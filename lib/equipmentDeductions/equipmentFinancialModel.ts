/**
 * Authoritative equipment deduction financial model (pure functions).
 *
 * Separates:
 * - supervisor declaration (cash / pre-payroll payment evidence)
 * - REQUEST (الاستقطاعات)
 * - ACTUAL payroll (الاستقطاعات_الفعلية.خصم_المحفظة_شيت_المدير)
 * - carry-forward shortfall (request − actual per cycle)
 */

import { egpToMilliemes, milliemesToEgp } from '@/lib/money';
import { normalizeRiderCodeForPerformance } from '@/lib/riderCodeUtils';

/** Hard maximum REQUEST per payout cycle (300 EGP). */
export const MAX_CYCLE_INSTALLMENT_MILLI = 30000;

export type SupervisorPaymentStatus = 'NOT_PAID' | 'PARTIALLY_PAID' | 'FULLY_PAID';

export type ReconciliationStatus =
  | 'MATCH'
  | 'PARTIAL_ACTUAL'
  | 'ACTUAL_ZERO'
  | 'SUPERVISOR_FULLY_PAID'
  | 'SUPERVISOR_PARTIALLY_PAID'
  | 'SUPERVISOR_NOT_PAID'
  | 'OVER_DEDUCTION'
  | 'REQUEST_MISMATCH'
  | 'MISSING_ACTUAL'
  | 'MISSING_LIABILITY'
  | 'DUPLICATE_RIDER'
  | 'INVALID_CYCLE'
  | 'DATA_ERROR';

export type CycleRequestActual = {
  cycleKey: string;
  requestedMilli: number;
  actualMilli: number;
};

export type FinancialState = {
  originalLiabilityMilli: number;
  supervisorDeclaredPaidMilli: number;
  outstandingAfterSupervisorMilli: number;
  cumulativeActualPayrollMilli: number;
  currentOutstandingMilli: number;
  /** Positive when cumulative actual exceeds post-supervisor baseline (audit). */
  actualExceedsSupervisorBaselineMilli: number;
};

/** Split liability into per-cycle REQUEST chunks capped at 300 EGP each. */
export function splitInstallmentsMilliemesCapped(
  totalMilli: number,
  maxParts = 6
): number[] {
  let remaining = Math.max(0, Math.trunc(totalMilli));
  const out: number[] = [];
  while (remaining > 0 && out.length < maxParts) {
    const chunk = Math.min(MAX_CYCLE_INSTALLMENT_MILLI, remaining);
    out.push(chunk);
    remaining -= chunk;
  }
  return out;
}

export function declaredPaidFromStatus(params: {
  status: SupervisorPaymentStatus;
  declaredPaidMilli?: number | null;
  originalLiabilityMilli: number;
}): number {
  const original = Math.max(0, Math.trunc(params.originalLiabilityMilli));
  if (params.status === 'FULLY_PAID') return original;
  if (params.status === 'NOT_PAID') return 0;
  const paid = Math.max(0, Math.trunc(params.declaredPaidMilli ?? 0));
  return Math.min(original, paid);
}

export function computeFinancialState(params: {
  originalLiabilityMilli: number;
  supervisorDeclaredPaidMilli: number;
  cumulativeActualPayrollMilli: number;
}): FinancialState {
  const original = Math.max(0, Math.trunc(params.originalLiabilityMilli));
  const declared = Math.min(original, Math.max(0, Math.trunc(params.supervisorDeclaredPaidMilli)));
  const afterSupervisor = Math.max(0, original - declared);
  const actual = Math.max(0, Math.trunc(params.cumulativeActualPayrollMilli));
  const current = Math.max(0, afterSupervisor - actual);
  const actualExceeds = Math.max(0, actual - afterSupervisor);
  return {
    originalLiabilityMilli: original,
    supervisorDeclaredPaidMilli: declared,
    outstandingAfterSupervisorMilli: afterSupervisor,
    cumulativeActualPayrollMilli: actual,
    currentOutstandingMilli: current,
    actualExceedsSupervisorBaselineMilli: actualExceeds,
  };
}

/** Unfulfilled REQUEST portion for one cycle. */
export function cycleShortfallMilli(requestedMilli: number, actualMilli: number): number {
  const requested = Math.max(0, Math.trunc(requestedMilli));
  const actual = Math.max(0, Math.trunc(actualMilli));
  return Math.max(0, requested - actual);
}

