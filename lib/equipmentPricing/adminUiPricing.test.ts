import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { APPROVED_ADMIN_EQUIPMENT_PRICING_EGP } from '@/lib/equipmentPricing/approvedDefaults';
import { mergePartialPricingForAdminUiDisplay } from '@/lib/equipmentPricing/loadAdminPricing';
import { validateAndConvertAdminPricingEgp } from '@/lib/equipmentPricing/validate';
import { computeAssignmentLiabilityFields } from '@/lib/equipmentPricing/computeFromPricing';
import { pricingSnapshotFromEgpForTests } from '@/lib/equipmentPricing/loadAdminPricing';
import { isSrs014FinancialApplyEnabled } from '@/lib/srs014Flags';

describe('Admin UI pricing merge + security column readiness', () => {
  it('approved defaults match current business catalog', () => {
    assert.deepEqual(APPROVED_ADMIN_EQUIPMENT_PRICING_EGP, {
      motorcycleBox: 530,
      bicycleBox: 530,
      tshirt: 135,
      jacket: 0,
      helmet: 0,
      securityCheck: 100,
    });
  });

  it('UI merge preserves sheet 530/530/135/0/0 and suggests security 100', () => {
    const merged = mergePartialPricingForAdminUiDisplay({
      motorcycleBox: 530,
      bicycleBox: 530,
      tshirt: 135,
      jacket: 0,
      helmet: 0,
      // securityCheck missing
    });
    assert.equal(merged.needsSecurityColumnSave, true);
    assert.equal(merged.egp.motorcycleBox, 530);
    assert.equal(merged.egp.bicycleBox, 530);
    assert.equal(merged.egp.tshirt, 135);
    assert.equal(merged.egp.jacket, 0);
    assert.equal(merged.egp.helmet, 0);
    assert.equal(merged.egp.securityCheck, 100);
  });

  it('partial sheet without security is INVALID for liability create (fail closed)', () => {
    const v = validateAndConvertAdminPricingEgp({
      motorcycleBox: 530,
      bicycleBox: 530,
      tshirt: 135,
      jacket: 0,
      helmet: 0,
    });
    assert.equal(v.ok, false);
  });

  it('full Admin config enables 800/900 from snapshot', () => {
    const full = {
      motorcycleBox: 530,
      bicycleBox: 530,
      tshirt: 135,
      jacket: 0,
      helmet: 0,
      securityCheck: 100,
    };
    const { snapshot } = pricingSnapshotFromEgpForTests(full);
    const paid = computeAssignmentLiabilityFields({
      snapshot,
      bagType: 'motorcycle',
      securityPaidUpfront: true,
    });
    const unpaid = computeAssignmentLiabilityFields({
      snapshot,
      bagType: 'bicycle',
      securityPaidUpfront: false,
    });
    assert.equal(paid.originalLiabilityMilli, 80000);
    assert.equal(unpaid.originalLiabilityMilli, 90000);
    assert.deepEqual(paid.installmentSchedule, [26667, 26667, 26666]);
    assert.deepEqual(unpaid.installmentSchedule, [30000, 30000, 30000]);
  });

  it('financial apply remains OFF', () => {
    assert.equal(isSrs014FinancialApplyEnabled(), false);
  });
});
