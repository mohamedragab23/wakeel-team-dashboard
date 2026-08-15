/**
 * SRS-014 Phase D — liability balance reconciliation after payroll ledger posts.
 * Money is integer milliemes only.
 */

export type LiabilityBalanceSnapshot = {
  originalLiabilityMilli: number;
  amountDeductedMilli: number;
  settlementPaidMilli: number;
  outstandingMilli: number;
  status: string;
};

/**
 * Expected outstanding for an open issue:
 * original - installmentAutoDeducted - settlementPaid
 * (waiver sets outstanding to 0 / status waived — not handled here).
 */
export function expectedOutstandingMilli(s: LiabilityBalanceSnapshot): number {
  return Math.max(
    0,
    Math.trunc(s.originalLiabilityMilli) -
      Math.trunc(s.amountDeductedMilli) -
      Math.trunc(s.settlementPaidMilli || 0)
  );
}

/** True when open-issue outstanding does not match the money equation. */
export function liabilityBalanceInconsistent(s: LiabilityBalanceSnapshot): boolean {
  if (s.status !== 'open') return false;
  return Math.trunc(s.outstandingMilli) !== expectedOutstandingMilli(s);
}

/**
 * Detect a ledger post that has not yet been applied to installment progress.
 * Safe: returns 0 when applying would double-deduct.
 *
 * Call only when payroll ledger already has this idempotency key.
 * Pass `balanceAlreadyApplied=true` when liability amountDeducted already
 * reflects this post (or a posted auto-deduction row exists for the key).
 */
export function unrecoveredLedgerPostMilli(params: {
  snapshot: LiabilityBalanceSnapshot;
  postedMilli: number;
  balanceAlreadyApplied: boolean;
}): number {
  const posted = Math.max(0, Math.trunc(params.postedMilli));
  if (posted <= 0) return 0;
  if (params.snapshot.status !== 'open') return 0;
  if (params.balanceAlreadyApplied) return 0;

  const expected = expectedOutstandingMilli(params.snapshot);
  if (Math.trunc(params.snapshot.outstandingMilli) !== expected) {
    // Inconsistent sheet — do not guess; ops must repair manually.
    return 0;
  }
  return Math.min(posted, Math.max(0, Math.trunc(params.snapshot.outstandingMilli)));
}

/** Derive installmentComplete for a recovered gap on the current installment. */
export function shouldIncrementInstallmentAfterRecover(params: {
  schedule: number[];
  installmentsCompleted: number;
  amountDeductedMilli: number;
  gapMilli: number;
}): boolean {
  const completedSum = params.schedule
    .slice(0, params.installmentsCompleted)
    .reduce((a, b) => a + Math.max(0, Math.trunc(b)), 0);
  const target = Math.max(0, Math.trunc(params.schedule[params.installmentsCompleted] ?? 0));
  if (target <= 0) return false;
  const paidToward = Math.max(0, Math.trunc(params.amountDeductedMilli) - completedSum);
  return paidToward + Math.max(0, Math.trunc(params.gapMilli)) >= target;
}
