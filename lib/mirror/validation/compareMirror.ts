import { getSheetData } from '@/lib/googleSheets';
import { hashRow, hashTab } from '@/lib/mirror/hash';
import { MIRROR_SHEET_NAMES, type MirrorSheetName } from '@/lib/mirror/config';
import { loadMirrorSheetRows, getMirrorRowCount } from '@/lib/mirror/validation/loadMirrorRows';

/** Normalize sheet cells for comparison (FORMATTED_VALUE strings). */
export function normalizeRow(row: unknown[]): string[] {
  return row.map((c) => String(c ?? '').trim());
}

export function rowsEquivalent(a: unknown[], b: unknown[]): boolean {
  const max = Math.max(a.length, b.length);
  for (let i = 0; i < max; i++) {
    if (String(a[i] ?? '').trim() !== String(b[i] ?? '').trim()) return false;
  }
  return true;
}

export function hashRowNormalized(row: unknown[]): string {
  return hashRow(normalizeRow(row));
}

export function hashTabNormalized(rows: unknown[][]): string {
  return hashTab(rows.map((r) => normalizeRow(r as unknown[])));
}

export type TableValidation = {
  sheetName: MirrorSheetName;
  sheetRowCount: number;
  mirrorRowCount: number;
  missingRows: number;
  extraRows: number;
  hashMismatches: number;
  matchPercentage: number;
  tabHashMatch: boolean;
  passed: boolean;
};

export type MirrorValidationReport = {
  validatedAt: string;
  tables: TableValidation[];
  overallMatchPercentage: number;
  passed: boolean;
};

export async function validateMirrorAgainstSheets(): Promise<MirrorValidationReport> {
  const tables: TableValidation[] = [];

  for (const sheetName of MIRROR_SHEET_NAMES) {
    const sheetRows = await getSheetData(sheetName, false);
    const mirrorRows = (await loadMirrorSheetRows(sheetName)) ?? [];
    const sheetCount = sheetRows.length;
    const mirrorCount = mirrorRows.length;

    let missingRows = 0;
    let extraRows = 0;
    let hashMismatches = 0;
    const maxCompare = Math.max(sheetCount, mirrorCount);

    for (let i = 0; i < maxCompare; i++) {
      const inSheet = i < sheetCount;
      const inMirror = i < mirrorCount;
      if (inSheet && !inMirror) {
        missingRows++;
        continue;
      }
      if (!inSheet && inMirror) {
        extraRows++;
        continue;
      }
      if (!rowsEquivalent(sheetRows[i] as unknown[], mirrorRows[i] as unknown[])) {
        hashMismatches++;
      }
    }

    const mismatched = missingRows + extraRows + hashMismatches;
    const matchPercentage =
      sheetCount === 0 && mirrorCount === 0
        ? 100
        : sheetCount > 0
          ? Math.round(((sheetCount - mismatched) / sheetCount) * 10000) / 100
          : 0;

    const tabHashMatch =
      hashTabNormalized(sheetRows) === hashTabNormalized(mirrorRows);

    tables.push({
      sheetName,
      sheetRowCount: sheetCount,
      mirrorRowCount: mirrorCount,
      missingRows,
      extraRows,
      hashMismatches,
      matchPercentage: tabHashMatch && mismatched === 0 ? 100 : matchPercentage,
      tabHashMatch,
      passed: tabHashMatch && mismatched === 0 && sheetCount === mirrorCount,
    });
  }

  const overallMatchPercentage =
    tables.length === 0
      ? 0
      : Math.round(
          (tables.reduce((s, t) => s + t.matchPercentage, 0) / tables.length) * 100
        ) / 100;

  const passed = tables.every((t) => t.passed && t.matchPercentage >= 100);

  return {
    validatedAt: new Date().toISOString(),
    tables,
    overallMatchPercentage,
    passed,
  };
}

/** Quick row-count probe without full hash compare. */
export async function probeMirrorRowCounts(): Promise<
  Record<string, { sheet: number; mirror: number }>
> {
  const out: Record<string, { sheet: number; mirror: number }> = {};
  for (const name of MIRROR_SHEET_NAMES) {
    const sheetRows = await getSheetData(name, false);
    const mirrorCount = await getMirrorRowCount(name);
    out[name] = { sheet: sheetRows.length, mirror: mirrorCount };
  }
  return out;
}
