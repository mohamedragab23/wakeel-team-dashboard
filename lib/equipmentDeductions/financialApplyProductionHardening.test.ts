/**
 * SRS-014 Phase 4D.5.4 — pre-first-run hardening regressions (A–O).
 * Injectable ports only — ZERO live Sheets / wallet / Redis mutations.
 */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { runAllocationFoundation } from '@/lib/equipmentDeductions/allocationOrchestration';
import {
  createMemoryEvidenceApplyStore,
  markEvidenceSupersededForReplacement,
  persistEvidenceBatch,
} from '@/lib/equipmentDeductions/evidenceApply';
import {
  createMemoryFinancialApplyIntentStore,
  type FinancialApplyPorts,
  type LiabilitySnapshot,
  type LedgerTxn,
} from '@/lib/equipmentDeductions/financialApply';
import { authorizeProductionFinancialApply } from '@/lib/equipmentDeductions/financialApplyAuthorization';
import {
  acquireFinancialApplyLock,
  createMemoryFailClosedLockRedis,
} from '@/lib/equipmentDeductions/financialApplyLock';
import {
  runProductionFinancialApplyLine,
  validateProductionFinancialApplyPeriodCycleId,
} from '@/lib/equipmentDeductions/financialApplyProduction';
import { computeEvidenceIdentityKey } from '@/lib/equipmentDeductions/managerCompare';
import {
  createRequestObligation,
  type DeductionObligation,
} from '@/lib/equipmentDeductions/obligations';
import { isSrs014FinancialApplyEnabled } from '@/lib/srs014Flags';

const scope = {
  cycleId: 'C1',
  cycleLabel: 'الأولى',
  monthLabel: 'أغسطس',
  year: 2026,
};

function eq(partial: {
  deductionId: string;
  originalAmount: number;
}): DeductionObligation {
  return createRequestObligation({
    deductionId: partial.deductionId,
    source: 'auto_equipment',
    riderCode: 'R1',
    reason: 'معدات',
    originalCycleId: 'C1',
    originalAmount: partial.originalAmount,
    obligationAgeKey: '1',
    equipmentIssueId: 'ISSUE-A',
    installmentNumber: 1,
  });
}

async function seedValidApplied() {
  const store = createMemoryEvidenceApplyStore();
  const deductionId = 'E1';
  const obligation = eq({ deductionId, originalAmount: 30000 });
  const identity = computeEvidenceIdentityKey(scope, [
    { riderCode: 'R1', actualMilli: 30000 },
  ]);
  await persistEvidenceBatch(store, {
    cycleScope: scope,
    fileValidationStatus: 'FILE_VALID',
    reconcileBatchId: 'rb1',
    evidenceIdentityKey: identity,
    completeCycleConfirmedBy: 'admin',
    completeCycleConfirmedAt: 't',
  });
  const alloc = await runAllocationFoundation({
    evidenceIdentityKey: identity,
    reconcileBatchId: 'rb1',
    fileValidationStatus: 'FILE_VALID',
    actualByRiderMilli: { R1: 30000 },
    obligations: [obligation],
    store,
  });
  assert.equal(alloc.outcome, 'applied');
  return { store, obligation, identity, batch: 'rb1', deductionId };
}

