/**
 * Priority 3: Daily Contact Priority List
 * "If you have time to contact only 10 riders today — these are them"
 *
 * Identifies riders who are currently inactive (3+ consecutive days)
 * but were previously active, ranked by priority score.
 */
import { normalizeRiderCodeForPerformance } from '@/lib/dataFilter';
import type {
  ControlTowerBuildContext,
  DailyContactEntry,
} from '@/lib/strategicOps/controlTower/types';

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

const MIN_PREV_AVG_HOURS = 3;
const MIN_CONSECUTIVE_INACTIVE_DAYS = 3;
const TOP_N = 10;

export function buildDailyContactList(
  ctx: ControlTowerBuildContext
): DailyContactEntry[] {
  const {
    riders,
    performance,
    riderHistoricalBaselines,
    operationalPeriodDays,
    endDate,
  } = ctx;
  const baselines = riderHistoricalBaselines ?? new Map();

  // Get all dates in current period (sorted ascending)
  const allDates = Array.from(new Set(performance.map((p) => p.date))).sort();
  if (allDates.length === 0) return [];

  // Use last 14 days for recent no-show rate
  const last14Dates = allDates.slice(-14);

  // Index current period performance by rider
  const perfByRider = new Map<string, Map<string, number>>();
  for (const row of performance) {
    const norm = normalizeRiderCodeForPerformance(row.riderCode);
    if (!norm) continue;
    const riderMap = perfByRider.get(norm) ?? new Map<string, number>();
    riderMap.set(row.date, (riderMap.get(row.date) ?? 0) + row.hours);
    perfByRider.set(norm, riderMap);
  }

  const results: DailyContactEntry[] = [];

  for (const rider of riders) {
    const norm = normalizeRiderCodeForPerformance(rider.code);
    if (!norm) continue;

    const baseline = baselines.get(norm);
    if (!baseline?.hasHistory) continue;
    if (baseline.avgHoursDaily < MIN_PREV_AVG_HOURS) continue;

    const riderDateMap = perfByRider.get(norm) ?? new Map<string, number>();

    // Count consecutive inactive days from the END of the current period
    let consecutiveInactiveDays = 0;
    for (let i = allDates.length - 1; i >= 0; i--) {
      const date = allDates[i];
      const hours = riderDateMap.get(date) ?? 0;
      if (hours === 0) {
        consecutiveInactiveDays++;
      } else {
        break;
      }
    }

    if (consecutiveInactiveDays < MIN_CONSECUTIVE_INACTIVE_DAYS) continue;

    // Compute recent no-show rate (last 14 days)
    let noShowDays14 = 0;
    for (const date of last14Dates) {
      const hours = riderDateMap.get(date) ?? 0;
      if (hours === 0) noShowDays14++;
    }
    const noShowRateRecent = last14Dates.length > 0 ? noShowDays14 / last14Dates.length : 0;

    // Priority score formula (spec-defined)
    const priorityScore = round2(
      baseline.avgHoursDaily * 0.40 +
      consecutiveInactiveDays * 0.30 +
      baseline.avgOrdersDaily * 0.20 +
      noShowRateRecent * -0.10
    );

    results.push({
      priority: 0,
      code: rider.code,
      name: rider.name,
      supervisorCode: rider.supervisorCode,
      supervisorName: rider.supervisorName,
      prev30AvgHours: baseline.avgHoursDaily,
      prev30AvgOrders: baseline.avgOrdersDaily,
      consecutiveInactiveDays,
      expectedRecoveryHours: baseline.avgHoursDaily,
      expectedRecoveryOrders: baseline.avgOrdersDaily,
      priorityScore,
    });
  }

  // Sort by priority score descending, take top 10
  const top = results
    .sort((a, b) => b.priorityScore - a.priorityScore)
    .slice(0, TOP_N);

  top.forEach((r, i) => { r.priority = i + 1; });
  return top;
}