/**
 * Sum carry-forward shortfalls from ordered prior cycles.
 * Pass pairs in chronological order; `upToCycleKey` excludes that cycle and later.
 */
export function sumCarryForwardShortfall(
  history: CycleRequestActual[],
  upToCycleKey?: string
): number {
  let total = 0;
  for (const row of history) {
    if (upToCycleKey && row.cycleKey === upToCycleKey) break;
    total += cycleShortfallMilli(row.requestedMilli, row.actualMilli);
  }
  return total;
}

/**
 * Next-cycle REQUEST amount.
 * Rule: previous shortfall + min(300, payroll outstanding), capped at outstanding + shortfall.
 */
export function computeCycleRequestMilli(params: {
  payrollOutstandingMilli: number;
  carryForwardShortfallMilli: number;
}): number {
  const outstanding = Math.max(0, Math.trunc(params.payrollOutstandingMilli));
  const carry = Math.max(0, Math.trunc(params.carryForwardShortfallMilli));
  const newInstallment = Math.min(MAX_CYCLE_INSTALLMENT_MILLI, outstanding);
  const raw = carry + newInstallment;
  return Math.min(raw, outstanding + carry);
}

export function validateDeclaredPaid(params: {
  status: SupervisorPaymentStatus;
  declaredPaidEgp: number | null | undefined;
  originalLiabilityMilli: number;
}): { ok: true; paidMilli: number } | { ok: false; error: string } {
  const original = Math.max(0, Math.trunc(params.originalLiabilityMilli));
  if (params.status === 'FULLY_PAID') {
    return { ok: true, paidMilli: original };
  }
  if (params.status === 'NOT_PAID') {
    return { ok: true, paidMilli: 0 };
  }
  const egp = params.declaredPaidEgp;
  if (egp == null || !Number.isFinite(Number(egp))) {
    return { ok: false, error: 'المبلغ المدفوع مطلوب للدفع الجزئي' };
  }
  const paid = egpToMilliemes(Number(egp));
  if (paid < 0) return { ok: false, error: 'المبلغ المدفوع لا يمكن أن يكون سالباً' };
  if (paid > original) {
    return { ok: false, error: 'المبلغ المدفوع يتجاوز أصل العهدة' };
  }
  return { ok: true, paidMilli: paid };
}

export function normalizeRiderCodeKey(code: unknown): string {
  return normalizeRiderCodeForPerformance(code);
}

export function classifyReconciliation(params: {
  hasLiability: boolean;
  financial: FinancialState;
  requestedMilli: number;
  actualMilli: number;
  shortfallMilli: number;
  duplicateRider: boolean;
  invalidCycle: boolean;
}): ReconciliationStatus {
  if (params.invalidCycle) return 'INVALID_CYCLE';
  if (params.duplicateRider) return 'DUPLICATE_RIDER';
  if (!params.hasLiability) return 'MISSING_LIABILITY';
  if (params.financial.supervisorDeclaredPaidMilli >= params.financial.originalLiabilityMilli) {
    return 'SUPERVISOR_FULLY_PAID';
  }
  if (params.financial.supervisorDeclaredPaidMilli === 0) {
    if (params.requestedMilli > 0 && params.actualMilli === 0) return 'MISSING_ACTUAL';
    return 'SUPERVISOR_NOT_PAID';
  }
  if (
    params.financial.supervisorDeclaredPaidMilli > 0 &&
    params.financial.supervisorDeclaredPaidMilli < params.financial.originalLiabilityMilli
  ) {
    // partial supervisor payment
  }
  if (params.financial.actualExceedsSupervisorBaselineMilli > 0) return 'OVER_DEDUCTION';
  if (params.actualMilli === 0 && params.requestedMilli > 0) return 'ACTUAL_ZERO';
  if (params.shortfallMilli > 0) return 'PARTIAL_ACTUAL';
  if (params.requestedMilli !== params.actualMilli && params.actualMilli > 0) {
    return 'REQUEST_MISMATCH';
  }
  if (params.financial.supervisorDeclaredPaidMilli > 0) return 'SUPERVISOR_PARTIALLY_PAID';
  return 'MATCH';
}

export function formatMilliEgp(milli: number): string {
  return milliemesToEgp(Math.trunc(milli)).toFixed(2);
}
