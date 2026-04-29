import fs from 'fs';
import path from 'path';
import { google } from 'googleapis';

export type SheetsCredentialTarget = 'main' | 'shifts';

function normalizePrivateKey(raw: string): string {
  let k = String(raw ?? '');
  // Remove accidental wrapping quotes from env pastes
  if (
    (k.startsWith('"') && k.endsWith('"')) ||
    (k.startsWith("'") && k.endsWith("'"))
  ) {
    k = k.slice(1, -1);
  }
  // Normalize line endings and escaped newlines
  k = k.replace(/\r\n/g, '\n').replace(/\\n/g, '\n');
  k = k.trim();

  // If the key is pasted as a single line (or has extra whitespace),
  // re-wrap it into a valid PEM block to avoid OpenSSL decoder errors.
  const tryRewrap = (header: string, footer: string): string | null => {
    const hIdx = k.indexOf(header);
    const fIdx = k.indexOf(footer);
    if (hIdx === -1 || fIdx === -1 || fIdx <= hIdx) return null;
    const between = k
      .slice(hIdx + header.length, fIdx)
      .replace(/[\s\r\n]+/g, ''); // remove all whitespace/newlines
    if (!between) return null;
    const lines: string[] = [];
    for (let i = 0; i < between.length; i += 64) {
      lines.push(between.slice(i, i + 64));
    }
    return [header, ...lines, footer, ''].join('\n');
  };

  // PKCS8
  const pkcs8 = tryRewrap('-----BEGIN PRIVATE KEY-----', '-----END PRIVATE KEY-----');
  if (pkcs8) return pkcs8;

  // PKCS1 (common older format)
  const pkcs1 = tryRewrap('-----BEGIN RSA PRIVATE KEY-----', '-----END RSA PRIVATE KEY-----');
  if (pkcs1) return pkcs1;

  return k;
}

function parseServiceAccountJson(raw: string): { client_email: string; private_key: string } {
  const parsed = JSON.parse(raw) as { client_email?: string; private_key?: string };
  if (!parsed.client_email || !parsed.private_key) {
    throw new Error('Service account JSON must include client_email and private_key');
  }
  return {
    client_email: parsed.client_email,
    private_key: normalizePrivateKey(parsed.private_key),
  };
}

function loadFromJsonEnv(envName: string): { client_email: string; private_key: string } | null {
  const raw = process.env[envName]?.trim();
  if (!raw) return null;
  try {
    // Some platforms store JSON env values wrapped as a JSON-string.
    // Try direct parse first; if it fails, try JSON.parse(raw) as a string then parse again.
    try {
      return parseServiceAccountJson(raw);
    } catch {
      const maybeString = JSON.parse(raw);
      if (typeof maybeString === 'string') {
        return parseServiceAccountJson(maybeString);
      }
      throw new Error('Invalid service account JSON');
    }
  } catch (e: any) {
    // On platforms like Vercel, env vars are frequently pasted with accidental quotes/newlines,
    // which makes the JSON invalid. Treat invalid JSON as "unset" so we can fall back
    // to other credential sources (file path or classic email+key).
    console.warn(`[googleSheetsAuth] Invalid JSON in ${envName}: ${e?.message || e}`);
    return null;
  }
}

function loadFromFileEnv(envName: string): { client_email: string; private_key: string } | null {
  const p = process.env[envName]?.trim();
  if (!p) return null;
  const abs = path.isAbsolute(p) ? p : path.join(process.cwd(), p);
  const raw = fs.readFileSync(abs, 'utf8');
  return parseServiceAccountJson(raw);
}

/**
 * Credentials for the main (007Sup) spreadsheet.
 * Priority: inline JSON env → JSON file path → classic GOOGLE_SERVICE_ACCOUNT_EMAIL + GOOGLE_PRIVATE_KEY.
 */
