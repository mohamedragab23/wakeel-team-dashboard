import type { TwinFleetMetrics } from './types';

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

export type TerminationSimulationEstimate = {
  terminateRiders: number;
  hoursLost: number;
  ordersLost: number;
  achievementAfter: number;
  replacementNeed: number;
  riskScore: number;
  supervisorImpactAr: string;
};

export function simulateTermination(
  fleet: TwinFleetMetrics,
  terminateRiders: number
): TerminationSimulationEstimate {
  const n = Math.max(0, Math.min(Math.floor(terminateRiders), fleet.headcount));
  const avgH = fleet.avgHours > 0 ? fleet.avgHours : 5;
  const oph = fleet.ordersPerHour > 0 ? fleet.ordersPerHour : 2;
  const hoursLost = round2(n * avgH);
  const ordersLost = round2(hoursLost * oph);
  const hoursAfter = Math.max(0, fleet.actualHours - hoursLost);
  const achievementAfter =
    fleet.targetHours > 0 ? round2((hoursAfter / fleet.targetHours) * 100) : 0;
  const riskScore = round2(
    Math.min(100, (n / Math.max(1, fleet.headcount)) * 100 * 1.5 + (fleet.achievement - achievementAfter))
  );

  return {
    terminateRiders: n,
    hoursLost,
    ordersLost,
    achievementAfter,
    replacementNeed: n,
    riskScore,
    supervisorImpactAr:
      n === 0
        ? 'لا تأثير'
        : `انخفاض متوقع في حمل الفرق — ${n} طيار، ~${hoursLost} ساعة/يوم`,
  };
}
