/**
 * Derived payment status for Equipment Liability Management Desk.
 * Separate from liability status (open|settled|waived|closed).
 */

export type EquipmentPaymentStatus = 'UNPAID' | 'PARTIALLY_PAID' | 'PAID';

export const EQUIPMENT_PAYMENT_STATUS_AR: Record<EquipmentPaymentStatus, string> = {
  UNPAID: 'لم يدفع',
  PARTIALLY_PAID: 'دفع جزئي',
  PAID: 'دفع بالكامل',
};

/** Lifecycle of a cash payment history row vs العهدة aggregate. */
export type EquipmentPaymentAggregateStatus =
  | 'PENDING'
  | 'APPLIED'
  | 'CONFLICT'
  | 'REQUIRES_REVIEW';

export const EQUIPMENT_PAYMENT_AGGREGATE_STATUS_AR: Record<
  EquipmentPaymentAggregateStatus,
  string
> = {
  PENDING: 'معلّق',
  APPLIED: 'مطبّق',
  CONFLICT: 'تعارض',
  REQUIRES_REVIEW: 'يحتاج مراجعة',
};

export function deriveEquipmentPaymentStatus(params: {
  settlementPaidMilli: number;
  amountDeductedMilli: number;
  outstandingMilli: number;
}): EquipmentPaymentStatus {
  const cash = Math.max(0, Math.trunc(params.settlementPaidMilli || 0));
  const auto = Math.max(0, Math.trunc(params.amountDeductedMilli || 0));
  const outstanding = Math.trunc(params.outstandingMilli);
  const totalCredited = cash + auto;

  if (outstanding === 0) return 'PAID';
  if (totalCredited === 0 && outstanding > 0) return 'UNPAID';
  if (totalCredited > 0 && outstanding > 0) return 'PARTIALLY_PAID';
  // outstanding < 0 should never occur; treat as PAID for display safety.
  return 'PAID';
}

export function totalCreditedMilli(params: {
  settlementPaidMilli: number;
  amountDeductedMilli: number;
}): number {
  return (
    Math.max(0, Math.trunc(params.settlementPaidMilli || 0)) +
    Math.max(0, Math.trunc(params.amountDeductedMilli || 0))
  );
}
