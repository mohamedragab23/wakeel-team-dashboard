import * as XLSX from 'xlsx';
import {
  parseTableauPerformanceExport,
  assessTableauPerformanceQuality,
  mergeCodDebt,
  type TableauPerformanceRow,
} from '@/lib/tableauPerformanceTransform';
import { processPerformanceExcel } from '@/lib/excelProcessor';
import { parseCodWalletExcel, loadCodDebtByRiderForDate, saveCodSnapshotForDate } from '@/lib/codDebtLookup';
import { applyPerformanceToSheet } from '@/lib/performanceSyncService';
import { performanceDateExists } from '@/lib/performanceDaySheet';

export type PerformanceImportPreview = {
  targetDate: string;
  source: 'tableau' | 'legacy';
  wakeelRows: number;
  withDataRows: number;
  zeroRatio: number;
  qualityMessage: string;
  isSuspiciousEmpty: boolean;
  codRiders: number;
  hadCodFile: boolean;
  warnings: string[];
  sample: Array<{
    riderCode: string;
    hours: number;
    orders: number;
    debt: number;
  }>;
};

function legacyToTableauRows(
  buffer: ArrayBuffer,
  forcedDate: string
): { rows: TableauPerformanceRow[]; warnings: string[] } {
  const wb = XLSX.read(buffer, { type: 'array', raw: false });
  const ws = wb.Sheets[wb.SheetNames[0]];
  const matrix = XLSX.utils.sheet_to_json<any[]>(ws, { header: 1, defval: '' }) as any[][];
  const processed = processPerformanceExcel(matrix, { forcedDate });
  if (!processed.success || processed.data.length === 0) {
    return { rows: [], warnings: processed.errors.concat(processed.warnings) };
  }
  const rows: TableauPerformanceRow[] = processed.data.map((p) => ({
    riderCode: p.riderCode,
    hours: p.hours,
    break: p.break,
    delay: p.delay,
    absence: p.absence,
    orders: p.orders,
    acceptance: p.acceptance,
    debt: p.debt,
  }));
  return { rows, warnings: processed.warnings };
}

/** Parse Tableau crosstab export, or fall back to legacy 9-column sheet format. */
export function parsePerformanceFileBuffer(
  buffer: ArrayBuffer,
  forcedDate: string
): { rows: TableauPerformanceRow[]; warnings: string[]; source: 'tableau' | 'legacy' } {
  const tableau = parseTableauPerformanceExport(buffer, 'excel');
  if (tableau.rows.length > 0) {
    return { rows: tableau.rows, warnings: tableau.warnings, source: 'tableau' };
  }
  const legacy = legacyToTableauRows(buffer, forcedDate);
  if (legacy.rows.length > 0) {
    return { rows: legacy.rows, warnings: [...tableau.warnings, ...legacy.warnings], source: 'legacy' };
  }
  return {
    rows: [],
    warnings: [
      ...tableau.warnings,
      ...legacy.warnings,
      'لم يُعثر على بيانات. استخدم تصدير Crosstab من Tableau (Rider Performance + wakeel) أو ملف الأعمدة التسعة.',
    ],
    source: 'tableau',
  };
}

export async function buildPerformanceImportPreview(
  targetDate: string,
  performanceBuffer: ArrayBuffer,
  codBuffer?: ArrayBuffer
): Promise<PerformanceImportPreview> {
  const { rows, warnings, source } = parsePerformanceFileBuffer(performanceBuffer, targetDate);

  let debtMap: Map<string, number>;
  const hadCodFile = !!codBuffer?.byteLength;
  if (hadCodFile && codBuffer) {
    debtMap = parseCodWalletExcel(codBuffer, targetDate);
  } else {
    debtMap = await loadCodDebtByRiderForDate(targetDate);
  }

  const merged = mergeCodDebt(rows, debtMap);
  const quality = assessTableauPerformanceQuality(merged);
  const withDataRows = merged.filter((r) => r.hours > 0 || r.orders > 0).length;
  const sample = merged
    .filter((r) => r.hours > 0 || r.orders > 0)
    .slice(0, 5)
    .map((r) => ({
      riderCode: r.riderCode,
      hours: r.hours,
      orders: r.orders,
      debt: r.debt,
    }));

  return {
    targetDate,
    source,
    wakeelRows: merged.length,
    withDataRows,
    zeroRatio: quality.zeroRatio,
    qualityMessage: quality.message,
    isSuspiciousEmpty: quality.isSuspiciousEmpty,
    codRiders: debtMap.size,
    hadCodFile,
    warnings,
    sample,
  };
}

export async function applyPerformanceImport(
  targetDate: string,
  performanceBuffer: ArrayBuffer,
  options?: { codBuffer?: ArrayBuffer; forceReplace?: boolean; skipQualityBlock?: boolean }
): Promise<{
  preview: PerformanceImportPreview;
  written: number;
  deleted: number;
}> {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(targetDate)) {
    throw new Error('تاريخ غير صالح (YYYY-MM-DD)');
  }

  const exists = await performanceDateExists(targetDate);
  if (exists && !options?.forceReplace) {
    throw new Error(
      `أداء ${targetDate} موجود مسبقاً. احذف اليوم من الصفحة أو فعّل "استبدال اليوم".`
    );
  }

  const preview = await buildPerformanceImportPreview(
    targetDate,
    performanceBuffer,
    options?.codBuffer
  );

  if (preview.wakeelRows === 0) {
    throw new Error(preview.warnings.join(' ') || 'لا توجد صفوف للرفع');
  }

  if (preview.isSuspiciousEmpty && !options?.skipQualityBlock) {
    throw new Error(`${preview.qualityMessage} — راجع المعاينة أو فعّل "رفع رغم التحذير".`);
  }

  if (options?.codBuffer?.byteLength) {
    const debtMap = parseCodWalletExcel(options.codBuffer, targetDate);
    await saveCodSnapshotForDate(targetDate, debtMap, true);
  }

  const { rows } = parsePerformanceFileBuffer(performanceBuffer, targetDate);
  let debtMap = await loadCodDebtByRiderForDate(targetDate);
  const merged = mergeCodDebt(rows, debtMap);
  const { written, deleted } = await applyPerformanceToSheet(targetDate, merged);

  return { preview, written, deleted };
}
