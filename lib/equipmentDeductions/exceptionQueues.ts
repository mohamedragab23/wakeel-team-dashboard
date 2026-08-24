/**
 * Calibrated exception queues + full declaration population helpers.
 * Pure — no sheet writes, no liability mutation.
 */
import {
  actualDeductedEgpFromWalletRaw,
  ledgerOutstandingInvariant,
  normalizeRiderCodeKey,
} from '@/lib/equipmentDeductions/equipmentFinancialModel';
import {
  aggregateActualPayrollByRiderCycle,
  aggregateRequestedByRiderCycle,
} from '@/lib/equipmentDeductions/carryForward';
import type { EquipmentLiabilityIssue } from '@/lib/equipmentLiability/store';
import { DEDUCTIONS_ACTUAL_HEADERS, DEDUCTION_IMPORT_HEADERS } from '@/lib/equipmentSheetConstants';
import { milliemesToEgp } from '@/lib/money';

export type CycleEvidence = {
  cycleLabel: string;
  monthLabel: string;
  year: number;
  requestMilli: number;
  requestEgp: number;
  rawWalletEgp: number;
  actualAbsMilli: number;
  actualAbsEgp: number;
};

export type RosterRider = {
  riderCode: string;
  riderName: string;
  supervisorCode: string;
  supervisorName?: string;
};

export type MissingLiabilityReviewItem = {
  exceptionType: 'MISSING_LIABILITY_NEEDS_SUPERVISOR_REVIEW';
  riderCode: string;
  riderName: string;
  supervisorCode: string;
  hasLiabilityRecord: false;
  equipmentDeliveryEvidence: string[];
  securityPaidEvidence: string | null;
  requestHistory: CycleEvidence[];
  managerActualHistory: CycleEvidence[];
  sheetRequestTotalEgp: number;
  sheetActualTotalEgp: number;
  whyItIsAnException: string;
  recommendedReviewAction: string;
};

export type SheetVsLedgerReviewItem = {
  exceptionType: 'SHEET_VS_LEDGER_DISAGREE' | 'ADMIN_LEDGER_CORRECTION_REQUIRED';
  riderCode: string;
  riderName: string;
  supervisorCode: string;
  original: number;
  settlement: number;
  ledgerDeducted: number;
  outstanding: number;
  w1: CycleEvidence | null;
  w2: CycleEvidence | null;
  sheetActualTotal: number;
  ledgerAppliedTotal: number;
  delta: number;
  ledgerInvariantOk: boolean;
  whyItIsAnException: string;
  recommendedReviewAction: string;
  /** milliemes mirrors */
  originalLiabilityMilli: number;
  settlementPaidMilli: number;
  amountDeductedMilli: number;
  outstandingMilli: number;
  totalSheetActualMilli: number;
  differenceMilli: number;
};

function parseMoney(v: unknown): number {
  if (v === undefined || v === null || v === '') return 0;
  const s = String(v).replace(/,/g, '').replace(/[^\d.-]/g, '');
  const n = Number(s);
  return Number.isFinite(n) ? n : 0;
}

export function cycleEvidence(
  rider: string,
  cycleLabel: string,
  monthLabel: string,
  year: number,
  requestRows: unknown[][],
  actualRows: unknown[][]
): CycleEvidence {
  const req = aggregateRequestedByRiderCycle(requestRows, cycleLabel, monthLabel, year).get(rider) || 0;
  const ACT = DEDUCTIONS_ACTUAL_HEADERS;
  let rawWalletEgp = 0;
  for (let i = 1; i < actualRows.length; i++) {
    const row = actualRows[i];
    if (!row) continue;
    if (String(row[ACT.indexOf('دورة_الاستقطاع')] ?? '').trim() !== cycleLabel) continue;
    if (String(row[ACT.indexOf('شهر')] ?? '').trim() !== monthLabel) continue;
    const yNum = Number(String(row[ACT.indexOf('سنة')] ?? '').replace(/,/g, ''));
    if (Number.isFinite(yNum) && Math.round(yNum) !== year) continue;
    if (normalizeRiderCodeKey(row[ACT.indexOf('كود_المندوب')]) !== rider) continue;
    rawWalletEgp += parseMoney(row[ACT.indexOf('خصم_المحفظة_شيت_المدير')]);
  }
  const actualAbsEgp = actualDeductedEgpFromWalletRaw(rawWalletEgp);
  const actualAbsMilli =
    aggregateActualPayrollByRiderCycle(actualRows, cycleLabel, monthLabel, year).get(rider) || 0;
  return {
    cycleLabel,
    monthLabel,
    year,
    requestMilli: req,
    requestEgp: milliemesToEgp(req),
    rawWalletEgp,
    actualAbsMilli,
    actualAbsEgp,
  };
}

