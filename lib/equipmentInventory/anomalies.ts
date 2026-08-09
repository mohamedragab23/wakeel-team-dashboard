/**
 * SRS-014 Phase G — inventory anomaly helpers (non-breaking).
 * Runs only when FEATURE_EQUIPMENT_INVENTORY_V2_ENABLED is true.
 */

export type InventoryCounters = {
  motorcyclePouch: number;
  bicyclePouch: number;
  tshirt: number;
  jacket: number;
  helmet: number;
};

export type InventoryAnomaly = {
  code: string;
  severity: 'warn' | 'error';
  message: string;
  field?: keyof InventoryCounters;
};

export function detectInventoryAnomalies(counters: InventoryCounters): InventoryAnomaly[] {
  const out: InventoryAnomaly[] = [];
  (Object.keys(counters) as (keyof InventoryCounters)[]).forEach((field) => {
    const v = Number(counters[field]);
    if (!Number.isFinite(v)) {
      out.push({ code: 'non_numeric', severity: 'error', message: `${field} is not numeric`, field });
      return;
    }
    if (v < 0) {
      out.push({ code: 'negative_stock', severity: 'error', message: `${field} is negative (${v})`, field });
    }
    if (v === 0) {
      out.push({ code: 'zero_stock', severity: 'warn', message: `${field} is zero`, field });
    }
  });
  return out;
}
