import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { APPROVED_ADMIN_EQUIPMENT_PRICING_EGP } from '@/lib/equipmentPricing/approvedDefaults';
import { pricingSnapshotFromEgpForTests } from '@/lib/equipmentPricing/loadAdminPricing';
import { computeLiabilityFields } from '@/lib/equipmentLiability/store';

const pricing = pricingSnapshotFromEgpForTests(APPROVED_ADMIN_EQUIPMENT_PRICING_EGP).snapshot;

describe('equipment liability fields (Admin price snapshot)', () => {
  it('bag cost comes from Admin snapshot for motorcycle and bicycle', () => {
    const paid = computeLiabilityFields({
      securityPaidUpfront: true,
      bagType: 'motorcycle',
      pricing,
    });
    const unpaid = computeLiabilityFields({
      securityPaidUpfront: false,
      bagType: 'bicycle',
      pricing,
    });
    assert.equal(paid.bagCostMilli, 53000);
    assert.equal(unpaid.bagCostMilli, 53000);
  });

  it('shirts and security from Admin snapshot', () => {
    const fields = computeLiabilityFields({
      securityPaidUpfront: true,
      bagType: 'motorcycle',
      pricing,
    });
    assert.equal(fields.securityFeeMilli, 10000);
    assert.equal(fields.shirtCostMilli, 27000);
    assert.equal(fields.originalLiabilityMilli, 80000);
  });

  it('unpaid security yields 900', () => {
    const fields = computeLiabilityFields({
      securityPaidUpfront: false,
      bagType: 'bicycle',
      pricing,
    });
    assert.equal(fields.originalLiabilityMilli, 90000);
  });

  it('custody flags do not change money', () => {
    const withCustody = computeLiabilityFields({
      securityPaidUpfront: true,
      bagType: 'motorcycle',
      jacketHeld: true,
      helmetHeld: true,
      pricing,
    });
    const without = computeLiabilityFields({
      securityPaidUpfront: true,
      bagType: 'motorcycle',
      pricing,
    });
    assert.equal(withCustody.originalLiabilityMilli, without.originalLiabilityMilli);
    assert.equal(withCustody.jacketHeld, true);
    assert.equal(withCustody.helmetHeld, true);
  });
});
