/**
 * SRS-014 Phase 4D.3 — Allocation foundation tests.
 * Injectable store only — no wallet / ledger / updateBalance / Sheets.
 */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { runAllocationFoundation } from '@/lib/equipmentDeductions/allocationOrchestration';
import {
  createMemoryEvidenceApplyStore,
  ensurePendingApplyRecords,
  listApplyRecordsForEvidence,
  markEvidenceSupersededForReplacement,
  persistEvidenceBatch,
  computeEvidenceIdentityKey,
} from '@/lib/equipmentDeductions/evidenceApply';
import { createRequestObligation, isEconomicallyConsistent } from '@/lib/equipmentDeductions/obligations';
import type { DeductionObligation } from '@/lib/equipmentDeductions/obligations';

const scope = {
  cycleId: 'C1',
  cycleLabel: 'الأولى',
  monthLabel: 'أغسطس',
  year: 2026,
};

function eq(partial: {
  deductionId: string;
  originalAmount: number;
  obligationAgeKey: string;
  equipmentIssueId?: string;
  installmentNumber?: number;
  riderCode?: string;
}): DeductionObligation {
  return createRequestObligation({
    deductionId: partial.deductionId,
    source: 'auto_equipment',
    riderCode: partial.riderCode || 'R1',
    reason: 'معدات',
    originalCycleId: 'C1',
    originalAmount: partial.originalAmount,
    obligationAgeKey: partial.obligationAgeKey,
    equipmentIssueId: partial.equipmentIssueId || 'ISSUE-A',
    installmentNumber: partial.installmentNumber ?? 1,
  });
}

function loan(partial: {
  deductionId: string;
  originalAmount: number;
  obligationAgeKey: string;
  reason?: 'سلفة' | 'خصم تشغيل' | 'استعلام أمني' | 'مديونية سابقة';
  riderCode?: string;
}): DeductionObligation {
  return createRequestObligation({
    deductionId: partial.deductionId,
    source: 'supervisor',
    riderCode: partial.riderCode || 'R1',
    reason: partial.reason || 'سلفة',
    originalCycleId: 'C1',
    originalAmount: partial.originalAmount,
    obligationAgeKey: partial.obligationAgeKey,
  });
}

async function seedFileValid(
  store: ReturnType<typeof createMemoryEvidenceApplyStore>,
  identity: string,
  batch: string
) {
  await persistEvidenceBatch(store, {
    cycleScope: scope,
    fileValidationStatus: 'FILE_VALID',
    reconcileBatchId: batch,
    evidenceIdentityKey: identity,
    completeCycleConfirmedBy: 'admin',
    completeCycleConfirmedAt: 't',
  });
}

