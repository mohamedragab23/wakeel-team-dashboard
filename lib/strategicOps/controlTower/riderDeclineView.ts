/**
 * Priority 1: Rider Decline Intelligence
 * Ranks riders by percentage hours decline vs their 30-day historical baseline.
 * Only includes riders with a statistically valid baseline (≥5 active days, prev30Avg ≥ 3h).
 */
import { normalizeRiderCodeForPerformance } from '@/lib/dataFilter';
import type {
  ControlTowerBuildContext,
  RiderDeclineEntry,
} from '@/lib/strategicOps/controlTower/types';

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

const MIN_PREV_AVG_HOURS = 3;
const MIN_DECLINE_PCT = 20;
const MIN_ACTIVE_DAYS_IN_LOOKBACK = 5;

export function buildRiderDeclineView(
  ctx: ControlTowerBuildContext
): RiderDeclineEntry[] {
  const {
    riders,
    performance,
    lookbackPerformance = [],
    riderHistoricalBaselines,
    operationalPeriodDays,
    endDate,
  } = ctx;
  const baselines = riderHistoricalBaselines ?? new Map();
  const days = Math.max(1, operationalPeriodDays);

  // Index current period performance
  const currentPerfByRider = new Map<string, Array<{ date: string; hours: number; orders: number }>>();
  for (const row of performance) {
    const norm = normalizeRiderCodeForPerformance(row.riderCode);
    if (!norm) continue;
    const list = currentPerfByRider.get(norm) ?? [];
    list.push(row);
    currentPerfByRider.set(norm, list);
  }

  // Get sorted dates in current period for consecutive analysis
  const currentDates = Array.from(new Set(performance.map((p) => p.date))).sort();

  const results: RiderDeclineEntry[] = [];

  for (const rider of riders) {
    const norm = normalizeRiderCodeForPerformance(rider.code);
    if (!norm) continue;

    const baseline = baselines.get(norm);
    if (!baseline) continue;

    // Filtering rules
    if (baseline.activeDays < MIN_ACTIVE_DAYS_IN_LOOKBACK) continue;
    if (baseline.avgHoursDaily < MIN_PREV_AVG_HOURS) continue;

    const riderPerf = currentPerfByRider.get(norm) ?? [];
    const totalHours = riderPerf.reduce((s, r) => s + r.hours, 0);
    const totalOrders = riderPerf.reduce((s, r) => s + r.orders, 0);

    const currentAvgHours = round2(totalHours / days);
    const currentAvgOrders = round2(totalOrders / days);

    const prev30AvgHours = baseline.avgHoursDaily;
    const prev30AvgOrders = baseline.avgOrdersDaily;

    if (prev30AvgHours <= 0) continue;

    const hoursDeclinePct = round2(((prev30AvgHours - currentAvgHours) / prev30AvgHours) * 100);
    if (hoursDeclinePct < MIN_DECLINE_PCT) continue;

    const ordersDeclinePct =
      prev30AvgOrders > 0
        ? round2(((prev30AvgOrders - currentAvgOrders) / prev30AvgOrders) * 100)
        : 0;

    // Find first day in current period where hours dropped below 70% of baseline
    const threshold70 = prev30AvgHours * 0.7;
    let declineStartDay: string | null = null;
    for (const date of currentDates) {
      const dayRec = riderPerf.find((p) => p.date === date);
      const dayHours = dayRec ? dayRec.hours : 0;
      if (dayHours < threshold70) {
        declineStartDay = date;
        break;
      }
    }

    let daysInDecline = 0;
    if (declineStartDay) {
      const startIdx = currentDates.indexOf(declineStartDay);
      daysInDecline = startIdx >= 0 ? currentDates.length - startIdx : 0;
    }

    const riskLevel: RiderDeclineEntry['riskLevel'] =
      hoursDeclinePct > 70 ? 'critical' : hoursDeclinePct > 40 ? 'high' : 'medium';
    const riskLabelAr = riskLevel === 'critical' ? 'حرج' : riskLevel === 'high' ? 'مرتفع' : 'متوسط';

    results.push({
      code: rider.code,
      name: rider.name,
      supervisorCode: rider.supervisorCode,
      supervisorName: rider.supervisorName,
      prev30AvgHours,
      currentAvgHours,
      hoursDeclinePct,
      prev30AvgOrders,
      currentAvgOrders,
      ordersDeclinePct,
      declineStartDay,
      daysInDecline,
      riskLevel,
      riskLabelAr,
      baselineSource: baseline.baselineSource,
    });
  }

  return results.sort((a, b) => b.hoursDeclinePct - a.hoursDeclinePct);
}
