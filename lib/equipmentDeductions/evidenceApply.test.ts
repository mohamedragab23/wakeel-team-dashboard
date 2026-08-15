/**
 * SRS-014 Phase 4D.2 — Evidence persistence + apply-record foundation tests.
 * No wallet / ledger_native / allocation waterfall / updateBalance.
 */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  buildFileValidIdentity,
  createMemoryEvidenceApplyStore,
  ensurePendingApplyRecords,
  hasAppliedEconomicEffect,
  inspectApplyCrashRecovery,
  listApplyRecordsForEvidence,
  markEvidenceSupersededForReplacement,
  persistEvidenceBatch,
  persistConfirmedEvidenceFromCompare,
  computeEvidenceIdentityKey,
  checkManagerCompareDualGate,
  evaluateTechnicalManagerFile,
} from '@/lib/equipmentDeductions/evidenceApply';
import {
  buildManagerCompareResult,
  newReconcileBatchId,
} from '@/lib/equipmentDeductions/managerCompare';
import { createRequestObligation } from '@/lib/equipmentDeductions/obligations';

const scope = {
  cycleId: 'C1',
  cycleLabel: 'الأولى',
  monthLabel: 'أغسطس',
  year: 2026,
};

const population = [
  { riderCode: '1001', actualMilli: 30000 },
  { riderCode: '2002', actualMilli: 0 },
];

