import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { BAG_COST_MILLI, SECURITY_FEE_MILLI, TWO_TSHIRTS_COST_MILLI } from '@/lib/money';
import { computeLiabilityFields } from '@/lib/equipmentLiability/store';

describe('equipment liability amounts', () => {
  it('bag cost is always 53000 milliemes', () => {
    const paid = computeLiabilityFields({ securityPaidUpfront: true, bagType: 'motorcycle' });
    const unpaid = computeLiabilityFields({ securityPaidUpfront: false, bagType: 'bicycle' });
    assert.equal(paid.bagCostMilli, BAG_COST_MILLI);
    assert.equal(unpaid.bagCostMilli, BAG_COST_MILLI);
    assert.equal(BAG_COST_MILLI, 53000);
  });

  it('800 liability when security paid upfront', () => {
    const fields = computeLiabilityFields({ securityPaidUpfront: true, bagType: 'motorcycle' });
    assert.equal(fields.originalLiabilityMilli, 80000);
    assert.equal(fields.outstandingMilli, 80000);
    assert.equal(fields.securityFeeMilli, SECURITY_FEE_MILLI);
    assert.equal(fields.shirtCostMilli, TWO_TSHIRTS_COST_MILLI);
    assert.deepEqual(fields.installmentSchedule, [26667, 26667, 26666]);
  });

  it('900 liability when security not paid upfront', () => {
    const fields = computeLiabilityFields({ securityPaidUpfront: false, bagType: 'bicycle' });
    assert.equal(fields.originalLiabilityMilli, 90000);
    assert.equal(fields.outstandingMilli, 90000);
    assert.deepEqual(fields.installmentSchedule, [30000, 30000, 30000]);
  });

  it('jacket/helmet custody flags do not affect money', () => {
    const withCustody = computeLiabilityFields({
      securityPaidUpfront: false,
      bagType: 'motorcycle',
      jacketHeld: true,
      helmetHeld: true,
    });
    const without = computeLiabilityFields({
      securityPaidUpfront: false,
      bagType: 'motorcycle',
      jacketHeld: false,
      helmetHeld: false,
    });
    assert.equal(withCustody.originalLiabilityMilli, without.originalLiabilityMilli);
    assert.equal(withCustody.jacketHeld, true);
    assert.equal(withCustody.helmetHeld, true);
  });
});
