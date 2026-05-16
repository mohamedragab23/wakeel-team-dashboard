import { getSheetData, appendToSheet } from '@/lib/googleSheets';
import { cache, CACHE_KEYS } from '@/lib/cache';
import { getMainSpreadsheetId, getSheetsClientFor } from '@/lib/googleSheetsAuth';
import { invalidateSupervisorCaches, notifySupervisorsOfChange } from '@/lib/realtimeSync';

const SHEET = 'البيانات اليومية';

function toLocalIsoDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function normalizeAnyDateToIso(v: unknown): string | null {
  if (!v) return null;
  if (v instanceof Date && Number.isFinite(v.getTime())) return toLocalIsoDate(v);
  const s = String(v).trim();
  if (!s) return null;
  const mIso = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (mIso) return `${mIso[1]}-${mIso[2]}-${mIso[3]}`;
  const mSlash = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (mSlash) {
    const a = parseInt(mSlash[1], 10);
    const b = parseInt(mSlash[2], 10);
    const y = parseInt(mSlash[3], 10);
    const month = a > 12 ? b : a;
    const day = a > 12 ? a : b;
    const d = new Date(y, month - 1, day);
    return Number.isFinite(d.getTime()) ? toLocalIsoDate(d) : null;
  }
  const d = new Date(s);
  return Number.isFinite(d.getTime()) ? toLocalIsoDate(d) : null;
}

function groupContiguousDescending(rows: number[]): Array<{ startRow: number; endRow: number }> {
  const ranges: Array<{ startRow: number; endRow: number }> = [];
  let start = -1;
  let end = -1;
  for (const r of rows) {
    if (start === -1) {
      start = r;
      end = r;
      continue;
    }
    if (r === end - 1) {
      end = r;
    } else {
      ranges.push({ startRow: end, endRow: start });
      start = r;
      end = r;
    }
  }
  if (start !== -1) ranges.push({ startRow: end, endRow: start });
  return ranges;
}

async function deleteRowsBatch(sheetName: string, rowNumbersDesc: number[]) {
  if (rowNumbersDesc.length === 0) return 0;

  const spreadsheetId = getMainSpreadsheetId();
  const sheets = await getSheetsClientFor('main');
  const spreadsheet = await sheets.spreadsheets.get({ spreadsheetId });
  const sheet = spreadsheet.data.sheets?.find((s: { properties?: { title?: string } }) => s.properties?.title === sheetName);
  if (!sheet?.properties?.sheetId) throw new Error(`Sheet "${sheetName}" not found`);
  const sheetId = sheet.properties.sheetId;

  const ranges = groupContiguousDescending(rowNumbersDesc);
  const requests = ranges.map((r) => ({
    deleteDimension: {
      range: {
        sheetId,
        dimension: 'ROWS' as const,
        startIndex: r.startRow - 1,
        endIndex: r.endRow,
      },
    },
  }));

  await sheets.spreadsheets.batchUpdate({
    spreadsheetId,
    requestBody: { requests },
  });
  return rowNumbersDesc.length;
}

export async function deletePerformanceRowsForDate(dateIso: string): Promise<number> {
  const sheet = await getSheetData(SHEET, false);
  if (!sheet || sheet.length <= 1) return 0;

  const rowsToDelete: number[] = [];
  for (let i = 1; i < sheet.length; i++) {
    const row = sheet[i] || [];
    const iso = normalizeAnyDateToIso(row[0]);
    if (iso === dateIso) rowsToDelete.push(i + 1);
  }
  rowsToDelete.sort((a, b) => b - a);
  return deleteRowsBatch(SHEET, rowsToDelete);
}

export async function appendPerformanceRows(rows: any[][]): Promise<void> {
  if (!rows.length) return;
  await appendToSheet(SHEET, rows, false);
}

export async function replacePerformanceDay(dateIso: string, rows: any[][]): Promise<{ deleted: number; written: number }> {
  const deleted = await deletePerformanceRowsForDate(dateIso);
  await appendPerformanceRows(rows);
  cache.clear(CACHE_KEYS.sheetData(SHEET));
  const allKeys = cache.keys();
  for (const key of allKeys) {
    if (key.includes('performance') || key.includes('dashboard') || key.includes('riders-data')) {
      cache.clear(key);
    }
  }
  invalidateSupervisorCaches();
  notifySupervisorsOfChange('performance');
  return { deleted, written: rows.length };
}

export async function performanceDateExists(dateIso: string): Promise<boolean> {
  try {
    const sheet = await getSheetData(SHEET, false);
    for (let i = 1; i < sheet.length; i++) {
      const iso = normalizeAnyDateToIso(sheet[i]?.[0]);
      if (iso === dateIso) return true;
    }
    return false;
  } catch {
    return false;
  }
}
