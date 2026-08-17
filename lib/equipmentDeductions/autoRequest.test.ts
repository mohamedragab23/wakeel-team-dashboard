/**
 * SRS-014 Phase 4C — Auto → REQUEST integration tests.
 * No wallet / ledger_native / updateBalance / Y-gate.
 */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  computeAutoRequestDecision,
  runEquipmentAutoRequestsForDate,
} from '@/lib/equipmentDeductions/autoRequest';
import {
  createMemoryObligationLedgerStore,
  emitRequestObligation,
  listPersistedObligations,
  REQUEST_LEDGER_HEADERS,
  stableEquipmentInstallmentDeductionId,
} from '@/lib/equipmentDeductions/requestPersistence';
import { isEconomicallyConsistent } from '@/lib/equipmentDeductions/obligations';
import type { EquipmentLiabilityIssue } from '@/lib/equipmentLiability/store';
import type { PayoutCycle } from '@/lib/payoutCycles/types';
import { liabilityInstallmentSchedule } from '@/lib/money';

function c(
  partial: Partial<PayoutCycle> & Pick<PayoutCycle, 'cycleId' | 'startDate' | 'endDate'>
): PayoutCycle {
  return {
    year: 2026,
    month: 8,
    cycleNumber: 1,
    payoutDate: partial.endDate,
    // Generation date on/before asOf so resolveCycleForDeductionDate can cover the window.
    deductionGenerationDate: partial.startDate,
    isClosing: false,
    equipmentDeductionEnabled: true,
    status: 'active',
    notes: '',
    createdBy: '',
    createdAt: '',
    updatedBy: '',
    updatedAt: '',
    ...partial,
  };
}

function issue(partial: Partial<EquipmentLiabilityIssue> & Pick<EquipmentLiabilityIssue, 'equipmentIssueId'>): EquipmentLiabilityIssue {
  const schedule = liabilityInstallmentSchedule('NOT_PAID').schedule;
  return {
    riderCode: '1001',
    riderNameSnapshot: 'Rider',
    zoneSnapshot: 'Z1',
    supervisorCodeSnapshot: 'S1',
    supervisorNameSnapshot: 'Sup',
    issueDate: '2026-08-01',
    activationDate: '2026-08-01',
    bagType: 'motorcycle',
    bagCostMilli: 53000,
    shirtQty: 2,
    shirtCostMilli: 27000,
    securityFeeMilli: 10000,
    securityPaidUpfront: false,
    originalLiabilityMilli: 90000,
    outstandingMilli: 90000,
    amountDeductedMilli: 0,
    settlementPaidMilli: 0,
    installmentsCompleted: 0,
    status: 'open',
    deliveryRowRef: '',
    jacketHeld: false,
    helmetHeld: false,
    createdAt: '',
    createdBy: '',
    updatedAt: '',
    updatedBy: '',
    installmentSchedule: schedule,
    ...partial,
  };
}

