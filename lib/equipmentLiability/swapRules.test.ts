import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { APPROVED_ADMIN_EQUIPMENT_PRICING_EGP } from '@/lib/equipmentPricing/approvedDefaults';
import { pricingSnapshotFromEgpForTests } from '@/lib/equipmentPricing/loadAdminPricing';
import {
  resolveDeliveryEconomicIntent,
  shirtSwapOriginalMilli,
} from '@/lib/equipmentLiability/swapRules';

const pricing = pricingSnapshotFromEgpForTests(APPROVED_ADMIN_EQUIPMENT_PRICING_EGP).snapshot;

describe('SRS-014 swap / assignment economic rules', () => {
  it('assignment creates full liability components from Admin pricing', () => {
    const r = resolveDeliveryEconomicIntent({
      deliveryType: 'تعيين',
      motorcyclePouch: 1,
      tshirtQty: 2,
      pricing,
    });
    assert.equal(r.kind, 'assignment_create_liability');
    assert.equal(r.createsLiability, true);
    assert.equal(r.bagCostMilli, 53000);
    assert.equal(r.shirtCostMilli, 27000);
    assert.equal(r.securityFeeMilli, 10000);
  });

  it('bag swap is FREE — no liability', () => {
    const r = resolveDeliveryEconomicIntent({
      deliveryType: 'تبديل',
      motorcyclePouch: 0,
      bicyclePouch: 1,
      tshirtQty: 0,
      pricing,
    });
    assert.equal(r.kind, 'swap_bag_free_inventory_only');
    assert.equal(r.createsLiability, false);
    assert.equal(r.bagCostMilli, 0);
  });

  it('shirt swap is paid configured shirt unit per shirt', () => {
    const r = resolveDeliveryEconomicIntent({
      deliveryType: 'تبديل',
      tshirtQty: 1,
      pricing,
    });
    assert.equal(r.kind, 'swap_shirt_charge_create_liability');
    assert.equal(r.createsLiability, true);
    assert.equal(r.shirtCostMilli, 13500);
    assert.equal(r.bagCostMilli, 0);
    assert.equal(r.securityFeeMilli, 0);
    assert.equal(shirtSwapOriginalMilli(1, 13500), 13500);
    assert.equal(shirtSwapOriginalMilli(2, 13500), 27000);
  });

  it('admin free shirt swap override — inventory only + auditable flag', () => {
    const r = resolveDeliveryEconomicIntent({
      deliveryType: 'تبديل',
      tshirtQty: 1,
      adminFreeShirtOverride: true,
      pricing,
    });
    assert.equal(r.kind, 'swap_free_shirt_override_inventory_only');
    assert.equal(r.createsLiability, false);
    assert.equal(r.adminFreeShirtOverride, true);
    assert.equal(r.shirtCostMilli, 0);
  });
});
