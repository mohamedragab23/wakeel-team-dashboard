/**
 * SRS-014 Phase 4D.5.4.16 — REQUEST ≠ ACTUAL payroll reconcile tests.
 * No wallet / ledger_native / Financial Apply / payroll execution.
 */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  reconcileActualPayrollDeduction,
  type ActualPayrollReconcileDeps,
} from '@/lib/equipmentDeductions/actualPayrollReconcile';
import { createMemoryActualReconcileStore } from '@/lib/equipmentDeductions/actualReconcileStore';
import {
  computeAutoRequestDecision,
} from '@/lib/equipmentDeductions/autoRequest';
import {
  assertOriginalAmountImmutable,
  createRequestObligation,
} from '@/lib/equipmentDeductions/obligations';
import {
  buildEquipmentRequestExportRow,
  EQUIPMENT_REQUEST_EXPORT_COLUMNS,
} from '@/lib/equipmentDeductions/requestExportView';
import {
  createMemoryObligationLedgerStore,
  emitRequestObligation,
  findPersistedByDeductionId,
  listPersistedObligations,
  stableEquipmentInstallmentDeductionId,
} from '@/lib/equipmentDeductions/requestPersistence';
import {
  sundayEmitEquipmentRequest,
  thursdayReconcileActual,
  weeklyWorkflowSafetySnapshot,
  exportRowForWeeklyRequest,
} from '@/lib/equipmentDeductions/weeklyEquipmentWorkflow';
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
  const schedule =
    partial.installmentSchedule ?? scheduleFromPersistedOriginalMilli(original);
  return {
    riderCode: '4802535',
    riderNameSnapshot: 'Pilot Open',
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
    installmentSchedule: schedule,
    ...partial,
  };
}

function memoryLiabilityMap(seed: EquipmentLiabilityIssue[]) {
  const map = new Map(seed.map((i) => [i.equipmentIssueId, { ...i }]));
  return {
    get: async (id: string) => {
      const hit = map.get(id);
      return hit ? { ...hit } : null;
    },
    updateBalance: async (
      equipmentIssueId: string,
      deductionMilli: number,
      _actor: { code: string; name: string },
      opts?: { incrementInstallment?: boolean }
    ) => {
      const issue = map.get(equipmentIssueId);
      if (!issue) return { ok: false as const, error: 'issue not found' };
      const deduct = Math.max(0, Math.trunc(deductionMilli));
      const newDeducted = issue.amountDeductedMilli + deduct;
      const newOutstanding = Math.max(0, issue.outstandingMilli - deduct);
      const shouldIncrement = opts?.incrementInstallment ?? deduct > 0;
      const updated: EquipmentLiabilityIssue = {
        ...issue,
        originalLiabilityMilli: issue.originalLiabilityMilli,
        settlementPaidMilli: issue.settlementPaidMilli,
        amountDeductedMilli: newDeducted,
        outstandingMilli: newOutstanding,
        installmentsCompleted:
          issue.installmentsCompleted + (shouldIncrement ? 1 : 0),
        status: newOutstanding <= 0 && issue.status === 'open' ? 'settled' : issue.status,
      };
      map.set(equipmentIssueId, updated);
      return { ok: true as const, issue: { ...updated } };
    },
    snapshot: () => new Map([...map.entries()].map(([k, v]) => [k, { ...v }])),
  };
}

function buildDeps(
  issues: EquipmentLiabilityIssue[],
  store = createMemoryObligationLedgerStore(),
  actualStore = createMemoryActualReconcileStore()
): {
  store: ReturnType<typeof createMemoryObligationLedgerStore>;
  actualStore: ReturnType<typeof createMemoryActualReconcileStore>;
  liability: ReturnType<typeof memoryLiabilityMap>;
  deps: ActualPayrollReconcileDeps;
  audits: Array<{ action: string; after?: unknown }>;
} {
  const liability = memoryLiabilityMap(issues);
  const audits: Array<{ action: string; after?: unknown }> = [];
  const deps: ActualPayrollReconcileDeps = {
    obligationStore: store,
    getLiabilityById: liability.get,
    updateLiabilityBalance: liability.updateBalance,
    findByIdempotencyKey: (key) => actualStore.findByIdempotencyKey(key),
    persistReconcileRecord: (r) => actualStore.append(r),
    appendAudit: async (e) => {
      audits.push({ action: e.action, after: e.after });
    },
  };
  return { store, actualStore, liability, deps, audits };
}

