import { normalizeRiderCodeForPerformance } from '@/lib/dataFilter';
import { resolveRiderExpected } from '@/lib/strategicOps/controlTower/riderHistory';
import type {
  ControlTowerBuildContext,
  NegativeImpactRider,
  RiderImpactLevel,
  RiderIntelligence,
  RiderClassification,
} from '@/lib/strategicOps/controlTower/types';

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function impactLevel(
  lostHoursDaily: number,
  noShowCount: number,
  fleetAvgHours: number
): RiderImpactLevel {
  const criticalLost = Math.max(fleetAvgHours * 1.5, 4);
  const highLost = Math.max(fleetAvgHours, 2);
  if (lostHoursDaily >= criticalLost || noShowCount >= 8) return 'critical';
  if (lostHoursDaily >= highLost || noShowCount >= 4) return 'high';
  if (lostHoursDaily >= highLost * 0.5 || noShowCount >= 2) return 'medium';
  return 'low';
}

const IMPACT_LABELS: Record<RiderImpactLevel, string> = {
  critical: 'حرج',
  high: 'مرتفع',
  medium: 'متوسط',
  low: 'منخفض',
};

function countNoShows(
  riderCode: string,
  performance: ControlTowerBuildContext['performance']
): number {
  const norm = normalizeRiderCodeForPerformance(riderCode);
  if (!norm) return 0;
  return performance.filter(
    (p) =>
      normalizeRiderCodeForPerformance(p.riderCode) === norm &&
      p.hours === 0 &&
      p.orders === 0
  ).length;
}

function countScheduledDays(
  riderCode: string,
  performance: ControlTowerBuildContext['performance']
): number {
  const norm = normalizeRiderCodeForPerformance(riderCode);
  if (!norm) return 0;
  const dates = new Set(
    performance
      .filter((p) => normalizeRiderCodeForPerformance(p.riderCode) === norm)
      .map((p) => p.date)
  );
  return dates.size;
}

/** Build top negative-impact riders using per-rider historical expected hours (fallback: fleet avg). */
export function buildTopNegativeImpactRiders(
  ctx: ControlTowerBuildContext,
  limit = 20
): NegativeImpactRider[] {
  const { riders, operationalPeriodDays, performance, avgHoursPerActiveRider } = ctx;
  const riderHistoricalBaselines = ctx.riderHistoricalBaselines ?? new Map();
  const days = Math.max(1, operationalPeriodDays);
  const fleetExpectedDaily = avgHoursPerActiveRider > 0 ? avgHoursPerActiveRider : 0;
  const fleetAvgOrders = ctx.fleetTalabat.activeRiders > 0
    ? round2(ctx.fleetTalabat.dailySeries.reduce((s, d) => s + (d as any).orders || 0, 0) / days)
    : 0;

  const rows = riders.map((r) => {
    const { hours: expectedHoursDaily } = resolveRiderExpected(
      r.code,
      riderHistoricalBaselines,
      fleetExpectedDaily,
      fleetAvgOrders
    );
    

    const actualHoursDaily = round2(r.totalHours / days);
    const hoursGapDaily = round2(Math.max(0, expectedHoursDaily - actualHoursDaily));
    const noShowCount = countNoShows(r.code, performance);
    const scheduledDays = countScheduledDays(r.code, performance);
    const noShowLostDaily =
      scheduledDays > 0
        ? round2((noShowCount / scheduledDays) * expectedHoursDaily)
        : round2(noShowCount * (expectedHoursDaily / days));
    const lostHoursDaily = round2(hoursGapDaily + noShowLostDaily);
    const lostHoursPeriod = round2(lostHoursDaily * days);
    const level = impactLevel(lostHoursDaily, noShowCount, fleetExpectedDaily);
    const impactScore = lostHoursDaily * 10 + noShowCount * 2;

    return {
      code: r.code,
      name: r.name,
      supervisorCode: r.supervisorCode,
      supervisorName: r.supervisorName,
      region: r.region,
      expectedHoursDaily,
      actualHoursDaily,
      lostHoursDaily,
      lostHoursPeriod,
      scheduledDays,
      noShowCount,
      impactLevel: level,
      impactLabelAr: IMPACT_LABELS[level],
      impactScore,
    };
  });

  return rows
    .filter((r) => r.lostHoursDaily > 0 || r.noShowCount > 0)
    .sort((a, b) => b.impactScore - a.impactScore)
    .slice(0, limit)
    .map(({ impactScore: _, ...rest }) => rest);
}

export function buildRiderLostHoursRank(
  ctx: ControlTowerBuildContext,
  limit = 10
): Array<{ code: string; name: string; lostHoursDaily: number }> {
  return buildTopNegativeImpactRiders(ctx, limit).map((r) => ({
    code: r.code,
    name: r.name,
    lostHoursDaily: r.lostHoursDaily,
  }));
}

// ─── Rider Intelligence (classification + risk score) ───────────────────────

