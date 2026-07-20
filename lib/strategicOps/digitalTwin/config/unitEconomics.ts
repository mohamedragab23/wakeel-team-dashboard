/**
 * Configurable unit economics for Digital Twin financial impact.
 * Override via env — never hardcode city-specific assumptions in engines.
 */

export type UnitEconomicsConfig = {
  revenuePerOrder: number;
  costPerActiveRiderDay: number;
  hiringCostPerRider: number;
  trainingCostPerRider: number;
  equipmentCostPerRider: number;
  currency: string;
  source: 'env' | 'default';
};

function envNum(key: string, fallback: number): number {
  const raw = process.env[key];
  if (raw == null || raw.trim() === '') return fallback;
  const n = Number(raw);
  return Number.isFinite(n) && n >= 0 ? n : fallback;
}

/** Server-side defaults (safe for API). Client uses values embedded in twin snapshot. */
export function getUnitEconomicsConfig(): UnitEconomicsConfig {
  const fromEnv =
    process.env.DT_REVENUE_PER_ORDER != null ||
    process.env.DT_COST_PER_ACTIVE_RIDER_DAY != null ||
    process.env.DT_HIRING_COST_PER_RIDER != null;

  return {
    revenuePerOrder: envNum('DT_REVENUE_PER_ORDER', 18),
    costPerActiveRiderDay: envNum('DT_COST_PER_ACTIVE_RIDER_DAY', 120),
    hiringCostPerRider: envNum('DT_HIRING_COST_PER_RIDER', 1500),
    trainingCostPerRider: envNum('DT_TRAINING_COST_PER_RIDER', 500),
    equipmentCostPerRider: envNum('DT_EQUIPMENT_COST_PER_RIDER', 800),
    currency: process.env.DT_CURRENCY?.trim() || 'EGP',
    source: fromEnv ? 'env' : 'default',
  };
}

export function totalHireInvestment(economics: UnitEconomicsConfig, riders: number): number {
  const n = Math.max(0, riders);
  return (
    n *
    (economics.hiringCostPerRider +
      economics.trainingCostPerRider +
      economics.equipmentCostPerRider)
  );
}
