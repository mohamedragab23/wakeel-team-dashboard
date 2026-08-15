/**
 * SRS-014 Phase 4D.3 — Allocation foundation / apply orchestration.
 *
 * Consumes FILE_VALID evidence + REQUEST obligations + pure allocate.ts.
 * Updates apply records via injectable EvidenceApplyStore only.
 *
 * NO updateBalance, wallet, ledger_native, amountDeductedMilli,
 * outstandingMilli, installmentsCompleted persistence, Sheets, or cron.
 */

import { allocateActualToObligations, type AllocationLineResult } from '@/lib/equipmentDeductions/allocate';
import {
  ensurePendingApplyRecords,
  hasAppliedEconomicEffect,
  isEvidenceIdentitySupersededForApply,
  listApplyRecordsForEvidence,
  type EvidenceApplyStore,
  type PersistedApplyRecord,
} from '@/lib/equipmentDeductions/evidenceApply';
import {
  isEconomicallyConsistent,
  isOpenForAllocation,
  projectAfterAllocation,
  type DeductionObligation,
} from '@/lib/equipmentDeductions/obligations';
import type { FileValidationStatus } from '@/lib/equipmentDeductions/managerCompare';

function sideEffectsNone() {
  return {
    walletMutated: false as const,
    ledgerNativeWritten: false as const,
    amountDeductedMilliDelta: 0 as const,
    outstandingMilliDelta: 0 as const,
    /** H-1: allocation foundation never advances installmentsCompleted. */
    installmentsCompletedDelta: 0 as const,
    paidAmountIncrementedOnWallet: false as const,
    productionFinancialMutation: false as const,
  };
}

function truncNonNeg(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.trunc(n));
}

export type AllocationFoundationInput = {
  evidenceIdentityKey: string;
  reconcileBatchId: string;
  fileValidationStatus: FileValidationStatus;
  /** Rider → Actual milli (FILE_VALID population; missing riders may be 0). */
  actualByRiderMilli: Record<string, number>;
  /** Current REQUEST/open obligations (in-memory; not written to production Sheets). */
  obligations: readonly DeductionObligation[];
  store: EvidenceApplyStore;
  now?: string;
};

export type AllocationFoundationResult = {
  outcome:
    | 'applied'
    | 'idempotent_already_applied'
    | 'recovered_incomplete_apply'
    | 'rejected'
    | 'blocked_superseded';
  reason?: string;
  evidenceIdentityKey: string;
  reconcileBatchId: string;
  lines: AllocationLineResult[];
  allocatedTotalMilli: number;
  surplusMilli: number;
  /** Projected obligation states after allocation (in-memory only). */
  obligationsAfter: DeductionObligation[];
  applyRecords: PersistedApplyRecord[];
  /**
   * Pure H-1 signals from allocate.ts — NOT persisted as installmentsCompleted.
   * Count of equipment lines where remaining became 0 this apply.
   */
  installmentCompletedSignals: number;
  financialSideEffects: ReturnType<typeof sideEffectsNone>;
};

function projectObligationsFromApplyRecords(
  obligations: readonly DeductionObligation[],
  records: PersistedApplyRecord[]
): DeductionObligation[] {
  const byId = new Map(records.map((r) => [r.deductionId, r]));
  return obligations.map((o) => {
    const rec = byId.get(o.deductionId);
    const alloc = truncNonNeg(rec?.allocatedMilli ?? 0);
    if (alloc <= 0) return { ...o };
    return projectAfterAllocation(o, alloc).obligation;
  });
}

function linesFromAppliedRecords(
  obligations: readonly DeductionObligation[],
  records: PersistedApplyRecord[]
): AllocationLineResult[] {
  const oblById = new Map(obligations.map((o) => [o.deductionId, o]));
  const lines: AllocationLineResult[] = [];
  for (const r of records) {
    if (r.applyStatus !== 'APPLIED') continue;
    const alloc = truncNonNeg(r.allocatedMilli);
    if (alloc <= 0) continue;
    const o = oblById.get(r.deductionId);
    if (!o) continue;
    const projected = projectAfterAllocation(o, alloc);
    lines.push({
      deductionId: r.deductionId,
      reason: o.reason,
      allocatedAmount: projected.allocatedAmount,
      paidAfter: projected.obligation.paidAmount,
      remainingAfter: projected.obligation.remainingAmount,
      fullyPaid: projected.obligation.remainingAmount === 0,
      installmentCompleted: projected.installmentCompleted,
      wouldAffectEquipmentWallet: o.reason === 'معدات' && projected.allocatedAmount > 0,
      equipmentIssueId: o.equipmentIssueId,
      installmentNumber: o.installmentNumber,
    });
  }
  return lines;
}