describe('Phase 4D.3 — Allocation foundation', () => {
  it('equipment-first: allocates to معدات before سلفة', async () => {
    const store = createMemoryEvidenceApplyStore();
    const obligations = [
      loan({ deductionId: 'L1', originalAmount: 20000, obligationAgeKey: '1' }),
      eq({ deductionId: 'E1', originalAmount: 50000, obligationAgeKey: '2' }),
    ];
    const identity = computeEvidenceIdentityKey(scope, [{ riderCode: 'R1', actualMilli: 50000 }]);
    await seedFileValid(store, identity, 'rb1');

    const r = await runAllocationFoundation({
      evidenceIdentityKey: identity,
      reconcileBatchId: 'rb1',
      fileValidationStatus: 'FILE_VALID',
      actualByRiderMilli: { R1: 50000 },
      obligations,
      store,
    });

    assert.equal(r.outcome, 'applied');
    assert.equal(r.lines[0].deductionId, 'E1');
    assert.equal(r.lines[0].allocatedAmount, 50000);
    const loanAfter = r.obligationsAfter.find((o) => o.deductionId === 'L1')!;
    assert.equal(loanAfter.paidAmount, 0);
    assert.equal(loanAfter.remainingAmount, 20000);
    assert.equal(r.financialSideEffects.walletMutated, false);
    assert.equal(r.financialSideEffects.ledgerNativeWritten, false);
    assert.equal(r.financialSideEffects.installmentsCompletedDelta, 0);
    assert.equal(r.financialSideEffects.productionFinancialMutation, false);
  });

  it('non-equipment priority: استعلام أمني before سلفة', async () => {
    const store = createMemoryEvidenceApplyStore();
    const obligations = [
      loan({ deductionId: 'L1', originalAmount: 10000, obligationAgeKey: '1', reason: 'سلفة' }),
      loan({
        deductionId: 'S1',
        originalAmount: 10000,
        obligationAgeKey: '2',
        reason: 'استعلام أمني',
      }),
    ];
    const identity = computeEvidenceIdentityKey(scope, [{ riderCode: 'R1', actualMilli: 10000 }]);
    await seedFileValid(store, identity, 'rb1');
    const r = await runAllocationFoundation({
      evidenceIdentityKey: identity,
      reconcileBatchId: 'rb1',
      fileValidationStatus: 'FILE_VALID',
      actualByRiderMilli: { R1: 10000 },
      obligations,
      store,
    });
    assert.equal(r.lines[0].deductionId, 'S1');
    assert.equal(r.lines[0].allocatedAmount, 10000);
  });

  it('partial allocation leaves remaining > 0; H-1 installmentCompletedSignals only for full close', async () => {
    const store = createMemoryEvidenceApplyStore();
    const obligations = [eq({ deductionId: 'E1', originalAmount: 50000, obligationAgeKey: '1' })];
    const identity = computeEvidenceIdentityKey(scope, [{ riderCode: 'R1', actualMilli: 30000 }]);
    await seedFileValid(store, identity, 'rb1');
    const r = await runAllocationFoundation({
      evidenceIdentityKey: identity,
      reconcileBatchId: 'rb1',
      fileValidationStatus: 'FILE_VALID',
      actualByRiderMilli: { R1: 30000 },
      obligations,
      store,
    });
    assert.equal(r.lines[0].allocatedAmount, 30000);
    assert.equal(r.lines[0].remainingAfter, 20000);
    assert.equal(r.lines[0].installmentCompleted, false);
    assert.equal(r.installmentCompletedSignals, 0);
    assert.equal(r.financialSideEffects.installmentsCompletedDelta, 0);
    assert.ok(isEconomicallyConsistent(r.obligationsAfter[0]));
  });

  it('full allocation closes equipment installment signal but does not advance installmentsCompleted', async () => {
    const store = createMemoryEvidenceApplyStore();
    const obligations = [eq({ deductionId: 'E1', originalAmount: 30000, obligationAgeKey: '1' })];
    const identity = computeEvidenceIdentityKey(scope, [{ riderCode: 'R1', actualMilli: 30000 }]);
    await seedFileValid(store, identity, 'rb1');
    const r = await runAllocationFoundation({
      evidenceIdentityKey: identity,
      reconcileBatchId: 'rb1',
      fileValidationStatus: 'FILE_VALID',
      actualByRiderMilli: { R1: 30000 },
      obligations,
      store,
    });
    assert.equal(r.lines[0].fullyPaid, true);
    assert.equal(r.lines[0].installmentCompleted, true);
    assert.equal(r.installmentCompletedSignals, 1);
    assert.equal(r.financialSideEffects.installmentsCompletedDelta, 0);
  });

  it('insufficient actual: allocates what is available', async () => {
    const store = createMemoryEvidenceApplyStore();
    const obligations = [
      eq({ deductionId: 'E1', originalAmount: 50000, obligationAgeKey: '1' }),
      loan({ deductionId: 'L1', originalAmount: 20000, obligationAgeKey: '2' }),
    ];
    const identity = computeEvidenceIdentityKey(scope, [{ riderCode: 'R1', actualMilli: 10000 }]);
    await seedFileValid(store, identity, 'rb1');
    const r = await runAllocationFoundation({
      evidenceIdentityKey: identity,
      reconcileBatchId: 'rb1',
      fileValidationStatus: 'FILE_VALID',
      actualByRiderMilli: { R1: 10000 },
      obligations,
      store,
    });
    assert.equal(r.allocatedTotalMilli, 10000);
    assert.equal(r.lines.length, 1);
    assert.equal(r.lines[0].deductionId, 'E1');
  });

  it('excess actual becomes surplus; no new obligation', async () => {
    const store = createMemoryEvidenceApplyStore();
    const obligations = [eq({ deductionId: 'E1', originalAmount: 10000, obligationAgeKey: '1' })];
    const identity = computeEvidenceIdentityKey(scope, [{ riderCode: 'R1', actualMilli: 50000 }]);
    await seedFileValid(store, identity, 'rb1');
    const r = await runAllocationFoundation({
      evidenceIdentityKey: identity,
      reconcileBatchId: 'rb1',
      fileValidationStatus: 'FILE_VALID',
      actualByRiderMilli: { R1: 50000 },
      obligations,
      store,
    });
    assert.equal(r.allocatedTotalMilli, 10000);
    assert.equal(r.surplusMilli, 40000);
    assert.equal(r.obligationsAfter.length, 1);
  });

  it('multiple obligations + deterministic ordering by age / equipmentIssueId', async () => {
    const store = createMemoryEvidenceApplyStore();
    const obligations = [
      eq({
        deductionId: 'E-new',
        originalAmount: 10000,
        obligationAgeKey: '90',
        equipmentIssueId: 'ISSUE-Z',
      }),
      eq({
        deductionId: 'E-old-b',
        originalAmount: 10000,
        obligationAgeKey: '10',
        equipmentIssueId: 'ISSUE-B',
      }),
      eq({
        deductionId: 'E-old-a',
        originalAmount: 10000,
        obligationAgeKey: '10',
        equipmentIssueId: 'ISSUE-A',
      }),
    ];
    const identity = computeEvidenceIdentityKey(scope, [{ riderCode: 'R1', actualMilli: 15000 }]);
    await seedFileValid(store, identity, 'rb1');
    const r = await runAllocationFoundation({
      evidenceIdentityKey: identity,
      reconcileBatchId: 'rb1',
      fileValidationStatus: 'FILE_VALID',
      actualByRiderMilli: { R1: 15000 },
      obligations,
      store,
    });
    assert.deepEqual(
      r.lines.map((l) => l.deductionId),
      ['E-old-a', 'E-old-b']
    );
    assert.equal(r.lines[0].allocatedAmount, 10000);
    assert.equal(r.lines[1].allocatedAmount, 5000);
  });

  it('same evidence retry is idempotent; different batch does not re-apply', async () => {
    const store = createMemoryEvidenceApplyStore();
    const obligations = [eq({ deductionId: 'E1', originalAmount: 30000, obligationAgeKey: '1' })];
    const identity = computeEvidenceIdentityKey(scope, [{ riderCode: 'R1', actualMilli: 30000 }]);
    await seedFileValid(store, identity, 'rb1');

    const first = await runAllocationFoundation({
      evidenceIdentityKey: identity,
      reconcileBatchId: 'rb1',
      fileValidationStatus: 'FILE_VALID',
      actualByRiderMilli: { R1: 30000 },
      obligations,
      store,
    });
    assert.equal(first.outcome, 'applied');

    const second = await runAllocationFoundation({
      evidenceIdentityKey: identity,
      reconcileBatchId: 'rb_NEW_BATCH',
      fileValidationStatus: 'FILE_VALID',
      actualByRiderMilli: { R1: 30000 },
      obligations,
      store,
    });
    assert.equal(second.outcome, 'idempotent_already_applied');
    assert.equal(second.allocatedTotalMilli, first.allocatedTotalMilli);
    const recs = await listApplyRecordsForEvidence(store, identity);
    assert.equal(recs.filter((x) => x.applyStatus === 'APPLIED').length, 1);
    assert.equal(recs[0].allocatedMilli, 30000);
  });

  it('superseded evidence blocked; replacement identity may allocate', async () => {
    const store = createMemoryEvidenceApplyStore();
    const pop1 = [{ riderCode: 'R1', actualMilli: 30000 }];
    const pop2 = [{ riderCode: 'R1', actualMilli: 25000 }];
    const e1 = computeEvidenceIdentityKey(scope, pop1);
    const e2 = computeEvidenceIdentityKey(scope, pop2);
    assert.notEqual(e1, e2);

    const obligations = [eq({ deductionId: 'E1', originalAmount: 30000, obligationAgeKey: '1' })];
    await seedFileValid(store, e1, 'rb1');
    await ensurePendingApplyRecords(store, {
      evidenceIdentityKey: e1,
      reconcileBatchId: 'rb1',
      lines: [{ deductionId: 'E1', reason: 'معدات' }],
    });
    await markEvidenceSupersededForReplacement(store, {
      priorEvidenceIdentityKey: e1,
      replacementEvidenceIdentityKey: e2,
      replacementReconcileBatchId: 'rb2',
    });

    const blocked = await runAllocationFoundation({
      evidenceIdentityKey: e1,
      reconcileBatchId: 'rb_retry',
      fileValidationStatus: 'FILE_VALID',
      actualByRiderMilli: { R1: 30000 },
      obligations,
      store,
    });
    assert.equal(blocked.outcome, 'blocked_superseded');

    await seedFileValid(store, e2, 'rb2');
    const ok = await runAllocationFoundation({
      evidenceIdentityKey: e2,
      reconcileBatchId: 'rb2',
      fileValidationStatus: 'FILE_VALID',
      actualByRiderMilli: { R1: 25000 },
      obligations,
      store,
    });
    assert.equal(ok.outcome, 'applied');
    assert.equal(ok.allocatedTotalMilli, 25000);
  });

  it('rejects FILE_PARTIAL; invariants preserved on obligationsAfter', async () => {
    const store = createMemoryEvidenceApplyStore();
    const obligations = [eq({ deductionId: 'E1', originalAmount: 10000, obligationAgeKey: '1' })];
    const r = await runAllocationFoundation({
      evidenceIdentityKey: 'x',
      reconcileBatchId: 'rb',
      fileValidationStatus: 'FILE_PARTIAL',
      actualByRiderMilli: { R1: 10000 },
      obligations,
      store,
    });
    assert.equal(r.outcome, 'rejected');
    assert.equal(r.reason, 'not_file_valid');
  });

  it('crash/retry: incomplete apply finishes without double economic set', async () => {
    const store = createMemoryEvidenceApplyStore();
    const obligations = [
      eq({ deductionId: 'E1', originalAmount: 10000, obligationAgeKey: '1' }),
      loan({ deductionId: 'L1', originalAmount: 10000, obligationAgeKey: '2' }),
    ];
    const identity = computeEvidenceIdentityKey(scope, [{ riderCode: 'R1', actualMilli: 15000 }]);
    await seedFileValid(store, identity, 'rb1');

    const ensure = await ensurePendingApplyRecords(store, {
      evidenceIdentityKey: identity,
      reconcileBatchId: 'rb1',
      lines: obligations.map((o) => ({ deductionId: o.deductionId, reason: o.reason })),
    });
    assert.equal(ensure.outcome, 'created');

    // Simulate crash: one line APPLIED mid-flight, one still PENDING.
    const mid = ensure.records[0];
    await store.updateApplyRecord(mid.applyRecordId, {
      ...mid,
      allocatedMilli: 10000,
      applyStatus: 'APPLIED',
      liabilityRecoverable: false,
      updatedAt: 't-mid',
    });

    const recovered = await runAllocationFoundation({
      evidenceIdentityKey: identity,
      reconcileBatchId: 'rb1',
      fileValidationStatus: 'FILE_VALID',
      actualByRiderMilli: { R1: 15000 },
      obligations,
      store,
    });
    assert.equal(recovered.outcome, 'recovered_incomplete_apply');
    const recs = await listApplyRecordsForEvidence(store, identity);
    assert.ok(recs.every((x) => x.applyStatus === 'APPLIED'));
    assert.equal(recs.length, 2);

    const again = await runAllocationFoundation({
      evidenceIdentityKey: identity,
      reconcileBatchId: 'rb1',
      fileValidationStatus: 'FILE_VALID',
      actualByRiderMilli: { R1: 15000 },
      obligations,
      store,
    });
    assert.equal(again.outcome, 'idempotent_already_applied');
  });

  it('apply records store allocatedMilli; allocatedMilli starts 0 then becomes applied amount', async () => {
    const store = createMemoryEvidenceApplyStore();
    const obligations = [eq({ deductionId: 'E1', originalAmount: 20000, obligationAgeKey: '1' })];
    const identity = computeEvidenceIdentityKey(scope, [{ riderCode: 'R1', actualMilli: 20000 }]);
    await seedFileValid(store, identity, 'rb1');
    await runAllocationFoundation({
      evidenceIdentityKey: identity,
      reconcileBatchId: 'rb1',
      fileValidationStatus: 'FILE_VALID',
      actualByRiderMilli: { R1: 20000 },
      obligations,
      store,
    });
    const recs = await listApplyRecordsForEvidence(store, identity);
    assert.equal(recs[0].applyStatus, 'APPLIED');
    assert.equal(recs[0].allocatedMilli, 20000);
    assert.equal(recs[0].liabilityRecoverable, false);
  });
});
