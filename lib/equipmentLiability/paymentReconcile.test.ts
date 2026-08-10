import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { withImmutableOriginal } from '@/lib/equipmentLiability/store';
import {
  classifyPaymentAggregateState,
  type EquipmentLiabilityPayment,
} from '@/lib/equipmentLiability/payments';
import {
  reconcileEquipmentLiabilityPayment,
  reconcileUnresolvedEquipmentLiabilityPayments,
  EQUIPMENT_PAYMENT_RECONCILE_JOB_TTL_SECONDS,
} from '@/lib/equipmentLiability/paymentReconcile';

function baseIssue() {
  return {
    equipmentIssueId: 'iss_recon_1',
    riderCode: 'R900',
    riderNameSnapshot: 'Rider',
    zoneSnapshot: 'Z',
    supervisorCodeSnapshot: 'S',
    supervisorNameSnapshot: 'Sup',
    issueDate: '2026-01-01',
    activationDate: '2026-01-01',
    bagType: 'motorcycle' as const,
    bagCostMilli: 53000,
    shirtQty: 2,
    shirtCostMilli: 27000,
    securityFeeMilli: 10000,
    securityPaidUpfront: true,
    originalLiabilityMilli: 80000,
    outstandingMilli: 80000,
    amountDeductedMilli: 0,
    settlementPaidMilli: 0,
    installmentsCompleted: 0,
    status: 'open' as const,
    deliveryRowRef: 'd1',
    jacketHeld: false,
    helmetHeld: false,
    createdAt: '2026-01-01T00:00:00.000Z',
    createdBy: 'a',
    updatedAt: '2026-01-01T00:00:00.000Z',
    updatedBy: 'a',
    sheetRow: 2,
  };
}

function pendingPayment(overrides: Partial<EquipmentLiabilityPayment> = {}): EquipmentLiabilityPayment {
  return {
    paymentId: 'pay_1',
    equipmentIssueId: 'iss_recon_1',
    riderCode: 'R900',
    amountMilli: 20000,
    paymentDate: '2026-01-02',
    paymentMethod: 'CASH',
    note: '',
    idempotencyKey: 'idem_recon_1',
    outstandingBeforeMilli: 80000,
    resultingOutstandingMilli: 60000,
    resultingSettlementPaidMilli: 20000,
    actorCode: 'ADM',
    actorName: 'Admin',
    createdAt: '2026-01-02T00:00:00.000Z',
    aggregateStatus: 'PENDING',
    reconciledAt: '',
    lastReconcileResult: '',
    lastReconcileReason: '',
    lastReconcileActor: '',
    sheetRow: 2,
    ...overrides,
  };
}

function makeReconHarness(opts?: { issue?: ReturnType<typeof baseIssue>; payment?: EquipmentLiabilityPayment }) {
  let current = opts?.issue ? { ...opts.issue } : baseIssue();
  const payments: EquipmentLiabilityPayment[] = [opts?.payment || pendingPayment()];
  let applyCount = 0;
  let jobLocked = false;

  const deps = {
    listUnresolved: async () => payments.filter((p) => p.aggregateStatus !== 'APPLIED'),
    getById: async () => current,
    findPaymentById: async (id: string) => payments.find((p) => p.paymentId === id) || null,
    acquireIssueLock: async () => ({
      ok: true as const,
      token: 't',
      release: async () => undefined,
    }),
    acquireJobLock: async () => {
      if (jobLocked) return { ok: false as const, reason: 'lock_busy' as const };
      jobLocked = true;
      return {
        ok: true as const,
        token: 'j',
        release: async () => {
          jobLocked = false;
        },
      };
    },
    applyPayment: async (_id: string, paid: number, actor: { code: string }) => {
      applyCount++;
      current = withImmutableOriginal(current, {
        settlementPaidMilli: (current.settlementPaidMilli || 0) + paid,
        outstandingMilli: current.outstandingMilli - paid,
        status: current.outstandingMilli - paid <= 0 ? 'settled' : 'open',
        updatedBy: actor.code,
      });
      return { ok: true as const, issue: current };
    },
    updateLifecycle: async (paymentId: string, patch: any) => {
      const idx = payments.findIndex((p) => p.paymentId === paymentId);
      if (idx < 0) return null;
      payments[idx] = {
        ...payments[idx],
        ...patch,
        reconciledAt: new Date().toISOString(),
      };
      return payments[idx];
    },
    cacheResult: async () => undefined,
    skipAudit: true,
  };

  return {
    get current() {
      return current;
    },
    set current(v) {
      current = v;
    },
    payments,
    get applyCount() {
      return applyCount;
    },
    deps,
    setJobLocked(v: boolean) {
      jobLocked = v;
    },
  };
}

