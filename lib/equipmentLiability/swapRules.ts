/**
 * SRS-014 — Equipment delivery economic intent (assignment vs swap).
 *
 * CALCULATION / LIABILITY INTENT ONLY.
 * Does not mutate wallets, ledger_native, or financial-apply intents.
 *
 * Rules:
 * - Assignment (تعيين): full SRS liability — amounts from Admin price snapshot when provided.
 * - Bag swap (تبديل): bag is FREE — no bag charge.
 * - Shirt swap: configured shirt unit (Admin) per shirt unless admin free override (auditable).
 * - Security is NOT re-charged on swap (already settled at assignment).
 *
 * NOTE: money.ts constants are NOT a runtime price authority. Prefer passing `pricing`.
 */

import type { EquipmentPriceSnapshot } from '@/lib/equipmentPricing/types';

/** @deprecated Fixture only — runtime shirt unit comes from Admin snapshot. */
export const SHIRT_UNIT_COST_MILLI = 13500;

export type DeliveryTypeAr = 'تعيين' | 'تبديل';

export type DeliveryEconomicKind =
  | 'assignment_create_liability'
  | 'swap_bag_free_inventory_only'
  | 'swap_shirt_charge_create_liability'
  | 'swap_free_shirt_override_inventory_only'
  | 'swap_noop';

export type DeliveryEconomicIntent = {
  kind: DeliveryEconomicKind;
  deliveryType: DeliveryTypeAr;
  /** True ⇒ approve path should call liability create / shirt-swap create. */
  createsLiability: boolean;
  bagCostMilli: number;
  shirtQty: number;
  shirtCostMilli: number;
  securityFeeMilli: number;
  /** Security included in original (assignment only). */
  includeSecurityInLiability: boolean;
  adminFreeShirtOverride: boolean;
  /** Human-readable reason for audits / UI. */
  reason: string;
};

export function normalizeDeliveryType(raw: unknown): DeliveryTypeAr | null {
  const s = String(raw || '').trim();
  if (s === 'تعيين' || s === 'تبديل') return s;
  return null;
}

/**
 * Resolve economic effect of a delivery row before inventory / liability mutation.
 */
export function resolveDeliveryEconomicIntent(input: {
  deliveryType: unknown;
  motorcyclePouch?: number;
  bicyclePouch?: number;
  tshirtQty?: number;
  /** Admin-approved free shirt swap exception. */
  adminFreeShirtOverride?: boolean;
  /** When provided, amount fields reflect Admin snapshot (not money.ts). */
  pricing?: Pick<
    EquipmentPriceSnapshot,
    'motorcycleBagMilli' | 'bicycleBagMilli' | 'shirtMilli' | 'securityFeeMilli'
  >;
}): DeliveryEconomicIntent {
  const deliveryType = normalizeDeliveryType(input.deliveryType);
  const moto = Math.max(0, Math.trunc(Number(input.motorcyclePouch) || 0));
  const bike = Math.max(0, Math.trunc(Number(input.bicyclePouch) || 0));
  const shirts = Math.max(0, Math.trunc(Number(input.tshirtQty) || 0));
  const freeShirt = Boolean(input.adminFreeShirtOverride);
  const hasBag = moto + bike > 0;
  const shirtUnit = input.pricing?.shirtMilli;
  const bagMilli =
    input.pricing != null
      ? moto > 0
        ? input.pricing.motorcycleBagMilli
        : input.pricing.bicycleBagMilli
      : 0;
  const twoShirtsMilli =
    shirtUnit != null ? 2 * shirtUnit : 0;
  const securityMilli = input.pricing?.securityFeeMilli ?? 0;

  if (!deliveryType) {
    return {
      kind: 'swap_noop',
      deliveryType: 'تعيين',
      createsLiability: false,
      bagCostMilli: 0,
      shirtQty: 0,
      shirtCostMilli: 0,
      securityFeeMilli: 0,
      includeSecurityInLiability: false,
      adminFreeShirtOverride: freeShirt,
      reason: 'invalid_delivery_type',
    };
  }

  if (deliveryType === 'تعيين') {
    return {
      kind: 'assignment_create_liability',
      deliveryType,
      createsLiability: true,
      bagCostMilli: bagMilli,
      shirtQty: 2,
      shirtCostMilli: twoShirtsMilli,
      securityFeeMilli: securityMilli,
      includeSecurityInLiability: true,
      adminFreeShirtOverride: false,
      reason: 'assignment_full_liability',
    };
  }

  // تبديل
  if (shirts > 0 && freeShirt && !hasBag) {
    return {
      kind: 'swap_free_shirt_override_inventory_only',
      deliveryType,
      createsLiability: false,
      bagCostMilli: 0,
      shirtQty: shirts,
      shirtCostMilli: 0,
      securityFeeMilli: 0,
      includeSecurityInLiability: false,
      adminFreeShirtOverride: true,
      reason: 'admin_free_shirt_swap',
    };
  }

  if (shirts > 0 && !freeShirt) {
    return {
      kind: 'swap_shirt_charge_create_liability',
      deliveryType,
      createsLiability: true,
      bagCostMilli: 0,
      shirtQty: shirts,
      shirtCostMilli: shirts * (shirtUnit ?? 0),
      securityFeeMilli: 0,
      includeSecurityInLiability: false,
      adminFreeShirtOverride: false,
      reason: 'paid_shirt_swap',
    };
  }

  if (hasBag) {
    return {
      kind: 'swap_bag_free_inventory_only',
      deliveryType,
      createsLiability: false,
      bagCostMilli: 0,
      shirtQty: 0,
      shirtCostMilli: 0,
      securityFeeMilli: 0,
      includeSecurityInLiability: false,
      adminFreeShirtOverride: freeShirt,
      reason: 'free_bag_swap',
    };
  }

  return {
    kind: 'swap_noop',
    deliveryType,
    createsLiability: false,
    bagCostMilli: 0,
    shirtQty: 0,
    shirtCostMilli: 0,
    securityFeeMilli: 0,
    includeSecurityInLiability: false,
    adminFreeShirtOverride: freeShirt,
    reason: 'swap_no_billable_items',
  };
}

/** Pure original liability for shirt-only swap (no security, no bag). */
export function shirtSwapOriginalMilli(shirtQty: number, shirtUnitMilli: number): number {
  const q = Math.max(0, Math.trunc(shirtQty));
  const unit = Math.max(0, Math.trunc(shirtUnitMilli));
  return q * unit;
}
