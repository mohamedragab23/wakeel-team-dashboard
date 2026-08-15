/**
 * Pure liability computation from an immutable Admin price snapshot.
 */

import { splitInstallmentsMilliemes } from '@/lib/money';
import type { EquipmentPriceSnapshot } from '@/lib/equipmentPricing/types';
import type { EquipmentBagType } from '@/lib/equipmentLiability/constants';

export const STANDARD_ASSIGNMENT_SHIRT_QTY = 2;

export function bagCostMilliFromSnapshot(
  snapshot: EquipmentPriceSnapshot,
  bagType: EquipmentBagType
): number {
  return bagType === 'bicycle' ? snapshot.bicycleBagMilli : snapshot.motorcycleBagMilli;
}

export function computeOriginalLiabilityMilli(params: {
  snapshot: EquipmentPriceSnapshot;
  bagType: EquipmentBagType;
  shirtQty?: number;
  securityPaidUpfront: boolean;
  /** When true, bag cost is excluded (e.g. shirt-only swap). */
  includeBag?: boolean;
}): number {
  const includeBag = params.includeBag !== false;
  const shirtQty = Math.max(0, Math.trunc(params.shirtQty ?? STANDARD_ASSIGNMENT_SHIRT_QTY));
  const bag = includeBag ? bagCostMilliFromSnapshot(params.snapshot, params.bagType) : 0;
  const shirts = shirtQty * params.snapshot.shirtMilli;
  const security = params.securityPaidUpfront ? 0 : params.snapshot.securityFeeMilli;
  return bag + shirts + security;
}

export function computeAssignmentLiabilityFields(params: {
  snapshot: EquipmentPriceSnapshot;
  bagType: EquipmentBagType;
  securityPaidUpfront: boolean;
  jacketHeld?: boolean;
  helmetHeld?: boolean;
}): {
  bagCostMilli: number;
  shirtQty: number;
  shirtCostMilli: number;
  securityFeeMilli: number;
  originalLiabilityMilli: number;
  outstandingMilli: number;
  amountDeductedMilli: number;
  settlementPaidMilli: number;
  installmentsCompleted: number;
  installmentSchedule: number[];
  jacketHeld: boolean;
  helmetHeld: boolean;
  priceSnapshot: EquipmentPriceSnapshot;
} {
  const shirtQty = STANDARD_ASSIGNMENT_SHIRT_QTY;
  const bagCostMilli = bagCostMilliFromSnapshot(params.snapshot, params.bagType);
  const shirtCostMilli = shirtQty * params.snapshot.shirtMilli;
  const securityFeeMilli = params.snapshot.securityFeeMilli;
  const originalLiabilityMilli = computeOriginalLiabilityMilli({
    snapshot: params.snapshot,
    bagType: params.bagType,
    shirtQty,
    securityPaidUpfront: params.securityPaidUpfront,
    includeBag: true,
  });
  const schedule = splitInstallmentsMilliemes(originalLiabilityMilli, 3);
  return {
    bagCostMilli,
    shirtQty,
    shirtCostMilli,
    securityFeeMilli,
    originalLiabilityMilli,
    outstandingMilli: originalLiabilityMilli,
    amountDeductedMilli: 0,
    settlementPaidMilli: 0,
    installmentsCompleted: 0,
    installmentSchedule: schedule,
    jacketHeld: Boolean(params.jacketHeld),
    helmetHeld: Boolean(params.helmetHeld),
    priceSnapshot: params.snapshot,
  };
}

/** Installment schedule from persisted original — never re-read live Admin prices. */
export function scheduleFromPersistedOriginalMilli(originalLiabilityMilli: number): number[] {
  return splitInstallmentsMilliemes(Math.max(0, Math.trunc(originalLiabilityMilli)), 3);
}
