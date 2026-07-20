import { computeAdditionalRidersNeeded } from '@/lib/strategicOps/roadmapCalculation';
import { totalHireInvestment, type UnitEconomicsConfig } from './config/unitEconomics';
import type { TwinFleetMetrics } from './types';

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

export type HiringSimulationEstimate = {
  hireRiders: number;
  hoursGained: number;
  ordersGained: number;
  targetCoverageGainPercent: number;
  cost: number;
  roiPercent: number;
  paybackDays: number | null;
  recruitmentTimelineDays: number;
};

export function simulateHiring(
  fleet: TwinFleetMetrics,
  economics: UnitEconomicsConfig,
  hireRiders: number
): HiringSimulationEstimate {
  const n = Math.max(0, Math.floor(hireRiders));
  const avgH = fleet.avgHours > 0 ? fleet.avgHours : 5;
  const oph = fleet.ordersPerHour > 0 ? fleet.ordersPerHour : 2;
  const hoursGained = round2(n * avgH);
  const ordersGained = round2(hoursGained * oph);
  const cost = totalHireInvestment(economics, n);
  const dailyRevenueGain = ordersGained * economics.revenuePerOrder;
  const dailyCostIncrease = n * economics.costPerActiveRiderDay;
  const dailyProfitGain = dailyRevenueGain - dailyCostIncrease;
  const paybackDays =
    dailyProfitGain > 0 ? Math.ceil(cost / dailyProfitGain) : null;
  const roiPercent =
    cost > 0 ? round2(((dailyProfitGain * 30 - cost) / cost) * 100) : 0;
  const targetCoverageGainPercent =
    fleet.targetHours > 0 ? round2((hoursGained / fleet.targetHours) * 100) : 0;

  return {
    hireRiders: n,
    hoursGained,
    ordersGained,
    targetCoverageGainPercent,
    cost,
    roiPercent,
    paybackDays,
    recruitmentTimelineDays: Math.min(90, 14 + n * 2),
  };
}

export function hiringNeededForGap(gapHours: number, avgHours: number): number {
  const audit = computeAdditionalRidersNeeded(gapHours, avgHours);
  return audit.roundedResult ?? 0;
}

export const HIRING_PRESETS = [5, 10, 20, 30, 50, 100] as const;
