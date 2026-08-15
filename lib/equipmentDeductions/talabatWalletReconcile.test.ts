/**
 * Talabat Wallet file Actual reconcile — regression tests.
 * ACTUAL = Applaied Deduction on Wallet only.
 */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  reconcileActualPayrollDeduction,
  type ActualPayrollReconcileDeps,
} from '@/lib/equipmentDeductions/actualPayrollReconcile';
import { createMemoryActualReconcileStore } from '@/lib/equipmentDeductions/actualReconcileStore';
import {
  computeWalletFileBatchId,
  matchRiderIdExactly,
  pickNextEligibleCycle,
  runTalabatWalletReconcileBatch,
  talabatWalletExcelRow,
} from '@/lib/equipmentDeductions/talabatWalletReconcile';
import {
  parseTalabatWalletRows,
  TALABAT_WALLET_SOURCE_COLUMNS,
} from '@/lib/equipmentDeductions/talabatWalletSource';
import {
  createMemoryObligationLedgerStore,
  emitRequestObligation,
  listPersistedObligations,
} from '@/lib/equipmentDeductions/requestPersistence';
import { scheduleFromPersistedOriginalMilli } from '@/lib/equipmentPricing';
import type { EquipmentLiabilityIssue } from '@/lib/equipmentLiability/store';
import type { PayoutCycle } from '@/lib/payoutCycles/types';
import { isSrs014FinancialApplyEnabled } from '@/lib/srs014Flags';

