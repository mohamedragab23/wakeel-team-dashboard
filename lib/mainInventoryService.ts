import {
  appendToSheet,
  ensureSheetExists,
  getSheetData,
  updateSheetRange,
} from '@/lib/googleSheets';
import { SHEET_MAIN_INVENTORY } from '@/lib/equipmentSheetConstants';

export interface MainInventoryCounts {
  motorcyclePouch: number;
  bicyclePouch: number;
  tshirt: number;
  jacket: number;
  helmet: number;
}

const HEADERS = ['باوتش_موتوسيكل', 'باوتش_عجلة', 'تيشرت', 'جاكيت', 'خوذة'];

function parseRow(row: any[] | undefined): MainInventoryCounts {
  if (!row || row.length < 5) {
    return { motorcyclePouch: 0, bicyclePouch: 0, tshirt: 0, jacket: 0, helmet: 0 };
  }
  return {
    motorcyclePouch: Math.max(0, Number(row[0]) || 0),
    bicyclePouch: Math.max(0, Number(row[1]) || 0),
    tshirt: Math.max(0, Number(row[2]) || 0),
    jacket: Math.max(0, Number(row[3]) || 0),
    helmet: Math.max(0, Number(row[4]) || 0),
  };
}

export async function ensureMainInventoryInitialized(): Promise<void> {
  await ensureSheetExists(SHEET_MAIN_INVENTORY, HEADERS);
  const data = await getSheetData(SHEET_MAIN_INVENTORY, false);
  if (data.length < 2) {
    await appendToSheet(SHEET_MAIN_INVENTORY, [[0, 0, 0, 0, 0]], false);
  } else {
    const row = data[1];
    if (!row || row.length < 5 || row.every((c) => c === '' || c === undefined)) {
      await updateSheetRange(SHEET_MAIN_INVENTORY, 'A2:E2', [[0, 0, 0, 0, 0]]);
    }
  }
}

export async function readMainInventory(): Promise<MainInventoryCounts> {
  await ensureMainInventoryInitialized();
  const data = await getSheetData(SHEET_MAIN_INVENTORY, false);
  return parseRow(data[1]);
}

export async function writeMainInventory(counts: MainInventoryCounts): Promise<boolean> {
  await ensureMainInventoryInitialized();
  const row = [
    counts.motorcyclePouch,
    counts.bicyclePouch,
    counts.tshirt,
    counts.jacket,
    counts.helmet,
  ];
  return updateSheetRange(SHEET_MAIN_INVENTORY, 'A2:E2', [row]);
}

/** Apply delta to main inventory (positive = restock, negative = issue). */
export async function applyMainInventoryDelta(delta: MainInventoryCounts): Promise<{
  ok: true;
  newCounts: MainInventoryCounts;
} | { ok: false; error: string }> {
  const current = await readMainInventory();
  const next: MainInventoryCounts = {
    motorcyclePouch: current.motorcyclePouch + delta.motorcyclePouch,
    bicyclePouch: current.bicyclePouch + delta.bicyclePouch,
    tshirt: current.tshirt + delta.tshirt,
    jacket: current.jacket + delta.jacket,
    helmet: current.helmet + delta.helmet,
  };
  const keys: (keyof MainInventoryCounts)[] = [
    'motorcyclePouch',
    'bicyclePouch',
    'tshirt',
    'jacket',
    'helmet',
  ];
  for (const k of keys) {
    if (next[k] < 0) {
      return {
        ok: false,
        error: `الكمية غير كافية في المخزون الرئيسي (${k})`,
      };
    }
  }
  const saved = await writeMainInventory(next);
  if (!saved) return { ok: false, error: 'فشل تحديث المخزون الرئيسي' };
  return { ok: true, newCounts: next };
}