describe('Phase 4D.2 — Evidence + apply-record foundation', () => {
  it('evidence identity determinism; batch id is not part of identity', () => {
    const k1 = computeEvidenceIdentityKey(scope, population);
    const k2 = computeEvidenceIdentityKey(scope, [...population].reverse());
    assert.equal(k1, k2);
    assert.notEqual(newReconcileBatchId(), newReconcileBatchId());
    assert.equal(computeEvidenceIdentityKey(scope, population), k1);
  });

  it('different evidence ⇒ different identity', () => {
    const a = computeEvidenceIdentityKey(scope, population);
    const b = computeEvidenceIdentityKey(scope, [
      { riderCode: '1001', actualMilli: 30001 },
      { riderCode: '2002', actualMilli: 0 },
    ]);
    const c = computeEvidenceIdentityKey({ ...scope, cycleId: 'C2' }, population);
    assert.notEqual(a, b);
    assert.notEqual(a, c);
  });

  it('explicit confirmation + dual-gate required for FILE_VALID identity', () => {
    const technical = evaluateTechnicalManagerFile({ parsedValidRowCount: 2 });
    const noConfirm = buildFileValidIdentity({
      technical,
      explicitConfirm: false,
      dualGate: { ok: true, hasReconcileFeature: true, hasVerifyPermission: true },
      actorCode: 'a',
      cycleScope: scope,
      population,
    });
    assert.equal(noConfirm.fileValidationStatus, 'FILE_PARTIAL');
    assert.equal(noConfirm.evidenceIdentityKey, null);

    const noGate = buildFileValidIdentity({
      technical,
      explicitConfirm: true,
      dualGate: checkManagerCompareDualGate({ role: 'admin', permissions: '' }),
      actorCode: 'a',
      cycleScope: scope,
      population,
    });
    assert.equal(noGate.fileValidationStatus, 'FILE_PARTIAL');

    const ok = buildFileValidIdentity({
      technical,
      explicitConfirm: true,
      dualGate: { ok: true, hasReconcileFeature: true, hasVerifyPermission: true },
      actorCode: 'admin1',
      cycleScope: scope,
      population,
      confirmedAt: 't1',
    });
    assert.equal(ok.fileValidationStatus, 'FILE_VALID');
    assert.ok(ok.evidenceIdentityKey);
  });

  it('persist FILE_PARTIAL without evidenceIdentityKey; no apply records', async () => {
    const store = createMemoryEvidenceApplyStore();
    const r = await persistEvidenceBatch(store, {
      cycleScope: scope,
      fileValidationStatus: 'FILE_PARTIAL',
      reconcileBatchId: 'rb_partial',
    });
    assert.equal(r.outcome, 'created');
    assert.equal(r.evidence.fileValidationStatus, 'FILE_PARTIAL');
    assert.equal(r.evidence.evidenceIdentityKey, '');
    assert.equal(r.financialSideEffects.allocationApplied, false);
    assert.equal((await store.listApplyRecords()).length, 0);
  });

  it('same evidenceIdentityKey is idempotent across new reconcileBatchId (AT-07b foundation)', async () => {
    const store = createMemoryEvidenceApplyStore();
    const identity = computeEvidenceIdentityKey(scope, population);

    const first = await persistEvidenceBatch(store, {
      cycleScope: scope,
      fileValidationStatus: 'FILE_VALID',
      reconcileBatchId: 'rb_1',
      evidenceIdentityKey: identity,
      completeCycleConfirmedBy: 'a',
      completeCycleConfirmedAt: 't',
    });
    assert.equal(first.outcome, 'created');

    const second = await persistEvidenceBatch(store, {
      cycleScope: scope,
      fileValidationStatus: 'FILE_VALID',
      reconcileBatchId: 'rb_2_new_batch_only',
      evidenceIdentityKey: identity,
      completeCycleConfirmedBy: 'a',
      completeCycleConfirmedAt: 't2',
    });
    assert.equal(second.outcome, 'idempotent_existing_valid');
    assert.equal(second.evidence.reconcileBatchId, 'rb_1');
    assert.equal((await store.listEvidence()).length, 1);
  });

  it('apply-record-first: PENDING created before allocation; crash state recoverable', async () => {
    const store = createMemoryEvidenceApplyStore();
    const identity = computeEvidenceIdentityKey(scope, population);
    await persistEvidenceBatch(store, {
      cycleScope: scope,
      fileValidationStatus: 'FILE_VALID',
      reconcileBatchId: 'rb_a',
      evidenceIdentityKey: identity,
      completeCycleConfirmedBy: 'a',
      completeCycleConfirmedAt: 't',
    });

    const ensure = await ensurePendingApplyRecords(store, {
      evidenceIdentityKey: identity,
      reconcileBatchId: 'rb_a',
      lines: [
        { deductionId: 'D1', reason: 'معدات' },
        { deductionId: 'D2', reason: 'سلفة' },
      ],
    });
    assert.equal(ensure.outcome, 'created');
    assert.equal(ensure.records.length, 2);
    assert.ok(ensure.records.every((r) => r.applyStatus === 'PENDING'));
    assert.ok(ensure.records.every((r) => r.liabilityRecoverable === true));
    assert.ok(ensure.records.every((r) => r.allocatedMilli === 0));
    assert.equal(ensure.financialSideEffects.walletMutated, false);
    assert.equal(ensure.financialSideEffects.ledgerNativeWritten, false);
    assert.equal(ensure.financialSideEffects.installmentsCompletedDelta, 0);

    const crash = await inspectApplyCrashRecovery(store, identity);
    assert.equal(crash.applyRecordExists, true);
    assert.equal(crash.allocationCompleted, false);
    assert.equal(crash.liabilityRecoverable, true);
    assert.equal(crash.retrySafe, true);
    assert.equal(crash.pendingCount, 2);
    assert.equal(crash.appliedCount, 0);
  });

  it('same evidenceIdentityKey does not create duplicate apply records (replay / new batch)', async () => {
    const store = createMemoryEvidenceApplyStore();
    const identity = computeEvidenceIdentityKey(scope, population);
    await persistEvidenceBatch(store, {
      cycleScope: scope,
      fileValidationStatus: 'FILE_VALID',
      reconcileBatchId: 'rb_a',
      evidenceIdentityKey: identity,
      completeCycleConfirmedBy: 'a',
      completeCycleConfirmedAt: 't',
    });

    await ensurePendingApplyRecords(store, {
      evidenceIdentityKey: identity,
      reconcileBatchId: 'rb_a',
      lines: [{ deductionId: 'D1', reason: 'معدات' }],
    });
    const replay = await ensurePendingApplyRecords(store, {
      evidenceIdentityKey: identity,
      reconcileBatchId: 'rb_DIFFERENT_BATCH',
      lines: [
        { deductionId: 'D1', reason: 'معدات' },
        { deductionId: 'D9', reason: 'سلفة' },
      ],
    });
    assert.equal(replay.outcome, 'idempotent_existing');
    assert.equal((await listApplyRecordsForEvidence(store, identity)).length, 1);
  });

  it('blocked_already_applied when any line is APPLIED (future phase marker)', async () => {
    const store = createMemoryEvidenceApplyStore();
    const identity = computeEvidenceIdentityKey(scope, population);
    await persistEvidenceBatch(store, {
      cycleScope: scope,
      fileValidationStatus: 'FILE_VALID',
      reconcileBatchId: 'rb_a',
      evidenceIdentityKey: identity,
      completeCycleConfirmedBy: 'a',
      completeCycleConfirmedAt: 't',
    });
    const created = await ensurePendingApplyRecords(store, {
      evidenceIdentityKey: identity,
      reconcileBatchId: 'rb_a',
      lines: [{ deductionId: 'D1', reason: 'معدات' }],
    });
    // Simulate later allocation marking APPLIED without calling wallet in this phase.
    const row = created.records[0];
    await store.updateApplyRecord(row.applyRecordId, {
      ...row,
      applyStatus: 'APPLIED',
      allocatedMilli: 1000,
      liabilityRecoverable: false,
      updatedAt: 't2',
    });
    assert.equal(await hasAppliedEconomicEffect(store, identity), true);

    const again = await ensurePendingApplyRecords(store, {
      evidenceIdentityKey: identity,
      reconcileBatchId: 'rb_new',
      lines: [{ deductionId: 'D2', reason: 'سلفة' }],
    });
    assert.equal(again.outcome, 'blocked_already_applied');
    assert.equal((await listApplyRecordsForEvidence(store, identity)).length, 1);
  });

  it('supersession foundation: prior SUPERSEDED; replacement distinct identity; no wallet reverse', async () => {
    const store = createMemoryEvidenceApplyStore();
    const priorKey = computeEvidenceIdentityKey(scope, population);
    const replacementPop = [
      { riderCode: '1001', actualMilli: 25000 },
      { riderCode: '2002', actualMilli: 0 },
    ];
    const nextKey = computeEvidenceIdentityKey(scope, replacementPop);
    assert.notEqual(priorKey, nextKey);

    await persistEvidenceBatch(store, {
      cycleScope: scope,
      fileValidationStatus: 'FILE_VALID',
      reconcileBatchId: 'rb_old',
      evidenceIdentityKey: priorKey,
      completeCycleConfirmedBy: 'a',
      completeCycleConfirmedAt: 't',
    });
    await ensurePendingApplyRecords(store, {
      evidenceIdentityKey: priorKey,
      reconcileBatchId: 'rb_old',
      lines: [{ deductionId: 'D1', reason: 'معدات' }],
    });

    const superResult = await markEvidenceSupersededForReplacement(store, {
      priorEvidenceIdentityKey: priorKey,
      replacementEvidenceIdentityKey: nextKey,
      replacementReconcileBatchId: 'rb_new',
    });
    assert.equal(superResult.outcome, 'superseded');
    assert.equal(superResult.prior?.evidenceLifecycleStatus, 'SUPERSEDED');
    assert.equal(superResult.prior?.supersededByEvidenceIdentityKey, nextKey);
    assert.equal(superResult.financialSideEffects.walletMutated, false);

    const priorApply = await listApplyRecordsForEvidence(store, priorKey);
    assert.ok(priorApply.every((r) => r.applyStatus === 'SUPERSEDED'));

    const replacement = await persistEvidenceBatch(store, {
      cycleScope: scope,
      fileValidationStatus: 'FILE_VALID',
      reconcileBatchId: 'rb_new',
      evidenceIdentityKey: nextKey,
      completeCycleConfirmedBy: 'a',
      completeCycleConfirmedAt: 't3',
      supersedesEvidenceIdentityKey: priorKey,
    });
    assert.equal(replacement.outcome, 'created');
    assert.equal(replacement.evidence.evidenceIdentityKey, nextKey);

    const nextApply = await ensurePendingApplyRecords(store, {
      evidenceIdentityKey: nextKey,
      reconcileBatchId: 'rb_new',
      lines: [{ deductionId: 'D1', reason: 'معدات' }],
    });
    assert.equal(nextApply.outcome, 'created');
    assert.equal(nextApply.records[0].applyStatus, 'PENDING');
  });

  it('4D.2.2 H-1: superseded E1 retry must NOT mint new PENDING; E2 may; batch id irrelevant', async () => {
    const store = createMemoryEvidenceApplyStore();
    const e1 = computeEvidenceIdentityKey(scope, population);
    const e2 = computeEvidenceIdentityKey(scope, [
      { riderCode: '1001', actualMilli: 25000 },
      { riderCode: '2002', actualMilli: 0 },
    ]);
    assert.notEqual(e1, e2);

    // 1–2: E1 → PENDING
    await persistEvidenceBatch(store, {
      cycleScope: scope,
      fileValidationStatus: 'FILE_VALID',
      reconcileBatchId: 'rb_e1',
      evidenceIdentityKey: e1,
      completeCycleConfirmedBy: 'a',
      completeCycleConfirmedAt: 't',
    });
    const first = await ensurePendingApplyRecords(store, {
      evidenceIdentityKey: e1,
      reconcileBatchId: 'rb_e1',
      lines: [
        { deductionId: 'D1', reason: 'معدات' },
        { deductionId: 'D2', reason: 'سلفة' },
      ],
    });
    assert.equal(first.outcome, 'created');
    assert.equal(first.records.length, 2);
    const pendingIdsBefore = first.records.map((r) => r.applyRecordId).sort();

    // 2: supersede E1
    await markEvidenceSupersededForReplacement(store, {
      priorEvidenceIdentityKey: e1,
      replacementEvidenceIdentityKey: e2,
      replacementReconcileBatchId: 'rb_e2',
    });

    // 3–5: retry E1 → blocked, no new PENDING
    const retry1 = await ensurePendingApplyRecords(store, {
      evidenceIdentityKey: e1,
      reconcileBatchId: 'rb_e1_retry',
      lines: [
        { deductionId: 'D1', reason: 'معدات' },
        { deductionId: 'D9', reason: 'خصم تشغيل' },
      ],
    });
    assert.equal(retry1.outcome, 'blocked_superseded');
    assert.equal(retry1.reason, 'evidence_identity_superseded');
    assert.ok(retry1.records.every((r) => r.applyStatus === 'SUPERSEDED'));
    assert.equal(retry1.records.filter((r) => r.applyStatus === 'PENDING').length, 0);

    // 8: same identity + different reconcileBatchId after supersession still blocked
    const retryBatch = await ensurePendingApplyRecords(store, {
      evidenceIdentityKey: e1,
      reconcileBatchId: 'rb_TOTALLY_NEW_BATCH',
      lines: [{ deductionId: 'D1', reason: 'معدات' }],
    });
    assert.equal(retryBatch.outcome, 'blocked_superseded');

    // 9: repeated retries remain blocked/idempotent
    const retryAgain = await ensurePendingApplyRecords(store, {
      evidenceIdentityKey: e1,
      reconcileBatchId: 'rb_again',
      lines: [{ deductionId: 'D1', reason: 'معدات' }],
    });
    assert.equal(retryAgain.outcome, 'blocked_superseded');
    assert.deepEqual(
      retryAgain.records.map((r) => r.applyRecordId).sort(),
      pendingIdsBefore
    );

    const e1All = await listApplyRecordsForEvidence(store, e1);
    assert.equal(e1All.length, 2);
    assert.ok(e1All.every((r) => r.applyStatus === 'SUPERSEDED'));
    assert.equal(e1All.filter((r) => r.applyStatus === 'PENDING').length, 0);

    // 6–7: replacement E2 CAN create a new PENDING set
    await persistEvidenceBatch(store, {
      cycleScope: scope,
      fileValidationStatus: 'FILE_VALID',
      reconcileBatchId: 'rb_e2',
      evidenceIdentityKey: e2,
      completeCycleConfirmedBy: 'a',
      completeCycleConfirmedAt: 't2',
      supersedesEvidenceIdentityKey: e1,
    });
    const e2Pending = await ensurePendingApplyRecords(store, {
      evidenceIdentityKey: e2,
      reconcileBatchId: 'rb_e2',
      lines: [{ deductionId: 'D1', reason: 'معدات' }],
    });
    assert.equal(e2Pending.outcome, 'created');
    assert.equal(e2Pending.records.length, 1);
    assert.equal(e2Pending.records[0].applyStatus, 'PENDING');
    assert.equal(e2Pending.records[0].evidenceIdentityKey, e2);
    assert.equal(e2Pending.financialSideEffects.walletMutated, false);
    assert.equal(e2Pending.financialSideEffects.ledgerNativeWritten, false);
    assert.equal(e2Pending.financialSideEffects.allocationApplied, false);
  });

  it('persistConfirmedEvidenceFromCompare rejects FILE_VALID without dual-gate', async () => {
    const store = createMemoryEvidenceApplyStore();
    const compare = buildManagerCompareResult({
      cycleScope: scope,
      fileValidationStatus: 'FILE_VALID',
      obligations: [
        createRequestObligation({
          deductionId: 'D1',
          source: 'auto_equipment',
          riderCode: '1001',
          reason: 'معدات',
          originalCycleId: 'C1',
          originalAmount: 30000,
          obligationAgeKey: '1',
          equipmentIssueId: 'E1',
          installmentNumber: 1,
        }),
      ],
      managerActuals: [{ riderCode: '1001', actualMilli: 30000 }],
      reconcileBatchId: 'rb_x',
      completeCycleConfirmedBy: 'a',
      completeCycleConfirmedAt: 't',
    });
    const rejected = await persistConfirmedEvidenceFromCompare(store, {
      compare,
      dualGate: checkManagerCompareDualGate({ role: 'admin', permissions: '' }),
      actorCode: 'a',
    });
    assert.equal(rejected.outcome, 'rejected');
    assert.equal((await store.listEvidence()).length, 0);
  });

  it('no financial mutations on full happy path', async () => {
    const store = createMemoryEvidenceApplyStore();
    const identity = computeEvidenceIdentityKey(scope, population);
    const e = await persistEvidenceBatch(store, {
      cycleScope: scope,
      fileValidationStatus: 'FILE_VALID',
      reconcileBatchId: 'rb',
      evidenceIdentityKey: identity,
      completeCycleConfirmedBy: 'a',
      completeCycleConfirmedAt: 't',
    });
    const a = await ensurePendingApplyRecords(store, {
      evidenceIdentityKey: identity,
      reconcileBatchId: 'rb',
      lines: [{ deductionId: 'D1', reason: 'معدات' }],
    });
    for (const fx of [e.financialSideEffects, a.financialSideEffects]) {
      assert.deepEqual(fx, {
        walletMutated: false,
        ledgerNativeWritten: false,
        amountDeductedMilliDelta: 0,
        outstandingMilliDelta: 0,
        installmentsCompletedDelta: 0,
        paidAmountIncremented: false,
        allocationApplied: false,
      });
    }
  });
});
