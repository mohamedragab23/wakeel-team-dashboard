/**
 * Compute per-rider historical baselines from a lookback performance window.
 * Used to replace fleet-average expected hours with rider-specific expected hours.
 */
import { normalizeRiderCodeForPerformance } from '@/lib/dataFilter';
import type { RiderHistoricalBaseline } from './types';

type PerfRow = { date: string; riderCode: string; hours: number; orders: number };

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

const LOOKBACK_DAYS = 30;
const MIN_ACTIVE_DAYS = 3; // minimum history to trust a rider baseline

/**
 * Build per-rider historical baselines from lookback performance data.
 * Lookback = performance rows BEFORE the current report period (e.g., 30 days prior).
 */
export function buildRiderHistoricalBaselines(
  lookbackPerformance: PerfRow[],
  lookbackWindowDays: number = LOOKBACK_DAYS
): Map<string, RiderHistoricalBaseline> {
  const byRider = new Map<string, { dates: Set<string>; totalHours: number; totalOrders: number }>();

  for (const row of lookbackPerformance) {
    const code = normalizeRiderCodeForPerformance(row.riderCode);
    if (!code) continue;
    const existing = byRider.get(code) ?? { dates: new Set(), totalHours: 0, totalOrders: 0 };
    existing.dates.add(row.date);
    existing.totalHours += row.hours;
    existing.totalOrders += row.orders;
    byRider.set(code, existing);
  }

  const baselines = new Map<string, RiderHistoricalBaseline>();
  const denom = Math.max(1, lookbackWindowDays);

  for (const [riderCode, data] of byRider) {
    const activeDays = data.dates.size;
    const avgHoursDaily = round2(data.totalHours / denom);
    const avgOrdersDaily = round2(data.totalOrders / denom);

    baselines.set(riderCode, {
      riderCode,
      avgHoursDaily,
      avgOrdersDaily,
      activeDays,
      lookbackDays: lookbackWindowDays,
      hasHistory: activeDays >= MIN_ACTIVE_DAYS,
    });
  }

  return baselines;
}

/**
 * Resolve expected hours for a specific rider.
 * Returns { hours, orders, source } — source indicates whether rider history or fleet avg was used.
 */
export function resolveRiderExpected(
  riderCode: string,
  baselines: Map<string, RiderHistoricalBaseline>,
  fleetAvgHours: number,
  fleetAvgOrders: number
): { hours: number; orders: number; source: 'rider_history' | 'fleet_average' } {
  const norm = normalizeRiderCodeForPerformance(riderCode);
  const baseline = norm ? baselines.get(norm) : undefined;

  if (baseline?.hasHistory && baseline.avgHoursDaily > 0) {
    return {
      hours: baseline.avgHoursDaily,
      orders: baseline.avgOrdersDaily,
      source: 'rider_history',
    };
  }

  return {
    hours: fleetAvgHours > 0 ? fleetAvgHours : 0,
    orders: fleetAvgOrders > 0 ? fleetAvgOrders : 0,
    source: 'fleet_average',
  };
}
