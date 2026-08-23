import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { APPROVED_ADMIN_EQUIPMENT_PRICING_EGP } from '@/lib/equipmentPricing/approvedDefaults';
import {
  computeAssignmentLiabilityFields,
  scheduleFromPersistedOriginalMilli,
} from '@/lib/equipmentPricing/computeFromPricing';
import { pricingSnapshotFromEgpForTests } from '@/lib/equipmentPricing/loadAdminPricing';
import { validateAndConvertAdminPricingEgp } from '@/lib/equipmentPricing/validate';
import { computeLiabilityFields } from '@/lib/equipmentLiability/store';
import { buildExpectedDeductionSnapshot } from '@/lib/equipmentDeductions/expectedSnapshot';
import { allocateActualToObligations } from '@/lib/equipmentDeductions/allocate';
import { isSrs014FinancialApplyEnabled } from '@/lib/srs014Flags';
import { splitInstallmentsMilliemes } from '@/lib/money';
import type { DeductionObligation } from '@/lib/equipmentDeductions/obligations';

const APPROVED = APPROVED_ADMIN_EQUIPMENT_PRICING_EGP;

function snap(egp = APPROVED, at = '2026-08-01T00:00:00.000Z') {
  return pricingSnapshotFromEgpForTests(egp, at).snapshot;
}

