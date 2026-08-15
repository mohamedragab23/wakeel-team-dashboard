/**
 * SRS-014 Phase 4D.4 — Controlled financial apply tests (AT-F1..F16).
 * Injectable ports only — no live Sheets / production wallet.
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
  createMemoryFinancialApplyLock,
  financialApplyEconomicKey,
  runFinancialApplyLine,
  type FinancialApplyPorts,
  type LiabilitySnapshot,
  type LedgerTxn,
} from '@/lib/equipmentDeductions/financialApply';
import {
  createRequestObligation,
  type DeductionObligation,
} from '@/lib/equipmentDeductions/obligations';

const scope = {
  cycleId: 'C1',
  cycleLabel: 'الأولى',
  monthLabel: 'أغسطس',
  year: 2026,
};

function eq(partial: {
  deductionId: string;
  originalAmount: number;
  obligationAgeKey?: string;
  equipmentIssueId?: string;
  installmentNumber?: number;
}): DeductionObligation {
  return createRequestObligation({
    deductionId: partial.deductionId,
    source: 'auto_equipment',
    riderCode: 'R1',
    reason: 'معدات',
    originalCycleId: 'C1',
    originalAmount: partial.originalAmount,
    obligationAgeKey: partial.obligationAgeKey || '1',
    equipmentIssueId: partial.equipmentIssueId || 'ISSUE-A',
    installmentNumber: partial.installmentNumber ?? 1,
  });
}

async function seedAllocated(params: {
  originalAmount: number;
  actualMilli: number;
  batch?: string;
  identity?: string;
}) {
  const store = createMemoryEvidenceApplyStore();
  const obligation = eq({
    deductionId: 'E1',
    originalAmount: params.originalAmount,
  });
  const identity =
    params.identity ||
    computeEvidenceIdentityKey(scope, [{ riderCode: 'R1', actualMilli: params.actualMilli }]);
  const batch = params.batch || 'rb1';

  await persistEvidenceBatch(store, {
    cycleScope: scope,
    fileValidationStatus: 'FILE_VALID',
    reconcileBatchId: batch,
    evidenceIdentityKey: identity,
    completeCycleConfirmedBy: 'admin',
    completeCycleConfirmedAt: 't',
  });

  const alloc = await runAllocationFoundation({
    evidenceIdentityKey: identity,
    reconcileBatchId: batch,
    fileValidationStatus: 'FILE_VALID',
    actualByRiderMilli: { R1: params.actualMilli },
    obligations: [obligation],
    store,
  });
  assert.equal(alloc.outcome, 'applied');

  return { store, obligation, identity, batch, alloc };
}

function createHarness(params: {
  evidenceStore: ReturnType<typeof createMemoryEvidenceApplyStore>;
  obligation: DeductionObligation;
  crashAfter?: 'intent' | 'obligation' | 'wallet' | 'ledger';
  /** Fail the next N liability updates with ok:false (then succeed). */
  liabilityFailTimes?: number;
}) {
  const intentStore = createMemoryFinancialApplyIntentStore();
  const lock = createMemoryFinancialApplyLock();
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
  let walletCalls = 0;
  let ledgerAppendCalls = 0;
  let installmentIncrements = 0;
  let saveObligationCalls = 0;
  let liabilityFailsLeft = params.liabilityFailTimes ?? 0;

  const ports: FinancialApplyPorts = {
    intentStore,
    evidenceStore: params.evidenceStore,
    acquireLock: lock.acquireLock,
    dualGateSatisfied: true,
    managerConfirmed: true,
    actor: { code: 'sys', name: 'system' },
    period: '2026-08',
    cycleId: 'C1',
    now: '2026-08-11T00:00:00.000Z',
    async getObligation(id) {
      const o = obligations.get(id);
      return o ? { ...o } : null;
    },
    async saveObligation(o) {
      saveObligationCalls += 1;
      obligations.set(o.deductionId, { ...o });
      if (params.crashAfter === 'obligation') {
        throw new Error('crash_after_obligation');
      }
    },
    async getLiability(id) {
      if (id !== liability.equipmentIssueId) return null;
      return { ...liability };
    },
    async updateLiabilityBalance(id, deductionMilli, opts) {
      walletCalls += 1;
      if (id !== liability.equipmentIssueId) return { ok: false, error: 'not found' };
      if (liabilityFailsLeft > 0) {
        liabilityFailsLeft -= 1;
        return { ok: false, error: 'injected_liability_failure' };
      }
      liability.amountDeductedMilli += deductionMilli;
      liability.outstandingMilli = Math.max(0, liability.outstandingMilli - deductionMilli);
      if (opts.incrementInstallment) {
        liability.installmentsCompleted += 1;
        installmentIncrements += 1;
      }
      if (params.crashAfter === 'wallet') {
        throw new Error('crash_after_wallet');
      }
      return { ok: true, issue: { ...liability } };
    },
    async getLedgerByIdempotencyKey(key) {
      return ledger.get(key) ?? null;
    },
    async appendLedgerNative(p) {
      ledgerAppendCalls += 1;
      const existing = ledger.get(p.idempotencyKey);
      if (existing) return existing;
      const txn = { transactionId: `txn_${ledgerAppendCalls}`, idempotencyKey: p.idempotencyKey };
      ledger.set(p.idempotencyKey, txn);
      if (params.crashAfter === 'ledger') {
        throw new Error('crash_after_ledger');
      }
      return txn;
    },
  };

  return {
    ports,
    intentStore,
    obligations,
    liability,
    ledger,
    counters: {
      get walletCalls() {
        return walletCalls;
      },
      get ledgerAppendCalls() {
        return ledgerAppendCalls;
      },
      get installmentIncrements() {
        return installmentIncrements;
      },
      get saveObligationCalls() {
        return saveObligationCalls;
      },
    },
  };
}

