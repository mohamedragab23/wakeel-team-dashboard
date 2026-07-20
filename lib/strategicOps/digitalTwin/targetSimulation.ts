import { hiringNeededForGap } from './hiringSimulation';
import type { TwinFleetMetrics } from './types';

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

export type TargetSimulationResult = {
  newTargetHours: number;
  requiredHours: number;
  requiredRiders: number;
  requiredOrders: number;
  requiredProductivity: number;
  hiringNeed: number;
  timelineDays: number;
  probabilityOfSuccess: number;
};

export function simulateTarget(
  fleet: TwinFleetMetrics,
  newTargetHours: number
): TargetSimulationResult {
  const target = Math.max(0, newTargetHours);
  const gap = round2(Math.max(0, target - fleet.actualHours));
  const avgH = fleet.avgHours > 0 ? fleet.avgHours : 5;
  const oph = fleet.ordersPerHour > 0 ? fleet.ordersPerHour : 2;
  const hiringNeed = hiringNeededForGap(gap, avgH);
  const requiredRiders = round2(Math.max(fleet.activeRiders, target / avgH));
  const requiredOrders = round2(target * oph);
  const ratio = fleet.actualHours > 0 ? target / fleet.actualHours : 2;
  const probabilityOfSuccess = round2(
    Math.max(
      5,
      Math.min(95, 90 - Math.max(0, ratio - 1) * 70 - Math.max(0, 80 - fleet.achievement) * 0.2)
    )
  );

  return {
    newTargetHours: target,
    requiredHours: target,
    requiredRiders,
    requiredOrders,
    requiredProductivity: avgH,
    hiringNeed,
    timelineDays: Math.min(180, 21 + hiringNeed * 3),
    probabilityOfSuccess,
  };
}