const CLASSIFICATION_LABELS: Record<RiderClassification, string> = {
  high_performer: 'أداء عالي',
  stable: 'مستقر',
  improving: 'في تحسن',
  declining: 'في تراجع',
  sudden_drop: 'انخفاض مفاجئ',
  chronic_underperformer: 'ضعف مزمن',
  inactive: 'غير نشط',
  no_show_risk: 'خطر غياب',
  new_joiner: 'موظف جديد',
  reactivated: 'معاد تفعيله',
};

function classifyRider(
  actualHoursDaily: number,
  expectedHoursDaily: number,
  noShowCount: number,
  scheduledDays: number,
  noShowCountPrev: number,
  scheduledDaysPrev: number,
  hoursTrendPct: number,
  isNew: boolean,
  wasReactivated: boolean
): RiderClassification {
  if (isNew) return 'new_joiner';
  if (wasReactivated) return 'reactivated';

  const noShowRate = scheduledDays > 0 ? noShowCount / scheduledDays : 0;
  const prevNoShowRate = scheduledDaysPrev > 0 ? noShowCountPrev / scheduledDaysPrev : 0;

  if (actualHoursDaily === 0 && scheduledDays === 0) return 'inactive';
  if (noShowRate >= 0.6) return 'no_show_risk';

  const utilization = expectedHoursDaily > 0 ? actualHoursDaily / expectedHoursDaily : 0;

  if (utilization >= 0.95 && noShowRate < 0.1) return 'high_performer';

  if (hoursTrendPct < -30 && noShowRate > prevNoShowRate + 0.2) return 'sudden_drop';
  if (hoursTrendPct > 15 && noShowRate <= prevNoShowRate) return 'improving';
  if (hoursTrendPct < -15 && utilization < 0.6) return 'declining';
  if (utilization < 0.4 && noShowRate >= 0.3) return 'chronic_underperformer';

  return 'stable';
}

function riderRiskScore(
  noShowCount: number,
  scheduledDays: number,
  hoursGapPct: number,
  consecutiveInactive: number,
  hoursTrendPct: number,
  volatility: number
): number {
  const noShowRate = scheduledDays > 0 ? noShowCount / scheduledDays : 0;
  let score = 0;
  score += Math.min(30, noShowRate * 60);
  score += Math.min(20, Math.max(0, -hoursTrendPct) * 0.4);
  score += Math.min(20, hoursGapPct * 0.3);
  score += Math.min(15, consecutiveInactive * 3);
  score += Math.min(15, volatility * 5);
  return Math.round(Math.min(100, score));
}

function computeVolatility(dailyHours: number[]): number {
  if (dailyHours.length < 2) return 0;
  const mean = dailyHours.reduce((s, v) => s + v, 0) / dailyHours.length;
  if (mean === 0) return 0;
  const variance = dailyHours.reduce((s, v) => s + (v - mean) ** 2, 0) / dailyHours.length;
  return round2(Math.sqrt(variance) / mean);
}

function countConsecutiveInactive(
  riderCode: string,
  performance: ControlTowerBuildContext['performance'],
  endDate: string
): number {
  const norm = normalizeRiderCodeForPerformance(riderCode);
  if (!norm) return 0;
  const activeDates = new Set(
    performance
      .filter((p) => normalizeRiderCodeForPerformance(p.riderCode) === norm && p.hours > 0)
      .map((p) => p.date)
  );
  const sorted = performance
    .filter((p) => normalizeRiderCodeForPerformance(p.riderCode) === norm)
    .map((p) => p.date)
    .sort()
    .reverse();
  let consecutive = 0;
  for (const date of sorted) {
    if (!activeDates.has(date)) consecutive++;
    else break;
  }
  return consecutive;
}

