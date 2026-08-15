/**
 * 4D.5.4.15D — READ-ONLY Expected installment ladder helpers (pure).
 * Business rule: EXPECTED = MIN(normalInstallment, currentOutstanding)
 * Normal installment for 900 EGP original = 300 EGP (schedule[0..2]).
 */

import { expectedInstallmentMilliemes } from '@/lib/money';
import { scheduleFromPersistedOriginalMilli } from '@/lib/equipmentPricing/computeFromPricing';

export const NORMAL_INSTALLMENT_EGP = 300;
export const NORMAL_INSTALLMENT_MILLI = 30000;

export type ExpectedLadderStep = {
  cycle: number;
  currentOutstandingMilli: number;
  normalInstallmentMilli: number;
  expectedDeductionMilli: number;
  theoreticalRemainingMilli: number;
};

/**
 * Simulate successive Expected deductions without mutating Production.
 * Uses schedule from persisted original; caps each step by remaining outstanding.
 * settlementPaid does NOT advance installment index — only amountDeducted / index do.
 */
export function simulateExpectedInstallmentLadder(params: {
  originalLiabilityMilli: number;
  openingOutstandingMilli: number;
  amountDeductedMilli?: number;
  installmentsCompleted?: number;
  maxCycles?: number;
}): ExpectedLadderStep[] {
  const schedule = scheduleFromPersistedOriginalMilli(params.originalLiabilityMilli);
  let outstanding = Math.max(0, Math.trunc(params.openingOutstandingMilli));
  let deducted = Math.max(0, Math.trunc(params.amountDeductedMilli ?? 0));
  let index = Math.max(0, Math.trunc(params.installmentsCompleted ?? 0));
  const maxCycles = Math.max(1, Math.trunc(params.maxCycles ?? 6));
  const steps: ExpectedLadderStep[] = [];

  for (let c = 1; c <= maxCycles; c++) {
    const normal =
      typeof schedule[index] === 'number' && Number.isFinite(schedule[index])
        ? Math.max(0, Math.trunc(schedule[index]))
        : NORMAL_INSTALLMENT_MILLI;
    const expected = expectedInstallmentMilliemes({
      remainingMilli: outstanding,
      schedule,
      installmentIndex: index,
      amountDeductedMilli: deducted,
    });
    const remaining = Math.max(0, outstanding - expected);
    steps.push({
      cycle: c,
      currentOutstandingMilli: outstanding,
      normalInstallmentMilli: normal,
      expectedDeductionMilli: expected,
      theoreticalRemainingMilli: remaining,
    });
    if (expected <= 0) break;
    outstanding = remaining;
    deducted += expected;
    index += 1;
  }

  return steps;
}

export function totalTheoreticalDeductions(steps: ExpectedLadderStep[]): number {
  return steps.reduce((s, x) => s + x.expectedDeductionMilli, 0);
}
