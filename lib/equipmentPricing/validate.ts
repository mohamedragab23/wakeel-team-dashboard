import { egpToMilliemes } from '@/lib/money';
import type {
  AdminEquipmentPricingEgp,
  EquipmentPricingMilli,
  EquipmentPriceSnapshot,
} from '@/lib/equipmentPricing/types';

function isNonNegFiniteInt(n: unknown): n is number {
  return typeof n === 'number' && Number.isFinite(n) && Number.isInteger(n) && n >= 0;
}

function egpFieldToMilli(egp: unknown): number | null {
  if (typeof egp !== 'number' || !Number.isFinite(egp) || Number.isNaN(egp) || egp < 0) {
    return null;
  }
  // Reject non-representable fractional millieme after ×100 (allow .00 / .5 → 50 milli).
  const milli = egpToMilliemes(egp);
  if (!Number.isFinite(milli) || milli < 0 || !Number.isInteger(milli)) return null;
  return milli;
}

export type PricingValidationError =
  | 'PRICING_MISSING'
  | 'PRICING_INVALID'
  | 'PRICING_NEGATIVE'
  | 'PRICING_NAN';

/**
 * Validate Admin EGP pricing and convert to milliemes.
 * Fail closed — no silent legacy substitution.
 */
export function validateAndConvertAdminPricingEgp(
  raw: Partial<AdminEquipmentPricingEgp> | null | undefined
):
  | { ok: true; pricing: EquipmentPricingMilli; egp: AdminEquipmentPricingEgp }
  | { ok: false; error: PricingValidationError; detail: string } {
  if (!raw || typeof raw !== 'object') {
    return { ok: false, error: 'PRICING_MISSING', detail: 'Admin equipment pricing missing' };
  }

  const keys: (keyof AdminEquipmentPricingEgp)[] = [
    'motorcycleBox',
    'bicycleBox',
    'tshirt',
    'jacket',
    'helmet',
    'securityCheck',
  ];

  for (const k of keys) {
    const v = raw[k];
    if (v === undefined || v === null) {
      return { ok: false, error: 'PRICING_MISSING', detail: `missing field ${k}` };
    }
    if (typeof v === 'number' && Number.isNaN(v)) {
      return { ok: false, error: 'PRICING_NAN', detail: `NaN field ${k}` };
    }
    if (typeof v !== 'number' || !Number.isFinite(v)) {
      return { ok: false, error: 'PRICING_INVALID', detail: `invalid field ${k}` };
    }
    if (v < 0) {
      return { ok: false, error: 'PRICING_NEGATIVE', detail: `negative field ${k}` };
    }
  }

  const motorcycleBagMilli = egpFieldToMilli(raw.motorcycleBox);
  const bicycleBagMilli = egpFieldToMilli(raw.bicycleBox);
  const shirtMilli = egpFieldToMilli(raw.tshirt);
  const jacketMilli = egpFieldToMilli(raw.jacket);
  const helmetMilli = egpFieldToMilli(raw.helmet);
  const securityFeeMilli = egpFieldToMilli(raw.securityCheck);

  if (
    motorcycleBagMilli == null ||
    bicycleBagMilli == null ||
    shirtMilli == null ||
    jacketMilli == null ||
    helmetMilli == null ||
    securityFeeMilli == null
  ) {
    return { ok: false, error: 'PRICING_INVALID', detail: 'egp→milli conversion failed' };
  }

  const egp: AdminEquipmentPricingEgp = {
    motorcycleBox: raw.motorcycleBox as number,
    bicycleBox: raw.bicycleBox as number,
    tshirt: raw.tshirt as number,
    jacket: raw.jacket as number,
    helmet: raw.helmet as number,
    securityCheck: raw.securityCheck as number,
  };

  return {
    ok: true,
    egp,
    pricing: {
      motorcycleBagMilli,
      bicycleBagMilli,
      shirtMilli,
      jacketMilli,
      helmetMilli,
      securityFeeMilli,
    },
  };
}

export function snapshotFromPricingMilli(
  pricing: EquipmentPricingMilli,
  capturedAt = new Date().toISOString()
): EquipmentPriceSnapshot {
  return {
    source: 'ADMIN_EQUIPMENT_PRICES',
    capturedAt,
    motorcycleBagMilli: pricing.motorcycleBagMilli,
    bicycleBagMilli: pricing.bicycleBagMilli,
    shirtMilli: pricing.shirtMilli,
    securityFeeMilli: pricing.securityFeeMilli,
  };
}

export function assertSnapshotImmutableShape(s: EquipmentPriceSnapshot): boolean {
  return (
    (s.source === 'ADMIN_EQUIPMENT_PRICES' ||
      s.source === 'OPENING_MIGRATION' ||
      s.source === 'LEGACY_NO_SNAPSHOT') &&
    typeof s.capturedAt === 'string' &&
    s.capturedAt.length > 0 &&
    isNonNegFiniteInt(s.motorcycleBagMilli) &&
    isNonNegFiniteInt(s.bicycleBagMilli) &&
    isNonNegFiniteInt(s.shirtMilli) &&
    isNonNegFiniteInt(s.securityFeeMilli)
  );
}
