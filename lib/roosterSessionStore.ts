import { getSheetData } from '@/lib/googleSheets';

function norm(v: any): string {
  return String(v ?? '').trim();
}

function getSheetName(): string {
  return norm(process.env.ROOSTER_SESSION_SHEET_NAME) || 'cron_config';
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
  const sheetName = getSheetName();
  const matrix = await getSheetData(sheetName, false);
  if (!matrix?.length) return null;

  const headerRow = (matrix[0] || []).map((x) => norm(x).toLowerCase());
  const keyCol = headerRow.findIndex((h) => h === 'key' || h === 'name' || h === 'المتغير' || h === 'المفتاح');
  const valueCol = headerRow.findIndex((h) => h === 'value' || h === 'القيمة');

  const idxKey = keyCol >= 0 ? keyCol : 0;
  const idxVal = valueCol >= 0 ? valueCol : 1;

  for (let r = 1; r < matrix.length; r++) {
    const row = matrix[r] || [];
    const k = norm(row[idxKey]);
    if (k !== 'ROOSTER_EXPORT_HEADERS_JSON') continue;
    const raw = norm(row[idxVal]);
    if (!raw) return null;
    try {
      const parsed = JSON.parse(raw);
      if (!parsed || typeof parsed !== 'object') return null;
      return Object.fromEntries(Object.entries(parsed).map(([a, b]) => [String(a), String(b)]));
    } catch {
      throw new Error(`Sheet ${sheetName} has invalid JSON for ROOSTER_EXPORT_HEADERS_JSON`);
    }
  }

  return null;
}

