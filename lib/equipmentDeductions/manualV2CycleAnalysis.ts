/**
 * Manual V2 current-cycle analysis — inclusion/exclusion provenance.
 * READ-ONLY pure helpers. Does not mutate historical rows.
 */
import { normalizeRiderCodeKey } from '@/lib/equipmentDeductions/equipmentFinancialModel';
import { DEDUCTION_IMPORT_HEADERS } from '@/lib/equipmentSheetConstants';
import { egpToMilliemes, milliemesToEgp } from '@/lib/money';

const REQ = DEDUCTION_IMPORT_HEADERS;

const CLOSED_STATUSES = new Set(['cancelled', 'replaced', 'closed', 'void', 'reversed']);

export type ManualV2IncludedRow = {
  rowIndex: number;
  riderCode: string;
  riderName: string;
  supervisorCode: string;
  amountMilli: number;
  amountEgp: number;
  reason: string;
  cycleLabel: string;
  monthLabel: string;
  year: string;
  source: string;
  deductionId: string;
  currentCycleId: string;
  status: string;
};

export type ManualV2ExcludedRow = ManualV2IncludedRow & {
  exclusionReason: string;
};

export type ManualV2CycleAnalysis = {
  target: {
    cycleId: string;
    cycleLabel: string;
    monthLabel: string;
    year: number;
  };
  manualV2RowsIncluded: ManualV2IncludedRow[];
  manualV2TotalMilli: number;
  manualV2TotalEgp: number;
  manualV2ByReason: Record<string, { rows: number; totalMilli: number; totalEgp: number }>;
  manualV2BySupervisor: Record<string, { rows: number; totalMilli: number; totalEgp: number }>;
  manualV2ByRider: Map<string, number>;
  manualV2ExcludedRows: ManualV2ExcludedRow[];
  stats: {
    scannedRows: number;
    sourceManualV2Rows: number;
    includedCount: number;
    excludedCount: number;
    duplicateDeductionIdsSkipped: number;
  };
};

function idx(name: (typeof REQ)[number]): number {
  return REQ.indexOf(name);
}

function cell(row: unknown[], name: (typeof REQ)[number]): string {
  const i = idx(name);
  if (i < 0) return '';
  return String(row[i] ?? '').trim();
}

function parseMoney(v: unknown): number {
  if (v === undefined || v === null || v === '') return 0;
  const s = String(v).replace(/,/g, '').replace(/[^\d.-]/g, '');
  const n = Number(s);
  return Number.isFinite(n) ? n : 0;
}

function readRow(row: unknown[], rowIndex: number): ManualV2IncludedRow {
  const amountEgp = parseMoney(row[idx('قيمة_الاستقطاع')]);
  return {
    rowIndex,
    riderCode: cell(row, 'كود_المندوب'),
    riderName: cell(row, 'اسم_المندوب'),
    supervisorCode: cell(row, 'كود_المشرف'),
    amountMilli: egpToMilliemes(amountEgp),
    amountEgp,
    reason: cell(row, 'السبب') || 'أخرى',
    cycleLabel: cell(row, 'دورة_الاستقطاع'),
    monthLabel: cell(row, 'شهر'),
    year: String(cell(row, 'سنة')).replace(/,/g, ''),
    source: cell(row, 'source'),
    deductionId: cell(row, 'deductionId'),
    currentCycleId: cell(row, 'currentCycleId'),
    status: cell(row, 'status').toLowerCase(),
  };
}

/**
 * Include Manual V2 rows that belong to the target payout cycle ONLY.
 *
 * Match rules (any one of):
 * 1) currentCycleId === target.cycleId (preferred when present)
 * 2) Arabic cycleLabel + monthLabel + year all match exactly
 *
 * Exclusions:
 * - source !== manual_v2
 * - cancelled / replaced / closed / void / reversed
 * - wrong cycle / month / year (when no currentCycleId match)
 * - missing year when relying on Arabic labels
 * - duplicate deductionId (keep first)
 * - non-positive amount
 */
