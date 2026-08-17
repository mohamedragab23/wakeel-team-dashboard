/**
 * Cycle export for admin → Talabat Accounts upload.
 * Reads REQUEST ledger «الاستقطاعات» (manual + equipment) for one payout cycle.
 */
import {
  ARABIC_MONTH_NAMES,
  DEDUCTION_CYCLE_LABELS,
  DEDUCTION_IMPORT_HEADERS,
  SHEET_DEDUCTIONS_IMPORT,
  type DeductionCycleKey,
} from '@/lib/equipmentSheetConstants';
import { getSheetDataOrThrow } from '@/lib/googleSheets';
import type { PayoutCycle } from '@/lib/payoutCycles/types';

const H = DEDUCTION_IMPORT_HEADERS;

function idx(name: (typeof H)[number]): number {
  return H.indexOf(name);
}

function cell(row: unknown[], name: (typeof H)[number]): string {
  const i = idx(name);
  if (i < 0 || i >= row.length) return '';
  return String(row[i] ?? '').trim();
}

export function cycleLabelForPayout(cycle: PayoutCycle): string {
  if (cycle.isClosing) return DEDUCTION_CYCLE_LABELS.closing;
  const keys: DeductionCycleKey[] = ['first', 'second', 'third', 'fourth'];
  const key = keys[Math.max(0, Math.trunc(cycle.cycleNumber) - 1)];
  return key ? DEDUCTION_CYCLE_LABELS[key] : '';
}

export function monthLabelForPayout(cycle: PayoutCycle): string {
  const m = Math.trunc(cycle.month);
  if (m < 1 || m > 12) return '';
  return ARABIC_MONTH_NAMES[m - 1];
}

export type CycleDeductionExportRow = {
  تاريخ_الرفع: string;
  كود_المشرف: string;
  اسم_المشرف: string;
  كود_المندوب: string;
  اسم_المندوب: string;
  قيمة_الاستقطاع: string;
  السبب: string;
  الزون: string;
  دورة_الاستقطاع: string;
  شهر: string;
  سنة: string;
  source: string;
  deductionId: string;
};

export type CycleDeductionExportSummary = {
  total: number;
  equipment: number;
  manual: number;
  other: number;
  rows: CycleDeductionExportRow[];
};

function rowBelongsToCycle(row: unknown[], cycle: PayoutCycle): boolean {
  const current = cell(row, 'currentCycleId');
  const original = cell(row, 'originalCycleId');
  if (current && current === cycle.cycleId) return true;
  if (original && original === cycle.cycleId && !current) return true;
  const label = cycleLabelForPayout(cycle);
  const month = monthLabelForPayout(cycle);
  const year = String(cycle.year);
  return (
    cell(row, 'دورة_الاستقطاع') === label &&
    cell(row, 'شهر') === month &&
    cell(row, 'سنة') === year
  );
}

export async function loadCycleDeductionExport(
  cycle: PayoutCycle
): Promise<CycleDeductionExportSummary> {
  const data = await getSheetDataOrThrow(
    SHEET_DEDUCTIONS_IMPORT,
    false,
    `${SHEET_DEDUCTIONS_IMPORT}!A:AZ`
  );
  const rows: CycleDeductionExportRow[] = [];
  let equipment = 0;
  let manual = 0;
  let other = 0;
  for (let i = 1; i < data.length; i++) {
    const raw = data[i] || [];
    if (!rowBelongsToCycle(raw, cycle)) continue;
    const source = cell(raw, 'source');
    if (source === 'auto_equipment' || cell(raw, 'السبب') === 'معدات') equipment += 1;
    else if (source === 'manual_v2') manual += 1;
    else other += 1;
    rows.push({
      تاريخ_الرفع: cell(raw, 'تاريخ_الرفع'),
      كود_المشرف: cell(raw, 'كود_المشرف'),
      اسم_المشرف: cell(raw, 'اسم_المشرف'),
      كود_المندوب: cell(raw, 'كود_المندوب'),
      اسم_المندوب: cell(raw, 'اسم_المندوب'),
      قيمة_الاستقطاع: cell(raw, 'قيمة_الاستقطاع'),
      السبب: cell(raw, 'السبب'),
      الزون: cell(raw, 'الزون'),
      دورة_الاستقطاع: cell(raw, 'دورة_الاستقطاع'),
      شهر: cell(raw, 'شهر'),
      سنة: cell(raw, 'سنة'),
      source,
      deductionId: cell(raw, 'deductionId'),
    });
  }
  return { total: rows.length, equipment, manual, other, rows };
}

const EXPORT_COLUMNS: Array<keyof CycleDeductionExportRow> = [
  'كود_المندوب',
  'اسم_المندوب',
  'قيمة_الاستقطاع',
  'السبب',
  'الزون',
  'دورة_الاستقطاع',
  'شهر',
  'سنة',
  'كود_المشرف',
  'اسم_المشرف',
  'تاريخ_الرفع',
  'source',
];

export async function buildCycleDeductionXlsx(cycle: PayoutCycle): Promise<{
  buffer: Buffer;
  filename: string;
  summary: CycleDeductionExportSummary;
}> {
  const XLSX = await import('xlsx');
  const summary = await loadCycleDeductionExport(cycle);
  const aoa: unknown[][] = [
    EXPORT_COLUMNS,
    ...summary.rows.map((r) => EXPORT_COLUMNS.map((c) => r[c])),
  ];
  const ws = XLSX.utils.aoa_to_sheet(aoa);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'الاستقطاعات');
  const buffer = Buffer.from(XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }) as ArrayBuffer);
  const filename = `استقطاعات-${cycle.year}-${String(cycle.month).padStart(2, '0')}-دورة${cycle.cycleNumber}.xlsx`;
  return { buffer, filename, summary };
}
