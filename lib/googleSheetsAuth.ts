import fs from 'fs';
import path from 'path';
import { google } from 'googleapis';

export type SheetsCredentialTarget = 'main' | 'shifts';

function parseServiceAccountJson(raw: string): { client_email: string; private_key: string } {
  const parsed = JSON.parse(raw) as { client_email?: string; private_key?: string };
  if (!parsed.client_email || !parsed.private_key) {
    throw new Error('Service account JSON must include client_email and private_key');
  }
  return {
    client_email: parsed.client_email,
    private_key: String(parsed.private_key).replace(/\\n/g, '\n'),
  };
}

function loadFromJsonEnv(envName: string): { client_email: string; private_key: string } | null {
  const raw = process.env[envName]?.trim();
  if (!raw) return null;
  try {
    return parseServiceAccountJson(raw);
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
  const privateKey = process.env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, '\n');
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