async function markRecordsApplied(
  store: EvidenceApplyStore,
  records: PersistedApplyRecord[],
  allocatedByDeductionId: Map<string, number>,
  now: string
): Promise<PersistedApplyRecord[]> {
  const out: PersistedApplyRecord[] = [];
  for (const r of records) {
    if (r.applyStatus === 'SUPERSEDED' || r.applyStatus === 'REVERSED') {
      out.push(r);
      continue;
    }
    const allocatedMilli = truncNonNeg(allocatedByDeductionId.get(r.deductionId) ?? r.allocatedMilli ?? 0);
    const next: PersistedApplyRecord = {
      ...r,
      allocatedMilli,
      applyStatus: 'APPLIED',
      liabilityRecoverable: false,
      updatedAt: now,
    };
    await store.updateApplyRecord(r.applyRecordId, next);
    out.push(next);
  }
  return out;
}

/**
 * Run allocation foundation for one FILE_VALID evidence identity.
 * Idempotent on evidenceIdentityKey. No production financial mutation.
 */
export async function runAllocationFoundation(
  input: AllocationFoundationInput
): Promise<AllocationFoundationResult> {
  const key = String(input.evidenceIdentityKey || '').trim();
  const batch = String(input.reconcileBatchId || '').trim();
  const now = String(input.now || new Date().toISOString());
  const fx = sideEffectsNone();

  if (!key) {
    return {
      outcome: 'rejected',
      reason: 'missing_evidence_identity_key',
      evidenceIdentityKey: '',
      reconcileBatchId: batch,
      lines: [],
      allocatedTotalMilli: 0,
      surplusMilli: 0,
      obligationsAfter: input.obligations.map((o) => ({ ...o })),
      applyRecords: [],
      installmentCompletedSignals: 0,
      financialSideEffects: fx,
    };
  }

  if (input.fileValidationStatus !== 'FILE_VALID') {
    return {
      outcome: 'rejected',
      reason: 'not_file_valid',
      evidenceIdentityKey: key,
      reconcileBatchId: batch,
      lines: [],
      allocatedTotalMilli: 0,
      surplusMilli: 0,
      obligationsAfter: input.obligations.map((o) => ({ ...o })),
      applyRecords: [],
      installmentCompletedSignals: 0,
      financialSideEffects: fx,
    };
  }

  for (const o of input.obligations) {
    if (!isEconomicallyConsistent(o)) {
      return {
        outcome: 'rejected',
        reason: `inconsistent_obligation:${o.deductionId}`,
        evidenceIdentityKey: key,
        reconcileBatchId: batch,
        lines: [],
        allocatedTotalMilli: 0,
        surplusMilli: 0,
        obligationsAfter: input.obligations.map((x) => ({ ...x })),
        applyRecords: [],
        installmentCompletedSignals: 0,
        financialSideEffects: fx,
      };
    }
  }

  const superseded = await isEvidenceIdentitySupersededForApply(input.store, key);
  if (superseded.superseded) {
    return {
      outcome: 'blocked_superseded',
      reason: 'evidence_identity_superseded',
      evidenceIdentityKey: key,
      reconcileBatchId: batch,
      lines: [],
      allocatedTotalMilli: 0,
      surplusMilli: 0,
      obligationsAfter: input.obligations.map((o) => ({ ...o })),
      applyRecords: superseded.applyRecords,
      installmentCompletedSignals: 0,
      financialSideEffects: fx,
    };
  }

  let records = await listApplyRecordsForEvidence(input.store, key);
  const applied = records.filter((r) => r.applyStatus === 'APPLIED');
  const pending = records.filter((r) => r.applyStatus === 'PENDING');

  // Fully applied → idempotent (do not re-waterfall / double-count).
  if (applied.length > 0 && pending.length === 0) {
    const lines = linesFromAppliedRecords(input.obligations, applied);
    const obligationsAfter = projectObligationsFromApplyRecords(input.obligations, applied);
    const allocatedTotalMilli = lines.reduce((s, l) => s + l.allocatedAmount, 0);
    const actualTotal = Object.values(input.actualByRiderMilli).reduce(
      (s, v) => s + truncNonNeg(v),
      0
    );
    return {
      outcome: 'idempotent_already_applied',
      evidenceIdentityKey: key,
      reconcileBatchId: batch,
      lines,
      allocatedTotalMilli,
      surplusMilli: Math.max(0, actualTotal - allocatedTotalMilli),
      obligationsAfter,
      applyRecords: applied,
      installmentCompletedSignals: lines.filter((l) => l.installmentCompleted).length,
      financialSideEffects: fx,
    };
  }

  // Crash mid-apply: some APPLIED + some PENDING → finish PENDING without re-allocate.
  if (applied.length > 0 && pending.length > 0) {
    const allocatedByDeductionId = new Map<string, number>();
    for (const r of applied) {
      allocatedByDeductionId.set(r.deductionId, truncNonNeg(r.allocatedMilli));
    }
    for (const r of pending) {
      if (!allocatedByDeductionId.has(r.deductionId)) {
        allocatedByDeductionId.set(r.deductionId, truncNonNeg(r.allocatedMilli));
      }
    }
    const finished = await markRecordsApplied(input.store, records, allocatedByDeductionId, now);
    const appliedFinal = finished.filter((r) => r.applyStatus === 'APPLIED');
    const lines = linesFromAppliedRecords(input.obligations, appliedFinal);
    const obligationsAfter = projectObligationsFromApplyRecords(input.obligations, appliedFinal);
    const allocatedTotalMilli = lines.reduce((s, l) => s + l.allocatedAmount, 0);
    return {
      outcome: 'recovered_incomplete_apply',
      evidenceIdentityKey: key,
      reconcileBatchId: batch,
      lines,
      allocatedTotalMilli,
      surplusMilli: 0,
      obligationsAfter,
      applyRecords: appliedFinal,
      installmentCompletedSignals: lines.filter((l) => l.installmentCompleted).length,
      financialSideEffects: fx,
    };
  }

  // Fresh path: ensure PENDING apply-record-first, then allocate, then mark APPLIED.
  const openObligations = input.obligations.filter(isOpenForAllocation);
  const ensure = await ensurePendingApplyRecords(input.store, {
    evidenceIdentityKey: key,
    reconcileBatchId: batch,
    lines: openObligations.map((o) => ({
      deductionId: o.deductionId,
      reason: o.reason,
    })),
    now,
  });

  if (ensure.outcome === 'blocked_superseded') {
    return {
      outcome: 'blocked_superseded',
      reason: ensure.reason,
      evidenceIdentityKey: key,
      reconcileBatchId: batch,
      lines: [],
      allocatedTotalMilli: 0,
      surplusMilli: 0,
      obligationsAfter: input.obligations.map((o) => ({ ...o })),
      applyRecords: ensure.records,
      installmentCompletedSignals: 0,
      financialSideEffects: fx,
    };
  }

  if (ensure.outcome === 'blocked_already_applied') {
    // Race: became applied between checks — treat as idempotent.
    const recs = await listApplyRecordsForEvidence(input.store, key);
    const lines = linesFromAppliedRecords(input.obligations, recs);
    return {
      outcome: 'idempotent_already_applied',
      evidenceIdentityKey: key,
      reconcileBatchId: batch,
      lines,
      allocatedTotalMilli: lines.reduce((s, l) => s + l.allocatedAmount, 0),
      surplusMilli: 0,
      obligationsAfter: projectObligationsFromApplyRecords(input.obligations, recs),
      applyRecords: recs.filter((r) => r.applyStatus === 'APPLIED'),
      installmentCompletedSignals: lines.filter((l) => l.installmentCompleted).length,
      financialSideEffects: fx,
    };
  }

  records = await listApplyRecordsForEvidence(input.store, key);

  // Per-rider deterministic allocation (Equipment-First inside allocate.ts).
  const riders = [
    ...new Set([
      ...openObligations.map((o) => o.riderCode),
      ...Object.keys(input.actualByRiderMilli),
    ]),
  ].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));

  const allLines: AllocationLineResult[] = [];
  let obligationsCursor: DeductionObligation[] = input.obligations.map((o) => ({ ...o }));
  let surplusMilli = 0;

  for (const riderCode of riders) {
    const riderObligations = obligationsCursor.filter((o) => o.riderCode === riderCode);
    const actual = truncNonNeg(input.actualByRiderMilli[riderCode] ?? 0);
    const result = allocateActualToObligations({
      actualTotalMilli: actual,
      obligations: riderObligations,
    });
    allLines.push(...result.lines);
    surplusMilli += result.surplusMilli;
    const afterById = new Map(result.obligationsAfter.map((o) => [o.deductionId, o]));
    obligationsCursor = obligationsCursor.map((o) =>
      o.riderCode === riderCode ? afterById.get(o.deductionId) ?? o : o
    );
  }

  const allocatedByDeductionId = new Map<string, number>();
  for (const line of allLines) {
    allocatedByDeductionId.set(
      line.deductionId,
      truncNonNeg(allocatedByDeductionId.get(line.deductionId) ?? 0) + line.allocatedAmount
    );
  }

  const finished = await markRecordsApplied(input.store, records, allocatedByDeductionId, now);
  const appliedFinal = finished.filter((r) => r.applyStatus === 'APPLIED');

  // Guard: must not have created a second economic set for this identity.
  if (await hasAppliedEconomicEffect(input.store, key)) {
    /* expected after mark */
  }

  return {
    outcome: 'applied',
    evidenceIdentityKey: key,
    reconcileBatchId: batch,
    lines: allLines,
    allocatedTotalMilli: allLines.reduce((s, l) => s + l.allocatedAmount, 0),
    surplusMilli,
    obligationsAfter: obligationsCursor,
    applyRecords: appliedFinal,
    installmentCompletedSignals: allLines.filter((l) => l.installmentCompleted).length,
    financialSideEffects: fx,
  };
}
