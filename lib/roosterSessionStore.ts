import { getSheetData, updateSheetRange, appendToSheet } from '@/lib/googleSheets';
import { logStructured } from '@/lib/requestTrace';

function norm(v: any): string {
  return String(v ?? '').trim();
}

function getSheetName(): string {
  return norm(process.env.ROOSTER_SESSION_SHEET_NAME) || 'cron_config';
}

/** A1-style column letter for a 0-based column index (A, B, ..., Z, AA, ...). */
function columnLetter(index: number): string {
  let n = index + 1;
  let letters = '';
  while (n > 0) {
    const rem = (n - 1) % 26;
    letters = String.fromCharCode(65 + rem) + letters;
    n = Math.floor((n - 1) / 26);
  }
  return letters || 'A';
}

type KeyValueLocation = {
  matrix: any[][];
  keyCol: number;
  valueCol: number;
};

async function loadKeyValueSheet(useCache: boolean): Promise<KeyValueLocation | null> {
  const sheetName = getSheetName();
  const matrix = await getSheetData(sheetName, useCache);
  if (!matrix?.length) return null;

  const headerRow = (matrix[0] || []).map((x) => norm(x).toLowerCase());
  const keyCol = headerRow.findIndex((h) => h === 'key' || h === 'name' || h === 'المتغير' || h === 'المفتاح');
  const valueCol = headerRow.findIndex((h) => h === 'value' || h === 'القيمة');

  return {
    matrix,
    keyCol: keyCol >= 0 ? keyCol : 0,
    valueCol: valueCol >= 0 ? valueCol : 1,
  };
}

function findRowIndexForKey(loc: KeyValueLocation, key: string): number {
  for (let r = 1; r < loc.matrix.length; r++) {
    const row = loc.matrix[r] || [];
    if (norm(row[loc.keyCol]) === key) return r;
  }
  return -1;
}

async function readJsonHeadersForKey(key: string): Promise<Record<string, string> | null> {
  const loc = await loadKeyValueSheet(false);
  if (!loc) return null;
  const rowIdx = findRowIndexForKey(loc, key);
  if (rowIdx < 0) return null;
  const raw = norm((loc.matrix[rowIdx] || [])[loc.valueCol]);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return null;
    return Object.fromEntries(Object.entries(parsed).map(([a, b]) => [String(a), String(b)]));
  } catch {
    throw new Error(`Sheet ${getSheetName()} has invalid JSON for ${key}`);
  }
}

/** Writes `{key: value}` into the cron_config sheet — updates the existing row if present,
 *  otherwise appends a new one. Used for automatic, no-human-intervention cookie rotation. */
async function writeJsonHeadersForKey(key: string, valueJson: string): Promise<boolean> {
  const sheetName = getSheetName();
  try {
    const loc = await loadKeyValueSheet(false);
    if (loc) {
      const rowIdx = findRowIndexForKey(loc, key);
      if (rowIdx >= 0) {
        const rowNumber = rowIdx + 1; // 1-based for the Sheets API
        const cell = `${columnLetter(loc.valueCol)}${rowNumber}`;
        const ok = await updateSheetRange(sheetName, cell, [[valueJson]]);
        logStructured(ok ? 'info' : 'error', 'rooster_session_sheet_updated', { key, sheetName, mode: 'update' });
        return ok;
      }
    }
    // Key not present yet (or sheet empty besides header) — append a new row,
    // padding any gap columns so key/value land in the detected columns.
    const keyCol = loc ? loc.keyCol : 0;
    const valueCol = loc ? loc.valueCol : 1;
    const row: any[] = [];
    row[keyCol] = key;
    row[valueCol] = valueJson;
    const padded = Array.from({ length: Math.max(row.length, 1) }, (_, i) => row[i] ?? '');
    const ok = await appendToSheet(sheetName, [padded]);
    logStructured(ok ? 'info' : 'error', 'rooster_session_sheet_updated', { key, sheetName, mode: 'append' });
    return ok;
  } catch (error: any) {
    logStructured('error', 'rooster_session_sheet_write_failed', {
      key,
      sheetName,
      error: error?.message || String(error),
    });
    return false;
  }
}

/**
 * Reads export headers JSON from Google Sheet to avoid redeploys.
 *
 * Expected layout (default sheet name: `cron_config`):
 * - A1: key (e.g. ROOSTER_EXPORT_HEADERS_JSON)
 * - B1: value
 * - A2: ROOSTER_EXPORT_HEADERS_JSON
 * - B2: {"Cookie":"..."}
 *
 * You can override sheet name via `ROOSTER_SESSION_SHEET_NAME`.
 */
export async function getRoosterExportHeadersFromSheet(): Promise<Record<string, string> | null> {
  return readJsonHeadersForKey('ROOSTER_EXPORT_HEADERS_JSON');
}

/**
 * Writes a fresh Cookie header back into the `cron_config` sheet under
 * `ROOSTER_EXPORT_HEADERS_JSON`, automatically — used by the self-healing
 * session refresh so a human never has to paste cookies from DevTools as
 * long as the underlying Okta/Cloudflare Access session is still alive.
 */
export async function setRoosterExportHeadersInSheet(cookieHeader: string): Promise<boolean> {
  const valueJson = JSON.stringify({ Cookie: cookieHeader });
  return writeJsonHeadersForKey('ROOSTER_EXPORT_HEADERS_JSON', valueJson);
}

/**
 * Optional: the Okta (or other IdP) domain's own session cookie, captured
 * separately from DevTools (it is NOT sent to eg.me.logisticsbackoffice.com,
 * so it never shows up in that request's Cookie header). When present, the
 * self-healing session refresh can follow the full Cloudflare Access →
 * Okta → Cloudflare Access redirect chain the browser does silently,
 * instead of only being able to refresh the short-lived dhh_token.
 *
 * Sheet row: key=ROOSTER_OKTA_COOKIE, value={"Cookie":"..."}
 */
export async function getRoosterOktaCookieFromSheet(): Promise<string | null> {
  const parsed = await readJsonHeadersForKey('ROOSTER_OKTA_COOKIE');
  return parsed?.Cookie || parsed?.cookie || null;
}