/**
 * Genuine unexplained sheet-vs-ledger disagreement.
 *
 * Calibrated to forensic pattern (~7 riders):
 * - still open (outstanding > 0)
 * - scoped abs(wallet) payroll evidence exists
 * - amountDeductedMilli does NOT reflect that payroll (~0)
 * - settlementPaidMilli IS booked (payroll likely mis-booked as settlement,
 *   or settlement/proxy absorbs sheet evidence)
 *
 * Does NOT flag:
 * - outstanding already 0
 * - sheet already reflected in amountDeducted
 * - ordinary request/actual shortfall (carry-forward)
 * - sheet history with no settlement and no deducted (separate data issue)
 */
export function isGenuineSheetVsLedgerDisagree(params: {
  outstandingMilli: number;
  amountDeductedMilli: number;
  settlementPaidMilli: number;
  sheetActualMilli: number;
  toleranceMilli?: number;
}): boolean {
  const tol = params.toleranceMilli ?? 100; // 1 EGP
  const outstanding = Math.trunc(params.outstandingMilli);
  const deducted = Math.max(0, Math.trunc(params.amountDeductedMilli));
  const settlement = Math.max(0, Math.trunc(params.settlementPaidMilli));
  const sheet = Math.max(0, Math.trunc(params.sheetActualMilli));
  if (outstanding <= 0) return false;
  if (sheet <= tol) return false;
  if (deducted > tol) {
    // Payroll already booked into amountDeducted — only flag if sheet far exceeds it
    // after settlement is NOT used as substitute. Keep strict: if deducted present, require
    // unexplained = sheet - deducted > tol AND settlement does not explain the gap alone.
    return sheet - deducted > tol && settlement <= tol;
  }
  // deducted ~ 0: require settlement booked (forensic 7 pattern) to avoid wide false positives
  if (settlement <= tol) return false;
  return true;
}

/**
 * Riders with scoped equipment REQUEST/ACTUAL evidence but no liability row.
 * Requires full roster (or activity-derived riders) so supervisor assignment is preserved.
 */