function buildPorts(params: {
  evidenceStore: ReturnType<typeof createMemoryEvidenceApplyStore>;
  obligation: DeductionObligation;
}): {
  ports: FinancialApplyPorts;
  counters: {
    walletCalls: number;
    ledgerAppendCalls: number;
    saveObligationCalls: number;
    intentCreates: number;
  };
  intentStore: ReturnType<typeof createMemoryFinancialApplyIntentStore>;
} {
  const intentStore = createMemoryFinancialApplyIntentStore();
  const redis = createMemoryFailClosedLockRedis({ configured: true });
  const obligations = new Map<string, DeductionObligation>([
    [params.obligation.deductionId, { ...params.obligation }],
  ]);
  const liability: LiabilitySnapshot = {
    equipmentIssueId: 'ISSUE-A',
    riderCode: 'R1',
    riderNameSnapshot: 'Rider',
    outstandingMilli: 90000,
    amountDeductedMilli: 0,
    installmentsCompleted: 0,
    status: 'open',
  };
  const ledger = new Map<string, LedgerTxn>();
  const counters = {
    walletCalls: 0,
    ledgerAppendCalls: 0,
    saveObligationCalls: 0,
    intentCreates: 0,
  };

  const baseCreate = intentStore.createIfAbsent.bind(intentStore);
  intentStore.createIfAbsent = async (intent) => {
    counters.intentCreates += 1;
    return baseCreate(intent);
  };

  const ports: FinancialApplyPorts = {
    intentStore,
    evidenceStore: params.evidenceStore,
    dualGateSatisfied: true,
    managerConfirmed: true,
    actor: { code: 'sys', name: 'system' },
    period: '2026-08',
    cycleId: 'C1',
    acquireLock: (economicKey) => acquireFinancialApplyLock(economicKey, redis),
    async getObligation(id) {
      const o = obligations.get(id);
      return o ? { ...o } : null;
    },
    async saveObligation(o) {
      counters.saveObligationCalls += 1;
      obligations.set(o.deductionId, { ...o });
    },
    async getLiability() {
      return { ...liability };
    },
    async updateLiabilityBalance(_id, deductionMilli, opts) {
      counters.walletCalls += 1;
      liability.amountDeductedMilli += deductionMilli;
      liability.outstandingMilli = Math.max(0, liability.outstandingMilli - deductionMilli);
      if (opts.incrementInstallment) liability.installmentsCompleted += 1;
      return { ok: true, issue: { ...liability } };
    },
    async getLedgerByIdempotencyKey(key) {
      return ledger.get(key) ?? null;
    },
    async appendLedgerNative(p) {
      counters.ledgerAppendCalls += 1;
      const existing = ledger.get(p.idempotencyKey);
      if (existing) return existing;
      const txn = { transactionId: `txn_${counters.ledgerAppendCalls}`, idempotencyKey: p.idempotencyKey };
      ledger.set(p.idempotencyKey, txn);
      return txn;
    },
  };

  return { ports, counters, intentStore };
}

function assertZeroMutation(counters: {
  walletCalls: number;
  ledgerAppendCalls: number;
  saveObligationCalls: number;
  intentCreates: number;
}) {
  assert.equal(counters.walletCalls, 0, 'wallet mutation must be 0');
  assert.equal(counters.ledgerAppendCalls, 0, 'ledger mutation must be 0');
  assert.equal(counters.saveObligationCalls, 0, 'liability/obligation mutation must be 0');
  assert.equal(counters.intentCreates, 0, 'financial intent mutation must be 0');
}