describe('4D.5.4.2 equipment pricing SoT + immutable snapshot', () => {
  it('Test1: Admin 530/135/100 security paid → 800', () => {
    const fields = computeAssignmentLiabilityFields({
      snapshot: snap(),
      bagType: 'motorcycle',
      securityPaidUpfront: true,
    });
    assert.equal(fields.originalLiabilityMilli, 80000);
    assert.equal(fields.bagCostMilli, 53000);
    assert.equal(fields.shirtCostMilli, 27000);
  });

  it('Test2: security unpaid → 900', () => {
    const fields = computeAssignmentLiabilityFields({
      snapshot: snap(),
      bagType: 'bicycle',
      securityPaidUpfront: false,
    });
    assert.equal(fields.originalLiabilityMilli, 90000);
  });

  it('Test3: 800 installments 300+300+200 (300 EGP cap)', () => {
    assert.deepEqual(splitInstallmentsMilliemes(80000, 3), [30000, 30000, 20000]);
  });

  it('Test4: 900 installments 300×3', () => {
    assert.deepEqual(splitInstallmentsMilliemes(90000, 3), [30000, 30000, 30000]);
  });

  it('Test5+7: Admin price change does not alter existing liability amounts', () => {
    const created = computeLiabilityFields({
      securityPaidUpfront: true,
      bagType: 'motorcycle',
      pricing: snap(APPROVED, '2026-08-01T00:00:00.000Z'),
    });
    const laterAdmin = { ...APPROVED, motorcycleBox: 550, bicycleBox: 550, tshirt: 140 };
    const newSnap = snap(laterAdmin, '2026-09-01T00:00:00.000Z');
    // Existing persisted amounts stay at creation values
    assert.equal(created.originalLiabilityMilli, 80000);
    assert.equal(created.bagCostMilli, 53000);
    assert.equal(created.shirtCostMilli, 27000);
    assert.notEqual(created.priceSnapshot.motorcycleBagMilli, newSnap.motorcycleBagMilli);
    assert.equal(created.priceSnapshot.motorcycleBagMilli, 53000);
  });

  it('Test6: new liability after Admin change uses new prices', () => {
    const later = snap(
      { ...APPROVED, motorcycleBox: 550, bicycleBox: 550, tshirt: 140, securityCheck: 100 },
      '2026-09-01T00:00:00.000Z'
    );
    const fields = computeAssignmentLiabilityFields({
      snapshot: later,
      bagType: 'motorcycle',
      securityPaidUpfront: true,
    });
    assert.equal(fields.bagCostMilli, 55000);
    assert.equal(fields.shirtCostMilli, 28000);
    assert.equal(fields.originalLiabilityMilli, 83000);
  });

  it('Test8: motorcycle and bicycle use their configured bag fields', () => {
    const asymmetric = snap({
      ...APPROVED,
      motorcycleBox: 530,
      bicycleBox: 600,
    });
    const moto = computeAssignmentLiabilityFields({
      snapshot: asymmetric,
      bagType: 'motorcycle',
      securityPaidUpfront: true,
    });
    const bike = computeAssignmentLiabilityFields({
      snapshot: asymmetric,
      bagType: 'bicycle',
      securityPaidUpfront: true,
    });
    assert.equal(moto.bagCostMilli, 53000);
    assert.equal(bike.bagCostMilli, 60000);
  });

  it('Test9+10: security paid=0 in total; unpaid=configured', () => {
    const paid = computeAssignmentLiabilityFields({
      snapshot: snap(),
      bagType: 'motorcycle',
      securityPaidUpfront: true,
    });
    const unpaid = computeAssignmentLiabilityFields({
      snapshot: snap(),
      bagType: 'motorcycle',
      securityPaidUpfront: false,
    });
    assert.equal(paid.securityFeeMilli, 10000);
    assert.equal(paid.originalLiabilityMilli, paid.bagCostMilli + paid.shirtCostMilli);
    assert.equal(
      unpaid.originalLiabilityMilli,
      unpaid.bagCostMilli + unpaid.shirtCostMilli + unpaid.securityFeeMilli
    );
  });

  it('Test11: invalid Admin prices fail validation', () => {
    assert.equal(validateAndConvertAdminPricingEgp({ ...APPROVED, motorcycleBox: -1 }).ok, false);
    assert.equal(
      validateAndConvertAdminPricingEgp({ ...APPROVED, tshirt: Number.NaN }).ok,
      false
    );
    assert.equal(validateAndConvertAdminPricingEgp({ motorcycleBox: 530 }).ok, false);
  });

  it('Test12: missing pricing is not silently 550', () => {
    const missing = validateAndConvertAdminPricingEgp(null);
    assert.equal(missing.ok, false);
    if (!missing.ok) assert.equal(missing.error, 'PRICING_MISSING');
  });

  it('Test13: legacy persisted original uses 300 EGP capped schedule', () => {
    const schedule = scheduleFromPersistedOriginalMilli(80000);
    assert.deepEqual(schedule, [30000, 30000, 20000]);
  });

  it('Test14: snapshot object is distinct from later Admin config', () => {
    const s1 = snap(APPROVED, 't1');
    const s2 = snap({ ...APPROVED, motorcycleBox: 600 }, 't2');
    assert.equal(s1.motorcycleBagMilli, 53000);
    assert.equal(s2.motorcycleBagMilli, 60000);
    assert.notEqual(s1.capturedAt, s2.capturedAt);
  });

  it('Test15: Expected Snapshot uses historical original not live catalog', () => {
    const cycle = {
      cycleId: '2026-08-C2',
      year: 2026,
      month: 8,
      cycleNumber: 2,
      startDate: '2026-08-10',
      endDate: '2026-08-16',
      status: 'open' as const,
      isClosing: false,
      equipmentDeductionEnabled: true,
      paydayDate: '2026-08-17',
    };
    const snapExpected = buildExpectedDeductionSnapshot({
      asOfDate: '2026-08-12',
      cycle,
      allCycles: [cycle],
      openIssues: [
        {
          equipmentIssueId: 'e1',
          riderCode: 'R1',
          activationDate: '2026-08-01',
          originalLiabilityMilli: 80000,
          outstandingMilli: 80000,
          amountDeductedMilli: 0,
          installmentsCompleted: 0,
          securityPaidUpfront: true,
          status: 'open',
          bagCostMilli: 53000,
          shirtCostMilli: 27000,
          securityFeeMilli: 10000,
        },
      ],
    });
    assert.equal(snapExpected.lines[0]?.expectedDeductionMilli, 30000);
    assert.equal(snapExpected.financialMutation, false);
  });

  it('Test16: schedule from persisted original preserves historical total', () => {
    assert.deepEqual(scheduleFromPersistedOriginalMilli(83000).reduce((a, b) => a + b, 0), 83000);
  });

  it('Test17: Allocation does not re-price liability', () => {
    const obligations: DeductionObligation[] = [
      {
        deductionId: 'd1',
        source: 'auto_equipment',
        riderCode: 'R1',
        reason: 'معدات',
        originalCycleId: '2026-08-C2',
        currentCycleId: '2026-08-C2',
        originalAmount: 30000,
        paidAmount: 0,
        remainingAmount: 30000,
        status: 'open',
        obligationAgeKey: '2026-08-10|d1',
        equipmentIssueId: 'e1',
        installmentNumber: 1,
      },
    ];
    const r = allocateActualToObligations({ actualTotalMilli: 30000, obligations });
    assert.equal(r.allocatedTotalMilli, 30000);
    assert.equal(r.lines[0]?.allocatedAmount, 30000);
  });

  it('Test18: Financial Apply remains OFF / unreachable via flag', () => {
    assert.equal(isSrs014FinancialApplyEnabled(), false);
    const storeSrc = readFileSync(join(process.cwd(), 'lib/equipmentLiability/store.ts'), 'utf8');
    assert.ok(!/isSrs014FinancialApplyEnabled/.test(storeSrc));
    assert.ok(/requireAdminEquipmentPricingForLiability/.test(storeSrc));
  });

  it('computeLiabilityFields requires Admin snapshot (not money.ts)', () => {
    const fields = computeLiabilityFields({
      securityPaidUpfront: false,
      bagType: 'motorcycle',
      pricing: snap(),
    });
    assert.equal(fields.originalLiabilityMilli, 90000);
    assert.equal(fields.priceSnapshot.source, 'ADMIN_EQUIPMENT_PRICES');
  });
});