export function buildMissingLiabilityQueue(params: {
  roster: RosterRider[];
  liabilities: EquipmentLiabilityIssue[];
  requestRows: unknown[][];
  actualRows: unknown[][];
  /** Evidence cycles only (e.g. Aug W1+W2) — not the whole ledger history. */
  evidenceCycles: Array<{ cycleLabel: string; monthLabel: string; year: number }>;
  deliveryNotesByRider?: Map<string, string[]>;
  securityPaidByRider?: Map<string, string>;
}): MissingLiabilityReviewItem[] {
  const liabilityCodes = new Set(
    params.liabilities.map((i) => normalizeRiderCodeKey(i.riderCode)).filter(Boolean)
  );

  const rosterByCode = new Map<string, RosterRider>();
  for (const r of params.roster) {
    const k = normalizeRiderCodeKey(r.riderCode);
    if (k) rosterByCode.set(k, r);
  }

  const REQ = DEDUCTION_IMPORT_HEADERS;
  const ACT = DEDUCTIONS_ACTUAL_HEADERS;
  const active = new Set<string>();
  const names = new Map<string, string>();
  const supervisors = new Map<string, string>();

  for (let i = 1; i < params.requestRows.length; i++) {
    const r = params.requestRows[i];
    if (!r) continue;
    const code = normalizeRiderCodeKey(r[REQ.indexOf('كود_المندوب')]);
    if (!code) continue;
    // Only count activity inside evidence cycles
    const c = String(r[REQ.indexOf('دورة_الاستقطاع')] ?? '').trim();
    const m = String(r[REQ.indexOf('شهر')] ?? '').trim();
    const y = String(r[REQ.indexOf('سنة')] ?? '').replace(/,/g, '').trim();
    const inScope = params.evidenceCycles.some(
      (ec) => ec.cycleLabel === c && ec.monthLabel === m && String(ec.year) === y
    );
    if (!inScope) continue;
    active.add(code);
    const nm = String(r[REQ.indexOf('اسم_المندوب')] ?? '').trim();
    const sup = String(r[REQ.indexOf('كود_المشرف')] ?? '').trim();
    if (nm) names.set(code, nm);
    if (sup) supervisors.set(code, sup);
  }
  for (let i = 1; i < params.actualRows.length; i++) {
    const r = params.actualRows[i];
    if (!r) continue;
    const code = normalizeRiderCodeKey(r[ACT.indexOf('كود_المندوب')]);
    if (!code) continue;
    const c = String(r[ACT.indexOf('دورة_الاستقطاع')] ?? '').trim();
    const m = String(r[ACT.indexOf('شهر')] ?? '').trim();
    const yNum = Number(String(r[ACT.indexOf('سنة')] ?? '').replace(/,/g, ''));
    const inScope = params.evidenceCycles.some(
      (ec) =>
        ec.cycleLabel === c &&
        ec.monthLabel === m &&
        (!Number.isFinite(yNum) || Math.round(yNum) === ec.year)
    );
    if (!inScope) continue;
    active.add(code);
    const nm = String(r[(ACT as readonly string[]).indexOf('اسم_المندوب')] ?? '').trim();
    const sup = String(r[(ACT as readonly string[]).indexOf('كود_المشرف')] ?? '').trim();
    if (nm) names.set(code, nm);
    if (sup) supervisors.set(code, sup);
  }

  // Also include delivery-only missing liabilities
  for (const k of params.deliveryNotesByRider?.keys() || []) active.add(k);

  const out: MissingLiabilityReviewItem[] = [];
  for (const key of [...active].sort()) {
    if (liabilityCodes.has(key)) continue;
    const roster = rosterByCode.get(key);
    const history = params.evidenceCycles.map((c) =>
      cycleEvidence(key, c.cycleLabel, c.monthLabel, c.year, params.requestRows, params.actualRows)
    );
    const reqTotal = history.reduce((s, h) => s + h.requestMilli, 0);
    const actTotal = history.reduce((s, h) => s + h.actualAbsMilli, 0);
    if (reqTotal <= 0 && actTotal <= 0 && !params.deliveryNotesByRider?.has(key)) continue;

    out.push({
      exceptionType: 'MISSING_LIABILITY_NEEDS_SUPERVISOR_REVIEW',
      riderCode: roster?.riderCode || key,
      riderName: roster?.riderName || names.get(key) || '',
      supervisorCode: roster?.supervisorCode || supervisors.get(key) || '',
      hasLiabilityRecord: false,
      equipmentDeliveryEvidence: params.deliveryNotesByRider?.get(key) || [],
      securityPaidEvidence: params.securityPaidByRider?.get(key) || null,
      requestHistory: history,
      managerActualHistory: history,
      sheetRequestTotalEgp: milliemesToEgp(reqTotal),
      sheetActualTotalEgp: milliemesToEgp(actTotal),
      whyItIsAnException:
        'Rider has scoped equipment request/actual evidence but no liability ledger row.',
      recommendedReviewAction:
        'Assign to supervisor for FINAL declaration. Do NOT auto-create liability. Admin approval required before backfill.',
    });
  }
  return out;
}

/**
 * Calibrated sheet-vs-ledger queue (~forensic 7 pattern).
 */
