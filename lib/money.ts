/**
 * SRS-014 — integer-safe money (milliemes).
 * 1 EGP = 100 milliemes. Never use floating-point for financial math.
 */

export const MILLIEMES_PER_EGP = 100;

/**
 * Approved CURRENT business fixture amounts (milliemes) matching Admin defaults
 * Bag 530 + 2×Shirt 135 + Security 100.
 *
 * NOT a runtime Source of Truth for NEW liabilities (see lib/equipmentPricing).
 * Kept for installment arithmetic fixtures / docs of the 800/900 meaning.
 */
export const BAG_COST_MILLI = 53000;
export const TWO_TSHIRTS_COST_MILLI = 27000;
export const SECURITY_FEE_MILLI = 10000;
export const FULL_LIABILITY_MILLI = BAG_COST_MILLI + TWO_TSHIRTS_COST_MILLI + SECURITY_FEE_MILLI; // 90000
export const LIABILITY_AFTER_SECURITY_PAID_MILLI = FULL_LIABILITY_MILLI - SECURITY_FEE_MILLI; // 80000

export type SecurityInquiryPayment = 'PAID' | 'NOT_PAID';

export function egpToMilliemes(egp: number): number {
  if (!Number.isFinite(egp)) return 0;
  return Math.round(egp * MILLIEMES_PER_EGP);
}

export function milliemesToEgp(milli: number): number {
  if (!Number.isFinite(milli)) return 0;
  return milli / MILLIEMES_PER_EGP;
}

/** Display helper: always 2 decimal places from integer milliemes. */
export function formatMilliemesAsEgp(milli: number): string {
  return milliemesToEgp(Math.trunc(milli)).toFixed(2);
}

export function originalLiabilityMilliemes(security: SecurityInquiryPayment): number {
  return security === 'PAID' ? LIABILITY_AFTER_SECURITY_PAID_MILLI : FULL_LIABILITY_MILLI;
}

/**
 * Split remaining liability into `parts` installments.
 * Remainder is front-loaded into earlier installments
 * (80000 → 26667+26667+26666; 90000 → 30000×3).
 */
export function splitInstallmentsMilliemes(totalMilli: number, parts = 3): number[] {
  const total = Math.max(0, Math.trunc(totalMilli));
  const n = Math.max(1, Math.trunc(parts));
  if (total === 0) return Array.from({ length: n }, () => 0);

  // Front-load remainder into earlier installments so 80000 → 26667+26667+26666
  // (frozen SRS-014 rule; not "absorb into final" via floor+last).
  const base = Math.floor(total / n);
  const remainder = total - base * n;
  const out = Array.from({ length: n }, () => base);
  for (let i = 0; i < remainder; i++) {
    out[i] += 1;
  }
  return out;
}

/** Schedule for a new issue based on security fee payment. */
export function liabilityInstallmentSchedule(security: SecurityInquiryPayment): {
  originalLiabilityMilli: number;
  schedule: number[];
} {
  const originalLiabilityMilli = originalLiabilityMilliemes(security);
  return {
    originalLiabilityMilli,
    schedule: splitInstallmentsMilliemes(originalLiabilityMilli, 3),
  };
}

/**
 * Next installment amount from remaining balance + schedule index.
 * Caps by remaining; uses schedule[index] when available, else equal split of remainder.
 *
 * When `amountDeductedMilli` is provided, only the unpaid remainder of the
 * current installment is returned (partial-payout carry-forward).
 */
export function expectedInstallmentMilliemes(params: {
  remainingMilli: number;
  schedule: number[];
  installmentIndex: number; // 0-based
  amountDeductedMilli?: number;
}): number {
  const remaining = Math.max(0, Math.trunc(params.remainingMilli));
  if (remaining <= 0) return 0;
  const idx = Math.max(0, Math.trunc(params.installmentIndex));
  const fromSchedule = params.schedule[idx];
  if (typeof fromSchedule === 'number' && Number.isFinite(fromSchedule)) {
    let target = Math.max(0, Math.trunc(fromSchedule));
    if (params.amountDeductedMilli != null) {
      const deducted = Math.max(0, Math.trunc(params.amountDeductedMilli));
      const completedSum = params.schedule
        .slice(0, idx)
        .reduce((s, n) => s + Math.max(0, Math.trunc(n)), 0);
      const paidIntoCurrent = Math.max(0, deducted - completedSum);
      target = Math.max(0, target - paidIntoCurrent);
    }
    return Math.min(remaining, target);
  }
  const leftParts = Math.max(1, params.schedule.length - idx);
  return Math.min(remaining, Math.ceil(remaining / leftParts));
}
