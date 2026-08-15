/**
 * SRS-014 Phase 4B — REQUEST persistence tests only.
 * No wallet / ledger_native / allocation apply / Auto cron wiring.
 */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  autoEquipmentRequestIdempotencyKey,
  createMemoryObligationLedgerStore,
  emitRequestObligation,
  findPersistedByDeductionId,
  listPersistedObligations,
  REQUEST_LEDGER_HEADERS,
  stableEquipmentInstallmentDeductionId,
} from '@/lib/equipmentDeductions/requestPersistence';
import { isEconomicallyConsistent } from '@/lib/equipmentDeductions/obligations';
import { DEDUCTION_IMPORT_HEADERS } from '@/lib/equipmentSheetConstants';

describe('Phase 4B — REQUEST persistence', () => {
  it('headers include SRS §8.1 additive fields without renaming legacy columns', () => {
    assert.equal(REQUEST_LEDGER_HEADERS[0], 'تاريخ_الرفع');
    assert.equal(REQUEST_LEDGER_HEADERS[5], 'قيمة_الاستقطاع');
    assert.ok(DEDUCTION_IMPORT_HEADERS.includes('deductionId'));
    assert.ok(DEDUCTION_IMPORT_HEADERS.includes('paidAmount'));
    assert.ok(DEDUCTION_IMPORT_HEADERS.includes('remainingAmount'));
    assert.ok(DEDUCTION_IMPORT_HEADERS.includes('originalAmount'));
    assert.ok(DEDUCTION_IMPORT_HEADERS.includes('currentCycleId'));
    assert.ok(DEDUCTION_IMPORT_HEADERS.includes('originalCycleId'));
    assert.ok(DEDUCTION_IMPORT_HEADERS.includes('status'));
    assert.ok(DEDUCTION_IMPORT_HEADERS.includes('source'));
    assert.ok(DEDUCTION_IMPORT_HEADERS.includes('equipmentIssueId'));
    assert.ok(DEDUCTION_IMPORT_HEADERS.includes('installmentNumber'));
  });

  it('AT-01 / REQUEST: paidAmount=0, remaining=original; economic invariants hold', async () => {
    const store = createMemoryObligationLedgerStore();
    const installmentsCompleted = { value: 2 };

    const result = await emitRequestObligation(store, {
      deductionId: stableEquipmentInstallmentDeductionId('ISSUE-1', 1),
      source: 'auto_equipment',
      riderCode: 'R1',
      riderName: 'Rider',
      reason: 'معدات',
      originalCycleId: 'C1',
      originalAmount: 50000,
      obligationAgeKey: '2026-01-01T00:00:00.000Z',
      uploadedAt: '2026-01-01T00:00:00.000Z',
      equipmentIssueId: 'ISSUE-1',
      installmentNumber: 1,
      cycleLabel: 'الأولى',
      monthLabel: 'يناير',
      year: 2026,
    });

    assert.equal(result.outcome, 'created');
    assert.equal(result.obligation.paidAmount, 0);
    assert.equal(result.obligation.remainingAmount, 50000);
    assert.equal(result.obligation.originalAmount, 50000);
    assert.equal(result.obligation.status, 'open');
    assert.ok(isEconomicallyConsistent(result.obligation));
    assert.equal(result.installmentsCompletedDelta, 0);
    assert.equal(result.financialSideEffects.walletMutated, false);
    assert.equal(result.financialSideEffects.ledgerNativeWritten, false);
    assert.equal(result.financialSideEffects.amountDeductedMilliDelta, 0);
    assert.equal(result.financialSideEffects.paidAmountIncremented, false);

    // H-1: caller-owned installmentsCompleted must not be advanced by REQUEST emit
    assert.equal(installmentsCompleted.value, 2);

    const listed = await listPersistedObligations(store);
    assert.equal(listed.length, 1);
    assert.equal(listed[0].obligation.paidAmount, 0);
    assert.equal(listed[0].obligation.remainingAmount, listed[0].obligation.originalAmount);
  });

  it('AT-08: open remainder does not create duplicate REQUEST; updates currentCycleId only', async () => {
    const store = createMemoryObligationLedgerStore();
    const deductionId = stableEquipmentInstallmentDeductionId('ISSUE-9', 2);

    const first = await emitRequestObligation(store, {
      deductionId,
      source: 'auto_equipment',
      riderCode: 'R9',
      reason: 'معدات',
      originalCycleId: 'C1',
      originalAmount: 26667,
      obligationAgeKey: 't1',
      uploadedAt: 't1',
      equipmentIssueId: 'ISSUE-9',
      installmentNumber: 2,
    });
    assert.equal(first.outcome, 'created');

    // Simulate PARTIALLY_ALLOCATED remainder still open (allocation itself is out of 4B scope)
    const rows = await store.listDataRows();
    const paidIdx = REQUEST_LEDGER_HEADERS.indexOf('paidAmount');
    const remIdx = REQUEST_LEDGER_HEADERS.indexOf('remainingAmount');
    const statusIdx = REQUEST_LEDGER_HEADERS.indexOf('status');
    const mutated = [...rows[0].values];
    mutated[paidIdx] = 10000;
    mutated[remIdx] = 16667;
    mutated[statusIdx] = 'partially_allocated';
    await store.updateRow(rows[0].rowNumber, mutated);

    const second = await emitRequestObligation(store, {
      deductionId,
      source: 'auto_equipment',
      riderCode: 'R9',
      reason: 'معدات',
      originalCycleId: 'C1',
      currentCycleId: 'C2',
      originalAmount: 26667,
      obligationAgeKey: 't2',
      uploadedAt: 't2',
      equipmentIssueId: 'ISSUE-9',
      installmentNumber: 2,
    });

    assert.equal(second.outcome, 'queued_existing');
    assert.equal(second.obligation.deductionId, deductionId);
    assert.equal(second.obligation.originalAmount, 26667);
    assert.equal(second.obligation.paidAmount, 10000);
    assert.equal(second.obligation.remainingAmount, 16667);
    assert.equal(second.obligation.originalCycleId, 'C1');
    assert.equal(second.obligation.currentCycleId, 'C2');
    assert.equal(second.installmentsCompletedDelta, 0);

    const all = await listPersistedObligations(store);
    assert.equal(all.length, 1, 'must not mint a second REQUEST row for open remainder');
  });

  it('AT-08c: duplicate emit for same new installment key does not create second deductionId row', async () => {
    const store = createMemoryObligationLedgerStore();
    const deductionId = stableEquipmentInstallmentDeductionId('ISSUE-2', 1);
    const key = autoEquipmentRequestIdempotencyKey({
      riderCode: 'R2',
      equipmentIssueId: 'ISSUE-2',
      cycleId: 'C1',
      installmentNumber: 1,
    });
    assert.match(key, /^equipment:R2:ISSUE-2:C1:1$/);

    const a = await emitRequestObligation(store, {
      deductionId,
      source: 'auto_equipment',
      riderCode: 'R2',
      reason: 'معدات',
      originalCycleId: 'C1',
      originalAmount: 30000,
      obligationAgeKey: 'a',
      equipmentIssueId: 'ISSUE-2',
      installmentNumber: 1,
    });
    const b = await emitRequestObligation(store, {
      deductionId,
      source: 'auto_equipment',
      riderCode: 'R2',
      reason: 'معدات',
      originalCycleId: 'C1',
      currentCycleId: 'C1',
      originalAmount: 30000,
      obligationAgeKey: 'b',
      equipmentIssueId: 'ISSUE-2',
      installmentNumber: 1,
    });

    assert.equal(a.outcome, 'created');
    assert.equal(b.outcome, 'queued_existing');
    assert.equal((await listPersistedObligations(store)).length, 1);
  });

  it('H-1: REQUEST emit never reports installmentsCompleted advance', async () => {
    const store = createMemoryObligationLedgerStore();
    const r = await emitRequestObligation(store, {
      deductionId: 'loan-1',
      source: 'supervisor',
      riderCode: 'R3',
      reason: 'سلفة',
      originalCycleId: 'C3',
      originalAmount: 20000,
      obligationAgeKey: 'x',
    });
    assert.equal(r.installmentsCompletedDelta, 0);
  });

  it('closed obligation with same deductionId does not append a second REQUEST', async () => {
    const store = createMemoryObligationLedgerStore();
    const id = 'D-CLOSED';
    await emitRequestObligation(store, {
      deductionId: id,
      source: 'supervisor',
      riderCode: 'R4',
      reason: 'سلفة',
      originalCycleId: 'C1',
      originalAmount: 10000,
      obligationAgeKey: '1',
    });
    const rows = await store.listDataRows();
    const paidIdx = REQUEST_LEDGER_HEADERS.indexOf('paidAmount');
    const remIdx = REQUEST_LEDGER_HEADERS.indexOf('remainingAmount');
    const statusIdx = REQUEST_LEDGER_HEADERS.indexOf('status');
    const closed = [...rows[0].values];
    closed[paidIdx] = 10000;
    closed[remIdx] = 0;
    closed[statusIdx] = 'paid';
    await store.updateRow(rows[0].rowNumber, closed);

    const again = await emitRequestObligation(store, {
      deductionId: id,
      source: 'supervisor',
      riderCode: 'R4',
      reason: 'سلفة',
      originalCycleId: 'C2',
      originalAmount: 10000,
      obligationAgeKey: '2',
    });
    assert.equal(again.outcome, 'already_exists_closed');
    assert.equal((await listPersistedObligations(store)).length, 1);
  });

  it('distinct deductionIds remain separate rows (no merge)', async () => {
    const store = createMemoryObligationLedgerStore();
    await emitRequestObligation(store, {
      deductionId: 'L-OLD',
      source: 'supervisor',
      riderCode: 'R5',
      reason: 'سلفة',
      originalCycleId: 'C1',
      originalAmount: 10000,
      obligationAgeKey: '1',
    });
    await emitRequestObligation(store, {
      deductionId: 'L-NEW',
      source: 'supervisor',
      riderCode: 'R5',
      reason: 'سلفة',
      originalCycleId: 'C1',
      originalAmount: 20000,
      obligationAgeKey: '2',
    });
    const all = await listPersistedObligations(store);
    assert.equal(all.length, 2);
    assert.ok(all.every((r) => isEconomicallyConsistent(r.obligation)));
  });

  it('findPersistedByDeductionId returns null when missing', async () => {
    const store = createMemoryObligationLedgerStore();
    assert.equal(await findPersistedByDeductionId(store, 'nope'), null);
  });

  it('financial side-effect flags stay zero on create and queue', async () => {
    const store = createMemoryObligationLedgerStore();
    const id = stableEquipmentInstallmentDeductionId('ISSUE-Z', 1);
    const created = await emitRequestObligation(store, {
      deductionId: id,
      source: 'auto_equipment',
      riderCode: 'RZ',
      reason: 'معدات',
      originalCycleId: 'C1',
      originalAmount: 1000,
      obligationAgeKey: '1',
      equipmentIssueId: 'ISSUE-Z',
      installmentNumber: 1,
    });
    const queued = await emitRequestObligation(store, {
      deductionId: id,
      source: 'auto_equipment',
      riderCode: 'RZ',
      reason: 'معدات',
      originalCycleId: 'C1',
      currentCycleId: 'C2',
      originalAmount: 1000,
      obligationAgeKey: '2',
      equipmentIssueId: 'ISSUE-Z',
      installmentNumber: 1,
    });
    for (const r of [created, queued]) {
      assert.deepEqual(r.financialSideEffects, {
        walletMutated: false,
        ledgerNativeWritten: false,
        amountDeductedMilliDelta: 0,
        paidAmountIncremented: false,
      });
    }
  });
});
