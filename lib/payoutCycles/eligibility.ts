import type { PayoutCycle } from './types';

/**
 * Resolve the cycle whose deductionGenerationDate matches `asOfDate` (YYYY-MM-DD).
 * Prefer exact match; if none, pick active cycle where start<=asOf<=end and generation date <= asOf.
 */
export function resolveCycleForDeductionDate(
  cycles: PayoutCycle[],
  asOfDate: string
): PayoutCycle | null {
  const exact = cycles.find((c) => c.deductionGenerationDate === asOfDate);
  if (exact) return exact;

  const covering = cycles
    .filter(
      (c) =>
        c.status !== 'draft' &&
        c.startDate <= asOfDate &&
        c.endDate >= asOfDate &&
        c.deductionGenerationDate <= asOfDate
    )
    .sort((a, b) => b.deductionGenerationDate.localeCompare(a.deductionGenerationDate));
  return covering[0] || null;
}

export function shouldSkipEquipmentAutoDeductions(cycle: Pick<PayoutCycle, 'equipmentDeductionEnabled' | 'isClosing'>): boolean {
  return !cycle.equipmentDeductionEnabled || cycle.isClosing;
}

/**
 * First eligible equipment-deduction cycle after activation:
 * next equipment-enabled, non-closing cycle with startDate > activationDate.
 */
export function findFirstEligibleEquipmentCycle(
  cycles: PayoutCycle[],
  activationDate: string
): PayoutCycle | null {
  if (!activationDate) return null;
  const eligible = cycles
    .filter(
      (c) =>
        c.equipmentDeductionEnabled &&
        !c.isClosing &&
        c.startDate > activationDate &&
        c.status !== 'draft'
    )
    .sort((a, b) => a.startDate.localeCompare(b.startDate) || a.cycleNumber - b.cycleNumber);
  return eligible[0] || null;
}

/**
 * Is `cycle` eligible for auto equipment deduction for a rider activated on `activationDate`?
 * - Must not be closing / equipment-disabled
 * - Activation cycle itself excluded: need startDate > activationDate
 * - Must be on/after the first eligible cycle (same or later)
 */
export function isCycleEligibleForEquipmentDeduction(
  cycle: PayoutCycle,
  allCycles: PayoutCycle[],
  activationDate: string
): { eligible: boolean; reason?: string } {
  if (cycle.status === 'finalized') {
    return { eligible: false, reason: 'cycle_finalized' };
  }
  if (cycle.status === 'draft') {
    return { eligible: false, reason: 'cycle_draft' };
  }
  if (shouldSkipEquipmentAutoDeductions(cycle)) {
    return {
      eligible: false,
      reason: cycle.isClosing ? 'closing_cycle' : 'equipment_deduction_disabled',
    };
  }
  if (!activationDate) {
    return { eligible: false, reason: 'missing_activation_date' };
  }
  if (cycle.startDate <= activationDate && cycle.endDate >= activationDate) {
    return { eligible: false, reason: 'activation_in_current_cycle' };
  }
  if (cycle.startDate <= activationDate) {
    return { eligible: false, reason: 'cycle_not_after_activation' };
  }
  const first = findFirstEligibleEquipmentCycle(allCycles, activationDate);
  if (!first) {
    return { eligible: false, reason: 'no_eligible_cycle' };
  }
  if (cycle.startDate < first.startDate) {
    return { eligible: false, reason: 'before_first_eligible' };
  }
  return { eligible: true };
}
