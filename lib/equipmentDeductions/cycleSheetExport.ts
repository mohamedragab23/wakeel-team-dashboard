/**
 * Cycle file for admin → Talabat Accounts.
 * Equipment amounts are computed from open liabilities (source of truth).
 * Manual deductions come from شيت الاستقطاعات with loose cycle matching.
 */
import {
  ARABIC_MONTH_NAMES,
  DEDUCTION_CYCLE_LABELS,
  DEDUCTION_IMPORT_HEADERS,
  SHEET_DEDUCTIONS_IMPORT,
  type DeductionCycleKey,
} from '@/lib/equipmentSheetConstants';
import { getSheetDataOrThrow } from '@/lib/googleSheets';
import { formatMilliemesAsEgp, milliemesToEgp } from '@/lib/money';
import { scheduleFromPersistedOriginalMilli } from '@/lib/equipmentPricing';
import { computeAutoRequestDecision } from '@/lib/equipmentDeductions/autoRequest';
import { listOutstandingIssues } from '@/lib/equipmentLiability/store';
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

function padMonth(m: number): string {
  return String(m).padStart(2, '0');
}

/** Loose match: UUID, manual:YYYY-MM:cN, Arabic labels, numeric month/cycle. */
export function rowBelongsToCycle(row: unknown[], cycle: PayoutCycle): boolean {
  const id = String(cycle.cycleId || '').trim();
  const current = cell(row, 'currentCycleId');
  const original = cell(row, 'originalCycleId');
  if (id && (current === id || original === id)) return true;

  const synthetic = `manual:${cycle.year}-${padMonth(cycle.month)}:c${cycle.cycleNumber}`;
  if (current === synthetic || original === synthetic) return true;

  const label = cycleLabelForPayout(cycle);
  const monthAr = monthLabelForPayout(cycle);
  const cycleCell = cell(row, 'دورة_الاستقطاع');
  const monthCell = cell(row, 'شهر');
  const yearCell = cell(row, 'سنة');

  const yearOk = !yearCell || yearCell === String(cycle.year);
  const monthOk =
    !monthCell ||
    monthCell === monthAr ||
    monthCell === String(cycle.month) ||
    monthCell === padMonth(cycle.month);
  const cycleOk =
    !cycleCell ||
    cycleCell === label ||
    cycleCell === String(cycle.cycleNumber) ||
    cycleCell === `الدورة ${cycle.cycleNumber}` ||
    cycleCell === `دورة ${cycle.cycleNumber}`;

  if (cycleCell === label && monthOk && yearOk) return true;
  if (cycleOk && monthOk && yearOk && (cycleCell || monthCell)) return true;
  return false;
}

export type CycleDeductionExportRow = {
  كود_المندوب: string;
  اسم_المندوب: string;
  قيمة_الاستقطاع: string;
  السبب: string;
  الزون: string;
  دورة_الاستقطاع: string;
  شهر: string;
  سنة: string;
  كود_المشرف: string;
  اسم_المشرف: string;
  تاريخ_الرفع: string;
  source: string;
};

export type CycleDeductionExportSummary = {
  total: number;
  equipment: number;
  manual: number;
  other: number;
  skippedEquipment: number;
  rows: CycleDeductionExportRow[];
};

function toRow(partial: CycleDeductionExportRow): CycleDeductionExportRow {
  return partial;
}

export async function loadCycleDeductionExport(
  cycle: PayoutCycle
): Promise<CycleDeductionExportSummary> {
  const allCycles = await listPayoutCycles();
  const outstanding = await listOutstandingIssues();
  const label = cycleLabelForPayout(cycle);
  const monthAr = monthLabelForPayout(cycle);
  const uploadedAt = new Date().toISOString();

  const equipmentByRider = new Map<string, CycleDeductionExportRow>();
  let skippedEquipment = 0;

  for (const issue of outstanding) {
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
    if (decision.action !== 'request') {
      skippedEquipment += 1;
      continue;
    }
    const rider = normalizeRiderCodeForPerformance(issue.riderCode) || issue.riderCode;
    const amountEgp = formatMilliemesAsEgp(decision.originalAmountMilli);
    const prev = equipmentByRider.get(rider);
    if (prev) {
      const sum = (Number(prev.قيمة_الاستقطاع) || 0) + milliemesToEgp(decision.originalAmountMilli);
      prev.قيمة_الاستقطاع = sum.toFixed(2);
      continue;
    }
    equipmentByRider.set(
      rider,
      toRow({
        كود_المندوب: issue.riderCode,
        اسم_المندوب: issue.riderNameSnapshot,
        قيمة_الاستقطاع: amountEgp,
        السبب: 'معدات',
        الزون: issue.zoneSnapshot,
        دورة_الاستقطاع: label,
        شهر: monthAr,
        سنة: String(cycle.year),
        كود_المشرف: issue.supervisorCodeSnapshot,
        اسم_المشرف: issue.supervisorNameSnapshot,
        تاريخ_الرفع: uploadedAt,
        source: 'auto_equipment',
      })
    );
  }

  const data = await getSheetDataOrThrow(
    SHEET_DEDUCTIONS_IMPORT,
    false,
    `${SHEET_DEDUCTIONS_IMPORT}!A:AZ`
  );
  const manualRows: CycleDeductionExportRow[] = [];
  const equipmentCodes = new Set(equipmentByRider.keys());

  for (let i = 1; i < data.length; i++) {
    const raw = data[i] || [];
    if (!rowBelongsToCycle(raw, cycle)) continue;
    const reason = cell(raw, 'السبب');
    const source = cell(raw, 'source');
    const rider = normalizeRiderCodeForPerformance(cell(raw, 'كود_المندوب'));
    if (source === 'auto_equipment' || reason === 'معدات') {
      // Liabilities are source of truth — skip stale sheet equipment rows.
      continue;
    }
    if (rider && equipmentCodes.has(rider) && reason === 'معدات') continue;
    let amount = cell(raw, 'قيمة_الاستقطاع');
    const n = Number(String(amount).replace(/,/g, ''));
    if (Number.isFinite(n) && n >= 1000 && Number.isInteger(n)) {
      amount = formatMilliemesAsEgp(n);
    } else if (Number.isFinite(n)) {
      amount = n.toFixed(2);
    }
    manualRows.push(
      toRow({
        كود_المندوب: cell(raw, 'كود_المندوب'),
        اسم_المندوب: cell(raw, 'اسم_المندوب'),
        قيمة_الاستقطاع: amount,
        السبب: reason,
        الزون: cell(raw, 'الزون'),
        دورة_الاستقطاع: cell(raw, 'دورة_الاستقطاع') || label,
        شهر: cell(raw, 'شهر') || monthAr,
        سنة: cell(raw, 'سنة') || String(cycle.year),
        كود_المشرف: cell(raw, 'كود_المشرف'),
        اسم_المشرف: cell(raw, 'اسم_المشرف'),
        تاريخ_الرفع: cell(raw, 'تاريخ_الرفع'),
        source: source || 'manual',
      })
    );
  }

  const equipmentRows = [...equipmentByRider.values()];
  const rows = [...equipmentRows, ...manualRows];
  return {
    total: rows.length,
    equipment: equipmentRows.length,
    manual: manualRows.filter((r) => r.source === 'manual_v2' || r.source === 'manual').length,
    other: Math.max(0, rows.length - equipmentRows.length - manualRows.filter((r) => r.source === 'manual_v2' || r.source === 'manual').length),
    skippedEquipment,
    rows,
  };
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