function cycle(
  partial: Partial<PayoutCycle> & Pick<PayoutCycle, 'cycleId' | 'startDate' | 'endDate'>
): PayoutCycle {
  return {
    year: 2026,
    month: 8,
    cycleNumber: 1,
    payoutDate: partial.endDate,
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

function makeIssue(
  partial: Partial<EquipmentLiabilityIssue> & Pick<EquipmentLiabilityIssue, 'equipmentIssueId'>
): EquipmentLiabilityIssue {
  const original = partial.originalLiabilityMilli ?? 90000;
  return {
    riderCode: '4802535',
    riderNameSnapshot: 'Pilot',
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
    originalLiabilityMilli: original,
    outstandingMilli: 50000,
    amountDeductedMilli: 0,
    settlementPaidMilli: 40000,
    installmentsCompleted: 0,
    status: 'open',
    deliveryRowRef: '',
    jacketHeld: false,
    helmetHeld: false,
    createdAt: '',
    createdBy: '',
    updatedAt: '',
    updatedBy: '',
    installmentSchedule: scheduleFromPersistedOriginalMilli(original),
    ...partial,
  };
}

function memoryLiability(seed: EquipmentLiabilityIssue[]) {
  const map = new Map(seed.map((i) => [i.equipmentIssueId, { ...i }]));
  return {
    get: async (id: string) => (map.has(id) ? { ...map.get(id)! } : null),
    listOpen: async () =>
      [...map.values()].filter((i) => i.status === 'open' && i.outstandingMilli > 0).map((i) => ({ ...i })),
    updateBalance: async (
      equipmentIssueId: string,
      deductionMilli: number,
      _a: { code: string; name: string },
      opts?: { incrementInstallment?: boolean }
    ) => {
      const issue = map.get(equipmentIssueId);
      if (!issue) return { ok: false as const, error: 'issue not found' };
      const deduct = Math.max(0, Math.trunc(deductionMilli));
      const newOutstanding = Math.max(0, issue.outstandingMilli - deduct);
      const updated: EquipmentLiabilityIssue = {
        ...issue,
        originalLiabilityMilli: issue.originalLiabilityMilli,
        settlementPaidMilli: issue.settlementPaidMilli,
        amountDeductedMilli: issue.amountDeductedMilli + deduct,
        outstandingMilli: newOutstanding,
        installmentsCompleted:
          issue.installmentsCompleted + ((opts?.incrementInstallment ?? deduct > 0) ? 1 : 0),
        status: newOutstanding <= 0 ? 'settled' : issue.status,
      };
      map.set(equipmentIssueId, updated);
      return { ok: true as const, issue: { ...updated } };
    },
    getIssue: (id: string) => map.get(id)!,
  };
}

async function seedRequest(
  store: ReturnType<typeof createMemoryObligationLedgerStore>,
  issue: EquipmentLiabilityIssue,
  amountMilli: number,
  cycleId: string,
  inst = 1
) {
  return emitRequestObligation(store, {
    deductionId: `eq:${issue.equipmentIssueId}:inst:${inst}`,
    source: 'auto_equipment',
    riderCode: issue.riderCode,
    reason: 'معدات',
    originalCycleId: cycleId,
    currentCycleId: cycleId,
    originalAmount: amountMilli,
    obligationAgeKey: 't1',
    equipmentIssueId: issue.equipmentIssueId,
    installmentNumber: inst,
  });
}

function buildBatchDeps(
  issues: EquipmentLiabilityIssue[],
  walletCycle: PayoutCycle,
  allCycles: PayoutCycle[],
  nextCycle: PayoutCycle | null,
  store = createMemoryObligationLedgerStore(),
  actualStore = createMemoryActualReconcileStore(),
  batchIds = new Set<string>()
) {
  const liability = memoryLiability(issues);
  const deps: Parameters<typeof runTalabatWalletReconcileBatch>[1] = {
    obligationStore: store,
    getLiabilityById: liability.get,
    updateLiabilityBalance: liability.updateBalance,
    findByIdempotencyKey: (k) => actualStore.findByIdempotencyKey(k),
    persistReconcileRecord: (r) => actualStore.append(r),
    appendAudit: async () => undefined,
    listOpenLiabilities: liability.listOpen,
    findBatchById: async (id) => batchIds.has(id),
    persistBatchId: async (id) => {
      batchIds.add(id);
    },
    allCycles,
    walletCycle,
    nextCycle,
    actor: { code: 'ops', name: 'Ops' },
    actualDeductionDate: '2026-08-14',
    operatorConfirmation: true,
  };
  return { store, actualStore, liability, deps, batchIds };
}

describe('Talabat wallet source mapping', () => {
  it('maps Applaied Deduction on Wallet → actualWalletDeductionMilli', () => {
    const parsed = parseTalabatWalletRows([
      talabatWalletExcelRow({
        riderId: '4802535',
        threePlInternalDeductionsEgp: 300,
        applaiedDeductionOnWalletEgp: 150,
      }),
    ]);
    assert.equal(parsed.rows.length, 1);
    assert.equal(parsed.rows[0].requestedFromFileMilli, 30000);
    assert.equal(parsed.rows[0].actualWalletDeductionMilli, 15000);
    assert.equal(
      parsed.rows[0].sourceMapping.actualSourceLabel,
      'Applaied Deduction on Wallet'
    );
    assert.equal(
      parsed.rows[0].sourceMapping.requestedSourceLabel,
      '3Pl Internal Deductions'
    );
  });

  it('never treats 3Pl Internal as Actual field name', () => {
    assert.notEqual(
      TALABAT_WALLET_SOURCE_COLUMNS.actual,
      TALABAT_WALLET_SOURCE_COLUMNS.requested
    );
  });

  it('matchRiderIdExact — no name fuzzy', () => {
    assert.equal(matchRiderIdExactly('4802535', ['4802535', '877614']), '4802535');
    assert.equal(matchRiderIdExactly('999', ['4802535']), null);
  });
});

describe('Talabat wallet reconcile batch', () => {
  const c1 = cycle({ cycleId: 'C1', cycleNumber: 1, startDate: '2026-08-01', endDate: '2026-08-07' });
  const c2 = cycle({ cycleId: 'C2', cycleNumber: 2, startDate: '2026-08-08', endDate: '2026-08-14' });
  const c3 = cycle({ cycleId: 'C3', cycleNumber: 3, startDate: '2026-08-15', endDate: '2026-08-21' });
  const cycles = [c1, c2, c3];

  it('Requested 300 / Applied 300 → outstanding 200 + next request 200', async () => {
    const issue = makeIssue({ equipmentIssueId: 'OPENING:4802535' });
    const { store, deps, liability } = buildBatchDeps([issue], c2, cycles, c3);
    await seedRequest(store, issue, 30000, 'C2');

    const result = await runTalabatWalletReconcileBatch(
      [
        talabatWalletExcelRow({
          riderId: '4802535',
          threePlInternalDeductionsEgp: 300,
          applaiedDeductionOnWalletEgp: 300,
        }),
      ],
      deps
    );

    assert.equal(result.applied.length, 1);
    assert.equal(result.applied[0].actualWalletDeductionMilli, 30000);
    assert.equal(result.applied[0].newOutstandingMilli, 20000);
    assert.equal(liability.getIssue('OPENING:4802535').outstandingMilli, 20000);
    const next = result.nextCyclePrep.find((n) => n.equipmentIssueId === 'OPENING:4802535');
    assert.ok(next);
    assert.equal(next!.nextExpectedMilli, 20000);
    assert.equal(next!.outcome, 'created');
  });

  it('Requested 300 / Applied 200 → outstanding decreases by 200 only', async () => {
    const issue = makeIssue({ equipmentIssueId: 'E-200' });
    const { store, deps, liability } = buildBatchDeps([issue], c2, cycles, null);
    await seedRequest(store, issue, 30000, 'C2');
    const result = await runTalabatWalletReconcileBatch(
      [
        talabatWalletExcelRow({
          riderId: '4802535',
          threePlInternalDeductionsEgp: 300,
          applaiedDeductionOnWalletEgp: 200,
        }),
      ],
      deps
    );
    assert.equal(result.applied[0].newOutstandingMilli, 30000);
    assert.equal(liability.getIssue('E-200').amountDeductedMilli, 20000);
  });

  it('Requested 300 / Applied 150 → partial', async () => {
    const issue = makeIssue({ equipmentIssueId: 'E-150' });
    const { store, deps } = buildBatchDeps([issue], c2, cycles, c3);
    await seedRequest(store, issue, 30000, 'C2');
    const result = await runTalabatWalletReconcileBatch(
      [
        talabatWalletExcelRow({
          riderId: '4802535',
          threePlInternalDeductionsEgp: 300,
          applaiedDeductionOnWalletEgp: 150,
        }),
      ],
      deps
    );
    assert.equal(result.applied[0].newOutstandingMilli, 35000);
    const rem = result.nextCyclePrep.find((n) => n.reason === 'open_remainder_queued');
    assert.ok(rem);
    assert.equal(rem!.nextExpectedMilli, 15000);
  });

  it('Requested 300 / Applied 0 → outstanding unchanged', async () => {
    const issue = makeIssue({ equipmentIssueId: 'E-0' });
    const { store, deps, liability } = buildBatchDeps([issue], c2, cycles, null);
    await seedRequest(store, issue, 30000, 'C2');
    const result = await runTalabatWalletReconcileBatch(
      [
        talabatWalletExcelRow({
          riderId: '4802535',
          threePlInternalDeductionsEgp: 300,
          applaiedDeductionOnWalletEgp: 0,
        }),
      ],
      deps
    );
    assert.equal(result.applied[0].newOutstandingMilli, 50000);
    assert.equal(liability.getIssue('E-0').amountDeductedMilli, 0);
  });

  it('Applied > outstanding → blocked exception', async () => {
    const issue = makeIssue({
      equipmentIssueId: 'E-OVER',
      outstandingMilli: 20000,
    });
    const { store, deps, liability } = buildBatchDeps([issue], c2, cycles, null);
    await seedRequest(store, issue, 20000, 'C2');
    const result = await runTalabatWalletReconcileBatch(
      [
        talabatWalletExcelRow({
          riderId: '4802535',
          threePlInternalDeductionsEgp: 200,
          applaiedDeductionOnWalletEgp: 250,
        }),
      ],
      deps
    );
    assert.equal(result.applied.length, 0);
    assert.ok(result.exceptions.some((e) => e.code === 'OVER_ACTUAL_DEDUCTION'));
    assert.equal(liability.getIssue('E-OVER').outstandingMilli, 20000);
  });

  it('Requested 0 / Applied 0 with no open request → quiet skip', async () => {
    const issue = makeIssue({ equipmentIssueId: 'E-ZERO', outstandingMilli: 0, status: 'settled' });
    const { deps } = buildBatchDeps([], c2, cycles, null);
    // no open liabilities in list — rider unknown if no obligations
    const result = await runTalabatWalletReconcileBatch(
      [
        talabatWalletExcelRow({
          riderId: '4802535',
          threePlInternalDeductionsEgp: 0,
          applaiedDeductionOnWalletEgp: 0,
        }),
      ],
      {
        ...deps,
        listOpenLiabilities: async () => [issue],
      }
    );
    // settled open list empty → unknown or no request
    assert.ok(
      result.exceptions.some((e) => e.code === 'UNKNOWN_RIDER_ID') ||
        result.exceptions.some((e) => e.code === 'NO_OPEN_EQUIPMENT_REQUEST') ||
        result.applied.length === 0
    );
  });

  it('Settled 877614 → no request / no outstanding change', async () => {
    const settled = makeIssue({
      equipmentIssueId: 'OPENING:877614',
      riderCode: '877614',
      originalLiabilityMilli: 80000,
      outstandingMilli: 0,
      settlementPaidMilli: 80000,
      status: 'settled',
    });
    const { store, deps } = buildBatchDeps([settled], c2, cycles, c3);
    // seed historical closed request? none open
    const result = await runTalabatWalletReconcileBatch(
      [
        talabatWalletExcelRow({
          riderId: '877614',
          threePlInternalDeductionsEgp: 0,
          applaiedDeductionOnWalletEgp: 0,
        }),
      ],
      deps
    );
    // known via obligations? none — open list may not include settled
    // Force known via obligation closed
    await emitRequestObligation(store, {
      deductionId: 'eq:OPENING:877614:inst:1',
      source: 'auto_equipment',
      riderCode: '877614',
      reason: 'معدات',
      originalCycleId: 'C0',
      originalAmount: 0,
      obligationAgeKey: 't0',
      equipmentIssueId: 'OPENING:877614',
      installmentNumber: 1,
    });
    // 0 amount request is odd; better: exception NO_OPEN when applied>0
    const result2 = await runTalabatWalletReconcileBatch(
      [
        talabatWalletExcelRow({
          riderId: '877614',
          threePlInternalDeductionsEgp: 100,
          applaiedDeductionOnWalletEgp: 100,
        }),
      ],
      deps
    );
    assert.ok(result2.exceptions.some((e) => e.code === 'NO_OPEN_EQUIPMENT_REQUEST'));
    assert.equal(result.safety.walletMutatedByUs, false);
  });

  it('Unknown Rider ID → FAIL CLOSED', async () => {
    const issue = makeIssue({ equipmentIssueId: 'E-U' });
    const { store, deps, liability } = buildBatchDeps([issue], c2, cycles, null);
    await seedRequest(store, issue, 30000, 'C2');
    const result = await runTalabatWalletReconcileBatch(
      [
        talabatWalletExcelRow({
          riderId: '9999999',
          threePlInternalDeductionsEgp: 300,
          applaiedDeductionOnWalletEgp: 300,
        }),
      ],
      deps
    );
    assert.ok(result.exceptions.some((e) => e.code === 'UNKNOWN_RIDER_ID'));
    assert.equal(liability.getIssue('E-U').outstandingMilli, 50000);
  });

  it('Duplicate wallet file batch → idempotent', async () => {
    const issue = makeIssue({ equipmentIssueId: 'E-DUP' });
    const { store, deps, batchIds, liability } = buildBatchDeps([issue], c2, cycles, null);
    await seedRequest(store, issue, 30000, 'C2');
    const rows = [
      talabatWalletExcelRow({
        riderId: '4802535',
        threePlInternalDeductionsEgp: 300,
        applaiedDeductionOnWalletEgp: 300,
      }),
    ];
    const batchId = computeWalletFileBatchId({
      cycleId: 'C2',
      fileBytes: Buffer.from(JSON.stringify(rows)),
    });
    const first = await runTalabatWalletReconcileBatch(rows, deps, { batchId });
    assert.equal(first.applied.length, 1);
    assert.equal(batchIds.has(batchId), true);
    const second = await runTalabatWalletReconcileBatch(rows, deps, { batchId });
    assert.equal(second.duplicateBatch, true);
    assert.equal(liability.getIssue('E-DUP').amountDeductedMilli, 30000);
  });

  it('Duplicate Talabat reference → no double deduct', async () => {
    const issue = makeIssue({ equipmentIssueId: 'E-REF' });
    const { store, deps, liability } = buildBatchDeps([issue], c2, cycles, null);
    await seedRequest(store, issue, 30000, 'C2');
    const reconcileDeps: ActualPayrollReconcileDeps = {
      obligationStore: store,
      getLiabilityById: deps.getLiabilityById,
      updateLiabilityBalance: deps.updateLiabilityBalance,
      findByIdempotencyKey: deps.findByIdempotencyKey,
      persistReconcileRecord: deps.persistReconcileRecord,
      appendAudit: async () => undefined,
    };
    const input = {
      deductionId: 'eq:E-REF:inst:1',
      actualDeductedMilli: 30000,
      actualDeductionDate: '2026-08-14',
      talabatReference: 'SAME-REF',
      operatorConfirmation: true as const,
      actorCode: 'ops',
      actorName: 'Ops',
    };
    await reconcileActualPayrollDeduction(input, reconcileDeps);
    await reconcileActualPayrollDeduction(input, reconcileDeps);
    assert.equal(liability.getIssue('E-REF').amountDeductedMilli, 30000);
  });

  it('Multiple cycles: 500→300→200→0', async () => {
    let issue = makeIssue({ equipmentIssueId: 'OPENING:4802535-MC' });
    const { store, deps, liability } = buildBatchDeps([issue], c2, cycles, c3);
    await seedRequest(store, issue, 30000, 'C2', 1);

    const r1 = await runTalabatWalletReconcileBatch(
      [
        talabatWalletExcelRow({
          riderId: '4802535',
          threePlInternalDeductionsEgp: 300,
          applaiedDeductionOnWalletEgp: 300,
        }),
      ],
      deps
    );
    assert.equal(r1.applied[0].newOutstandingMilli, 20000);
    issue = liability.getIssue('OPENING:4802535-MC');

    // Next cycle request was auto-created
    const nextReq = (await listPersistedObligations(store)).find(
      (p) => p.obligation.installmentNumber === 2
    );
    assert.ok(nextReq);
    assert.equal(nextReq!.obligation.originalAmount, 20000);

    const deps2 = {
      ...deps,
      walletCycle: c3,
      nextCycle: null as PayoutCycle | null,
    };
    const r2 = await runTalabatWalletReconcileBatch(
      [
        talabatWalletExcelRow({
          riderId: '4802535',
          threePlInternalDeductionsEgp: 200,
          applaiedDeductionOnWalletEgp: 200,
        }),
      ],
      deps2
    );
    assert.equal(r2.applied[0].newOutstandingMilli, 0);
    assert.equal(liability.getIssue('OPENING:4802535-MC').status, 'settled');
  });

  it('Final partial installment then settle', async () => {
    const issue = makeIssue({
      equipmentIssueId: 'E-FINAL',
      outstandingMilli: 20000,
      amountDeductedMilli: 30000,
      installmentsCompleted: 1,
    });
    const { store, deps } = buildBatchDeps([issue], c3, cycles, null);
    await seedRequest(store, issue, 20000, 'C3', 2);
    const result = await runTalabatWalletReconcileBatch(
      [
        talabatWalletExcelRow({
          riderId: '4802535',
          threePlInternalDeductionsEgp: 200,
          applaiedDeductionOnWalletEgp: 200,
        }),
      ],
      deps
    );
    assert.equal(result.applied[0].newOutstandingMilli, 0);
  });

  it('4811093 remains untouched', async () => {
    const issue = makeIssue({ equipmentIssueId: 'OPENING:4802535' });
    const { store, deps } = buildBatchDeps([issue], c2, cycles, null);
    await seedRequest(store, issue, 30000, 'C2');
    await runTalabatWalletReconcileBatch(
      [
        talabatWalletExcelRow({
          riderId: '4802535',
          threePlInternalDeductionsEgp: 300,
          applaiedDeductionOnWalletEgp: 300,
        }),
      ],
      deps
    );
    const all = await listPersistedObligations(store);
    assert.equal(all.filter((r) => r.obligation.riderCode === '4811093').length, 0);
  });

  it('Safety: FA off, no wallet/ledger/payroll by us', async () => {
    assert.equal(isSrs014FinancialApplyEnabled(), false);
    const issue = makeIssue({ equipmentIssueId: 'E-SAFE' });
    const { store, deps } = buildBatchDeps([issue], c2, cycles, null);
    await seedRequest(store, issue, 30000, 'C2');
    const result = await runTalabatWalletReconcileBatch(
      [
        talabatWalletExcelRow({
          riderId: '4802535',
          threePlInternalDeductionsEgp: 300,
          applaiedDeductionOnWalletEgp: 300,
        }),
      ],
      deps
    );
    assert.equal(result.safety.financialApplyEnabled, false);
    assert.equal(result.safety.walletMutatedByUs, false);
    assert.equal(result.safety.ledgerMoneyMutated, false);
    assert.equal(result.safety.payrollExecuted, false);
    assert.equal(result.safety.actualSource, 'Applaied Deduction on Wallet');
  });

  it('pickNextEligibleCycle skips closing', () => {
    const closing = cycle({
      cycleId: 'C4',
      cycleNumber: 4,
      startDate: '2026-08-22',
      endDate: '2026-08-28',
      isClosing: true,
      equipmentDeductionEnabled: false,
    });
    assert.equal(pickNextEligibleCycle([c1, c2, c3, closing], c2)?.cycleId, 'C3');
    assert.equal(pickNextEligibleCycle([c1, c2, c3, closing], c3), null);
  });
});