export function buildSheetVsLedgerQueue(params: {
  liabilities: EquipmentLiabilityIssue[];
  requestRows: unknown[][];
  actualRows: unknown[][];
  evidenceCycles: Array<{ cycleLabel: string; monthLabel: string; year: number }>;
  toleranceMilli?: number;
}): SheetVsLedgerReviewItem[] {
  const tol = params.toleranceMilli ?? 100;
  const out: SheetVsLedgerReviewItem[] = [];
  const w1 = params.evidenceCycles[0] || null;
  const w2 = params.evidenceCycles[1] || null;

  for (const issue of params.liabilities) {
    const rider = normalizeRiderCodeKey(issue.riderCode);
    if (!rider) continue;

    const cycles = params.evidenceCycles.map((c) =>
      cycleEvidence(rider, c.cycleLabel, c.monthLabel, c.year, params.requestRows, params.actualRows)
    );
    const totalSheetActualMilli = cycles.reduce((s, c) => s + c.actualAbsMilli, 0);
    const ledgerApplied = Math.trunc(issue.amountDeductedMilli || 0);
    const outstanding = Math.trunc(issue.outstandingMilli || 0);

    const inv = ledgerOutstandingInvariant({
      originalLiabilityMilli: issue.originalLiabilityMilli,
      amountDeductedMilli: issue.amountDeductedMilli,
      settlementPaidMilli: issue.settlementPaidMilli,
      outstandingMilli: issue.outstandingMilli,
    });

    if (!inv.ok) {
      out.push({
        exceptionType: 'ADMIN_LEDGER_CORRECTION_REQUIRED',
        riderCode: issue.riderCode,
        riderName: issue.riderNameSnapshot,
        supervisorCode: issue.supervisorCodeSnapshot,
        original: milliemesToEgp(issue.originalLiabilityMilli),
        settlement: milliemesToEgp(issue.settlementPaidMilli),
        ledgerDeducted: milliemesToEgp(ledgerApplied),
        outstanding: milliemesToEgp(outstanding),
        w1: w1
          ? cycleEvidence(rider, w1.cycleLabel, w1.monthLabel, w1.year, params.requestRows, params.actualRows)
          : null,
        w2: w2
          ? cycleEvidence(rider, w2.cycleLabel, w2.monthLabel, w2.year, params.requestRows, params.actualRows)
          : null,
        sheetActualTotal: milliemesToEgp(totalSheetActualMilli),
        ledgerAppliedTotal: milliemesToEgp(ledgerApplied),
        delta: milliemesToEgp(totalSheetActualMilli - ledgerApplied),
        ledgerInvariantOk: false,
        whyItIsAnException: `Ledger invariant failed: expected outstanding ${milliemesToEgp(inv.expectedOutstandingMilli)}, stored ${milliemesToEgp(outstanding)}.`,
        recommendedReviewAction:
          'Admin ledger correction required. Do not auto-overwrite. Supervisor still declares FINAL payment status.',
        originalLiabilityMilli: issue.originalLiabilityMilli,
        settlementPaidMilli: issue.settlementPaidMilli,
        amountDeductedMilli: ledgerApplied,
        outstandingMilli: outstanding,
        totalSheetActualMilli,
        differenceMilli: totalSheetActualMilli - ledgerApplied,
      });
      continue;
    }

    if (
      !isGenuineSheetVsLedgerDisagree({
        outstandingMilli: outstanding,
        amountDeductedMilli: ledgerApplied,
        settlementPaidMilli: issue.settlementPaidMilli || 0,
        sheetActualMilli: totalSheetActualMilli,
        toleranceMilli: tol,
      })
    ) {
      continue;
    }

    const deltaMilli = totalSheetActualMilli - ledgerApplied;
    out.push({
      exceptionType: 'SHEET_VS_LEDGER_DISAGREE',
      riderCode: issue.riderCode,
      riderName: issue.riderNameSnapshot,
      supervisorCode: issue.supervisorCodeSnapshot,
      original: milliemesToEgp(issue.originalLiabilityMilli),
      settlement: milliemesToEgp(issue.settlementPaidMilli),
      ledgerDeducted: milliemesToEgp(ledgerApplied),
      outstanding: milliemesToEgp(outstanding),
      w1: w1
        ? cycleEvidence(rider, w1.cycleLabel, w1.monthLabel, w1.year, params.requestRows, params.actualRows)
        : null,
      w2: w2
        ? cycleEvidence(rider, w2.cycleLabel, w2.monthLabel, w2.year, params.requestRows, params.actualRows)
        : null,
      sheetActualTotal: milliemesToEgp(totalSheetActualMilli),
      ledgerAppliedTotal: milliemesToEgp(ledgerApplied),
      delta: milliemesToEgp(deltaMilli),
      ledgerInvariantOk: true,
      whyItIsAnException: `Scoped sheet abs(wallet) payroll ${milliemesToEgp(totalSheetActualMilli)} EGP is not reflected in amountDeductedMilli (${milliemesToEgp(ledgerApplied)}). Outstanding still ${milliemesToEgp(outstanding)}. Risk of double-count or mis-booked settlement.`,
      recommendedReviewAction:
        'Supervisor declares FULLY_PAID / PARTIALLY_PAID / NOT_PAID. If ledger booking is wrong → ADMIN_LEDGER_CORRECTION_REQUIRED. No silent overwrite.',
      originalLiabilityMilli: issue.originalLiabilityMilli,
      settlementPaidMilli: issue.settlementPaidMilli,
      amountDeductedMilli: ledgerApplied,
      outstandingMilli: outstanding,
      totalSheetActualMilli,
      differenceMilli: deltaMilli,
    });
  }

  return out.sort((a, b) => Math.abs(b.differenceMilli) - Math.abs(a.differenceMilli));
}