/** Build full rider intelligence: classification, risk score, history-based expected hours. */
export function buildRiderIntelligence(ctx: ControlTowerBuildContext): RiderIntelligence[] {
  const {
    riders,
    operationalPeriodDays,
    performance,
    avgHoursPerActiveRider,
    endDate,
    fleetTalabat,
  } = ctx;
  const lookbackPerformance = ctx.lookbackPerformance ?? [];
  const riderHistoricalBaselines = ctx.riderHistoricalBaselines ?? new Map();
  const riderJoinDateByCode = ctx.riderJoinDateByCode ?? new Map();

  const days = Math.max(1, operationalPeriodDays);
  const fleetAvg = avgHoursPerActiveRider > 0 ? avgHoursPerActiveRider : 0;
  const fleetAvgOrders = 0;

  const perfByRider = new Map<string, Array<{ date: string; hours: number; orders: number }>>();
  for (const row of performance) {
    const norm = normalizeRiderCodeForPerformance(row.riderCode);
    if (!norm) continue;
    const list = perfByRider.get(norm) ?? [];
    list.push({ date: row.date, hours: row.hours, orders: row.orders });
    perfByRider.set(norm, list);
  }

  const lookbackByRider = new Map<string, Array<{ date: string; hours: number; orders: number }>>();
  for (const row of lookbackPerformance) {
    const norm = normalizeRiderCodeForPerformance(row.riderCode);
    if (!norm) continue;
    const list = lookbackByRider.get(norm) ?? [];
    list.push({ date: row.date, hours: row.hours, orders: row.orders });
    lookbackByRider.set(norm, list);
  }

  const periodEndDate = new Date(endDate + 'T23:59:59');
  const thirtyDaysAgo = new Date(periodEndDate.getTime() - 30 * 24 * 60 * 60 * 1000);

  const results: RiderIntelligence[] = [];

  for (const rider of riders) {
    const norm = normalizeRiderCodeForPerformance(rider.code);
    if (!norm) continue;

    const expectedResolved = resolveRiderExpected(
      rider.code,
      riderHistoricalBaselines,
      fleetAvg,
      fleetAvgOrders
    );
    const { hours: expectedH, orders: expectedO } = expectedResolved;
    const source = expectedResolved.source as 'historical_30d' | 'historical_partial' | 'fleet_average';

    const riderPerf = perfByRider.get(norm) ?? [];
    const totalHours = riderPerf.reduce((s, r) => s + r.hours, 0);
    const totalOrders = riderPerf.reduce((s, r) => s + r.orders, 0);
    const actualHoursDaily = round2(totalHours / days);
    const actualOrdersDaily = round2(totalOrders / days);

    const noShowCount = riderPerf.filter((r) => r.hours === 0 && r.orders === 0).length;
    const scheduledDays = new Set(riderPerf.map((r) => r.date)).size;

    const lookbackPerf = lookbackByRider.get(norm) ?? [];
    const lookbackScheduled = new Set(lookbackPerf.map((r) => r.date)).size;
    const lookbackNoShow = lookbackPerf.filter((r) => r.hours === 0 && r.orders === 0).length;
    const lookbackTotalHours = lookbackPerf.reduce((s, r) => s + r.hours, 0);
    const lookbackDays = Math.max(1, riderHistoricalBaselines.get(norm)?.lookbackDays ?? 30);
    const lookbackAvgHours = lookbackDays > 0 ? lookbackTotalHours / lookbackDays : 0;
    const hoursTrendPct = lookbackAvgHours > 0
      ? round2(((actualHoursDaily - lookbackAvgHours) / lookbackAvgHours) * 100)
      : 0;

    const lostHoursDaily = round2(Math.max(0, expectedH - actualHoursDaily));
    const hoursGapPct = expectedH > 0 ? round2((lostHoursDaily / expectedH) * 100) : 0;
    const lostHoursPeriod = round2(lostHoursDaily * days);
    const lostOrdersDaily = round2(Math.max(0, expectedO - actualOrdersDaily));

    const consecutiveInactive = countConsecutiveInactive(rider.code, performance, endDate);
    const dailyHoursArr = riderPerf.map((r) => r.hours);
    const volatility = computeVolatility(dailyHoursArr);

    const riskScore = riderRiskScore(
      noShowCount, scheduledDays, hoursGapPct, consecutiveInactive, hoursTrendPct, volatility
    );

    const attendanceRate = scheduledDays > 0
      ? round2(((scheduledDays - noShowCount) / scheduledDays) * 100)
      : 0;
    const utilizationPct = expectedH > 0 ? round2((actualHoursDaily / expectedH) * 100) : 0;

    const joinDateStr = riderJoinDateByCode.get(norm) ?? riderJoinDateByCode.get(rider.code) ?? '';
    const joinDate = joinDateStr ? new Date(joinDateStr + 'T00:00:00') : null;
    const isNew = joinDate !== null && joinDate >= thirtyDaysAgo;

    const classification = classifyRider(
      actualHoursDaily, expectedH, noShowCount, scheduledDays,
      lookbackNoShow, lookbackScheduled, hoursTrendPct, isNew, false
    );

    const trendDir: RiderIntelligence['trendDirection'] =
      hoursTrendPct > 10 ? 'improving' : hoursTrendPct < -10 ? 'declining' : 'stable';

    const level = impactLevel(lostHoursDaily, noShowCount, fleetAvg);

    results.push({
      code: rider.code,
      name: rider.name,
      supervisorCode: rider.supervisorCode,
      supervisorName: rider.supervisorName,
      region: rider.region,
      classification,
      classificationLabelAr: CLASSIFICATION_LABELS[classification],
      riskScore,
      expectedHoursDaily: round2(expectedH),
      actualHoursDaily,
      lostHoursDaily,
      lostHoursPeriod,
      expectedOrdersDaily: round2(expectedO),
      actualOrdersDaily,
      lostOrdersDaily,
      noShowCount,
      scheduledDays,
      attendanceRate,
      utilizationPercent: utilizationPct,
      trendDirection: trendDir,
      baselineSource: source,
      impactLevel: level,
      impactLabelAr: IMPACT_LABELS[level],
    });
  }

  return results.sort((a, b) => b.lostHoursDaily - a.lostHoursDaily);
}
