/**
 * SRS-014 Phase 4D.5 — production financial wiring tests (P1–P25).
 * Injectable ports only — ZERO live Sheets / wallet / Redis.
 */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { runAllocationFoundation } from '@/lib/equipmentDeductions/allocationOrchestration';
import {
  computeEvidenceIdentityKey,
  createMemoryEvidenceApplyStore,
  markEvidenceSupersededForReplacement,
  persistEvidenceBatch,
} from '@/lib/equipmentDeductions/evidenceApply';
import {
  createMemoryFinancialApplyIntentStore,
  financialApplyEconomicKey,
  type FinancialApplyPorts,
  type LiabilitySnapshot,
  type LedgerTxn,
} from '@/lib/equipmentDeductions/financialApply';
import {
  acquireFinancialApplyLock,
  createMemoryFailClosedLockRedis,
} from '@/lib/equipmentDeductions/financialApplyLock';
import {
  runProductionFinancialApplyLine,
} from '@/lib/equipmentDeductions/financialApplyProduction';
import {
  createRequestObligation,
  isEconomicallyConsistent,
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
  reason?: 'معدات' | 'سلفة';
  equipmentIssueId?: string;
}): DeductionObligation {
  return createRequestObligation({
    deductionId: partial.deductionId,
    source: partial.reason === 'سلفة' ? 'supervisor' : 'auto_equipment',
    riderCode: 'R1',
    reason: partial.reason || 'معدات',
    originalCycleId: 'C1',
    originalAmount: partial.originalAmount,
    obligationAgeKey: '1',
    equipmentIssueId: partial.equipmentIssueId || (partial.reason === 'سلفة' ? undefined : 'ISSUE-A'),
    installmentNumber: partial.reason === 'سلفة' ? undefined : 1,
  });
}

async function seedAllocated(params: {
  originalAmount: number;
  actualMilli: number;
  reason?: 'معدات' | 'سلفة';
  deductionId?: string;
}) {
  const store = createMemoryEvidenceApplyStore();
  const deductionId = params.deductionId || 'E1';
  const obligation = eq({
    deductionId,
    originalAmount: params.originalAmount,
    reason: params.reason,
  });
  const identity = computeEvidenceIdentityKey(scope, [
    { riderCode: 'R1', actualMilli: params.actualMilli },
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
    actualByRiderMilli: { R1: params.actualMilli },
    obligations: [obligation],
    store,
  });
  assert.equal(alloc.outcome, 'applied');
  return { store, obligation, identity, batch: 'rb1', deductionId };
}

function buildPorts(params: {
  evidenceStore: ReturnType<typeof createMemoryEvidenceApplyStore>;
  obligation: DeductionObligation;
  redis?: ReturnType<typeof createMemoryFailClosedLockRedis>;
  liabilityFailTimes?: number;
}): {
  ports: FinancialApplyPorts;
  obligations: Map<string, DeductionObligation>;
  liability: LiabilitySnapshot;
  ledger: Map<string, LedgerTxn>;
  counters: {
    walletCalls: number;
    ledgerAppendCalls: number;
    installmentIncrements: number;
    saveObligationCalls: number;
  };
} {
  const intentStore = createMemoryFinancialApplyIntentStore();
  const redis = params.redis ?? createMemoryFailClosedLockRedis({ configured: true });
  const obligations = new Map<string, DeductionObligation>([
    [params.obligation.deductionId, { ...params.obligation }],
  ]);
  const liability: LiabilitySnapshot = {
    equipmentIssueId: params.obligation.equipmentIssueId || 'ISSUE-A',
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
    installmentIncrements: 0,
    saveObligationCalls: 0,
  };
  let liabilityFailsLeft = params.liabilityFailTimes ?? 0;

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
      assert.equal(o.originalAmount, params.obligation.originalAmount);
      obligations.set(o.deductionId, { ...o });
    },
    async getLiability(id) {
      if (id !== liability.equipmentIssueId) return null;
      return { ...liability };
    },
    async updateLiabilityBalance(id, deductionMilli, opts) {
      counters.walletCalls += 1;
      if (liabilityFailsLeft > 0) {
        liabilityFailsLeft -= 1;
        return { ok: false, error: 'injected_fail' };
      }
      liability.amountDeductedMilli += deductionMilli;
      liability.outstandingMilli = Math.max(0, liability.outstandingMilli - deductionMilli);
      if (opts.incrementInstallment) {
        liability.installmentsCompleted += 1;
        counters.installmentIncrements += 1;
      }
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

  return { ports, obligations, liability, ledger, counters };
}

