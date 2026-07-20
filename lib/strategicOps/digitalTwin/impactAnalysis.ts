import type { ImpactDelta, TwinFleetMetrics } from './types';

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

export function computeImpactDeltas(
  baseline: TwinFleetMetrics,
  projected: TwinFleetMetrics
): ImpactDelta {
  const growthRate =
    baseline.actualHours > 0
      ? round2(((projected.actualHours - baseline.actualHours) / baseline.actualHours) * 100)
      : 0;

  const riskScore = round2(
    Math.max(
      0,
      Math.min(
        100,
        (projected.lostHoursPercent - baseline.lostHoursPercent) * 2 +
          Math.max(0, baseline.achievement - projected.achievement) +
          Math.max(0, projected.noShowRiders - baseline.noShowRiders) * 2
      )
    )
  );

  const supervisorLoad =
    projected.headcount > 0
      ? round2(projected.activeRiders / Math.max(1, projected.headcount / 10))
      : 0;

  return {
    headcount: round2(projected.headcount - baseline.headcount),
    activeRiders: round2(projected.activeRiders - baseline.activeRiders),
    hours: round2(projected.actualHours - baseline.actualHours),
    orders: round2(projected.orders - baseline.orders),
    ordersPerHour: round2(projected.ordersPerHour - baseline.ordersPerHour),
    avgHours: round2(projected.avgHours - baseline.avgHours),
    lostHours: round2(projected.lostHours - baseline.lostHours),
    achievement: round2(projected.achievement - baseline.achievement),
    utilization: round2(projected.utilization - baseline.utilization),
    healthScore: round2(projected.healthScore - baseline.healthScore),
    riskScore,
    growthRate,
    supervisorLoad,
  };
}
