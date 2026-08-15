/**
 * SRS-014 — Manager Compare → Evidence → Allocation orchestration (SAFE).
 *
 * CALCULATION + durable evidence/apply-record writes only.
 * NEVER calls financial apply / updateBalance / ledger_native.
 */

import { runAllocationFoundation } from '@/lib/equipmentDeductions/allocationOrchestration';
import {
  persistConfirmedEvidenceFromCompare,
  type EvidenceApplyStore,
} from '@/lib/equipmentDeductions/evidenceApply';
import {
  buildManagerCompareResult,
  checkManagerCompareDualGate,
  confirmCompleteCycle,
  egpWalletToActualMilli,
  evaluateTechnicalManagerFile,
  newReconcileBatchId,
  type ManagerActualByRider,
  type ManagerCompareCycleScope,
  type ManagerCompareResult,
} from '@/lib/equipmentDeductions/managerCompare';
import type { DeductionObligation } from '@/lib/equipmentDeductions/obligations';

export type ManagerCompareOrchestrationInput = {
  evidenceStore: EvidenceApplyStore;
  cycleScope: ManagerCompareCycleScope;
  /** Parsed manager wallet rows (EGP). */
  adminWalletByRiderEgp: Map<string, number>;
  obligations: DeductionObligation[];
  /** Explicit operator confirmation that the Manager file is complete for the cycle. */
  completeCycleConfirmed: boolean;
  /** When true and compare is FILE_VALID, persist evidence then run allocation foundation. */
  runAllocation: boolean;
  actor: { code: string; name: string };
  decoded: { role?: string; permissions?: string | null };
  parseErrorCount?: number;
  now?: string;
};

export type ManagerCompareOrchestrationResult = {
  compare: ManagerCompareResult;
  dualGateOk: boolean;
  evidencePersisted: boolean;
  evidenceOutcome?: string;
  allocationOutcome?: string;
  allocatedTotalMilli: number;
  surplusMilli: number;
  anomalyActualExceedsRequested: Array<{
    riderCode: string;
    requestedMilli: number;
    actualMilli: number;
  }>;
  financialSideEffects: {
    walletMutated: false;
    ledgerNativeWritten: false;
    productionFinancialMutation: false;
    allocationApplied: boolean;
  };
};

/**
 * Run Manager Compare foundation; optionally persist evidence + allocate.
 * Allocation updates apply-records / obligation projection in-memory result only
 * via EvidenceApplyStore — never wallets.
 */
export async function runManagerCompareOrchestration(
  input: ManagerCompareOrchestrationInput
): Promise<ManagerCompareOrchestrationResult> {
  const dualGate = checkManagerCompareDualGate(input.decoded);
  const managerActuals: ManagerActualByRider[] = [];
  for (const [riderCode, egp] of input.adminWalletByRiderEgp) {
    managerActuals.push({
      riderCode,
      actualMilli: egpWalletToActualMilli(egp),
    });
  }

  const technical = evaluateTechnicalManagerFile({
    parsedValidRowCount: managerActuals.length,
    parseErrorCount: input.parseErrorCount ?? 0,
    requiredWalletColumnPresent: true,
  });

  const confirmed = confirmCompleteCycle({
    technical,
    explicitConfirm: input.completeCycleConfirmed,
    dualGate,
    actorCode: input.actor.code,
    confirmedAt: input.now,
  });

  const compare = buildManagerCompareResult({
    cycleScope: input.cycleScope,
    fileValidationStatus: confirmed.fileValidationStatus,
    obligations: input.obligations,
    managerActuals,
    reconcileBatchId: newReconcileBatchId(),
    completeCycleConfirmedBy: confirmed.completeCycleConfirmedBy,
    completeCycleConfirmedAt: confirmed.completeCycleConfirmedAt,
  });

  const anomalies: ManagerCompareOrchestrationResult['anomalyActualExceedsRequested'] = [];
  for (const line of compare.lines) {
    if (
      line.actualMilli != null &&
      line.requestedMilli > 0 &&
      line.actualMilli > line.requestedMilli
    ) {
      anomalies.push({
        riderCode: line.riderCode,
        requestedMilli: line.requestedMilli,
        actualMilli: line.actualMilli,
      });
    }
  }

  let evidencePersisted = false;
  let evidenceOutcome: string | undefined;
  let allocationOutcome: string | undefined;
  let allocatedTotalMilli = 0;
  let surplusMilli = 0;
  let allocationApplied = false;

  // Persist FILE_* evidence whenever compare produces a durable status (preview also OK).
  const persist = await persistConfirmedEvidenceFromCompare(input.evidenceStore, {
    compare,
    dualGate,
    actorCode: input.actor.code,
    now: input.now,
  });
  evidencePersisted = persist.outcome !== 'rejected';
  evidenceOutcome = persist.outcome === 'rejected' ? persist.reason : persist.outcome;

  if (
    input.runAllocation &&
    compare.allocationReady &&
    compare.fileValidationStatus === 'FILE_VALID' &&
    compare.evidenceIdentityKey &&
    dualGate.ok &&
    anomalies.length === 0
  ) {
    const actualByRiderMilli: Record<string, number> = {};
    for (const a of managerActuals) {
      actualByRiderMilli[a.riderCode] = a.actualMilli;
    }
    const alloc = await runAllocationFoundation({
      evidenceIdentityKey: compare.evidenceIdentityKey,
      reconcileBatchId: compare.reconcileBatchId,
      fileValidationStatus: 'FILE_VALID',
      actualByRiderMilli,
      obligations: input.obligations,
      store: input.evidenceStore,
      now: input.now,
    });
    allocationOutcome = alloc.outcome;
    allocatedTotalMilli = alloc.allocatedTotalMilli;
    surplusMilli = alloc.surplusMilli;
    allocationApplied = alloc.outcome === 'applied' || alloc.outcome === 'idempotent_already_applied';
  } else if (input.runAllocation && anomalies.length > 0) {
    allocationOutcome = 'blocked_actual_exceeds_requested_anomaly';
  } else if (input.runAllocation && !compare.allocationReady) {
    allocationOutcome = 'not_allocation_ready';
  }

  return {
    compare,
    dualGateOk: dualGate.ok,
    evidencePersisted,
    evidenceOutcome,
    allocationOutcome,
    allocatedTotalMilli,
    surplusMilli,
    anomalyActualExceedsRequested: anomalies,
    financialSideEffects: {
      walletMutated: false,
      ledgerNativeWritten: false,
      productionFinancialMutation: false,
      allocationApplied,
    },
  };
}