export function analyzeManualV2ForCycle(params: {
  requestRows: unknown[][];
  cycleId: string;
  cycleLabel: string;
  monthLabel: string;
  year: number;
}): ManualV2CycleAnalysis {
  const included: ManualV2IncludedRow[] = [];
  const excluded: ManualV2ExcludedRow[] = [];
  const seenDeductionIds = new Set<string>();
  let scanned = 0;
  let sourceManual = 0;
  let dupSkipped = 0;

  const yearStr = String(params.year);

  for (let i = 1; i < params.requestRows.length; i++) {
    const row = params.requestRows[i];
    if (!row) continue;
    scanned += 1;
    const parsed = readRow(row, i);

    if (parsed.source !== 'manual_v2') {
      // Not Manual V2 — silent skip (not an exclusion of Manual V2)
      continue;
    }
    sourceManual += 1;

    if (CLOSED_STATUSES.has(parsed.status)) {
      excluded.push({ ...parsed, exclusionReason: `status_${parsed.status || 'closed'}` });
      continue;
    }

    if (parsed.amountMilli <= 0) {
      excluded.push({ ...parsed, exclusionReason: 'non_positive_amount' });
      continue;
    }

    const byCycleId =
      Boolean(parsed.currentCycleId) && parsed.currentCycleId === params.cycleId;
    const byArabicLabels =
      parsed.cycleLabel === params.cycleLabel &&
      parsed.monthLabel === params.monthLabel &&
      parsed.year === yearStr;

    if (!byCycleId && !byArabicLabels) {
      let reason = 'wrong_cycle_scope';
      if (parsed.currentCycleId && parsed.currentCycleId !== params.cycleId) {
        reason = 'currentCycleId_mismatch';
      } else if (parsed.cycleLabel !== params.cycleLabel) {
        reason = 'cycle_label_mismatch';
      } else if (parsed.monthLabel !== params.monthLabel) {
        reason = 'month_label_mismatch';
      } else if (!parsed.year) {
        reason = 'year_missing_required';
      } else if (parsed.year !== yearStr) {
        reason = 'year_mismatch';
      }
      excluded.push({ ...parsed, exclusionReason: reason });
      continue;
    }

    // Prefer cycleId match; if only Arabic match but currentCycleId points elsewhere, exclude.
    if (
      !byCycleId &&
      parsed.currentCycleId &&
      parsed.currentCycleId !== params.cycleId
    ) {
      excluded.push({ ...parsed, exclusionReason: 'currentCycleId_overrides_arabic_mismatch' });
      continue;
    }

    if (parsed.deductionId) {
      if (seenDeductionIds.has(parsed.deductionId)) {
        dupSkipped += 1;
        excluded.push({ ...parsed, exclusionReason: 'duplicate_deductionId' });
        continue;
      }
      seenDeductionIds.add(parsed.deductionId);
    }

    included.push(parsed);
  }

  const byReason: ManualV2CycleAnalysis['manualV2ByReason'] = {};
  const bySupervisor: ManualV2CycleAnalysis['manualV2BySupervisor'] = {};
  const byRider = new Map<string, number>();
  let totalMilli = 0;

  for (const r of included) {
    totalMilli += r.amountMilli;
    const reasonKey = r.reason || 'أخرى';
    if (!byReason[reasonKey]) byReason[reasonKey] = { rows: 0, totalMilli: 0, totalEgp: 0 };
    byReason[reasonKey].rows += 1;
    byReason[reasonKey].totalMilli += r.amountMilli;
    byReason[reasonKey].totalEgp = milliemesToEgp(byReason[reasonKey].totalMilli);

    const sup = r.supervisorCode || 'UNKNOWN';
    if (!bySupervisor[sup]) bySupervisor[sup] = { rows: 0, totalMilli: 0, totalEgp: 0 };
    bySupervisor[sup].rows += 1;
    bySupervisor[sup].totalMilli += r.amountMilli;
    bySupervisor[sup].totalEgp = milliemesToEgp(bySupervisor[sup].totalMilli);

    const rk = normalizeRiderCodeKey(r.riderCode);
    if (rk) byRider.set(rk, (byRider.get(rk) || 0) + r.amountMilli);
  }

  return {
    target: {
      cycleId: params.cycleId,
      cycleLabel: params.cycleLabel,
      monthLabel: params.monthLabel,
      year: params.year,
    },
    manualV2RowsIncluded: included,
    manualV2TotalMilli: totalMilli,
    manualV2TotalEgp: milliemesToEgp(totalMilli),
    manualV2ByReason: byReason,
    manualV2BySupervisor: bySupervisor,
    manualV2ByRider: byRider,
    manualV2ExcludedRows: excluded,
    stats: {
      scannedRows: scanned,
      sourceManualV2Rows: sourceManual,
      includedCount: included.length,
      excludedCount: excluded.length,
      duplicateDeductionIdsSkipped: dupSkipped,
    },
  };
}

/** Map rider → Manual V2 milli for operational engine merge. */
export function manualV2MilliByRiderFromAnalysis(
  analysis: ManualV2CycleAnalysis
): Map<string, number> {
  return new Map(analysis.manualV2ByRider);
}