export type DeclarationQueueItem = {
  riderCode: string;
  riderName: string;
  supervisorCode: string;
  originalLiabilityMilli: number | null;
  originalLiabilityEgp: number | null;
  securityPaidUpfront: boolean | null;
  systemOutstandingMilli: number | null;
  systemOutstandingEgp: number | null;
  settlementPaidMilli: number | null;
  settlementPaidEgp: number | null;
  amountDeductedMilli: number | null;
  amountDeductedEgp: number | null;
  hasLiability: boolean;
  equipmentIssueId: string | null;
  w1: CycleEvidence | null;
  w2: CycleEvidence | null;
  warnings: string[];
  needsFreshDeclaration: true;
};

/**
 * Fresh-from-scratch declaration queue for every currently relevant rider.
 * Population = full roster ∪ liability riders ∪ scoped activity riders.
 */
export function buildFreshDeclarationQueue(params: {
  roster: RosterRider[];
  liabilities: EquipmentLiabilityIssue[];
  requestRows: unknown[][];
  actualRows: unknown[][];
  evidenceCycles: Array<{ cycleLabel: string; monthLabel: string; year: number }>;
  /** When set, only this supervisor's riders. */
  supervisorCode?: string;
}): DeclarationQueueItem[] {
  const byRider = new Map<string, EquipmentLiabilityIssue>();
  for (const issue of params.liabilities) {
    const k = normalizeRiderCodeKey(issue.riderCode);
    if (!k) continue;
    if (!byRider.has(k) || issue.status === 'open') byRider.set(k, issue);
  }

  const rosterBy = new Map<string, RosterRider>();
  for (const r of params.roster) {
    const k = normalizeRiderCodeKey(r.riderCode);
    if (!k) continue;
    rosterBy.set(k, r);
  }

  const REQ = DEDUCTION_IMPORT_HEADERS;
  const ACT = DEDUCTIONS_ACTUAL_HEADERS;
  const activity = new Set<string>();
  for (let i = 1; i < params.requestRows.length; i++) {
    const r = params.requestRows[i];
    if (!r) continue;
    const code = normalizeRiderCodeKey(r[REQ.indexOf('كود_المندوب')]);
    if (!code) continue;
    const c = String(r[REQ.indexOf('دورة_الاستقطاع')] ?? '').trim();
    const m = String(r[REQ.indexOf('شهر')] ?? '').trim();
    const y = String(r[REQ.indexOf('سنة')] ?? '').replace(/,/g, '').trim();
    if (
      params.evidenceCycles.some(
        (ec) => ec.cycleLabel === c && ec.monthLabel === m && String(ec.year) === y
      )
    ) {
      activity.add(code);
    }
  }
  for (let i = 1; i < params.actualRows.length; i++) {
    const r = params.actualRows[i];
    if (!r) continue;
    const code = normalizeRiderCodeKey(r[ACT.indexOf('كود_المندوب')]);
    if (!code) continue;
    const c = String(r[ACT.indexOf('دورة_الاستقطاع')] ?? '').trim();
    const m = String(r[ACT.indexOf('شهر')] ?? '').trim();
    const yNum = Number(String(r[ACT.indexOf('سنة')] ?? '').replace(/,/g, ''));
    if (
      params.evidenceCycles.some(
        (ec) =>
          ec.cycleLabel === c &&
          ec.monthLabel === m &&
          (!Number.isFinite(yNum) || Math.round(yNum) === ec.year)
      )
    ) {
      activity.add(code);
    }
  }

  const population = new Set<string>([
    ...rosterBy.keys(),
    ...byRider.keys(),
    ...activity,
  ]);

  const w1 = params.evidenceCycles[0] || null;
  const w2 = params.evidenceCycles[1] || null;
  const wantSup = params.supervisorCode
    ? normalizeRiderCodeKey(params.supervisorCode).toUpperCase()
    : '';

  const out: DeclarationQueueItem[] = [];
  for (const key of [...population].sort()) {
    const roster = rosterBy.get(key);
    const issue = byRider.get(key) || null;
    const supervisorCode = roster?.supervisorCode || issue?.supervisorCodeSnapshot || '';
    if (wantSup) {
      const s = String(supervisorCode || '').replace(/\s+/g, '').toUpperCase();
      if (s !== wantSup && s.replace(/^WA-?/i, '') !== wantSup.replace(/^WA-?/i, '')) {
        // keep activity-only riders with empty supervisor for admin visibility when filtering? skip for supervisor-scoped
        if (params.supervisorCode) continue;
      }
    }

    // Relevant = on roster OR has liability OR has scoped activity
    const relevant = Boolean(roster) || Boolean(issue) || activity.has(key);
    if (!relevant) continue;

    const warnings: string[] = [];
    if (!issue && activity.has(key)) {
      warnings.push('MISSING_LIABILITY_NEEDS_SUPERVISOR_REVIEW');
    }
    if (!supervisorCode) warnings.push('SUPERVISOR_UNASSIGNED');
    if (!roster && issue) warnings.push('NOT_ON_CURRENT_ROSTER');

    const w1Ev = w1
      ? cycleEvidence(key, w1.cycleLabel, w1.monthLabel, w1.year, params.requestRows, params.actualRows)
      : null;
    const w2Ev = w2
      ? cycleEvidence(key, w2.cycleLabel, w2.monthLabel, w2.year, params.requestRows, params.actualRows)
      : null;

    out.push({
      riderCode: roster?.riderCode || issue?.riderCode || key,
      riderName: roster?.riderName || issue?.riderNameSnapshot || '',
      supervisorCode,
      originalLiabilityMilli: issue?.originalLiabilityMilli ?? null,
      originalLiabilityEgp:
        issue != null ? milliemesToEgp(issue.originalLiabilityMilli) : null,
      securityPaidUpfront: issue?.securityPaidUpfront ?? null,
      systemOutstandingMilli: issue?.outstandingMilli ?? null,
      systemOutstandingEgp: issue != null ? milliemesToEgp(issue.outstandingMilli) : null,
      settlementPaidMilli: issue?.settlementPaidMilli ?? null,
      settlementPaidEgp: issue != null ? milliemesToEgp(issue.settlementPaidMilli) : null,
      amountDeductedMilli: issue?.amountDeductedMilli ?? null,
      amountDeductedEgp: issue != null ? milliemesToEgp(issue.amountDeductedMilli) : null,
      hasLiability: Boolean(issue),
      equipmentIssueId: issue?.equipmentIssueId ?? null,
      w1: w1Ev,
      w2: w2Ev,
      warnings,
      needsFreshDeclaration: true,
    });
  }

  return out;
}
