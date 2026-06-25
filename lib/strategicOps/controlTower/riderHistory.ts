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
/**
 * Minimum active days in lookback window to trust a rider's own baseline.
 * Set to 2 (was 3) — a rider with 2 recorded days still beats fleet average.
 */
const MIN_ACTIVE_DAYS = 2;

/**
 * Build per-rider historical baselines from lookback performance data.
 *
 * Lookback window MUST be the 30 days BEFORE the report period start date:
 *   lookbackStart = reportStartDate - 30 days
 *   lookbackEnd   = reportStartDate - 1 day
 *
 * This ensures zero overlap with the current report period, which would
 * contaminate the baseline with current-period data.
 */
export function buildRiderHistoricalBaselines(
  lookbackPerformance: PerfRow[],
  lookbackWindowDays: number = LOOKBACK_DAYS
): Map<string, RiderHistoricalBaseline> {
  const byRider = new Map<string, { dates: Set<string>; totalHours: number; totalOrders: number }>();

  for (const row of lookbackPerformance) {
    // Only count rows where the rider actually worked (hours > 0) for active-day counting,
    // but include all rows for average calculation so no-shows lower the average correctly.
    const code = normalizeRiderCodeForPerformance(row.riderCode);
    if (!code) continue;
    const existing = byRider.get(code) ?? { dates: new Set(), totalHours: 0, totalOrders: 0 };
    if (row.hours > 0) {
      // Only active days count toward the minimum threshold
      existing.dates.add(row.date);
    }
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

    let baselineSource: RiderHistoricalBaseline['baselineSource'];
    if (activeDays >= 5) {
      baselineSource = 'historical_30d';
    } else if (activeDays >= MIN_ACTIVE_DAYS) {
      baselineSource = 'historical_partial';
    } else {
      baselineSource = 'fleet_average';
    }

    const hasHistory = activeDays >= MIN_ACTIVE_DAYS && avgHoursDaily > 0;

    baselines.set(riderCode, {
      riderCode,
      avgHoursDaily,
      avgOrdersDaily,
      activeDays,
      lookbackDays: lookbackWindowDays,
      hasHistory,
      baselineSource: hasHistory ? baselineSource : 'fleet_average',
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
): { hours: number; orders: number; source: RiderHistoricalBaseline['baselineSource'] } {
  const norm = normalizeRiderCodeForPerformance(riderCode);
  const baseline = norm ? baselines.get(norm) : undefined;

  if (baseline?.hasHistory && baseline.avgHoursDaily > 0) {
    return {
      hours: baseline.avgHoursDaily,
      orders: baseline.avgOrdersDaily,
      source: baseline.baselineSource,
    };
  }

  return {
    hours: fleetAvgHours > 0 ? fleetAvgHours : 0,
    orders: fleetAvgOrders > 0 ? fleetAvgOrders : 0,
    source: 'fleet_average',
  };
}

/**
 * Summarize baseline source coverage for the CURRENT roster riders only.
 *
 * Previously this counted Map entries (historical lookback codes), which included
 * former employees and produced totals larger than the actual headcount.
 *
 * Now iterates ctx.riders and resolves each rider's actual baseline source,
 * so: total === ctx.riders.length === current headcount.
 */
export function summarizeBaselineSources(
  baselines: Map<string, RiderHistoricalBaseline>,
  currentRiders: Array<{ code: string }>,
  fleetAvgHours: number
): {
  historical30d: number;
  historicalPartial: number;
  fleetAverage: number;
  total: number;
  historicalPct: number;
  fleetAvgPct: number;
  qualityWarning: boolean;
} {
  let historical30d = 0;
  let historicalPartial = 0;
  let fleetAverage = 0;

  for (const rider of currentRiders) {
    const { source } = resolveRiderExpected(rider.code, baselines, fleetAvgHours, 0);
    if (source === 'historical_30d') historical30d++;
    else if (source === 'historical_partial') historicalPartial++;
    else fleetAverage++;
  }

  const total = historical30d + historicalPartial + fleetAverage;
  const historicalPct = total > 0 ? Math.round(((historical30d + historicalPartial) / total) * 100) : 0;
  const fleetAvgPct = total > 0 ? Math.round((fleetAverage / total) * 100) : 0;

  return {
    historical30d,
    historicalPartial,
    fleetAverage,
    total,
    historicalPct,
    fleetAvgPct,
    qualityWarning: fleetAvgPct > 40,
  };
}
