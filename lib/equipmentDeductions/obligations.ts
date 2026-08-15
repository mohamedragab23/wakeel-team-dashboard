/**
 * SRS-014 Phase 4A — pure obligation domain model.
 * No I/O, Sheets, ledger, or wallet mutations.
 */

export const EQUIPMENT_REASON = 'معدات' as const;

/** Locked frozen vocabulary order (non-equipment follows this after Equipment First). */
export const NON_EQUIPMENT_REASON_ORDER = [
  'استعلام أمني',
  'مديونية سابقة',
  'سلفة',
  'خصم تشغيل',
] as const;

export type FrozenDeductionReason =
  | typeof EQUIPMENT_REASON
  | (typeof NON_EQUIPMENT_REASON_ORDER)[number];

export type ObligationSource = 'auto_equipment' | 'supervisor' | 'manual_v2' | 'other';

export type ObligationStatus =
  | 'open'
  | 'partially_allocated'
  | 'paid'
  | 'cancelled'
  | 'replaced';

export type DeductionObligation = {
  deductionId: string;
  source: ObligationSource;
  riderCode: string;
  reason: FrozenDeductionReason;
  equipmentIssueId?: string;
  installmentNumber?: number;
  originalCycleId: string;
  currentCycleId: string;
  /** Immutable original request amount (milliemes). */
  originalAmount: number;
  paidAmount: number;
  remainingAmount: number;
  status: ObligationStatus;
  /**
   * Deterministic age key for FIFO (lower = older).
   * Typically ISO createdAt or epoch millis; compared lexicographically as string
   * or numerically when both parse as finite numbers.
   */
  obligationAgeKey: string;
};

export type CreateRequestObligationInput = {
  deductionId: string;
  source: ObligationSource;
  riderCode: string;
  reason: FrozenDeductionReason;
  originalCycleId: string;
  currentCycleId?: string;
  originalAmount: number;
  obligationAgeKey: string;
  equipmentIssueId?: string;
  installmentNumber?: number;
};

function truncNonNeg(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.trunc(n));
}

/** Create a new REQUEST obligation: paid=0, remaining=original. No payment implied. */
export function createRequestObligation(input: CreateRequestObligationInput): DeductionObligation {
  const originalAmount = truncNonNeg(input.originalAmount);
  const reason = input.reason;
  const equipmentIssueId =
    reason === EQUIPMENT_REASON ? String(input.equipmentIssueId || '').trim() || undefined : undefined;
  const installmentNumber =
    reason === EQUIPMENT_REASON && input.installmentNumber != null
      ? Math.max(1, Math.trunc(input.installmentNumber))
      : undefined;

  return {
    deductionId: String(input.deductionId || '').trim(),
    source: input.source,
    riderCode: String(input.riderCode || '').trim(),
    reason,
    equipmentIssueId,
    installmentNumber,
    originalCycleId: String(input.originalCycleId || '').trim(),
    currentCycleId: String(input.currentCycleId || input.originalCycleId || '').trim(),
    originalAmount,
    paidAmount: 0,
    remainingAmount: originalAmount,
    status: 'open',
    obligationAgeKey: String(input.obligationAgeKey || ''),
  };
}

/** originalAmount is immutable — never overwritten by helpers in this module. */
export function assertOriginalAmountImmutable(
  before: DeductionObligation,
  after: DeductionObligation
): boolean {
  return before.originalAmount === after.originalAmount && before.deductionId === after.deductionId;
}

export function isEconomicallyConsistent(o: DeductionObligation): boolean {
  const paid = truncNonNeg(o.paidAmount);
  const rem = truncNonNeg(o.remainingAmount);
  const orig = truncNonNeg(o.originalAmount);
  return paid + rem === orig && paid <= orig && rem <= orig;
}

export function deriveStatusFromAmounts(paidAmount: number, remainingAmount: number): ObligationStatus {
  const paid = truncNonNeg(paidAmount);
  const rem = truncNonNeg(remainingAmount);
  if (rem === 0 && paid > 0) return 'paid';
  if (paid > 0 && rem > 0) return 'partially_allocated';
  return 'open';
}

/**
 * Pure projection after applying an allocated amount to one obligation.
 * Does not mutate input. Does not touch wallet / installmentsCompleted persistence.
 */
export function projectAfterAllocation(
  obligation: DeductionObligation,
  allocatedMilli: number
): {
  obligation: DeductionObligation;
  allocatedAmount: number;
  installmentCompleted: boolean;
} {
  const alloc = truncNonNeg(allocatedMilli);
  const capped = Math.min(alloc, truncNonNeg(obligation.remainingAmount));
  const paidAfter = truncNonNeg(obligation.paidAmount) + capped;
  const remainingAfter = truncNonNeg(obligation.originalAmount) - paidAfter;
  const installmentCompleted =
    obligation.reason === EQUIPMENT_REASON &&
    truncNonNeg(obligation.remainingAmount) > 0 &&
    remainingAfter === 0;

  return {
    allocatedAmount: capped,
    installmentCompleted,
    obligation: {
      ...obligation,
      originalAmount: obligation.originalAmount,
      paidAmount: paidAfter,
      remainingAmount: remainingAfter,
      status: deriveStatusFromAmounts(paidAfter, remainingAfter),
    },
  };
}

export function compareAgeKeys(a: string, b: string): number {
  const na = Number(a);
  const nb = Number(b);
  if (Number.isFinite(na) && Number.isFinite(nb)) return na - nb;
  return a < b ? -1 : a > b ? 1 : 0;
}

export function isOpenForAllocation(o: DeductionObligation): boolean {
  if (o.status === 'cancelled' || o.status === 'replaced' || o.status === 'paid') return false;
  return truncNonNeg(o.remainingAmount) > 0;
}