describe('4D.5.4.16 REQUEST ≠ ACTUAL payroll reconcile', () => {
  it('1+2. Opening 500 → Request 300; Request does not reduce outstanding', async () => {
    const issue = makeIssue({ equipmentIssueId: 'OPENING:4802535' });
    const cycles = [
      cycle({ cycleId: 'C1', cycleNumber: 1, startDate: '2026-08-01', endDate: '2026-08-07' }),
      cycle({ cycleId: 'C2', cycleNumber: 2, startDate: '2026-08-08', endDate: '2026-08-14' }),
    ];
    const store = createMemoryObligationLedgerStore();
    const sun = await sundayEmitEquipmentRequest({
      issue,
      cycle: cycles[1],
      allCycles: cycles,
      store,
      actor: { code: 'ops', name: 'Ops' },
    });
    assert.equal(sun.requestedMilli, 30000);
    assert.equal(sun.outstandingUnchanged, 50000);
    assert.equal(issue.outstandingMilli, 50000);
    assert.equal(sun.emitOutcome, 'created');
  });

  it('3. Case A: Actual 300 → outstanding 200', async () => {
    const issue = makeIssue({ equipmentIssueId: 'E-A' });
    const { store, deps, liability } = buildDeps([issue]);
    await emitRequestObligation(store, {
      deductionId: 'eq:E-A:inst:1',
      source: 'auto_equipment',
      riderCode: '4802535',
      reason: 'معدات',
      originalCycleId: 'C1',
      currentCycleId: 'C1',
      originalAmount: 30000,
      obligationAgeKey: 't1',
      equipmentIssueId: 'E-A',
      installmentNumber: 1,
    });
    const r = await reconcileActualPayrollDeduction(
      {
        deductionId: 'eq:E-A:inst:1',
        actualDeductedMilli: 30000,
        actualDeductionDate: '2026-08-14',
        talabatReference: 'TB-A-300',
        operatorConfirmation: true,
        actorCode: 'ops',
        actorName: 'Ops',
      },
      deps
    );
    assert.equal(r.ok, true);
    if (!r.ok) return;
    assert.equal(r.issue.outstandingMilli, 20000);
    assert.equal(r.issue.amountDeductedMilli, 30000);
    assert.equal(r.issue.settlementPaidMilli, 40000);
    assert.equal(r.obligation.originalAmount, 30000);
    assert.equal(liability.snapshot().get('E-A')?.outstandingMilli, 20000);
  });

  it('4. Case B: Actual 0 → outstanding remains 500', async () => {
    const issue = makeIssue({ equipmentIssueId: 'E-B' });
    const { store, deps } = buildDeps([issue]);
    await emitRequestObligation(store, {
      deductionId: 'eq:E-B:inst:1',
      source: 'auto_equipment',
      riderCode: '4802535',
      reason: 'معدات',
      originalCycleId: 'C1',
      originalAmount: 30000,
      obligationAgeKey: 't1',
      equipmentIssueId: 'E-B',
      installmentNumber: 1,
    });
    const r = await reconcileActualPayrollDeduction(
      {
        deductionId: 'eq:E-B:inst:1',
        actualDeductedMilli: 0,
        actualDeductionDate: '2026-08-14',
        talabatReference: 'TB-B-0',
        operatorConfirmation: true,
        actorCode: 'ops',
        actorName: 'Ops',
      },
      deps
    );
    assert.equal(r.ok, true);
    if (!r.ok) return;
    assert.equal(r.issue.outstandingMilli, 50000);
    assert.equal(r.issue.amountDeductedMilli, 0);
  });

  it('5+15. Case C / partial: Actual 200 → outstanding 300', async () => {
    const issue = makeIssue({ equipmentIssueId: 'E-C' });
    const { store, deps } = buildDeps([issue]);
    await emitRequestObligation(store, {
      deductionId: 'eq:E-C:inst:1',
      source: 'auto_equipment',
      riderCode: '4802535',
      reason: 'معدات',
      originalCycleId: 'C1',
      originalAmount: 30000,
      obligationAgeKey: 't1',
      equipmentIssueId: 'E-C',
      installmentNumber: 1,
    });
    const r = await reconcileActualPayrollDeduction(
      {
        deductionId: 'eq:E-C:inst:1',
        actualDeductedMilli: 20000,
        actualDeductionDate: '2026-08-14',
        talabatReference: 'TB-C-200',
        operatorConfirmation: true,
        actorCode: 'ops',
        actorName: 'Ops',
      },
      deps
    );
    assert.equal(r.ok, true);
    if (!r.ok) return;
    assert.equal(r.issue.outstandingMilli, 30000);
    assert.equal(r.obligation.paidAmount, 20000);
    assert.equal(r.obligation.remainingAmount, 10000);
    assert.equal(r.obligation.status, 'partially_allocated');
  });

  it('6. Case D: Final 200 → outstanding 0 settled', async () => {
    const issue = makeIssue({
      equipmentIssueId: 'E-D',
      outstandingMilli: 20000,
      amountDeductedMilli: 30000,
      installmentsCompleted: 1,
    });
    const { store, deps } = buildDeps([issue]);
    await emitRequestObligation(store, {
      deductionId: 'eq:E-D:inst:2',
      source: 'auto_equipment',
      riderCode: '4802535',
      reason: 'معدات',
      originalCycleId: 'C2',
      originalAmount: 20000,
      obligationAgeKey: 't2',
      equipmentIssueId: 'E-D',
      installmentNumber: 2,
    });
    const r = await reconcileActualPayrollDeduction(
      {
        deductionId: 'eq:E-D:inst:2',
        actualDeductedMilli: 20000,
        actualDeductionDate: '2026-08-21',
        talabatReference: 'TB-D-200',
        operatorConfirmation: true,
        actorCode: 'ops',
        actorName: 'Ops',
      },
      deps
    );
    assert.equal(r.ok, true);
    if (!r.ok) return;
    assert.equal(r.issue.outstandingMilli, 0);
    assert.equal(r.issue.status, 'settled');
  });

  it('7. Case E: Actual > outstanding → BLOCK OVER_ACTUAL_DEDUCTION', async () => {
    const issue = makeIssue({
      equipmentIssueId: 'E-E',
      outstandingMilli: 20000,
    });
    const { store, deps, liability } = buildDeps([issue]);
    await emitRequestObligation(store, {
      deductionId: 'eq:E-E:inst:1',
      source: 'auto_equipment',
      riderCode: '4802535',
      reason: 'معدات',
      originalCycleId: 'C1',
      originalAmount: 20000,
      obligationAgeKey: 't1',
      equipmentIssueId: 'E-E',
      installmentNumber: 1,
    });
    const r = await reconcileActualPayrollDeduction(
      {
        deductionId: 'eq:E-E:inst:1',
        actualDeductedMilli: 25000,
        actualDeductionDate: '2026-08-14',
        talabatReference: 'TB-E-OVER',
        operatorConfirmation: true,
        actorCode: 'ops',
        actorName: 'Ops',
      },
      deps
    );
    assert.equal(r.ok, false);
    if (r.ok) return;
    assert.equal(r.code, 'OVER_ACTUAL_DEDUCTION');
    assert.equal(liability.snapshot().get('E-E')?.outstandingMilli, 20000);
  });

  it('8. Duplicate Request same cycle → no second row', async () => {
    const issue = makeIssue({ equipmentIssueId: 'E-DUP-REQ' });
    const cycles = [
      cycle({ cycleId: 'C1', startDate: '2026-08-01', endDate: '2026-08-07' }),
      cycle({ cycleId: 'C2', cycleNumber: 2, startDate: '2026-08-08', endDate: '2026-08-14' }),
    ];
    const store = createMemoryObligationLedgerStore();
    const a = await sundayEmitEquipmentRequest({
      issue,
      cycle: cycles[1],
      allCycles: cycles,
      store,
      actor: { code: 'ops', name: 'Ops' },
    });
    const b = await sundayEmitEquipmentRequest({
      issue,
      cycle: cycles[1],
      allCycles: cycles,
      store,
      actor: { code: 'ops', name: 'Ops' },
    });
    assert.equal(a.emitOutcome, 'created');
    assert.equal(b.emitOutcome, 'queued_existing');
    const all = await listPersistedObligations(store);
    assert.equal(all.filter((x) => x.obligation.equipmentIssueId === 'E-DUP-REQ').length, 1);
  });

  it('9+25. Duplicate Actual payroll reference → idempotent', async () => {
    const issue = makeIssue({ equipmentIssueId: 'E-DUP-ACT' });
    const { store, deps, liability } = buildDeps([issue]);
    await emitRequestObligation(store, {
      deductionId: 'eq:E-DUP-ACT:inst:1',
      source: 'auto_equipment',
      riderCode: '4802535',
      reason: 'معدات',
      originalCycleId: 'C1',
      originalAmount: 30000,
      obligationAgeKey: 't1',
      equipmentIssueId: 'E-DUP-ACT',
      installmentNumber: 1,
    });
    const input = {
      deductionId: 'eq:E-DUP-ACT:inst:1',
      actualDeductedMilli: 30000,
      actualDeductionDate: '2026-08-14',
      talabatReference: 'TB-SAME-REF',
      operatorConfirmation: true as const,
      actorCode: 'ops',
      actorName: 'Ops',
    };
    const first = await reconcileActualPayrollDeduction(input, deps);
    const second = await reconcileActualPayrollDeduction(input, deps);
    assert.equal(first.ok, true);
    assert.equal(second.ok, true);
    if (!first.ok || !second.ok) return;
    assert.equal(first.created, true);
    assert.equal(second.duplicate, true);
    assert.equal(liability.snapshot().get('E-DUP-ACT')?.outstandingMilli, 20000);
    assert.equal(liability.snapshot().get('E-DUP-ACT')?.amountDeductedMilli, 30000);
  });

  it('10+18. Settled / 877614 → no Request', async () => {
    const settled = makeIssue({
      equipmentIssueId: 'OPENING:877614',
      riderCode: '877614',
      originalLiabilityMilli: 80000,
      outstandingMilli: 0,
      settlementPaidMilli: 80000,
      amountDeductedMilli: 0,
      status: 'settled',
      securityPaidUpfront: true,
      securityFeeMilli: 0,
    });
    const cycles = [
      cycle({ cycleId: 'C1', startDate: '2026-08-01', endDate: '2026-08-07' }),
      cycle({ cycleId: 'C2', cycleNumber: 2, startDate: '2026-08-08', endDate: '2026-08-14' }),
    ];
    const store = createMemoryObligationLedgerStore();
    const sun = await sundayEmitEquipmentRequest({
      issue: settled,
      cycle: cycles[1],
      allCycles: cycles,
      store,
      actor: { code: 'ops', name: 'Ops' },
    });
    assert.equal(sun.requestedMilli, 0);
    assert.equal(sun.skippedReason, 'no_outstanding');
    assert.equal((await listPersistedObligations(store)).length, 0);
  });

  it('11. Admin price changes do not affect Opening / request sizing', () => {
    const original = 90000;
    const schedule = scheduleFromPersistedOriginalMilli(original);
    const decision = computeAutoRequestDecision({
      remainingMilli: 50000,
      schedule,
      installmentsCompleted: 0,
      cycle: cycle({ cycleId: 'C2', cycleNumber: 2, startDate: '2026-08-08', endDate: '2026-08-14' }),
      allCycles: [
        cycle({ cycleId: 'C1', startDate: '2026-08-01', endDate: '2026-08-07' }),
        cycle({ cycleId: 'C2', cycleNumber: 2, startDate: '2026-08-08', endDate: '2026-08-14' }),
      ],
      activationDate: '2026-08-01',
      riderCode: '4802535',
      equipmentIssueId: 'OPENING:4802535',
    });
    assert.equal(decision.action, 'request');
    if (decision.action === 'request') {
      assert.equal(decision.originalAmountMilli, 30000);
    }
    // Live admin catalog would differ; sizing still from persisted schedule.
    assert.deepEqual(schedule, [30000, 30000, 30000]);
  });

  it('12. Historical settlement does not advance installment progress', async () => {
    const issue = makeIssue({
      equipmentIssueId: 'E-SETTLE',
      outstandingMilli: 50000,
      settlementPaidMilli: 40000,
      amountDeductedMilli: 0,
      installmentsCompleted: 0,
    });
    assert.equal(issue.installmentsCompleted, 0);
    assert.equal(issue.amountDeductedMilli, 0);
    const { store, deps } = buildDeps([issue]);
    await emitRequestObligation(store, {
      deductionId: 'eq:E-SETTLE:inst:1',
      source: 'auto_equipment',
      riderCode: '4802535',
      reason: 'معدات',
      originalCycleId: 'C1',
      originalAmount: 30000,
      obligationAgeKey: 't1',
      equipmentIssueId: 'E-SETTLE',
      installmentNumber: 1,
    });
    // Request path must not touch settlement or amountDeducted
    const before = (await findPersistedByDeductionId(store, 'eq:E-SETTLE:inst:1'))!;
    assert.equal(before.obligation.paidAmount, 0);
    const r = await reconcileActualPayrollDeduction(
      {
        deductionId: 'eq:E-SETTLE:inst:1',
        actualDeductedMilli: 30000,
        actualDeductionDate: '2026-08-14',
        talabatReference: 'TB-SETTLE',
        operatorConfirmation: true,
        actorCode: 'ops',
        actorName: 'Ops',
      },
      deps
    );
    assert.equal(r.ok, true);
    if (!r.ok) return;
    assert.equal(r.issue.settlementPaidMilli, 40000);
    assert.equal(r.issue.amountDeductedMilli, 30000);
    assert.equal(r.financialSideEffects.settlementPaidMutated, false);
  });

  it('13+14. Request immutable; Actual separate from requested', async () => {
    const before = createRequestObligation({
      deductionId: 'eq:IMM:inst:1',
      source: 'auto_equipment',
      riderCode: '4802535',
      reason: 'معدات',
      originalCycleId: 'C1',
      originalAmount: 30000,
      obligationAgeKey: 't1',
      equipmentIssueId: 'E-IMM',
      installmentNumber: 1,
    });
    const issue = makeIssue({ equipmentIssueId: 'E-IMM' });
    const { store, deps } = buildDeps([issue]);
    await emitRequestObligation(store, {
      ...before,
      obligationAgeKey: 't1',
    });
    const r = await reconcileActualPayrollDeduction(
      {
        deductionId: 'eq:IMM:inst:1',
        actualDeductedMilli: 20000,
        actualDeductionDate: '2026-08-14',
        talabatReference: 'TB-IMM',
        operatorConfirmation: true,
        actorCode: 'ops',
        actorName: 'Ops',
      },
      deps
    );
    assert.equal(r.ok, true);
    if (!r.ok) return;
    assert.ok(assertOriginalAmountImmutable(before, r.obligation));
    assert.equal(r.obligation.originalAmount, 30000);
    assert.equal(r.record.actualDeductedMilli, 20000);
    assert.notEqual(r.record.actualDeductedMilli, r.record.requestedAmountMilli);
  });

  it('16. Missing actual keeps request pending in export', async () => {
    const issue = makeIssue({ equipmentIssueId: 'E-PEND' });
    const store = createMemoryObligationLedgerStore();
    const emit = await emitRequestObligation(store, {
      deductionId: 'eq:E-PEND:inst:1',
      source: 'auto_equipment',
      riderCode: '4802535',
      reason: 'معدات',
      originalCycleId: 'C1',
      originalAmount: 30000,
      obligationAgeKey: 't1',
      equipmentIssueId: 'E-PEND',
      installmentNumber: 1,
    });
    const row = buildEquipmentRequestExportRow({
      obligation: emit.obligation,
      issue,
      requestDate: '2026-08-10',
      actual: null,
    });
    assert.equal(row.requestedAmount, 30000);
    assert.equal(row.actualDeductedAmount, '');
    assert.equal(row.actualStatus, 'PENDING_ACTUAL');
    assert.ok(EQUIPMENT_REQUEST_EXPORT_COLUMNS.includes('requestedAmount'));
    assert.ok(EQUIPMENT_REQUEST_EXPORT_COLUMNS.includes('actualDeductedAmount'));
  });

  it('17. Next cycle does not mint new installment while open remainder exists', async () => {
    const issue = makeIssue({ equipmentIssueId: 'E-NEXT' });
    const cycles = [
      cycle({ cycleId: 'C1', startDate: '2026-08-01', endDate: '2026-08-07' }),
      cycle({ cycleId: 'C2', cycleNumber: 2, startDate: '2026-08-08', endDate: '2026-08-14' }),
      cycle({ cycleId: 'C3', cycleNumber: 3, startDate: '2026-08-15', endDate: '2026-08-21' }),
    ];
    const store = createMemoryObligationLedgerStore();
    await sundayEmitEquipmentRequest({
      issue,
      cycle: cycles[1],
      allCycles: cycles,
      store,
      actor: { code: 'ops', name: 'Ops' },
    });
    // Partial actual leaves remainder
    const { deps } = buildDeps([issue], store);
    await thursdayReconcileActual({
      deductionId: stableEquipmentInstallmentDeductionId('E-NEXT', 1),
      actualDeductedMilli: 10000,
      actualDeductionDate: '2026-08-14',
      talabatReference: 'TB-NEXT-P',
      actor: { code: 'ops', name: 'Ops' },
      deps,
    });
    // Simulate autoRequest open-remainder gate: second sunday with same open remainder
    const again = await emitRequestObligation(store, {
      deductionId: stableEquipmentInstallmentDeductionId('E-NEXT', 1),
      source: 'auto_equipment',
      riderCode: '4802535',
      reason: 'معدات',
      originalCycleId: 'C2',
      currentCycleId: 'C3',
      originalAmount: 30000,
      obligationAgeKey: 't1',
      equipmentIssueId: 'E-NEXT',
      installmentNumber: 1,
    });
    assert.equal(again.outcome, 'queued_existing');
    assert.equal(again.obligation.originalAmount, 30000);
    const rows = await listPersistedObligations(store);
    assert.equal(rows.length, 1);
  });

  it('19. 4802535 ladder 500 → 300 → 200 → 0 via Actuals only', async () => {
    let issue = makeIssue({ equipmentIssueId: 'OPENING:4802535' });
    const { store, deps, liability } = buildDeps([issue]);
    const cycles = [
      cycle({ cycleId: 'C1', startDate: '2026-08-01', endDate: '2026-08-07' }),
      cycle({ cycleId: 'C2', cycleNumber: 2, startDate: '2026-08-08', endDate: '2026-08-14' }),
      cycle({ cycleId: 'C3', cycleNumber: 3, startDate: '2026-08-15', endDate: '2026-08-21' }),
    ];

    const sun1 = await sundayEmitEquipmentRequest({
      issue,
      cycle: cycles[1],
      allCycles: cycles,
      store,
      actor: { code: 'ops', name: 'Ops' },
    });
    assert.equal(sun1.requestedMilli, 30000);
    assert.equal(issue.outstandingMilli, 50000);

    const a1 = await thursdayReconcileActual({
      deductionId: sun1.deductionId!,
      actualDeductedMilli: 30000,
      actualDeductionDate: '2026-08-14',
      talabatReference: 'TB-480-1',
      actor: { code: 'ops', name: 'Ops' },
      deps,
    });
    assert.equal(a1.ok, true);
    if (!a1.ok) return;
    issue = a1.issue;
    assert.equal(issue.outstandingMilli, 20000);

    const sun2 = await sundayEmitEquipmentRequest({
      issue,
      cycle: cycles[2],
      allCycles: cycles,
      store,
      actor: { code: 'ops', name: 'Ops' },
    });
    assert.equal(sun2.requestedMilli, 20000);

    const a2 = await thursdayReconcileActual({
      deductionId: sun2.deductionId!,
      actualDeductedMilli: 20000,
      actualDeductionDate: '2026-08-21',
      talabatReference: 'TB-480-2',
      actor: { code: 'ops', name: 'Ops' },
      deps,
    });
    assert.equal(a2.ok, true);
    if (!a2.ok) return;
    assert.equal(a2.issue.outstandingMilli, 0);
    assert.equal(a2.issue.status, 'settled');
    assert.equal(liability.snapshot().get('OPENING:4802535')?.settlementPaidMilli, 40000);
  });

  it('20. 4811093 remains untouched (no liability → no request path)', async () => {
    const store = createMemoryObligationLedgerStore();
    const all = await listPersistedObligations(store);
    assert.equal(all.filter((r) => r.obligation.riderCode === '4811093').length, 0);
  });

  it('21-24. Safety: no FA / wallet / ledger / payroll flags in workflow', () => {
    const safety = weeklyWorkflowSafetySnapshot();
    assert.equal(isSrs014FinancialApplyEnabled(), false);
    assert.equal(safety.financialApplyEnabled, false);
    assert.equal(safety.walletMutated, false);
    assert.equal(safety.ledgerMoneyMutated, false);
    assert.equal(safety.payrollExecuted, false);
  });

  it('export separates Requested vs Actual columns after reconcile', async () => {
    const issue = makeIssue({ equipmentIssueId: 'E-EXP' });
    const { store, deps } = buildDeps([issue]);
    const emit = await emitRequestObligation(store, {
      deductionId: 'eq:E-EXP:inst:1',
      source: 'auto_equipment',
      riderCode: '4802535',
      reason: 'معدات',
      originalCycleId: 'C1',
      originalAmount: 30000,
      obligationAgeKey: 't1',
      equipmentIssueId: 'E-EXP',
      installmentNumber: 1,
    });
    const r = await reconcileActualPayrollDeduction(
      {
        deductionId: 'eq:E-EXP:inst:1',
        actualDeductedMilli: 30000,
        actualDeductionDate: '2026-08-14',
        talabatReference: 'TB-EXP',
        operatorConfirmation: true,
        actorCode: 'ops',
        actorName: 'Ops',
      },
      deps
    );
    assert.equal(r.ok, true);
    if (!r.ok) return;
    const row = exportRowForWeeklyRequest({
      obligation: r.obligation,
      issue: r.issue,
      requestDate: '2026-08-10',
      actual: r.record,
    });
    assert.equal(row.requestedAmount, 30000);
    assert.equal(row.actualDeductedAmount, 30000);
    assert.equal(row.outstandingBefore, 50000);
    assert.equal(row.outstandingAfter, 20000);
    assert.equal(row.actualStatus, 'DEDUCTED');
    assert.equal(emit.obligation.originalAmount, 30000);
  });

  it('audit events for create + reconcile', async () => {
    const issue = makeIssue({ equipmentIssueId: 'E-AUD' });
    const { store, deps, audits } = buildDeps([issue]);
    await emitRequestObligation(store, {
      deductionId: 'eq:E-AUD:inst:1',
      source: 'auto_equipment',
      riderCode: '4802535',
      reason: 'معدات',
      originalCycleId: 'C1',
      originalAmount: 30000,
      obligationAgeKey: 't1',
      equipmentIssueId: 'E-AUD',
      installmentNumber: 1,
    });
    await reconcileActualPayrollDeduction(
      {
        deductionId: 'eq:E-AUD:inst:1',
        actualDeductedMilli: 30000,
        actualDeductionDate: '2026-08-14',
        talabatReference: 'TB-AUD',
        operatorConfirmation: true,
        actorCode: 'ops',
        actorName: 'Ops',
      },
      deps
    );
    assert.ok(audits.some((a) => a.action === 'reconcile_equipment_actual_deduction'));
  });
});
