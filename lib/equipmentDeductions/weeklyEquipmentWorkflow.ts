/**
 * 4D.5.4.16 — Weekly non-financial workflow (mocked/testable):
 * EXPECTED → REQUEST → EXPORT → ACTUAL RECONCILE → OUTSTANDING UPDATE
 *
 * Does not enable Financial Apply, wallet, or payroll execution.
 */

import {
  computeAutoRequestDecision,
} from '@/lib/equipmentDeductions/autoRequest';
import {
  reconcileActualPayrollDeduction,
  type ActualPayrollReconcileDeps,
  type ActualPayrollReconcileResult,
} from '@/lib/equipmentDeductions/actualPayrollReconcile';
import {
  buildEquipmentRequestExportRow,
  type EquipmentRequestExportRow,
} from '@/lib/equipmentDeductions/requestExportView';
import {
  emitRequestObligation,
  type ObligationLedgerStore,
} from '@/lib/equipmentDeductions/requestPersistence';
import { scheduleFromPersistedOriginalMilli } from '@/lib/equipmentPricing';
import type { EquipmentLiabilityIssue } from '@/lib/equipmentLiability/store';
import type { PayoutCycle } from '@/lib/payoutCycles/types';
import { isSrs014FinancialApplyEnabled } from '@/lib/srs014Flags';

export type WeeklyWorkflowSafety = {
  financialApplyEnabled: boolean;
  walletMutated: false;
  ledgerMoneyMutated: false;
  payrollExecuted: false;
};

export function weeklyWorkflowSafetySnapshot(): WeeklyWorkflowSafety {
  return {
    financialApplyEnabled: isSrs014FinancialApplyEnabled(),
    walletMutated: false,
    ledgerMoneyMutated: false,
    payrollExecuted: false,
  };
}

/**
 * Sunday step: compute Expected and emit REQUEST (no outstanding mutation).
 */
export async function sundayEmitEquipmentRequest(params: {
  issue: EquipmentLiabilityIssue;
  cycle: PayoutCycle;
  allCycles: PayoutCycle[];
  store: ObligationLedgerStore;
  actor: { code: string; name: string };
}): Promise<{
  expectedMilli: number;
  requestedMilli: number;
  deductionId: string | null;
  skippedReason: string | null;
  outstandingUnchanged: number;
  emitOutcome: string | null;
}> {
  const schedule =
    params.issue.installmentSchedule?.length
      ? params.issue.installmentSchedule
      : scheduleFromPersistedOriginalMilli(params.issue.originalLiabilityMilli);

  const decision = computeAutoRequestDecision({
    remainingMilli: params.issue.outstandingMilli,
    schedule,
    installmentsCompleted: params.issue.installmentsCompleted,
    amountDeductedMilli: params.issue.amountDeductedMilli,
    cycle: params.cycle,
    allCycles: params.allCycles,
    activationDate: params.issue.activationDate,
    riderCode: params.issue.riderCode,
    equipmentIssueId: params.issue.equipmentIssueId,
  });

  const outstandingBefore = params.issue.outstandingMilli;

  if (decision.action === 'skip') {
    return {
      expectedMilli: 0,
      requestedMilli: 0,
      deductionId: null,
      skippedReason: decision.reason,
      outstandingUnchanged: outstandingBefore,
      emitOutcome: null,
    };
  }

  const emit = await emitRequestObligation(params.store, {
    deductionId: decision.deductionId,
    source: 'auto_equipment',
    riderCode: params.issue.riderCode,
    reason: 'معدات',
    originalCycleId: params.cycle.cycleId,
    currentCycleId: params.cycle.cycleId,
    originalAmount: decision.originalAmountMilli,
    obligationAgeKey: new Date().toISOString(),
    equipmentIssueId: params.issue.equipmentIssueId,
    installmentNumber: decision.installmentNumber,
    riderName: params.issue.riderNameSnapshot,
    supervisorCode: params.issue.supervisorCodeSnapshot,
    supervisorName: params.issue.supervisorNameSnapshot,
    zone: params.issue.zoneSnapshot,
    uploadedAt: new Date().toISOString(),
  });

  return {
    expectedMilli: decision.originalAmountMilli,
    requestedMilli: decision.originalAmountMilli,
    deductionId: decision.deductionId,
    skippedReason: null,
    outstandingUnchanged: outstandingBefore,
    emitOutcome: emit.outcome,
  };
}

/**
 * Thursday step: apply Actual against REQUEST; only Actual mutates outstanding.
 */
export async function thursdayReconcileActual(params: {
  deductionId: string;
  actualDeductedMilli: number;
  actualDeductionDate: string;
  talabatReference: string;
  actor: { code: string; name: string };
  deps: ActualPayrollReconcileDeps;
  evidenceNote?: string;
}): Promise<ActualPayrollReconcileResult> {
  return reconcileActualPayrollDeduction(
    {
      deductionId: params.deductionId,
      actualDeductedMilli: params.actualDeductedMilli,
      actualDeductionDate: params.actualDeductionDate,
      talabatReference: params.talabatReference,
      evidenceNote: params.evidenceNote,
      operatorConfirmation: true,
      actorCode: params.actor.code,
      actorName: params.actor.name,
    },
    params.deps
  );
}

export function exportRowForWeeklyRequest(params: {
  obligation: Parameters<typeof buildEquipmentRequestExportRow>[0]['obligation'];
  issue: EquipmentLiabilityIssue;
  requestDate: string;
  actual?: Parameters<typeof buildEquipmentRequestExportRow>[0]['actual'];
}): EquipmentRequestExportRow {
  return buildEquipmentRequestExportRow({
    obligation: params.obligation,
    issue: params.issue,
    riderName: params.issue.riderNameSnapshot,
    requestDate: params.requestDate,
    actual: params.actual,
    outstandingBeforeMilli: params.actual?.previousOutstandingMilli ?? params.issue.outstandingMilli,
  });
}
