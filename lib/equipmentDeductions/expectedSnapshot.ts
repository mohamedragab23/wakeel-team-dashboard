/**
 * SRS-014 — Expected equipment deduction snapshot (CALCULATION ONLY).
 *
 * Does NOT:
 * - mint REQUEST rows
 * - mutate wallet / liability balances
 * - call financial apply
 * - append ledger_native
 *
 * Used for Sunday/admin preview of what Auto REQUEST would size.
 */

import { expectedInstallmentMilliemes } from '@/lib/money';
import { scheduleFromPersistedOriginalMilli } from '@/lib/equipmentPricing';
import {
  findFirstEligibleEquipmentCycle,
  isCycleEligibleForEquipmentDeduction,
  shouldSkipEquipmentAutoDeductions,
} from '@/lib/payoutCycles/eligibility';
import type { PayoutCycle as Cycle } from '@/lib/payoutCycles/types';

export type ExpectedSnapshotIssueInput = {
  equipmentIssueId: string;
  riderCode: string;
  riderNameSnapshot?: string;
  activationDate: string;
  originalLiabilityMilli: number;
  outstandingMilli: number;
  amountDeductedMilli: number;
  installmentsCompleted: number;
  securityPaidUpfront: boolean;
  status: string;
  bagCostMilli?: number;
  shirtCostMilli?: number;
  securityFeeMilli?: number;
};

export type ExpectedDeductionLine = {
  equipmentIssueId: string;
  riderCode: string;
  riderNameSnapshot: string;
  originalLiabilityMilli: number;
  amountDeductedMilli: number;
  outstandingMilli: number;
  cycleId: string;
  cycleLabel: string;
  isClosing: boolean;
  eligible: boolean;
  expectedDeductionMilli: number;
  carriedRemainderMilli: number;
  bagCostMilli: number;
  shirtCostMilli: number;
  securityFeeMilli: number;
  reasonIfZero: string;
  firstEligibleCycleId: string;
  activationDate: string;
};

export type ExpectedDeductionSnapshot = {
  asOfDate: string;
  cycleId: string;
  cycleLabel: string;
  isClosing: boolean;
  equipmentDeductionEnabled: boolean;
  lines: ExpectedDeductionLine[];
  totals: {
    riders: number;
    expectedMilli: number;
    outstandingMilli: number;
    /** First-time installment sizing this cycle (no prior wallet deduction on issue). */
    newRequestedMilli: number;
    /** Continuing / carried exposure portion of expected (prior progress on issue). */
    carriedMilli: number;
    zeroReasonCounts: Record<string, number>;
  };
  /** Explicit safety: this snapshot never mutates money. */
  financialMutation: false;
};

/**
 * Build expected deduction preview for one resolved cycle + open issues.
 * Pure — no I/O. Uses persisted originalLiabilityMilli (historical), not live Admin prices.
 */
export function buildExpectedDeductionSnapshot(params: {
  asOfDate: string;
  cycle: Cycle;
  allCycles: Cycle[];
  openIssues: ExpectedSnapshotIssueInput[];
}): ExpectedDeductionSnapshot {
  const { asOfDate, cycle, allCycles, openIssues } = params;
  const closingSkip = shouldSkipEquipmentAutoDeductions(cycle);
  const lines: ExpectedDeductionLine[] = [];
  const zeroReasonCounts: Record<string, number> = {};
  let newRequestedMilli = 0;
  let carriedMilli = 0;

  for (const issue of openIssues) {
    if (issue.status !== 'open') continue;
    const outstanding = Math.max(0, Math.trunc(issue.outstandingMilli));
    const first = findFirstEligibleEquipmentCycle(allCycles, issue.activationDate);
    const eligibility = isCycleEligibleForEquipmentDeduction(
      cycle,
      allCycles,
      issue.activationDate
    );

    let expected = 0;
    let reasonIfZero = '';
    let eligible = eligibility.eligible;

    if (closingSkip) {
      eligible = false;
      reasonIfZero = cycle.isClosing ? 'closing_cycle' : 'equipment_deduction_disabled';
    } else if (!eligibility.eligible) {
      reasonIfZero = eligibility.reason || 'not_eligible';
    } else if (outstanding <= 0) {
      eligible = false;
      reasonIfZero = 'zero_outstanding';
    } else {
      const useSchedule = scheduleFromPersistedOriginalMilli(issue.originalLiabilityMilli);
      expected = expectedInstallmentMilliemes({
        remainingMilli: outstanding,
        schedule: useSchedule,
        installmentIndex: Math.max(0, Math.trunc(issue.installmentsCompleted)),
        amountDeductedMilli: issue.amountDeductedMilli,
      });
      expected = Math.min(expected, outstanding);
      if (expected <= 0) reasonIfZero = 'expected_zero';
    }

    if (reasonIfZero) {
      zeroReasonCounts[reasonIfZero] = (zeroReasonCounts[reasonIfZero] || 0) + 1;
    }

    const carried =
      eligible && expected > 0 ? Math.max(0, outstanding - expected) : outstanding;

    const isNewRequested =
      eligible &&
      expected > 0 &&
      Math.trunc(issue.amountDeductedMilli) === 0 &&
      Math.trunc(issue.installmentsCompleted) === 0;
    if (isNewRequested) newRequestedMilli += expected;
    else if (eligible && expected > 0) carriedMilli += expected;

    lines.push({
      equipmentIssueId: issue.equipmentIssueId,
      riderCode: issue.riderCode,
      riderNameSnapshot: issue.riderNameSnapshot || '',
      originalLiabilityMilli: issue.originalLiabilityMilli,
      amountDeductedMilli: issue.amountDeductedMilli,
      outstandingMilli: outstanding,
      cycleId: cycle.cycleId,
      cycleLabel: `${cycle.year}-${cycle.month}-C${cycle.cycleNumber}`,
      isClosing: Boolean(cycle.isClosing),
      eligible,
      expectedDeductionMilli: expected,
      carriedRemainderMilli: carried,
      bagCostMilli: issue.bagCostMilli ?? 0,
      shirtCostMilli: issue.shirtCostMilli ?? 0,
      securityFeeMilli: issue.securityFeeMilli ?? 0,
      reasonIfZero,
      firstEligibleCycleId: first?.cycleId || '',
      activationDate: issue.activationDate,
    });
  }

  lines.sort(
    (a, b) =>
      a.riderCode.localeCompare(b.riderCode) ||
      a.equipmentIssueId.localeCompare(b.equipmentIssueId)
  );

  return {
    asOfDate,
    cycleId: cycle.cycleId,
    cycleLabel: `${cycle.year}-${cycle.month}-C${cycle.cycleNumber}`,
    isClosing: Boolean(cycle.isClosing),
    equipmentDeductionEnabled: Boolean(cycle.equipmentDeductionEnabled),
    lines,
    totals: {
      riders: new Set(lines.map((l) => l.riderCode)).size,
      expectedMilli: lines.reduce((s, l) => s + l.expectedDeductionMilli, 0),
      outstandingMilli: lines.reduce((s, l) => s + l.outstandingMilli, 0),
      newRequestedMilli,
      carriedMilli,
      zeroReasonCounts,
    },
    financialMutation: false,
  };
}