describe('Phase 4D.5 — production financial wiring', () => {
  it('P1: flag OFF → zero financial mutations', async () => {
    assert.equal(isSrs014FinancialApplyEnabled(), false);
    const seeded = await seedAllocated({ originalAmount: 30000, actualMilli: 30000 });
    const h = buildPorts({ evidenceStore: seeded.store, obligation: seeded.obligation });
    const r = await runProductionFinancialApplyLine({
      evidenceIdentityKey: seeded.identity,
      reconcileBatchId: seeded.batch,
      deductionId: seeded.deductionId,
      fileValidationStatus: 'FILE_VALID',
      managerConfirmed: true,
      dualGateSatisfied: true,
      actor: { code: 'a', name: 'a' },
      period: '2026-08',
      cycleId: 'C1',
      ports: h.ports,
      isEnabled: () => false,
    });
    assert.equal(r.outcome, 'rejected');
    assert.equal(r.reason, 'financial_apply_flag_off');
    assert.equal(h.counters.walletCalls, 0);
    assert.equal(h.counters.ledgerAppendCalls, 0);
    assert.equal(h.counters.saveObligationCalls, 0);
  });

  it('P2/P3: persisted FILE_PARTIAL / FILE_INVALID rejected (caller status ignored)', async () => {
    for (const status of ['FILE_PARTIAL', 'FILE_INVALID'] as const) {
      const store = createMemoryEvidenceApplyStore();
      const identity = computeEvidenceIdentityKey(scope, [{ riderCode: 'R1', actualMilli: 1 }]);
      await persistEvidenceBatch(store, {
        cycleScope: scope,
        fileValidationStatus: status,
        reconcileBatchId: 'rb',
        evidenceIdentityKey: null,
      });
      store.evidence[0]!.evidenceIdentityKey = identity;
      const obligation = eq({ deductionId: 'E0', originalAmount: 10000 });
      const h = buildPorts({ evidenceStore: store, obligation });
      const r = await runProductionFinancialApplyLine({
        evidenceIdentityKey: identity,
        reconcileBatchId: 'rb',
        deductionId: 'E0',
        // Caller lies FILE_VALID — must not authorize.
        fileValidationStatus: 'FILE_VALID',
        managerConfirmed: true,
        dualGateSatisfied: true,
        actor: { code: 'a', name: 'a' },
        period: '2026-08',
        cycleId: 'C1',
        ports: h.ports,
        isEnabled: () => true,
      });
      assert.equal(r.outcome, 'rejected');
      assert.equal(r.reason, status === 'FILE_PARTIAL' ? 'file_partial' : 'file_invalid');
      assert.equal(h.counters.walletCalls, 0);
      assert.equal(h.counters.ledgerAppendCalls, 0);
      assert.equal(h.counters.saveObligationCalls, 0);
    }
  });

  it('P4/P5: caller managerConfirmed ignored; D-PERM-1 failure rejected', async () => {
    const seeded = await seedAllocated({ originalAmount: 30000, actualMilli: 30000 });
    const h = buildPorts({ evidenceStore: seeded.store, obligation: seeded.obligation });
    const base = {
      evidenceIdentityKey: seeded.identity,
      reconcileBatchId: seeded.batch,
      deductionId: seeded.deductionId,
      actor: { code: 'a', name: 'a' },
      period: '2026-08',
      cycleId: 'C1',
      ports: h.ports,
      isEnabled: () => true,
    };
    // Caller denies confirmation but persisted evidence is confirmed → authorize from store.
    const u = await runProductionFinancialApplyLine({
      ...base,
      managerConfirmed: false,
      dualGateSatisfied: true,
    });
    assert.equal(u.outcome, 'financially_applied');
    assert.equal(h.counters.walletCalls, 1);

    const d = await runProductionFinancialApplyLine({
      ...base,
      managerConfirmed: true,
      dualGateSatisfied: false,
    });
    assert.equal(d.outcome, 'rejected');
    assert.equal(d.reason, 'dual_gate_not_satisfied');
  });

  it('P6/P22: superseded evidence rejected', async () => {
    const seeded = await seedAllocated({ originalAmount: 30000, actualMilli: 30000 });
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
      fileValidationStatus: 'FILE_VALID',
      managerConfirmed: true,
      dualGateSatisfied: true,
      actor: { code: 'a', name: 'a' },
      period: '2026-08',
      cycleId: 'C1',
      ports: h.ports,
      isEnabled: () => true,
    });
    assert.equal(r.outcome, 'blocked_superseded');
    assert.equal(r.reason, 'evidence_identity_superseded');
    assert.equal(h.counters.walletCalls, 0);
  });

  it('P7/P8: missing APPLIED / allocatedMilli<=0 rejected', async () => {
    const store = createMemoryEvidenceApplyStore();
    const identity = computeEvidenceIdentityKey(scope, [{ riderCode: 'R1', actualMilli: 1 }]);
    await persistEvidenceBatch(store, {
      cycleScope: scope,
      fileValidationStatus: 'FILE_VALID',
      reconcileBatchId: 'rb',
      evidenceIdentityKey: identity,
      completeCycleConfirmedBy: 'a',
      completeCycleConfirmedAt: 't',
    });
    const obligation = eq({ deductionId: 'E0', originalAmount: 10000 });
    const h = buildPorts({ evidenceStore: store, obligation });
    const missing = await runProductionFinancialApplyLine({
      evidenceIdentityKey: identity,
      reconcileBatchId: 'rb',
      deductionId: 'E0',
      fileValidationStatus: 'FILE_VALID',
      managerConfirmed: true,
      dualGateSatisfied: true,
      actor: { code: 'a', name: 'a' },
      period: '2026-08',
      cycleId: 'C1',
      ports: h.ports,
      isEnabled: () => true,
    });
    assert.equal(missing.outcome, 'rejected');
    assert.equal(missing.reason, 'apply_record_missing');

    await store.appendApplyRecord({
      applyRecordId: 'ar0',
      evidenceIdentityKey: identity,
      reconcileBatchId: 'rb',
      deductionId: 'E0',
      allocatedMilli: 0,
      reason: 'معدات',
      applyStatus: 'APPLIED',
      liabilityRecoverable: false,
      supersedesApplyRecordId: null,
      supersededByApplyRecordId: null,
      createdAt: 't',
      updatedAt: 't',
    });
    const zero = await runProductionFinancialApplyLine({
      evidenceIdentityKey: identity,
      reconcileBatchId: 'rb',
      deductionId: 'E0',
      fileValidationStatus: 'FILE_VALID',
      managerConfirmed: true,
      dualGateSatisfied: true,
      actor: { code: 'a', name: 'a' },
      period: '2026-08',
      cycleId: 'C1',
      ports: h.ports,
      isEnabled: () => true,
    });
    assert.equal(zero.reason, 'allocated_milli_not_positive');
  });

  it('P9/P12: successful equipment partial apply; H-1 delta 0', async () => {
    const seeded = await seedAllocated({ originalAmount: 50000, actualMilli: 20000 });
    const h = buildPorts({ evidenceStore: seeded.store, obligation: seeded.obligation });
    const r = await runProductionFinancialApplyLine({
      evidenceIdentityKey: seeded.identity,
      reconcileBatchId: seeded.batch,
      deductionId: seeded.deductionId,
      fileValidationStatus: 'FILE_VALID',
      managerConfirmed: true,
      dualGateSatisfied: true,
      actor: { code: 'a', name: 'a' },
      period: '2026-08',
      cycleId: 'C1',
      ports: h.ports,
      isEnabled: () => true,
    });
    assert.equal(r.outcome, 'financially_applied');
    assert.equal(r.financialSideEffects.installmentsCompletedDelta, 0);
    assert.equal(h.counters.installmentIncrements, 0);
    assert.equal(h.liability.amountDeductedMilli, 20000);
    const o = h.obligations.get('E1')!;
    assert.ok(isEconomicallyConsistent(o));
    assert.equal(o.paidAmount + o.remainingAmount, o.originalAmount);
  });

  it('P10/P13: successful equipment full apply; H-1 +1 once', async () => {
    const seeded = await seedAllocated({ originalAmount: 30000, actualMilli: 30000 });
    const h = buildPorts({ evidenceStore: seeded.store, obligation: seeded.obligation });
    const input = {
      evidenceIdentityKey: seeded.identity,
      reconcileBatchId: seeded.batch,
      deductionId: seeded.deductionId,
      fileValidationStatus: 'FILE_VALID' as const,
      managerConfirmed: true,
      dualGateSatisfied: true,
      actor: { code: 'a', name: 'a' },
      period: '2026-08',
      cycleId: 'C1',
      ports: h.ports,
      isEnabled: () => true,
    };
    const r = await runProductionFinancialApplyLine(input);
    assert.equal(r.outcome, 'financially_applied');
    assert.equal(r.financialSideEffects.installmentsCompletedDelta, 1);
    assert.equal(h.counters.installmentIncrements, 1);
    await runProductionFinancialApplyLine(input);
    assert.equal(h.counters.installmentIncrements, 1);
  });

  it('P11: successful non-equipment apply', async () => {
    const seeded = await seedAllocated({
      originalAmount: 15000,
      actualMilli: 15000,
      reason: 'سلفة',
      deductionId: 'L1',
    });
    const h = buildPorts({ evidenceStore: seeded.store, obligation: seeded.obligation });
    const r = await runProductionFinancialApplyLine({
      evidenceIdentityKey: seeded.identity,
      reconcileBatchId: seeded.batch,
      deductionId: 'L1',
      fileValidationStatus: 'FILE_VALID',
      managerConfirmed: true,
      dualGateSatisfied: true,
      actor: { code: 'a', name: 'a' },
      period: '2026-08',
      cycleId: 'C1',
      ports: h.ports,
      isEnabled: () => true,
    });
    assert.equal(r.outcome, 'financially_applied');
    assert.equal(h.counters.walletCalls, 0);
    assert.equal(h.counters.installmentIncrements, 0);
    assert.equal(h.counters.ledgerAppendCalls, 1);
    assert.equal(h.obligations.get('L1')!.paidAmount, 15000);
  });

  it('P14: retry after liability failure', async () => {
    const seeded = await seedAllocated({ originalAmount: 30000, actualMilli: 30000 });
    const h = buildPorts({
      evidenceStore: seeded.store,
      obligation: seeded.obligation,
      liabilityFailTimes: 1,
    });
    const input = {
      evidenceIdentityKey: seeded.identity,
      reconcileBatchId: seeded.batch,
      deductionId: seeded.deductionId,
      fileValidationStatus: 'FILE_VALID' as const,
      managerConfirmed: true,
      dualGateSatisfied: true,
      actor: { code: 'a', name: 'a' },
      period: '2026-08',
      cycleId: 'C1',
      ports: h.ports,
      isEnabled: () => true,
    };
    const first = await runProductionFinancialApplyLine(input);
    assert.equal(first.outcome, 'recovery_required');
    assert.equal(h.counters.saveObligationCalls, 1);
    const second = await runProductionFinancialApplyLine(input);
    assert.equal(second.outcome, 'financially_applied');
    assert.equal(h.counters.saveObligationCalls, 1);
    assert.equal(h.counters.ledgerAppendCalls, 1);
  });

  it('P15/P16/P17/P21: wallet/ledger recovery + COMPLETED idempotent + no duplicate ledger', async () => {
    const seeded = await seedAllocated({ originalAmount: 30000, actualMilli: 30000 });
    const h = buildPorts({ evidenceStore: seeded.store, obligation: seeded.obligation });
    const input = {
      evidenceIdentityKey: seeded.identity,
      reconcileBatchId: 'rb-other-batch',
      deductionId: seeded.deductionId,
      fileValidationStatus: 'FILE_VALID' as const,
      managerConfirmed: true,
      dualGateSatisfied: true,
      actor: { code: 'a', name: 'a' },
      period: '2026-08',
      cycleId: 'C1',
      ports: h.ports,
      isEnabled: () => true,
    };
    await runProductionFinancialApplyLine(input);
    const again = await runProductionFinancialApplyLine(input);
    assert.equal(again.outcome, 'idempotent_already_applied');
    assert.equal(h.counters.walletCalls, 1);
    assert.equal(h.counters.ledgerAppendCalls, 1);
    assert.equal(h.ledger.size, 1);
    assert.equal(
      again.economicKey,
      financialApplyEconomicKey(seeded.identity, seeded.deductionId)
    );
  });

  it('P18/P20: concurrent same economicKey — no second mutation', async () => {
    const seeded = await seedAllocated({ originalAmount: 30000, actualMilli: 30000 });
    const h = buildPorts({ evidenceStore: seeded.store, obligation: seeded.obligation });
    const input = {
      evidenceIdentityKey: seeded.identity,
      reconcileBatchId: seeded.batch,
      deductionId: seeded.deductionId,
      fileValidationStatus: 'FILE_VALID' as const,
      managerConfirmed: true,
      dualGateSatisfied: true,
      actor: { code: 'a', name: 'a' },
      period: '2026-08',
      cycleId: 'C1',
      ports: h.ports,
      isEnabled: () => true,
    };
    const results = await Promise.all([
      runProductionFinancialApplyLine(input),
      runProductionFinancialApplyLine(input),
    ]);
    const outcomes = results.map((r) => r.outcome);
    assert.ok(outcomes.includes('financially_applied') || outcomes.includes('idempotent_already_applied'));
    assert.ok(outcomes.includes('lock_busy') || outcomes.filter((o) => o === 'financially_applied').length <= 1);
    assert.equal(h.liability.amountDeductedMilli, 30000);
    assert.equal(h.counters.installmentIncrements, 1);
  });

  it('P19: Redis unavailable → fail closed, zero mutation', async () => {
    const seeded = await seedAllocated({ originalAmount: 30000, actualMilli: 30000 });
    const redis = createMemoryFailClosedLockRedis({ configured: false });
    const h = buildPorts({
      evidenceStore: seeded.store,
      obligation: seeded.obligation,
      redis,
    });
    const r = await runProductionFinancialApplyLine({
      evidenceIdentityKey: seeded.identity,
      reconcileBatchId: seeded.batch,
      deductionId: seeded.deductionId,
      fileValidationStatus: 'FILE_VALID',
      managerConfirmed: true,
      dualGateSatisfied: true,
      actor: { code: 'a', name: 'a' },
      period: '2026-08',
      cycleId: 'C1',
      ports: h.ports,
      isEnabled: () => true,
    });
    assert.equal(r.outcome, 'redis_unavailable');
    assert.equal(h.counters.walletCalls, 0);
    assert.equal(h.counters.ledgerAppendCalls, 0);
  });

  it('P23: legacy REJECTED + obligationMutated recovery', async () => {
    const seeded = await seedAllocated({ originalAmount: 30000, actualMilli: 30000 });
    const h = buildPorts({ evidenceStore: seeded.store, obligation: seeded.obligation });
    const key = financialApplyEconomicKey(seeded.identity, 'E1');
    h.obligations.set('E1', {
      ...seeded.obligation,
      paidAmount: 30000,
      remainingAmount: 0,
      status: 'paid',
    });
    await h.ports.intentStore.createIfAbsent({
      financialApplyId: 'fa_legacy',
      economicKey: key,
      evidenceIdentityKey: seeded.identity,
      reconcileBatchId: seeded.batch,
      deductionId: 'E1',
      applyRecordId: (await seeded.store.listApplyRecords())[0]!.applyRecordId,
      allocatedMilli: 30000,
      riderCode: 'R1',
      reason: 'معدات',
      equipmentIssueId: 'ISSUE-A',
      status: 'REJECTED',
      obligationMutated: true,
      liabilityMutated: false,
      ledgerPosted: false,
      ledgerTransactionId: '',
      ledgerIdempotencyKey: key,
      installmentsCompletedDelta: 1,
      amountDeductedMilliDelta: 0,
      outstandingMilliDelta: 0,
      amountDeductedMilliBefore: 0,
      liabilityAttempted: false,
      paidAmountBefore: 0,
      remainingAmountBefore: 30000,
      paidAmountAfter: 30000,
      remainingAmountAfter: 0,
      walletMutationIdentity: '',
      createdAt: 't',
      updatedAt: 't',
      rejectReason: 'old',
    });
    const r = await runProductionFinancialApplyLine({
      evidenceIdentityKey: seeded.identity,
      reconcileBatchId: seeded.batch,
      deductionId: 'E1',
      fileValidationStatus: 'FILE_VALID',
      managerConfirmed: true,
      dualGateSatisfied: true,
      actor: { code: 'a', name: 'a' },
      period: '2026-08',
      cycleId: 'C1',
      ports: h.ports,
      isEnabled: () => true,
    });
    assert.equal(r.outcome, 'financially_applied');
    assert.equal(h.counters.saveObligationCalls, 0);
    assert.equal(h.counters.installmentIncrements, 1);
  });

  it('P24/P25: originalAmount immutable + economic invariant', async () => {
    const seeded = await seedAllocated({ originalAmount: 30000, actualMilli: 30000 });
    const original = seeded.obligation.originalAmount;
    const h = buildPorts({ evidenceStore: seeded.store, obligation: seeded.obligation });
    await runProductionFinancialApplyLine({
      evidenceIdentityKey: seeded.identity,
      reconcileBatchId: seeded.batch,
      deductionId: seeded.deductionId,
      fileValidationStatus: 'FILE_VALID',
      managerConfirmed: true,
      dualGateSatisfied: true,
      actor: { code: 'a', name: 'a' },
      period: '2026-08',
      cycleId: 'C1',
      ports: h.ports,
      isEnabled: () => true,
    });
    const o = h.obligations.get('E1')!;
    assert.equal(o.originalAmount, original);
    assert.equal(o.paidAmount + o.remainingAmount, o.originalAmount);
    assert.ok(isEconomicallyConsistent(o));
  });
});
