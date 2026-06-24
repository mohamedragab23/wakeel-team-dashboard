import { normalizeRiderCodeForPerformance } from '@/lib/dataFilter';
import type { ControlTowerBuildContext, NegativeImpactRider, RiderImpactLevel } from '@/lib/strategicOps/controlTower/types';

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

export function buildTopNegativeImpactRiders(
  ctx: ControlTowerBuildContext,
  limit = 20
): NegativeImpactRider[] {
  const { riders, operationalPeriodDays, performance, avgHoursPerActiveRider } = ctx;
  const days = Math.max(1, operationalPeriodDays);
  const fleetExpectedDaily = avgHoursPerActiveRider > 0 ? avgHoursPerActiveRider : 0;

  const rows = riders.map((r) => {
    const actualHoursDaily = round2(r.totalHours / days);
    const expectedHoursDaily = round2(fleetExpectedDaily);
    const hoursGapDaily = round2(Math.max(0, expectedHoursDaily - actualHoursDaily));
    const noShowCount = countNoShows(r.code, performance);
    const scheduledDays = countScheduledDays(r.code, performance);
    const noShowLostDaily =
      scheduledDays > 0
        ? round2((noShowCount / scheduledDays) * fleetExpectedDaily)
        : round2(noShowCount * (fleetExpectedDaily / days));
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