describe('Phase 4D.4 — Controlled financial apply', () => {
  it('AT-F1: successful partial financial apply', async () => {
    const seeded = await seedAllocated({ originalAmount: 50000, actualMilli: 20000 });
    const h = createHarness({ evidenceStore: seeded.store, obligation: seeded.obligation });
    const r = await runFinancialApplyLine({
      evidenceIdentityKey: seeded.identity,
      reconcileBatchId: seeded.batch,
      deductionId: 'E1',
      ports: h.ports,
    });
    assert.equal(r.outcome, 'financially_applied');
    assert.equal(r.financialSideEffects.paidAmountDelta, 20000);
    assert.equal(r.financialSideEffects.amountDeductedMilliDelta, 20000);
    assert.equal(h.obligations.get('E1')!.remainingAmount, 30000);
    assert.equal(h.liability.amountDeductedMilli, 20000);
    assert.equal(h.liability.installmentsCompleted, 0);
  });

  it('AT-F2 / AT-F4: successful full installment completion increments once', async () => {
    const seeded = await seedAllocated({ originalAmount: 30000, actualMilli: 30000 });
    const h = createHarness({ evidenceStore: seeded.store, obligation: seeded.obligation });
    const r = await runFinancialApplyLine({
      evidenceIdentityKey: seeded.identity,
      reconcileBatchId: seeded.batch,
      deductionId: 'E1',
      ports: h.ports,
    });
    assert.equal(r.outcome, 'financially_applied');
    assert.equal(r.financialSideEffects.installmentsCompletedDelta, 1);
    assert.equal(h.liability.installmentsCompleted, 1);
    assert.equal(h.counters.installmentIncrements, 1);
    assert.equal(h.obligations.get('E1')!.remainingAmount, 0);
  });

  it('AT-F3: partial apply does NOT increment installmentsCompleted', async () => {
    const seeded = await seedAllocated({ originalAmount: 50000, actualMilli: 10000 });
    const h = createHarness({ evidenceStore: seeded.store, obligation: seeded.obligation });
    const r = await runFinancialApplyLine({
      evidenceIdentityKey: seeded.identity,
      reconcileBatchId: seeded.batch,
      deductionId: 'E1',
      ports: h.ports,
    });
    assert.equal(r.financialSideEffects.installmentsCompletedDelta, 0);
    assert.equal(h.liability.installmentsCompleted, 0);
    assert.equal(h.counters.installmentIncrements, 0);
  });

  it('AT-F5: same evidenceIdentityKey + deductionId retry is idempotent', async () => {
    const seeded = await seedAllocated({ originalAmount: 30000, actualMilli: 30000 });
    const h = createHarness({ evidenceStore: seeded.store, obligation: seeded.obligation });
    const input = {
      evidenceIdentityKey: seeded.identity,
      reconcileBatchId: seeded.batch,
      deductionId: 'E1',
      ports: h.ports,
    };
    const first = await runFinancialApplyLine(input);
    const second = await runFinancialApplyLine(input);
    assert.equal(first.outcome, 'financially_applied');
    assert.equal(second.outcome, 'idempotent_already_applied');
    assert.equal(h.counters.walletCalls, 1);
    assert.equal(h.counters.ledgerAppendCalls, 1);
    assert.equal(h.counters.installmentIncrements, 1);
    assert.equal(h.liability.amountDeductedMilli, 30000);
  });

  it('AT-F6: different reconcileBatchId + same evidenceIdentityKey is still idempotent', async () => {
    const seeded = await seedAllocated({ originalAmount: 30000, actualMilli: 30000, batch: 'rb-a' });
    const h = createHarness({ evidenceStore: seeded.store, obligation: seeded.obligation });
    await runFinancialApplyLine({
      evidenceIdentityKey: seeded.identity,
      reconcileBatchId: 'rb-a',
      deductionId: 'E1',
      ports: h.ports,
    });
    const again = await runFinancialApplyLine({
      evidenceIdentityKey: seeded.identity,
      reconcileBatchId: 'rb-b-different',
      deductionId: 'E1',
      ports: h.ports,
    });
    assert.equal(again.outcome, 'idempotent_already_applied');
    assert.equal(h.counters.walletCalls, 1);
    assert.equal(
      financialApplyEconomicKey(seeded.identity, 'E1'),
      again.economicKey
    );
  });

  it('AT-F7: superseded evidence is rejected', async () => {
    const seeded = await seedAllocated({ originalAmount: 30000, actualMilli: 30000 });
    const identity2 = computeEvidenceIdentityKey(scope, [{ riderCode: 'R1', actualMilli: 29999 }]);
    await markEvidenceSupersededForReplacement(seeded.store, {
      priorEvidenceIdentityKey: seeded.identity,
      replacementEvidenceIdentityKey: identity2,
      replacementReconcileBatchId: 'rb2',
      replacementCycleScope: scope,
      actorCode: 'admin',
    });
    const h = createHarness({ evidenceStore: seeded.store, obligation: seeded.obligation });
    const r = await runFinancialApplyLine({
      evidenceIdentityKey: seeded.identity,
      reconcileBatchId: seeded.batch,
      deductionId: 'E1',
      ports: h.ports,
    });
    assert.equal(r.outcome, 'blocked_superseded');
    assert.equal(h.counters.walletCalls, 0);
    assert.equal(h.counters.ledgerAppendCalls, 0);
  });

  it('AT-F8: inconsistent obligation is rejected before wallet mutation', async () => {
    const seeded = await seedAllocated({ originalAmount: 30000, actualMilli: 30000 });
    const bad = { ...seeded.obligation, paidAmount: 1000, remainingAmount: 30000 };
    const h = createHarness({ evidenceStore: seeded.store, obligation: bad });
    const r = await runFinancialApplyLine({
      evidenceIdentityKey: seeded.identity,
      reconcileBatchId: seeded.batch,
      deductionId: 'E1',
      ports: h.ports,
    });
    assert.equal(r.outcome, 'rejected');
    assert.equal(r.reason, 'inconsistent_obligation');
    assert.equal(h.counters.walletCalls, 0);
  });

  it('AT-F9: allocatedMilli > remainingAmount is rejected', async () => {
    const seeded = await seedAllocated({ originalAmount: 30000, actualMilli: 30000 });
    const short = { ...seeded.obligation, originalAmount: 30000, paidAmount: 20000, remainingAmount: 10000 };
    // Apply record still has allocatedMilli=30000 from allocation.
    const h = createHarness({ evidenceStore: seeded.store, obligation: short });
    const r = await runFinancialApplyLine({
      evidenceIdentityKey: seeded.identity,
      reconcileBatchId: seeded.batch,
      deductionId: 'E1',
      ports: h.ports,
    });
    assert.equal(r.outcome, 'rejected');
    assert.equal(r.reason, 'allocated_exceeds_remaining');
    assert.equal(h.counters.walletCalls, 0);
  });

  it('AT-F10: zero allocation is rejected', async () => {
    const store = createMemoryEvidenceApplyStore();
    const obligation = eq({ deductionId: 'E0', originalAmount: 30000 });
    const identity = computeEvidenceIdentityKey(scope, [{ riderCode: 'R1', actualMilli: 0 }]);
    await persistEvidenceBatch(store, {
      cycleScope: scope,
      fileValidationStatus: 'FILE_VALID',
      reconcileBatchId: 'rb0',
      evidenceIdentityKey: identity,
      completeCycleConfirmedBy: 'admin',
      completeCycleConfirmedAt: 't',
    });
    // Manually mint APPLIED with 0 allocated (invalid financial target).
    await store.appendApplyRecord({
      applyRecordId: 'ar0',
      evidenceIdentityKey: identity,
      reconcileBatchId: 'rb0',
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
    const h = createHarness({ evidenceStore: store, obligation });
    const r = await runFinancialApplyLine({
      evidenceIdentityKey: identity,
      reconcileBatchId: 'rb0',
      deductionId: 'E0',
      ports: h.ports,
    });
    assert.equal(r.outcome, 'rejected');
    assert.equal(r.reason, 'allocated_milli_not_positive');
    assert.equal(h.counters.walletCalls, 0);
  });

  it('AT-F11: crash before wallet → retry safe', async () => {
    const seeded = await seedAllocated({ originalAmount: 30000, actualMilli: 30000 });
    const h = createHarness({
      evidenceStore: seeded.store,
      obligation: seeded.obligation,
      crashAfter: 'obligation',
    });
    await assert.rejects(
      () =>
        runFinancialApplyLine({
          evidenceIdentityKey: seeded.identity,
          reconcileBatchId: seeded.batch,
          deductionId: 'E1',
          ports: h.ports,
        }),
      /crash_after_obligation/
    );
    assert.equal(h.counters.walletCalls, 0);

    // Clear crash on save; reuse same intent + obligation state.
    h.ports.saveObligation = async (o) => {
      h.obligations.set(o.deductionId, { ...o });
    };
    const r = await runFinancialApplyLine({
      evidenceIdentityKey: seeded.identity,
      reconcileBatchId: seeded.batch,
      deductionId: 'E1',
      ports: h.ports,
    });
    assert.equal(r.outcome, 'financially_applied');
    assert.equal(r.reason, undefined);
    assert.equal(h.counters.walletCalls, 1);
    assert.equal(h.liability.amountDeductedMilli, 30000);
  });

  it('AT-F12: crash after wallet before ledger → no second wallet mutation', async () => {
    const seeded = await seedAllocated({ originalAmount: 30000, actualMilli: 30000 });
    const h = createHarness({
      evidenceStore: seeded.store,
      obligation: seeded.obligation,
      crashAfter: 'wallet',
    });
    await assert.rejects(
      () =>
        runFinancialApplyLine({
          evidenceIdentityKey: seeded.identity,
          reconcileBatchId: seeded.batch,
          deductionId: 'E1',
          ports: h.ports,
        }),
      /crash_after_wallet/
    );
    assert.equal(h.counters.walletCalls, 1);
    assert.equal(h.liability.amountDeductedMilli, 30000);

    const portsRetry: FinancialApplyPorts = {
      ...h.ports,
      async updateLiabilityBalance(id, deductionMilli, opts) {
        return h.ports.updateLiabilityBalance!(id, deductionMilli, opts);
      },
      async appendLedgerNative(p) {
        return h.ports.appendLedgerNative(p);
      },
    };
    // Remove crash by wrapping counters without crash.
    let walletCalls2 = 0;
    portsRetry.updateLiabilityBalance = async (id, deductionMilli, opts) => {
      walletCalls2 += 1;
      return h.ports.updateLiabilityBalance!(id, deductionMilli, opts);
    };
    // The harness still throws — rebuild liability path without crash.
    const intent = await h.intentStore.getByEconomicKey(
      financialApplyEconomicKey(seeded.identity, 'E1')
    );
    assert.ok(intent);
    assert.equal(intent!.liabilityAttempted, true);

    const clean = createHarness({ evidenceStore: seeded.store, obligation: h.obligations.get('E1')! });
    // Share intent + liability state from crash.
    clean.liability.amountDeductedMilli = h.liability.amountDeductedMilli;
    clean.liability.outstandingMilli = h.liability.outstandingMilli;
    clean.liability.installmentsCompleted = h.liability.installmentsCompleted;
    const sharedPorts: FinancialApplyPorts = {
      ...clean.ports,
      intentStore: h.intentStore,
      async getLiability(id) {
        if (id !== h.liability.equipmentIssueId) return null;
        return { ...h.liability };
      },
      async updateLiabilityBalance(id, deductionMilli, opts) {
        walletCalls2 += 1;
        h.liability.amountDeductedMilli += deductionMilli;
        h.liability.outstandingMilli = Math.max(0, h.liability.outstandingMilli - deductionMilli);
        if (opts.incrementInstallment) h.liability.installmentsCompleted += 1;
        return { ok: true, issue: { ...h.liability } };
      },
      async getObligation(id) {
        return h.obligations.get(id) ? { ...h.obligations.get(id)! } : null;
      },
      async saveObligation(o) {
        h.obligations.set(o.deductionId, { ...o });
      },
    };

    const r = await runFinancialApplyLine({
      evidenceIdentityKey: seeded.identity,
      reconcileBatchId: seeded.batch,
      deductionId: 'E1',
      ports: sharedPorts,
    });
    assert.equal(r.outcome, 'financially_applied');
    assert.equal(walletCalls2, 0, 'must not call wallet again');
    assert.equal(h.liability.amountDeductedMilli, 30000);
    assert.equal(h.liability.installmentsCompleted, 1);
  });

  it('AT-F13: crash after ledger before final status → no duplicate ledger/wallet', async () => {
    const seeded = await seedAllocated({ originalAmount: 30000, actualMilli: 30000 });
    const h = createHarness({
      evidenceStore: seeded.store,
      obligation: seeded.obligation,
      crashAfter: 'ledger',
    });
    await assert.rejects(
      () =>
        runFinancialApplyLine({
          evidenceIdentityKey: seeded.identity,
          reconcileBatchId: seeded.batch,
          deductionId: 'E1',
          ports: h.ports,
        }),
      /crash_after_ledger/
    );
    assert.equal(h.counters.walletCalls, 1);
    assert.equal(h.counters.ledgerAppendCalls, 1);

    let wallet2 = 0;
    let ledger2 = 0;
    const sharedPorts: FinancialApplyPorts = {
      ...h.ports,
      async updateLiabilityBalance(id, deductionMilli, opts) {
        wallet2 += 1;
        h.liability.amountDeductedMilli += deductionMilli;
        h.liability.outstandingMilli = Math.max(0, h.liability.outstandingMilli - deductionMilli);
        if (opts.incrementInstallment) h.liability.installmentsCompleted += 1;
        return { ok: true, issue: { ...h.liability } };
      },
      async appendLedgerNative(p) {
        ledger2 += 1;
        const existing = await h.ports.getLedgerByIdempotencyKey(p.idempotencyKey);
        if (existing) return existing;
        return h.ports.appendLedgerNative(p);
      },
      async getLedgerByIdempotencyKey(key) {
        return h.ports.getLedgerByIdempotencyKey(key);
      },
    };
    // Fix crash: replace append with non-throwing using existing map
    sharedPorts.appendLedgerNative = async (p) => {
      ledger2 += 1;
      const existing = await h.ports.getLedgerByIdempotencyKey(p.idempotencyKey);
      if (existing) return existing;
      const txn = { transactionId: 'txn_retry', idempotencyKey: p.idempotencyKey };
      // should not happen
      return txn;
    };

    const r = await runFinancialApplyLine({
      evidenceIdentityKey: seeded.identity,
      reconcileBatchId: seeded.batch,
      deductionId: 'E1',
      ports: sharedPorts,
    });
    assert.equal(r.outcome, 'financially_applied');
    assert.equal(wallet2, 0);
    // append may be skipped because getLedgerByIdempotencyKey finds existing before append
    assert.equal(h.liability.amountDeductedMilli, 30000);
  });

  it('AT-F14: H-1 completion retry does not double increment', async () => {
    const seeded = await seedAllocated({ originalAmount: 30000, actualMilli: 30000 });
    const h = createHarness({ evidenceStore: seeded.store, obligation: seeded.obligation });
    const input = {
      evidenceIdentityKey: seeded.identity,
      reconcileBatchId: seeded.batch,
      deductionId: 'E1',
      ports: h.ports,
    };
    await runFinancialApplyLine(input);
    await runFinancialApplyLine(input);
    await runFinancialApplyLine(input);
    assert.equal(h.counters.installmentIncrements, 1);
    assert.equal(h.liability.installmentsCompleted, 1);
  });

  it('AT-F15: concurrent duplicate apply attempts cannot create two economic effects', async () => {
    const seeded = await seedAllocated({ originalAmount: 30000, actualMilli: 30000 });
    const h = createHarness({ evidenceStore: seeded.store, obligation: seeded.obligation });
    const input = {
      evidenceIdentityKey: seeded.identity,
      reconcileBatchId: seeded.batch,
      deductionId: 'E1',
      ports: h.ports,
    };

    const p1 = runFinancialApplyLine(input);
    const p2 = runFinancialApplyLine(input);
    const results = await Promise.all([p1, p2]);
    const outcomes = results.map((r) => r.outcome).sort();
    assert.ok(outcomes.includes('financially_applied') || outcomes.includes('idempotent_already_applied'));
    assert.ok(outcomes.includes('lock_busy') || outcomes.includes('idempotent_already_applied') || outcomes.includes('financially_applied'));
    // Exactly one wallet economic effect.
    assert.equal(h.counters.walletCalls, 1);
    assert.equal(h.liability.amountDeductedMilli, 30000);
    assert.equal(h.counters.installmentIncrements, 1);

    // Loser retries after lock release → idempotent.
    const retry = await runFinancialApplyLine(input);
    assert.equal(retry.outcome, 'idempotent_already_applied');
    assert.equal(h.counters.walletCalls, 1);
  });

  it('AT-F16: future reverse linkage is complete', async () => {
    const seeded = await seedAllocated({ originalAmount: 30000, actualMilli: 30000 });
    const h = createHarness({ evidenceStore: seeded.store, obligation: seeded.obligation });
    const r = await runFinancialApplyLine({
      evidenceIdentityKey: seeded.identity,
      reconcileBatchId: seeded.batch,
      deductionId: 'E1',
      ports: h.ports,
    });
    assert.ok(r.reverseLinkage);
    const L = r.reverseLinkage!;
    assert.equal(L.evidenceIdentityKey, seeded.identity);
    assert.ok(L.applyRecordId);
    assert.equal(L.deductionId, 'E1');
    assert.ok(L.financialApplyId);
    assert.ok(L.economicKey);
    assert.ok(L.ledgerIdempotencyKey);
    assert.ok(L.ledgerTransactionId);
    assert.ok(L.walletMutationIdentity);
    assert.equal(L.allocatedMilli, 30000);
    assert.equal(L.equipmentIssueId, 'ISSUE-A');
    assert.equal(L.installmentsCompletedDelta, 1);
    assert.equal(L.paidAmountBefore, 0);
    assert.equal(L.remainingAmountBefore, 30000);
    assert.equal(L.paidAmountAfter, 30000);
    assert.equal(L.remainingAmountAfter, 0);
  });
});

describe('Phase 4D.4.2 — HIGH fix: post-obligation liability failure is resumable', () => {
  it('obligation succeeds → liability fails → LIABILITY_PENDING, not terminal REJECTED', async () => {
    const seeded = await seedAllocated({ originalAmount: 30000, actualMilli: 30000 });
    const h = createHarness({
      evidenceStore: seeded.store,
      obligation: seeded.obligation,
      liabilityFailTimes: 1,
    });
    const r = await runFinancialApplyLine({
      evidenceIdentityKey: seeded.identity,
      reconcileBatchId: seeded.batch,
      deductionId: 'E1',
      ports: h.ports,
    });
    assert.equal(r.outcome, 'recovery_required');
    assert.notEqual(r.outcome, 'rejected');
    assert.equal(r.intent?.status, 'LIABILITY_PENDING');
    assert.equal(r.intent?.obligationMutated, true);
    assert.equal(r.intent?.liabilityMutated, false);
    assert.equal(h.obligations.get('E1')!.paidAmount, 30000);
    assert.equal(h.liability.amountDeductedMilli, 0);
    assert.equal(h.counters.ledgerAppendCalls, 0);
  });

  it('retry after liability failure does not re-mutate obligation', async () => {
    const seeded = await seedAllocated({ originalAmount: 30000, actualMilli: 30000 });
    const h = createHarness({
      evidenceStore: seeded.store,
      obligation: seeded.obligation,
      liabilityFailTimes: 1,
    });
    const input = {
      evidenceIdentityKey: seeded.identity,
      reconcileBatchId: seeded.batch,
      deductionId: 'E1',
      ports: h.ports,
    };
    await runFinancialApplyLine(input);
    assert.equal(h.counters.saveObligationCalls, 1);
    const paidAfterFirst = h.obligations.get('E1')!.paidAmount;

    const retry = await runFinancialApplyLine(input);
    assert.equal(retry.outcome, 'financially_applied');
    assert.equal(h.counters.saveObligationCalls, 1, 'obligation must not be saved again');
    assert.equal(h.obligations.get('E1')!.paidAmount, paidAfterFirst);
  });

  it('retry completes liability + ledger → COMPLETED; no double H-1 / ledger', async () => {
    const seeded = await seedAllocated({ originalAmount: 30000, actualMilli: 30000 });
    const h = createHarness({
      evidenceStore: seeded.store,
      obligation: seeded.obligation,
      liabilityFailTimes: 1,
    });
    const input = {
      evidenceIdentityKey: seeded.identity,
      reconcileBatchId: seeded.batch,
      deductionId: 'E1',
      ports: h.ports,
    };
    const first = await runFinancialApplyLine(input);
    assert.equal(first.outcome, 'recovery_required');

    const second = await runFinancialApplyLine(input);
    assert.equal(second.outcome, 'financially_applied');
    assert.equal(second.intent?.status, 'COMPLETED');
    assert.equal(h.liability.amountDeductedMilli, 30000);
    assert.equal(h.counters.installmentIncrements, 1);
    assert.equal(h.counters.ledgerAppendCalls, 1);
    assert.equal(h.ledger.size, 1);

    const third = await runFinancialApplyLine(input);
    assert.equal(third.outcome, 'idempotent_already_applied');
    assert.equal(h.counters.walletCalls, 2); // 1 fail + 1 success
    assert.equal(h.counters.installmentIncrements, 1);
    assert.equal(h.counters.ledgerAppendCalls, 1);
    assert.equal(
      third.economicKey,
      financialApplyEconomicKey(seeded.identity, 'E1')
    );
  });

  it('pre-obligation failure remains terminal REJECTED', async () => {
    const seeded = await seedAllocated({ originalAmount: 30000, actualMilli: 30000 });
    const bad = { ...seeded.obligation, paidAmount: 1000, remainingAmount: 30000 };
    const h = createHarness({ evidenceStore: seeded.store, obligation: bad });
    const r = await runFinancialApplyLine({
      evidenceIdentityKey: seeded.identity,
      reconcileBatchId: seeded.batch,
      deductionId: 'E1',
      ports: h.ports,
    });
    assert.equal(r.outcome, 'rejected');
    assert.equal(r.reason, 'inconsistent_obligation');
    const intent = await h.intentStore.getByEconomicKey(
      financialApplyEconomicKey(seeded.identity, 'E1')
    );
    // Pre-mutation may reject before intent create, or REJECTED with obligationMutated=false.
    if (intent) {
      assert.equal(intent.obligationMutated, false);
      assert.equal(intent.status, 'REJECTED');
    }
    assert.equal(h.counters.walletCalls, 0);
  });

  it('heals legacy REJECTED+obligationMutated into LIABILITY_PENDING and completes', async () => {
    const seeded = await seedAllocated({ originalAmount: 30000, actualMilli: 30000 });
    const h = createHarness({ evidenceStore: seeded.store, obligation: seeded.obligation });
    const key = financialApplyEconomicKey(seeded.identity, 'E1');
    // Strand collection truth the old way (pre-4D.4.2).
    h.obligations.set('E1', {
      ...seeded.obligation,
      paidAmount: 30000,
      remainingAmount: 0,
      status: 'paid',
    });
    await h.intentStore.createIfAbsent({
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
      rejectReason: 'liability_update_failed:old',
    });

    const r = await runFinancialApplyLine({
      evidenceIdentityKey: seeded.identity,
      reconcileBatchId: seeded.batch,
      deductionId: 'E1',
      ports: h.ports,
    });
    assert.equal(r.outcome, 'financially_applied');
    assert.equal(r.intent?.status, 'COMPLETED');
    assert.equal(h.counters.saveObligationCalls, 0);
    assert.equal(h.liability.amountDeductedMilli, 30000);
    assert.equal(h.counters.installmentIncrements, 1);
    assert.equal(h.counters.ledgerAppendCalls, 1);
  });
});