describe('equipment payment reconcile — orphan recovery', () => {
  it('recovers NEEDS_APPLY orphan without new history row', async () => {
    const h = makeReconHarness();
    assert.equal(h.payments[0].aggregateStatus, 'PENDING');
    assert.equal(h.current.settlementPaidMilli, 0);

    const item = await reconcileEquipmentLiabilityPayment('pay_1', { code: 'cron', name: 'cron' }, h.deps);
    assert.equal(item.result, 'RECOVERED');
    assert.equal(item.recovered, true);
    assert.equal(h.applyCount, 1);
    assert.equal(h.payments.length, 1);
    assert.equal(h.payments[0].aggregateStatus, 'APPLIED');
    assert.equal(h.current.settlementPaidMilli, 20000);
    assert.equal(h.current.outstandingMilli, 60000);
    assert.equal(h.current.originalLiabilityMilli, 80000);
    assert.equal(h.current.amountDeductedMilli, 0);
  });

  it('ALREADY_APPLIED after aggregate update — no second mutation', async () => {
    const issue = baseIssue();
    issue.settlementPaidMilli = 20000;
    issue.outstandingMilli = 60000;
    const h = makeReconHarness({
      issue,
      payment: pendingPayment({ aggregateStatus: 'PENDING' }),
    });
    const first = await reconcileEquipmentLiabilityPayment('pay_1', { code: 'c', name: 'c' }, h.deps);
    const second = await reconcileEquipmentLiabilityPayment('pay_1', { code: 'c', name: 'c' }, h.deps);
    assert.equal(first.result, 'ALREADY_APPLIED');
    assert.equal(second.result, 'ALREADY_APPLIED');
    assert.equal(h.applyCount, 0);
    assert.equal(h.current.settlementPaidMilli, 20000);
  });

  it('CONFLICT leaves money untouched', async () => {
    const issue = baseIssue();
    issue.settlementPaidMilli = 5000;
    issue.outstandingMilli = 75000;
    const h = makeReconHarness({ issue });
    const item = await reconcileEquipmentLiabilityPayment('pay_1', { code: 'c', name: 'c' }, h.deps);
    assert.equal(item.result, 'CONFLICT');
    assert.equal(h.applyCount, 0);
    assert.equal(h.current.settlementPaidMilli, 5000);
    assert.equal(h.payments[0].aggregateStatus, 'CONFLICT');
  });

  it('duplicate reconciliation run recovers once then no-ops', async () => {
    const h = makeReconHarness();
    const run1 = await reconcileUnresolvedEquipmentLiabilityPayments(
      { code: 'cron', name: 'cron' },
      h.deps
    );
    assert.ok(!('ok' in run1 && run1.ok === false));
    if ('ok' in run1) return;
    assert.equal(run1.recovered, 1);
    assert.equal(h.applyCount, 1);

    const run2 = await reconcileUnresolvedEquipmentLiabilityPayments(
      { code: 'cron', name: 'cron' },
      h.deps
    );
    assert.ok(!('ok' in run2 && run2.ok === false));
    if ('ok' in run2) return;
    assert.equal(run2.scanned, 0);
    assert.equal(h.applyCount, 1);
  });

  it('concurrent job lock — loser skips', async () => {
    const h = makeReconHarness();
    h.setJobLocked(true);
    const busy = await reconcileUnresolvedEquipmentLiabilityPayments(
      { code: 'cron', name: 'cron' },
      h.deps
    );
    assert.deepEqual(busy, { ok: false, reason: 'lock_busy' });
    assert.equal(h.applyCount, 0);
  });

  it('concurrent issue lock during reconcile — LOCK_BUSY, no double apply', async () => {
    const h = makeReconHarness();
    const deps = {
      ...h.deps,
      acquireIssueLock: async () => ({ ok: false as const, reason: 'lock_busy' as const }),
    };
    const item = await reconcileEquipmentLiabilityPayment('pay_1', { code: 'c', name: 'c' }, deps);
    assert.equal(item.result, 'LOCK_BUSY');
    assert.equal(h.applyCount, 0);
    assert.equal(h.current.settlementPaidMilli, 0);
  });

  it('job TTL is short (not 90 days)', () => {
    assert.ok(EQUIPMENT_PAYMENT_RECONCILE_JOB_TTL_SECONDS <= 300);
  });

  it('cron route gated by Ledger only, not Auto Deduction', () => {
    const body = readFileSync(
      join(process.cwd(), 'app/api/cron/equipment-liability-payment-reconcile/route.ts'),
      'utf8'
    );
    assert.ok(body.includes('isEquipmentLedgerEnabled'));
    assert.ok(!body.includes('isAutoEquipmentDeductionsEnabled'));
    assert.ok(body.includes('reconcileUnresolvedEquipmentLiabilityPayments'));
  });

  it('manual reconcile API uses paymentId and does not create payments', () => {
    const body = readFileSync(
      join(
        process.cwd(),
        'app/api/admin/equipment-liability/payments/[paymentId]/reconcile/route.ts'
      ),
      'utf8'
    );
    assert.ok(body.includes('reconcileEquipmentLiabilityPayment'));
    assert.ok(!body.includes('recordEquipmentLiabilityCashPayment'));
  });

  it('classify still separates applied / needs_apply / conflict', () => {
    const p = pendingPayment();
    assert.equal(
      classifyPaymentAggregateState(
        { settlementPaidMilli: 0, outstandingMilli: 80000, status: 'open' },
        p
      ),
      'needs_apply'
    );
  });
});
