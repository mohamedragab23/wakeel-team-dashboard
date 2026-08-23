import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  computeCycleRequestMilli,
  computeFinancialState,
  cycleShortfallMilli,
  declaredPaidFromStatus,
  splitInstallmentsMilliemesCapped,
  sumCarryForwardShortfall,
  validateDeclaredPaid,
} from '@/lib/equipmentDeductions/equipmentFinancialModel';
import { splitInstallmentsMilliemes } from '@/lib/money';
import { normalizeRiderCodeForPerformance } from '@/lib/riderCodeUtils';

describe('equipmentFinancialModel', () => {
  it('900 liability installments 300+300+300', () => {
    assert.deepEqual(splitInstallmentsMilliemes(90000), [30000, 30000, 30000]);
  });

  it('800 liability installments 300+300+200', () => {
    assert.deepEqual(splitInstallmentsMilliemes(80000), [30000, 30000, 20000]);
  });

  it('500 → 300+200', () => {
    assert.deepEqual(splitInstallmentsMilliemes(50000), [30000, 20000]);
  });

  it('400 → 300+100', () => {
    assert.deepEqual(splitInstallmentsMilliemes(40000), [30000, 10000]);
  });

  it('supervisor fully paid → outstanding 0', () => {
    const f = computeFinancialState({
      originalLiabilityMilli: 90000,
      supervisorDeclaredPaidMilli: 90000,
      cumulativeActualPayrollMilli: 0,
    });
    assert.equal(f.currentOutstandingMilli, 0);
  });

  it('supervisor partial 400 on 900 → outstanding 500 before actual', () => {
    const f = computeFinancialState({
      originalLiabilityMilli: 90000,
      supervisorDeclaredPaidMilli: 40000,
      cumulativeActualPayrollMilli: 0,
    });
    assert.equal(f.outstandingAfterSupervisorMilli, 50000);
    assert.equal(f.currentOutstandingMilli, 50000);
  });

  it('payroll actual 200 after supervisor 400 → remaining 300', () => {
    const f = computeFinancialState({
      originalLiabilityMilli: 90000,
      supervisorDeclaredPaidMilli: 40000,
      cumulativeActualPayrollMilli: 20000,
    });
    assert.equal(f.currentOutstandingMilli, 30000);
  });

  it('carry-forward: requested 300 actual 200 → shortfall 100', () => {
    assert.equal(cycleShortfallMilli(30000, 20000), 10000);
  });

  it('next cycle request 100 shortfall + 300 installment = 400', () => {
    assert.equal(
      computeCycleRequestMilli({
        payrollOutstandingMilli: 30000,
        carryForwardShortfallMilli: 10000,
      }),
      40000
    );
  });

  it('next cycle request capped at outstanding + carry', () => {
    assert.equal(
      computeCycleRequestMilli({
        payrollOutstandingMilli: 50000,
        carryForwardShortfallMilli: 0,
      }),
      30000
    );
  });

  it('sum carry-forward across ordered cycles', () => {
    const total = sumCarryForwardShortfall([
      { cycleKey: 'w1', requestedMilli: 30000, actualMilli: 20000 },
      { cycleKey: 'w2', requestedMilli: 30000, actualMilli: 30000 },
    ]);
    assert.equal(total, 10000);
  });

  it('security paid → 800 original', () => {
    assert.equal(
      declaredPaidFromStatus({
        status: 'NOT_PAID',
        originalLiabilityMilli: 80000,
      }),
      0
    );
  });

  it('partial declaration validation', () => {
    const ok = validateDeclaredPaid({
      status: 'PARTIALLY_PAID',
      declaredPaidEgp: 400,
      originalLiabilityMilli: 90000,
    });
    assert.equal(ok.ok, true);
    if (ok.ok) assert.equal(ok.paidMilli, 40000);
  });

  it('rider code normalization 0877614 → 877614', () => {
    assert.equal(normalizeRiderCodeForPerformance('0877614'), '877614');
    assert.equal(normalizeRiderCodeForPerformance('877614'), '877614');
  });

  it('capped split helper matches money.ts', () => {
    assert.deepEqual(splitInstallmentsMilliemesCapped(80000), [30000, 30000, 20000]);
  });
});