export function getMainServiceAccountCredentials(): { client_email: string; private_key: string } {
  const fromJson =
    loadFromJsonEnv('GOOGLE_SHEETS_007SUP_CREDENTIALS_JSON') ||
    loadFromJsonEnv('GOOGLE_CREDENTIALS_JSON');
  if (fromJson) return fromJson;

  const fromFile =
    loadFromFileEnv('GOOGLE_SHEETS_007SUP_CREDENTIALS_PATH') ||
    loadFromFileEnv('GOOGLE_SHEETS_MAIN_CREDENTIALS_PATH') ||
    loadFromFileEnv('GOOGLE_SERVICE_ACCOUNT_KEY_PATH');
  if (fromFile) return fromFile;

  const email = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL?.trim();
  const privateKey = process.env.GOOGLE_PRIVATE_KEY ? normalizePrivateKey(process.env.GOOGLE_PRIVATE_KEY) : undefined;
  if (email && privateKey) {
    return { client_email: email, private_key: privateKey };
  }

  throw new Error(
    'Missing main Google credentials. Set one of: GOOGLE_SHEETS_007SUP_CREDENTIALS_JSON, GOOGLE_SHEETS_007SUP_CREDENTIALS_PATH, or GOOGLE_SERVICE_ACCOUNT_EMAIL + GOOGLE_PRIVATE_KEY'
  );
}

/**
 * Credentials for the Shifts spreadsheet.
 * Priority: Shifts-specific JSON/path → same resolution as main (shared service account).
 */
export function getShiftsServiceAccountCredentials(): { client_email: string; private_key: string } {
  const fromJson =
    loadFromJsonEnv('GOOGLE_SHEETS_SHIFTS_CREDENTIALS_JSON') ||
    loadFromJsonEnv('GOOGLE_SHEETS_SHIFTS_SERVICE_ACCOUNT_JSON');
  if (fromJson) return fromJson;

  const fromFile =
    loadFromFileEnv('GOOGLE_SHEETS_SHIFTS_CREDENTIALS_PATH') ||
    loadFromFileEnv('GOOGLE_SHEETS_SHIFTS_SERVICE_ACCOUNT_KEY_PATH');
  if (fromFile) return fromFile;

  try {
    return getMainServiceAccountCredentials();
  } catch {
    throw new Error(
      'Missing Shifts Google credentials. Set GOOGLE_SHEETS_SHIFTS_CREDENTIALS_PATH / _JSON, or configure main credentials so the same account can access the Shifts file.'
    );
  }
}

function getCredentials(which: SheetsCredentialTarget): { client_email: string; private_key: string } {
  return which === 'main' ? getMainServiceAccountCredentials() : getShiftsServiceAccountCredentials();
}

const sheetsClientCache: Partial<Record<SheetsCredentialTarget, any>> = {};

export async function getSheetsClientFor(which: SheetsCredentialTarget) {
  if (sheetsClientCache[which]) {
    return sheetsClientCache[which];
  }

  const creds = getCredentials(which);
  const auth = new google.auth.GoogleAuth({
    credentials: creds,
    scopes: ['https://www.googleapis.com/auth/spreadsheets'],
  });
  const authClient = await auth.getClient();
  const client = google.sheets({ version: 'v4', auth: authClient as any });
  sheetsClientCache[which] = client;
  return client;
}

/** Spreadsheet ID for the main (007Sup) workbook. */
export function getMainSpreadsheetId(): string {
  return (
    process.env.GOOGLE_SHEETS_SPREADSHEET_ID?.trim() ||
    process.env.GOOGLE_SHEETS_007SUP_SPREADSHEET_ID?.trim() ||
    '1HbSrZQ02CsdU0XqnHUNg168e_khH50ZUdmj-FMyalf0'
  );
}

export function getShiftsSpreadsheetIdFromEnv(): string | null {
  const id = process.env.GOOGLE_SHEETS_SHIFTS_SPREADSHEET_ID?.trim();
  // When migrating to a unified workbook, allow Shifts to fall back to main.
  return id || getMainSpreadsheetId();
}
