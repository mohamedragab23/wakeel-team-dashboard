/**
 * Priority 2: Order Collapse Ranking
 * Completely separate from hours decline. Identifies riders whose order
 * output has collapsed regardless of hours worked.
 *
 * "Hours also collapsed?" indicator: helps distinguish efficiency problems
 * (rider works but doesn't deliver) from attendance problems (rider absent).
 */
import { normalizeRiderCodeForPerformance } from '@/lib/dataFilter';
import type {
  ControlTowerBuildContext,
  OrderCollapseEntry,
} from '@/lib/strategicOps/controlTower/types';

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

const MIN_PREV_ORDERS = 1; // minimum historical orders to be meaningful
const MIN_LOST_ORDERS = 0.5; // minimum lost orders/day to appear in table

export function buildOrderCollapseView(
  ctx: ControlTowerBuildContext,
  limit = 25
): OrderCollapseEntry[] {
  const {
    riders,
    performance,
    riderHistoricalBaselines,
    operationalPeriodDays,
  } = ctx;
  const baselines = riderHistoricalBaselines ?? new Map();
  const days = Math.max(1, operationalPeriodDays);

  // Build hours decline map for "hours also collapsed?" lookup
  const hoursDeclinePctByCode = new Map<string, number>();

  // Index current period performance
  const currentPerfByRider = new Map<string, { totalHours: number; totalOrders: number }>();
  for (const row of performance) {
    const norm = normalizeRiderCodeForPerformance(row.riderCode);
    if (!norm) continue;
    const existing = currentPerfByRider.get(norm) ?? { totalHours: 0, totalOrders: 0 };
    existing.totalHours += row.hours;
    existing.totalOrders += row.orders;
    currentPerfByRider.set(norm, existing);
  }

  const results: OrderCollapseEntry[] = [];

  for (const rider of riders) {
    const norm = normalizeRiderCodeForPerformance(rider.code);
    if (!norm) continue;

    const baseline = baselines.get(norm);
    if (!baseline || !baseline.hasHistory) continue;
    if (baseline.avgOrdersDaily < MIN_PREV_ORDERS) continue;

    const riderPerf = currentPerfByRider.get(norm) ?? { totalHours: 0, totalOrders: 0 };
    const actualOrdersDaily = round2(riderPerf.totalOrders / days);
    const actualHoursDaily = round2(riderPerf.totalHours / days);

    const expectedOrdersDaily = baseline.avgOrdersDaily;
    const lostOrdersDaily = round2(Math.max(0, expectedOrdersDaily - actualOrdersDaily));

    if (lostOrdersDaily < MIN_LOST_ORDERS) continue;

    const ordersCollapsePct = round2((lostOrdersDaily / expectedOrdersDaily) * 100);

    // Compute hours decline for "hours also collapsed?"
    const hoursDeclinePct =
      baseline.avgHoursDaily > 0
        ? round2(((baseline.avgHoursDaily - actualHoursDaily) / baseline.avgHoursDaily) * 100)
        : 0;
    const hoursAlsoCollapsed = hoursDeclinePct > 20;

    results.push({
      rank: 0,
      code: rider.code,
      name: rider.name,
      supervisorCode: rider.supervisorCode,
      supervisorName: rider.supervisorName,
      expectedOrdersDaily,
      actualOrdersDaily,
      lostOrdersDaily,
      ordersCollapsePct,
      hoursAlsoCollapsed,
      hoursDeclinePct,
    });
  }

  // Sort by lost orders desc, then by collapse % desc
  const sorted = results
    .sort((a, b) => b.lostOrdersDaily - a.lostOrdersDaily || b.ordersCollapsePct - a.ordersCollapsePct)
    .slice(0, limit);

  sorted.forEach((r, i) => { r.rank = i + 1; });
  return sorted;
}
