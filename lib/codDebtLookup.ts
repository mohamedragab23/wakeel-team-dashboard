import * as XLSX from 'xlsx';
import { getSheetData, ensureSheetExists, appendToSheet } from '@/lib/googleSheets';
import { normalizeRiderCodeForPerformance } from '@/lib/dataFilter';

export const COD_SHEET_NAME = 'رصيد_COD';

const COD_HEADERS = ['التاريخ', 'كود المندوب', 'المديونية'];

export async function ensureCodSheet(): Promise<void> {
  await ensureSheetExists(COD_SHEET_NAME, COD_HEADERS);
}

/**
 * Load COD balances for a calendar day (YYYY-MM-DD). Missing riders → not in map (use 0).
 */
export async function loadCodDebtByRiderForDate(dateIso: string): Promise<Map<string, number>> {
  const map = new Map<string, number>();
  try {
    await ensureCodSheet();
    const data = await getSheetData(COD_SHEET_NAME, false);
    for (let i = 1; i < data.length; i++) {
      const row = data[i] || [];
      const d = String(row[0] ?? '').trim().slice(0, 10);
      if (d !== dateIso) continue;
      const code = normalizeRiderCodeForPerformance(row[1]);
      if (!code) continue;
      const debt = parseFloat(String(row[2] ?? '0').replace(/,/g, '')) || 0;
      map.set(code, debt);
    }
  } catch {
    /* sheet missing — all zero */
  }
  return map;
}

function normHeader(h: string): string {
  return String(h ?? '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ');
}

/** Parse Daily_COD_Wallet_Balance Excel export. */
export function parseCodWalletExcel(buffer: ArrayBuffer, dateIso: string): Map<string, number> {
  const wb = XLSX.read(buffer, { type: 'array', raw: false });
  const ws = wb.Sheets[wb.SheetNames[0]];
  const json = XLSX.utils.sheet_to_json<Record<string, unknown>>(ws, { defval: '' });
  const map = new Map<string, number>();

  for (const row of json) {
    const keys = Object.keys(row);
    const normMap = new Map(keys.map((k) => [normHeader(k), k]));
    const idKey =
      normMap.get('rider cod rider id') ||
      normMap.get('rider id') ||
      keys.find((k) => normHeader(k).includes('rider id'));
    const balKey =
      normMap.get('rider cod balance sum') ||
      normMap.get('balance sum') ||
      keys.find((k) => normHeader(k).includes('balance'));

    if (!idKey || !balKey) continue;
    const code = normalizeRiderCodeForPerformance(row[idKey]);
    if (!code) continue;
    const debt = parseFloat(String(row[balKey] ?? '0').replace(/,/g, '')) || 0;
    map.set(code, debt);
  }

  if (map.size === 0) {
    throw new Error(
      'لم يُعثر على أعمدة Rider COD Rider ID و Rider COD Balance Sum في ملف المديونية'
    );
  }
  return map;
}

/** Append COD snapshot; optional replace removes prior rows for same date first. */
export async function saveCodSnapshotForDate(
  dateIso: string,
  debtByRider: Map<string, number>,
  replace = true
): Promise<number> {
  await ensureCodSheet();
  if (replace) await deleteCodRowsForDate(dateIso);
  const rows = Array.from(debtByRider.entries()).map(([code, debt]) => [dateIso, code, debt]);
  if (rows.length) await appendToSheet(COD_SHEET_NAME, rows, false);
  return debtByRider.size;
}

async function deleteCodRowsForDate(dateIso: string): Promise<void> {
  try {
    const data = await getSheetData(COD_SHEET_NAME, false);
    if (!data || data.length <= 1) return;
    const { getMainSpreadsheetId, getSheetsClientFor } = await import('@/lib/googleSheetsAuth');
    const spreadsheetId = getMainSpreadsheetId();
    const sheets = await getSheetsClientFor('main');
    const spreadsheet = await sheets.spreadsheets.get({ spreadsheetId });
    const sheet = spreadsheet.data.sheets?.find(
      (s: { properties?: { title?: string } }) => s.properties?.title === COD_SHEET_NAME
    );
    if (!sheet?.properties?.sheetId) return;
    const sheetId = sheet.properties.sheetId;
    const toDelete: number[] = [];
    for (let i = 1; i < data.length; i++) {
      const d = String(data[i]?.[0] ?? '').trim().slice(0, 10);
      if (d === dateIso) toDelete.push(i + 1);
    }
    toDelete.sort((a, b) => b - a);
    if (!toDelete.length) return;
    const requests = toDelete.map((rowNum) => ({
      deleteDimension: {
        range: {
          sheetId,
          dimension: 'ROWS' as const,
          startIndex: rowNum - 1,
          endIndex: rowNum,
        },
      },
    }));
    await sheets.spreadsheets.batchUpdate({ spreadsheetId, requestBody: { requests } });
  } catch {
    /* ignore */
  }
}
