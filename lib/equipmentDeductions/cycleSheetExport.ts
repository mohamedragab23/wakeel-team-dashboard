/**
 * Cycle export for admin → Talabat Accounts upload.
 * Merges REQUEST ledger «الاستقطاعات» with outstanding equipment liabilities
 * so missing prep rows still appear in the file the admin uploads.
 */
import {
  ARABIC_MONTH_NAMES,
  DEDUCTION_CYCLE_LABELS,
  DEDUCTION_IMPORT_HEADERS,
  SHEET_DEDUCTIONS_IMPORT,
  type DeductionCycleKey,
} from '@/lib/equipmentSheetConstants';
import { computeAutoRequestDecision } from '@/lib/equipmentDeductions/autoRequest';
import { scheduleFromPersistedOriginalMilli } from '@/lib/equipmentPricing';
import { listOutstandingIssues } from '@/lib/equipmentLiability/store';
import { getSheetDataOrThrow } from '@/lib/googleSheets';
import { milliemesToEgp } from '@/lib/money';
import { listPayoutCycles } from '@/lib/payoutCycles/store';
import type { PayoutCycle } from '@/lib/payoutCycles/types';
import { normalizeRiderCodeForPerformance } from '@/lib/riderCodeUtils';

const H = DEDUCTION_IMPORT_HEADERS;

function idx(name: (typeof H)[number]): number {
  return H.indexOf(name);
}

function cell(row: unknown[], name: (typeof H)[number]): string {
  const i = idx(name);
  if (i < 0 || i >= row.length) return '';
  return String(row[i] ?? '').trim();
}

function foldAr(s: string): string {
  return String(s || '')
    .trim()
    .replace(/[٠-٩]/g, (ch) => String('٠١٢٣٤٥٦٧٨٩'.indexOf(ch)))
    .replace(/[أإآ]/g, 'ا')
    .replace(/ى/g, 'ي')
    .replace(/ة/g, 'ه');
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

export function manualSyntheticCycleId(cycle: PayoutCycle): string {
  return `manual:${cycle.year}-${String(cycle.month).padStart(2, '0')}:c${cycle.cycleNumber}`;
}

export function rowBelongsToCycle(row: unknown[], cycle: PayoutCycle): boolean {
  const current = cell(row, 'currentCycleId');
  const original = cell(row, 'originalCycleId');
  const synthetic = manualSyntheticCycleId(cycle);
  const id = String(cycle.cycleId || '').trim();
  if (current && (current === id || current.toLowerCase() === id.toLowerCase() || current === synthetic)) {
    return true;
  }
  if (original && (original === id || original === synthetic)) return true;

  const year = foldAr(cell(row, 'سنة'));
  const yearOk = !year || year === String(cycle.year);
  if (!yearOk) return false;

  const label = foldAr(cell(row, 'دورة_الاستقطاع'));
  const wantLabel = foldAr(cycleLabelForPayout(cycle));
  const labelOk =
    !label ||
    label === wantLabel ||
    label === String(cycle.cycleNumber) ||
    label === `دوره ${cycle.cycleNumber}` ||
    label === `الدوره ${cycle.cycleNumber}`;

  const monthRaw = foldAr(cell(row, 'شهر'));
  const wantMonth = foldAr(monthLabelForPayout(cycle));
  const monthOk =
    !monthRaw ||
    monthRaw === wantMonth ||
    monthRaw === String(cycle.month) ||
    monthRaw === String(cycle.month).padStart(2, '0');

  if (cell(row, 'كود_المندوب') && labelOk && monthOk && (label || current || original)) {
    return true;
  }
  return false;
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
  filledFromLiabilities: number;
  rows: CycleDeductionExportRow[];
};

function classify(row: CycleDeductionExportRow): 'equipment' | 'manual' | 'other' {
  if (row.source === 'auto_equipment' || row.السبب === 'معدات') return 'equipment';
  if (row.source === 'manual_v2') return 'manual';
  return 'other';
}

function toExportRow(raw: unknown[]): CycleDeductionExportRow {
  return {
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
    source: cell(raw, 'source'),
    deductionId: cell(raw, 'deductionId'),
  };
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
  const seenEquipment = new Set<string>();
  for (let i = 1; i < data.length; i++) {
    const raw = data[i] || [];
    if (!rowBelongsToCycle(raw, cycle)) continue;
    const mapped = toExportRow(raw);
    rows.push(mapped);
    if (mapped.السبب === 'معدات' || mapped.source === 'auto_equipment') {
      const code = normalizeRiderCodeForPerformance(mapped.كود_المندوب);
      if (code) seenEquipment.add(code);
    }
  }

  let filledFromLiabilities = 0;
  const allCycles = await listPayoutCycles();
  const outstanding = await listOutstandingIssues();
  const label = cycleLabelForPayout(cycle);
  const month = monthLabelForPayout(cycle);
  const uploadedAt = new Date().toISOString();

  for (const issue of outstanding) {
    const code = normalizeRiderCodeForPerformance(issue.riderCode);
    if (!code || seenEquipment.has(code)) continue;
    const schedule = issue.installmentSchedule?.length
      ? issue.installmentSchedule
      : scheduleFromPersistedOriginalMilli(issue.originalLiabilityMilli);
    const decision = computeAutoRequestDecision({
      remainingMilli: issue.outstandingMilli,
      schedule,
      installmentsCompleted: issue.installmentsCompleted,
      amountDeductedMilli: issue.amountDeductedMilli,
      cycle,
      allCycles,
      activationDate: issue.activationDate,
      riderCode: issue.riderCode,
      equipmentIssueId: issue.equipmentIssueId,
      existingFleetLiability: true,
    });
    if (decision.action !== 'request') continue;
    filledFromLiabilities += 1;
    seenEquipment.add(code);
    rows.push({
      تاريخ_الرفع: uploadedAt,
      كود_المشرف: issue.supervisorCodeSnapshot,
      اسم_المشرف: issue.supervisorNameSnapshot,
      كود_المندوب: issue.riderCode,
      اسم_المندوب: issue.riderNameSnapshot,
      قيمة_الاستقطاع: String(milliemesToEgp(decision.originalAmountMilli)),
      السبب: 'معدات',
      الزون: issue.zoneSnapshot,
      دورة_الاستقطاع: label,
      شهر: month,
      سنة: String(cycle.year),
      source: 'auto_equipment',
      deductionId: decision.deductionId,
    });
  }

  let equipment = 0;
  let manual = 0;
  let other = 0;
  for (const r of rows) {
    const k = classify(r);
    if (k === 'equipment') equipment += 1;
    else if (k === 'manual') manual += 1;
    else other += 1;
  }

  return { total: rows.length, equipment, manual, other, filledFromLiabilities, rows };
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