describe('Phase 4D.5.4 — pre-first-run hardening', () => {
  it('safety: FEATURE_SRS014_FINANCIAL_APPLY_ENABLED remains OFF', () => {
    assert.equal(isSrs014FinancialApplyEnabled(), false);
  });

  it('A: valid persisted evidence → authorization succeeds', async () => {
    const seeded = await seedValidApplied();
    const r = await authorizeProductionFinancialApply({
      evidenceStore: seeded.store,
      evidenceIdentityKey: seeded.identity,
      deductionId: seeded.deductionId,
      dualGateSatisfied: true,
      requestManagerConfirmed: false,
    });
    assert.equal(r.ok, true);
    if (r.ok) {
      assert.equal(r.fileValidationStatus, 'FILE_VALID');
      assert.equal(r.managerConfirmed, true);
      assert.ok(r.allocatedMilli > 0);
    }
  });

  it('B: caller managerConfirmed=true + persisted confirmation=false → rejected, zero mutation', async () => {
    const store = createMemoryEvidenceApplyStore();
    const identity = computeEvidenceIdentityKey(scope, [{ riderCode: 'R1', actualMilli: 30000 }]);
    await persistEvidenceBatch(store, {
      cycleScope: scope,
      fileValidationStatus: 'FILE_VALID',
      reconcileBatchId: 'rb1',
      evidenceIdentityKey: identity,
      completeCycleConfirmedBy: 'admin',
      completeCycleConfirmedAt: 't',
    });
    store.evidence[0]!.completeCycleConfirmed = false;
    store.evidence[0]!.completeCycleConfirmedBy = null;
    store.evidence[0]!.completeCycleConfirmedAt = null;
    await store.appendApplyRecord({
      applyRecordId: 'ar1',
      evidenceIdentityKey: identity,
      reconcileBatchId: 'rb1',
      deductionId: 'E1',
      allocatedMilli: 30000,
      reason: 'معدات',
      applyStatus: 'APPLIED',
      liabilityRecoverable: false,
      supersedesApplyRecordId: null,
      supersededByApplyRecordId: null,
      createdAt: 't',
      updatedAt: 't',
    });
    const obligation = eq({ deductionId: 'E1', originalAmount: 30000 });
    const h = buildPorts({ evidenceStore: store, obligation });
    const r = await runProductionFinancialApplyLine({
      evidenceIdentityKey: identity,
      reconcileBatchId: 'rb1',
      deductionId: 'E1',
      managerConfirmed: true,
      fileValidationStatus: 'FILE_VALID',
      dualGateSatisfied: true,
      actor: { code: 'a', name: 'a' },
      period: '2026-08',
      cycleId: 'C1',
      ports: h.ports,
      isEnabled: () => true,
    });
    assert.equal(r.outcome, 'rejected');
    assert.equal(r.reason, 'manager_confirmation_missing');
    assert.equal(r.financialSideEffects.productionFinancialMutation, false);
    assertZeroMutation(h.counters);
  });

  it('C: caller FILE_VALID + persisted FILE_PARTIAL → rejected, zero mutation', async () => {
    const store = createMemoryEvidenceApplyStore();
    const identity = computeEvidenceIdentityKey(scope, [{ riderCode: 'R1', actualMilli: 1 }]);
    await persistEvidenceBatch(store, {
      cycleScope: scope,
      fileValidationStatus: 'FILE_PARTIAL',
      reconcileBatchId: 'rb1',
      evidenceIdentityKey: null,
    });
    store.evidence[0]!.evidenceIdentityKey = identity;
    const obligation = eq({ deductionId: 'E1', originalAmount: 30000 });
    const h = buildPorts({ evidenceStore: store, obligation });
    const r = await runProductionFinancialApplyLine({
      evidenceIdentityKey: identity,
      reconcileBatchId: 'rb1',
      deductionId: 'E1',
      managerConfirmed: true,
      fileValidationStatus: 'FILE_VALID',
      dualGateSatisfied: true,
      actor: { code: 'a', name: 'a' },
      period: '2026-08',
      cycleId: 'C1',
      ports: h.ports,
      isEnabled: () => true,
    });
    assert.equal(r.outcome, 'rejected');
    assert.equal(r.reason, 'file_partial');
    assertZeroMutation(h.counters);
  });

  it('D: persisted SUPERSEDED → rejected, zero mutation', async () => {
    const seeded = await seedValidApplied();
    const id2 = computeEvidenceIdentityKey(scope, [{ riderCode: 'R1', actualMilli: 29999 }]);
    await markEvidenceSupersededForReplacement(seeded.store, {
      priorEvidenceIdentityKey: seeded.identity,
      replacementEvidenceIdentityKey: id2,
      replacementReconcileBatchId: 'rb2',
      replacementCycleScope: scope,
      actorCode: 'admin',
    });
    const h = buildPorts({ evidenceStore: seeded.store, obligation: seeded.obligation });
    const r = await runProductionFinancialApplyLine({
      evidenceIdentityKey: seeded.identity,
      reconcileBatchId: seeded.batch,
      deductionId: seeded.deductionId,
      managerConfirmed: true,
      fileValidationStatus: 'FILE_VALID',
      dualGateSatisfied: true,
      actor: { code: 'a', name: 'a' },
      period: '2026-08',
      cycleId: 'C1',
      ports: h.ports,
      isEnabled: () => true,
    });
    assert.equal(r.outcome, 'blocked_superseded');
    assert.equal(r.reason, 'evidence_identity_superseded');
    assertZeroMutation(h.counters);
  });

  it('E: identity mismatch → rejected, zero mutation', async () => {
    const seeded = await seedValidApplied();
    const h = buildPorts({ evidenceStore: seeded.store, obligation: seeded.obligation });
    const r = await runProductionFinancialApplyLine({
      evidenceIdentityKey: 'not-the-persisted-identity',
      reconcileBatchId: seeded.batch,
      deductionId: seeded.deductionId,
      managerConfirmed: true,
      fileValidationStatus: 'FILE_VALID',
      dualGateSatisfied: true,
      actor: { code: 'a', name: 'a' },
      period: '2026-08',
      cycleId: 'C1',
      ports: h.ports,
      isEnabled: () => true,
    });
    assert.equal(r.outcome, 'rejected');
    assert.ok(
      r.reason === 'evidence_missing' || r.reason === 'evidence_identity_mismatch'
    );
    assertZeroMutation(h.counters);
  });

  it('F: apply-record identity mismatch → rejected, zero mutation', async () => {
    const seeded = await seedValidApplied();
    const rows = await seeded.store.listApplyRecords();
    const row = rows[0]!;
    // Move APPLIED line off the requested evidence identity (identity mismatch / no match).
    await seeded.store.updateApplyRecord(row.applyRecordId, {
      ...row,
      evidenceIdentityKey: 'other-identity',
    });
    const h = buildPorts({ evidenceStore: seeded.store, obligation: seeded.obligation });
    const r = await runProductionFinancialApplyLine({
      evidenceIdentityKey: seeded.identity,
      reconcileBatchId: seeded.batch,
      deductionId: seeded.deductionId,
      managerConfirmed: true,
      fileValidationStatus: 'FILE_VALID',
      dualGateSatisfied: true,
      actor: { code: 'a', name: 'a' },
      period: '2026-08',
      cycleId: 'C1',
      ports: h.ports,
      isEnabled: () => true,
    });
    assert.equal(r.outcome, 'rejected');
    assert.ok(
      r.reason === 'apply_record_identity_mismatch' || r.reason === 'apply_record_missing'
    );
    assertZeroMutation(h.counters);
  });

  it('G: APPLIED missing → rejected, zero mutation', async () => {
    const store = createMemoryEvidenceApplyStore();
    const identity = computeEvidenceIdentityKey(scope, [{ riderCode: 'R1', actualMilli: 2 }]);
    await persistEvidenceBatch(store, {
      cycleScope: scope,
      fileValidationStatus: 'FILE_VALID',
      reconcileBatchId: 'rb1',
      evidenceIdentityKey: identity,
      completeCycleConfirmedBy: 'admin',
      completeCycleConfirmedAt: 't',
    });
    await store.appendApplyRecord({
      applyRecordId: 'ar1',
      evidenceIdentityKey: identity,
      reconcileBatchId: 'rb1',
      deductionId: 'E1',
      allocatedMilli: 30000,
      reason: 'معدات',
      applyStatus: 'PENDING',
      liabilityRecoverable: false,
      supersedesApplyRecordId: null,
      supersededByApplyRecordId: null,
      createdAt: 't',
      updatedAt: 't',
    });
    const obligation = eq({ deductionId: 'E1', originalAmount: 30000 });
    const h = buildPorts({ evidenceStore: store, obligation });
    const r = await runProductionFinancialApplyLine({
      evidenceIdentityKey: identity,
      reconcileBatchId: 'rb1',
      deductionId: 'E1',
      managerConfirmed: true,
      fileValidationStatus: 'FILE_VALID',
      dualGateSatisfied: true,
      actor: { code: 'a', name: 'a' },
      period: '2026-08',
      cycleId: 'C1',
      ports: h.ports,
      isEnabled: () => true,
    });
    assert.equal(r.outcome, 'rejected');
    assert.equal(r.reason, 'allocation_not_applied');
    assertZeroMutation(h.counters);
  });

  it('H: allocatedMilli <= 0 → rejected, zero mutation', async () => {
    const store = createMemoryEvidenceApplyStore();
    const identity = computeEvidenceIdentityKey(scope, [{ riderCode: 'R1', actualMilli: 3 }]);
    await persistEvidenceBatch(store, {
      cycleScope: scope,
      fileValidationStatus: 'FILE_VALID',
      reconcileBatchId: 'rb1',
      evidenceIdentityKey: identity,
      completeCycleConfirmedBy: 'admin',
      completeCycleConfirmedAt: 't',
    });
    await store.appendApplyRecord({
      applyRecordId: 'ar1',
      evidenceIdentityKey: identity,
      reconcileBatchId: 'rb1',
      deductionId: 'E1',
      allocatedMilli: 0,
      reason: 'معدات',
      applyStatus: 'APPLIED',
      liabilityRecoverable: false,
      supersedesApplyRecordId: null,
      supersededByApplyRecordId: null,
      createdAt: 't',
      updatedAt: 't',
    });
    const obligation = eq({ deductionId: 'E1', originalAmount: 30000 });
    const h = buildPorts({ evidenceStore: store, obligation });
    const r = await runProductionFinancialApplyLine({
      evidenceIdentityKey: identity,
      reconcileBatchId: 'rb1',
      deductionId: 'E1',
      managerConfirmed: true,
      fileValidationStatus: 'FILE_VALID',
      dualGateSatisfied: true,
      actor: { code: 'a', name: 'a' },
      period: '2026-08',
      cycleId: 'C1',
      ports: h.ports,
      isEnabled: () => true,
    });
    assert.equal(r.outcome, 'rejected');
    assert.equal(r.reason, 'allocated_milli_not_positive');
    assertZeroMutation(h.counters);
  });

  it('I: D-PERM-1 failure → rejected, zero mutation', async () => {
    const seeded = await seedValidApplied();
    const h = buildPorts({ evidenceStore: seeded.store, obligation: seeded.obligation });
    const r = await runProductionFinancialApplyLine({
      evidenceIdentityKey: seeded.identity,
      reconcileBatchId: seeded.batch,
      deductionId: seeded.deductionId,
      managerConfirmed: true,
      fileValidationStatus: 'FILE_VALID',
      dualGateSatisfied: false,
      actor: { code: 'a', name: 'a' },
      period: '2026-08',
      cycleId: 'C1',
      ports: h.ports,
      isEnabled: () => true,
    });
    assert.equal(r.outcome, 'rejected');
    assert.equal(r.reason, 'dual_gate_not_satisfied');
    assertZeroMutation(h.counters);
  });

  it('J: direct production entry cannot bypass persisted authorization', async () => {
    const store = createMemoryEvidenceApplyStore();
    const identity = computeEvidenceIdentityKey(scope, [{ riderCode: 'R1', actualMilli: 4 }]);
    await persistEvidenceBatch(store, {
      cycleScope: scope,
      fileValidationStatus: 'FILE_INVALID',
      reconcileBatchId: 'rb1',
      evidenceIdentityKey: null,
    });
    store.evidence[0]!.evidenceIdentityKey = identity;
    await store.appendApplyRecord({
      applyRecordId: 'ar1',
      evidenceIdentityKey: identity,
      reconcileBatchId: 'rb1',
      deductionId: 'E1',
      allocatedMilli: 30000,
      reason: 'معدات',
      applyStatus: 'APPLIED',
      liabilityRecoverable: false,
      supersedesApplyRecordId: null,
      supersededByApplyRecordId: null,
      createdAt: 't',
      updatedAt: 't',
    });
    const obligation = eq({ deductionId: 'E1', originalAmount: 30000 });
    const h = buildPorts({ evidenceStore: store, obligation });
    // Bypass attempt: omit route, forge caller gates, call lib entry directly.
    const r = await runProductionFinancialApplyLine({
      evidenceIdentityKey: identity,
      reconcileBatchId: 'rb1',
      deductionId: 'E1',
      managerConfirmed: true,
      fileValidationStatus: 'FILE_VALID',
      dualGateSatisfied: true,
      actor: { code: 'attacker', name: 'attacker' },
      period: '2026-08',
      cycleId: 'C1',
      ports: h.ports,
      isEnabled: () => true,
    });
    assert.equal(r.outcome, 'rejected');
    assert.equal(r.reason, 'file_invalid');
    assert.equal(r.financialSideEffects.walletMutated, false);
    assert.equal(r.financialSideEffects.ledgerNativeWritten, false);
    assert.equal(r.financialSideEffects.productionFinancialMutation, false);
    assertZeroMutation(h.counters);
  });

  it('K–N: empty / whitespace period and cycleId rejected before mutation', async () => {
    const seeded = await seedValidApplied();
    const cases: Array<{ period: string; cycleId: string; reason: string }> = [
      { period: '', cycleId: 'C1', reason: 'empty_period' },
      { period: '   ', cycleId: 'C1', reason: 'empty_period' },
      { period: '2026-08', cycleId: '', reason: 'empty_cycle_id' },
      { period: '2026-08', cycleId: '\t  ', reason: 'empty_cycle_id' },
    ];
    for (const c of cases) {
      const h = buildPorts({ evidenceStore: seeded.store, obligation: seeded.obligation });
      const r = await runProductionFinancialApplyLine({
        evidenceIdentityKey: seeded.identity,
        reconcileBatchId: seeded.batch,
        deductionId: seeded.deductionId,
        managerConfirmed: true,
        fileValidationStatus: 'FILE_VALID',
        dualGateSatisfied: true,
        actor: { code: 'a', name: 'a' },
        period: c.period,
        cycleId: c.cycleId,
        ports: h.ports,
        isEnabled: () => true,
      });
      assert.equal(r.outcome, 'rejected', c.reason);
      assert.equal(r.reason, c.reason);
      assertZeroMutation(h.counters);
    }
  });

  it('O: valid period + valid cycleId accepted by validation', () => {
    const ok = validateProductionFinancialApplyPeriodCycleId('2026-08', 'C1');
    assert.equal(ok.ok, true);
    if (ok.ok) {
      assert.equal(ok.period, '2026-08');
      assert.equal(ok.cycleId, 'C1');
    }
    const trimmed = validateProductionFinancialApplyPeriodCycleId(' 2026-08 ', ' C1 ');
    assert.equal(trimmed.ok, true);
    if (trimmed.ok) {
      assert.equal(trimmed.period, '2026-08');
      assert.equal(trimmed.cycleId, 'C1');
    }
  });
});
