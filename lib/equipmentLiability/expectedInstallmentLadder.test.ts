/**
 * 4D.5.4.15D — Expected installment ladder regression (READ-ONLY / pure).
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { scheduleFromPersistedOriginalMilli } from '@/lib/equipmentPricing/computeFromPricing';
import { expectedInstallmentMilliemes } from '@/lib/money';
import {
  NORMAL_INSTALLMENT_MILLI,
  simulateExpectedInstallmentLadder,
  totalTheoreticalDeductions,
} from '@/lib/equipmentLiability/expectedInstallmentLadder';
import {
  buildOpeningLiabilityIssue,
  defaultOpeningCatalogFromApprovedDefaults,
} from '@/lib/equipmentLiability/openingBalance';
import {
  isAutoEquipmentDeductionsEnabled,
  isSrs014FinancialApplyEnabled,
} from '@/lib/srs014Flags';

describe('4D.5.4.15D Expected installment ladder', () => {
  it('a. outstanding 500 → 300 → 200 → 0 (4802535 shape)', () => {
    const steps = simulateExpectedInstallmentLadder({
      originalLiabilityMilli: 90000,
      openingOutstandingMilli: 50000,
      amountDeductedMilli: 0,
      installmentsCompleted: 0,
    });
    assert.equal(scheduleFromPersistedOriginalMilli(90000)[0], 30000);
    assert.equal(steps[0].expectedDeductionMilli, 30000);
    assert.equal(steps[0].theoreticalRemainingMilli, 20000);
    assert.equal(steps[1].expectedDeductionMilli, 20000); // MIN(300,200)
    assert.equal(steps[1].theoreticalRemainingMilli, 0);
    assert.equal(steps[2].expectedDeductionMilli, 0);
    assert.equal(totalTheoreticalDeductions(steps), 50000);
  });

  it('b. outstanding exactly 300 → 300 → 0', () => {
    const steps = simulateExpectedInstallmentLadder({
      originalLiabilityMilli: 90000,
      openingOutstandingMilli: 30000,
    });
    assert.equal(steps[0].expectedDeductionMilli, 30000);
    assert.equal(steps[0].theoreticalRemainingMilli, 0);
    assert.equal(steps[1].expectedDeductionMilli, 0);
  });

  it('c. outstanding 200 → 200 → 0', () => {
    const steps = simulateExpectedInstallmentLadder({
      originalLiabilityMilli: 90000,
      openingOutstandingMilli: 20000,
    });
    assert.equal(steps[0].expectedDeductionMilli, 20000);
    assert.equal(steps[0].normalInstallmentMilli, NORMAL_INSTALLMENT_MILLI);
    assert.equal(steps[0].theoreticalRemainingMilli, 0);
  });

  it('d. outstanding 0 → 0', () => {
    const steps = simulateExpectedInstallmentLadder({
      originalLiabilityMilli: 90000,
      openingOutstandingMilli: 0,
    });
    assert.equal(steps[0].expectedDeductionMilli, 0);
    assert.equal(totalTheoreticalDeductions(steps), 0);
  });

  it('e. outstanding less than installment', () => {
    const expected = expectedInstallmentMilliemes({
      remainingMilli: 15000,
      schedule: [30000, 30000, 30000],
      installmentIndex: 0,
      amountDeductedMilli: 0,
    });
    assert.equal(expected, 15000);
  });

  it('f. settlement paid does not become installment progress', () => {
    const catalog = defaultOpeningCatalogFromApprovedDefaults();
    const built = buildOpeningLiabilityIssue(
      {
        riderCode: '4802535',
        motorcycleBagHeld: true,
        bicycleBagHeld: false,
        tshirtQuantity: 2,
        jacketQuantity: 0,
        helmetQuantity: 0,
        securityStatus: 'NOT_PAID',
        historicalPaidMilli: 40000,
        operatorConfirmation: true,
      },
      catalog
    );
    assert.ok(built.ok);
    if (!built.ok) return;
    assert.equal(built.issue.settlementPaidMilli, 40000);
    assert.equal(built.issue.amountDeductedMilli, 0);
    assert.equal(built.issue.installmentsCompleted, 0);
    // Expected uses amountDeducted/index, not settlementPaid
    const steps = simulateExpectedInstallmentLadder({
      originalLiabilityMilli: built.issue.originalLiabilityMilli,
      openingOutstandingMilli: built.issue.outstandingMilli,
      amountDeductedMilli: built.issue.amountDeductedMilli,
      installmentsCompleted: built.issue.installmentsCompleted,
    });
    assert.equal(steps[0].expectedDeductionMilli, 30000);
  });

  it('g. no over-deduction across ladder', () => {
    for (const outstanding of [50000, 30000, 20000, 10000, 0]) {
      const steps = simulateExpectedInstallmentLadder({
        originalLiabilityMilli: 90000,
        openingOutstandingMilli: outstanding,
      });
      assert.ok(totalTheoreticalDeductions(steps) <= outstanding);
    }
  });

  it('h. Admin catalog change does not reprice persisted Opening', () => {
    const catalog = defaultOpeningCatalogFromApprovedDefaults();
    const built = buildOpeningLiabilityIssue(
      {
        riderCode: '4802535',
        motorcycleBagHeld: true,
        bicycleBagHeld: false,
        tshirtQuantity: 2,
        jacketQuantity: 0,
        helmetQuantity: 0,
        securityStatus: 'NOT_PAID',
        historicalPaidMilli: 40000,
        operatorConfirmation: true,
      },
      catalog
    );
    assert.ok(built.ok);
    if (!built.ok) return;
    const frozen = {
      original: built.issue.originalLiabilityMilli,
      settlement: built.issue.settlementPaidMilli,
      outstanding: built.issue.outstandingMilli,
    };
    const futureCatalog = {
      ...catalog,
      motorcycleBagMilli: 999000,
      shirtMilli: 50000,
      securityFeeMilli: 50000,
    };
    const recalced = buildOpeningLiabilityIssue(
      {
        riderCode: '4802535',
        motorcycleBagHeld: true,
        bicycleBagHeld: false,
        tshirtQuantity: 2,
        jacketQuantity: 0,
        helmetQuantity: 0,
        securityStatus: 'NOT_PAID',
        historicalPaidMilli: 40000,
        operatorConfirmation: true,
      },
      futureCatalog
    );
    assert.ok(recalced.ok);
    if (!recalced.ok) return;
    assert.notEqual(recalced.issue.originalLiabilityMilli, frozen.original);
    // Persisted Opening economics stay frozen
    assert.equal(frozen.original, 90000);
    assert.equal(frozen.settlement, 40000);
    assert.equal(frozen.outstanding, 50000);
    const schedule = scheduleFromPersistedOriginalMilli(frozen.original);
    assert.deepEqual(schedule, [30000, 30000, 30000]);
  });

  it('no production mutation / FA OFF / Auto REQUEST OFF', () => {
    assert.equal(isSrs014FinancialApplyEnabled(), false);
    assert.equal(isAutoEquipmentDeductionsEnabled(), false);
  });
});