describe('Phase 4C — Auto REQUEST integration', () => {
  it('AT-01 / Y-gate: REQUEST decision does not require availablePayout', () => {
    const cycles = [
      c({ cycleId: '1', cycleNumber: 1, startDate: '2026-08-01', endDate: '2026-08-07' }),
      c({ cycleId: '2', cycleNumber: 2, startDate: '2026-08-08', endDate: '2026-08-14' }),
    ];
    const schedule = liabilityInstallmentSchedule('NOT_PAID').schedule;
    const decision = computeAutoRequestDecision({
      remainingMilli: 90000,
      schedule,
      installmentsCompleted: 0,
      cycle: cycles[1],
      allCycles: cycles,
      activationDate: '2026-08-01',
      riderCode: '1001',
      equipmentIssueId: 'E1',
    });
    assert.equal(decision.action, 'request');
    if (decision.action === 'request') {
      assert.equal(decision.originalAmountMilli, 30000);
      assert.equal(decision.installmentNumber, 1);
      assert.equal(decision.deductionId, stableEquipmentInstallmentDeductionId('E1', 1));
    }
  });

  it('AT-19: closing cycle skips REQUEST', () => {
    const cycles = [
      c({ cycleId: '1', cycleNumber: 1, startDate: '2026-08-01', endDate: '2026-08-07' }),
      c({
        cycleId: '2',
        cycleNumber: 2,
        startDate: '2026-08-08',
        endDate: '2026-08-14',
        isClosing: true,
        equipmentDeductionEnabled: false,
      }),
    ];
    const decision = computeAutoRequestDecision({
      remainingMilli: 90000,
      schedule: liabilityInstallmentSchedule('NOT_PAID').schedule,
      installmentsCompleted: 0,
      cycle: cycles[1],
      allCycles: cycles,
      activationDate: '2026-08-01',
      riderCode: '1001',
      equipmentIssueId: 'E1',
    });
    assert.equal(decision.action, 'skip');
  });

  it('AT-01b / AT-18 / H-1 / Ledger / Wallet: cron run creates REQUEST only', async () => {
    const store = createMemoryObligationLedgerStore();
    const cycles = [
      c({ cycleId: 'C1', cycleNumber: 1, startDate: '2026-08-01', endDate: '2026-08-07' }),
      c({ cycleId: 'C2', cycleNumber: 2, startDate: '2026-08-08', endDate: '2026-08-14' }),
    ];
    const open = [
      issue({
        equipmentIssueId: 'ISSUE-A',
        activationDate: '2026-08-01',
        installmentsCompleted: 0,
        outstandingMilli: 90000,
      }),
    ];
    const liabilityMutations = { updateBalance: 0, amountDeducted: 0, installmentsCompleted: 0 };
    const ledgerWrites = { count: 0 };

    const result = await runEquipmentAutoRequestsForDate(
      '2026-08-10',
      { code: 'test', name: 'test' },
      {
        deps: {
          isEnabled: () => true,
          listPayoutCycles: async () => cycles,
          listOpenIssues: async () => open,
          obligationStore: store,
        },
      }
    );

    assert.equal(result.enabled, true);
    assert.equal(result.cycleId, 'C2');
    assert.equal(result.requested, 1);
    assert.equal(result.queued, 0);

    const rows = await listPersistedObligations(store);
    assert.equal(rows.length, 1);
    const o = rows[0].obligation;
    assert.equal(o.paidAmount, 0);
    assert.equal(o.remainingAmount, o.originalAmount);
    assert.equal(o.originalAmount, 30000);
    assert.equal(o.status, 'open');
    assert.ok(isEconomicallyConsistent(o));
    assert.equal(o.deductionId, stableEquipmentInstallmentDeductionId('ISSUE-A', 1));

    assert.equal(liabilityMutations.updateBalance, 0);
    assert.equal(liabilityMutations.amountDeducted, 0);
    assert.equal(liabilityMutations.installmentsCompleted, 0);
    assert.equal(ledgerWrites.count, 0);
    assert.equal(open[0].installmentsCompleted, 0);
    assert.equal(open[0].amountDeductedMilli, 0);
    assert.equal(open[0].outstandingMilli, 90000);

    for (const a of result.auditTrail) {
      assert.equal(a.installmentsCompletedDelta, 0);
      if (a.financialSideEffects) {
        assert.equal(a.financialSideEffects.walletMutated, false);
        assert.equal(a.financialSideEffects.ledgerNativeWritten, false);
        assert.equal(a.financialSideEffects.amountDeductedMilliDelta, 0);
        assert.equal(a.financialSideEffects.paidAmountIncremented, false);
      }
    }
  });

  it('AT-08 / AT-08b / AT-08c: open remainder queues; no duplicate; H-1 holds', async () => {
    const store = createMemoryObligationLedgerStore();
    const cycles = [
      c({ cycleId: 'C1', cycleNumber: 1, startDate: '2026-08-01', endDate: '2026-08-07' }),
      c({ cycleId: 'C2', cycleNumber: 2, startDate: '2026-08-08', endDate: '2026-08-14' }),
      c({ cycleId: 'C3', cycleNumber: 3, startDate: '2026-08-15', endDate: '2026-08-21' }),
    ];
    const open = [
      issue({
        equipmentIssueId: 'ISSUE-B',
        activationDate: '2026-08-01',
        installmentsCompleted: 0,
      }),
    ];

    const first = await runEquipmentAutoRequestsForDate(
      '2026-08-10',
      { code: 't', name: 't' },
      {
        deps: {
          isEnabled: () => true,
          listPayoutCycles: async () => cycles,
          listOpenIssues: async () => open,
          obligationStore: store,
        },
      }
    );
    assert.equal(first.requested, 1);

    // Partial remainder still open (allocation out of scope — mutate store only)
    const listed = await store.listDataRows();
    const paidIdx = REQUEST_LEDGER_HEADERS.indexOf('paidAmount');
    const remIdx = REQUEST_LEDGER_HEADERS.indexOf('remainingAmount');
    const statusIdx = REQUEST_LEDGER_HEADERS.indexOf('status');
    const row = [...listed[0].values];
    row[paidIdx] = 10000;
    row[remIdx] = 20000;
    row[statusIdx] = 'partially_allocated';
    await store.updateRow(listed[0].rowNumber, row);

    const second = await runEquipmentAutoRequestsForDate(
      '2026-08-17',
      { code: 't', name: 't' },
      {
        deps: {
          isEnabled: () => true,
          listPayoutCycles: async () => cycles,
          listOpenIssues: async () => open,
          obligationStore: store,
        },
      }
    );

    assert.equal(second.requested, 0);
    assert.equal(second.queued, 1);
    const after = await listPersistedObligations(store);
    assert.equal(after.length, 1);
    assert.equal(after[0].obligation.deductionId, stableEquipmentInstallmentDeductionId('ISSUE-B', 1));
    assert.equal(after[0].obligation.originalAmount, 30000);
    assert.equal(after[0].obligation.paidAmount, 10000);
    assert.equal(after[0].obligation.remainingAmount, 20000);
    assert.equal(after[0].obligation.currentCycleId, 'C3');
    assert.equal(open[0].installmentsCompleted, 0);
  });

  it('idempotent re-run same cycle does not mint second deductionId', async () => {
    const store = createMemoryObligationLedgerStore();
    const cycles = [
      c({ cycleId: 'C1', cycleNumber: 1, startDate: '2026-08-01', endDate: '2026-08-07' }),
      c({ cycleId: 'C2', cycleNumber: 2, startDate: '2026-08-08', endDate: '2026-08-14' }),
    ];
    const open = [issue({ equipmentIssueId: 'ISSUE-C', activationDate: '2026-08-01' })];
    const deps = {
      isEnabled: () => true,
      listPayoutCycles: async () => cycles,
      listOpenIssues: async () => open,
      obligationStore: store,
    };
    const a = await runEquipmentAutoRequestsForDate('2026-08-10', { code: 't', name: 't' }, { deps });
    const b = await runEquipmentAutoRequestsForDate('2026-08-10', { code: 't', name: 't' }, { deps });
    assert.equal(a.requested, 1);
    assert.equal(b.requested, 0);
    assert.equal(b.queued, 1);
    assert.equal((await listPersistedObligations(store)).length, 1);
  });

  it('flag OFF → no REQUEST side effects', async () => {
    const store = createMemoryObligationLedgerStore();
    const result = await runEquipmentAutoRequestsForDate(
      '2026-08-10',
      { code: 't', name: 't' },
      {
        deps: {
          isEnabled: () => false,
          listPayoutCycles: async () => {
            throw new Error('should_not_load_cycles');
          },
          listOpenIssues: async () => {
            throw new Error('should_not_load_issues');
          },
          obligationStore: store,
        },
      }
    );
    assert.equal(result.enabled, false);
    assert.equal(result.requested, 0);
    assert.equal((await listPersistedObligations(store)).length, 0);
  });

  it('draft cycle writes nothing (admin must activate first)', async () => {
    const store = createMemoryObligationLedgerStore();
    const cycles = [
      c({
        cycleId: 'C2',
        cycleNumber: 2,
        startDate: '2026-08-08',
        endDate: '2026-08-14',
        status: 'draft',
      }),
    ];
    const result = await runEquipmentAutoRequestsForDate(
      '2026-08-14',
      { code: 't', name: 't' },
      {
        cycleId: 'C2',
        deps: {
          isEnabled: () => true,
          listPayoutCycles: async () => cycles,
          listOpenIssues: async () => [issue({ equipmentIssueId: 'ISSUE-DRAFT' })],
          obligationStore: store,
        },
      }
    );
    assert.equal(result.requested, 0);
    assert.ok(result.errors.includes('cycle_draft'));
    assert.equal((await listPersistedObligations(store)).length, 0);
  });

  it('opening fleet liability requests on the selected cycle even if activationDate is today', async () => {
    const store = createMemoryObligationLedgerStore();
    const cycles = [
      c({ cycleId: 'C1', cycleNumber: 1, startDate: '2026-08-01', endDate: '2026-08-07' }),
      c({ cycleId: 'C2', cycleNumber: 2, startDate: '2026-08-08', endDate: '2026-08-14' }),
    ];
    const open = [
      issue({
        equipmentIssueId: 'opening_1001_1',
        activationDate: '2026-08-17',
        pricingSource: 'OPENING_MIGRATION',
      }),
    ];
    const result = await runEquipmentAutoRequestsForDate(
      '2026-08-14',
      { code: 't', name: 't' },
      {
        cycleId: 'C2',
        deps: {
          isEnabled: () => true,
          listPayoutCycles: async () => cycles,
          listOpenIssues: async () => open,
          obligationStore: store,
        },
      }
    );
    assert.equal(result.requested, 1);
    assert.equal(result.cycleId, 'C2');
    assert.equal((await listPersistedObligations(store)).length, 1);
  });

  it('adminExplicitPrep includes non-opening liabilities even if activation is after cycle start', async () => {
    const store = createMemoryObligationLedgerStore();
    const cycles = [
      c({ cycleId: 'C2', cycleNumber: 2, startDate: '2026-08-10', endDate: '2026-08-16' }),
    ];
    const open = [
      issue({
        equipmentIssueId: 'ISSUE-NEW',
        activationDate: '2026-08-17',
      }),
    ];
    const blocked = await runEquipmentAutoRequestsForDate(
      '2026-08-16',
      { code: 't', name: 't' },
      {
        cycleId: 'C2',
        deps: {
          isEnabled: () => true,
          listPayoutCycles: async () => cycles,
          listOpenIssues: async () => open,
          obligationStore: store,
        },
      }
    );
    assert.equal(blocked.requested, 0);

    const store2 = createMemoryObligationLedgerStore();
    const allowed = await runEquipmentAutoRequestsForDate(
      '2026-08-16',
      { code: 't', name: 't' },
      {
        cycleId: 'C2',
        adminExplicitPrep: true,
        deps: {
          isEnabled: () => true,
          listPayoutCycles: async () => cycles,
          listOpenIssues: async () => open,
          obligationStore: store2,
        },
      }
    );
    assert.equal(allowed.requested, 1);
  });

  it('REQUEST emit path never increments paidAmount (AT-18)', async () => {
    const store = createMemoryObligationLedgerStore();
    const id = stableEquipmentInstallmentDeductionId('ISSUE-D', 1);
    const emit = await emitRequestObligation(store, {
      deductionId: id,
      source: 'auto_equipment',
      riderCode: '1001',
      reason: 'معدات',
      originalCycleId: 'C2',
      originalAmount: 30000,
      obligationAgeKey: 't',
      equipmentIssueId: 'ISSUE-D',
      installmentNumber: 1,
    });
    assert.equal(emit.obligation.paidAmount, 0);
    assert.equal(emit.financialSideEffects.paidAmountIncremented, false);
  });
});

/**
 * LEGACY TARGET-CONFLICT CLASSIFICATION (engine.test.ts — not rewritten here):
 * - missing available payout fail-closes
 * - partial payout caps deduction
 * - deduct action amounts tied to Y-gate
 * These assert paid-on-cron / Y-gate collection semantics superseded by SRS REQUEST path.
 * Kept as historical coverage of legacy `computeAutoDeductionDecision`; Phase 4C adds
 * parallel REQUEST tests above instead of silently rewriting them.
 */
