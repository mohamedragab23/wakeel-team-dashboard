/**
 * SRS-014 Phase 4D.5.4.2 — Admin equipment pricing types (milliemes).
 * Runtime SoT = Admin sheet أسعار_المعدات (via loader). Not money.ts.
 */

export const ADMIN_EQUIPMENT_PRICING_SHEET = 'أسعار_المعدات';

/** Pricing source label persisted on liability rows. */
export type EquipmentPricingSource =
  | 'ADMIN_EQUIPMENT_PRICES'
  | 'LEGACY_NO_SNAPSHOT'
  /** FLOW A — one-time Equipment Reconciliation / Opening Balance. */
  | 'OPENING_MIGRATION';

/**
 * Authoritative configured prices in milliemes (1 EGP = 100 milli).
 * Motorcycle and bicycle remain separate fields (ops distinct) even when equal.
 */
export type EquipmentPricingMilli = {
  motorcycleBagMilli: number;
  bicycleBagMilli: number;
  /** Unit price per shirt. */
  shirtMilli: number;
  securityFeeMilli: number;
  /** Salary-domain / custody catalog (not part of rider 800/900). */
  jacketMilli: number;
  helmetMilli: number;
};

/** Immutable snapshot captured at liability / economic commitment creation. */
export type EquipmentPriceSnapshot = {
  source: EquipmentPricingSource;
  capturedAt: string;
  motorcycleBagMilli: number;
  bicycleBagMilli: number;
  shirtMilli: number;
  securityFeeMilli: number;
  jacketMilli?: number;
  helmetMilli?: number;
};

/** Admin sheet / API shape in EGP (human-facing). */
export type AdminEquipmentPricingEgp = {
  motorcycleBox: number;
  bicycleBox: number;
  tshirt: number;
  jacket: number;
  helmet: number;
  /** Security check fee (EGP). Required for rider liability SoT. */
  securityCheck: number;
};
