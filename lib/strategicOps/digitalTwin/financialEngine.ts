import { totalHireInvestment } from './config/unitEconomics';
import type { DigitalTwinState, FinancialImpact, TwinFleetMetrics } from './types';

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

export function computeFinancialImpact(
  baseline: TwinFleetMetrics,
  projected: TwinFleetMetrics,
  twin: DigitalTwinState,
  hireRiders: number
): FinancialImpact {
  const economics = twin.economics;
  const periodDays = Math.max(1, twin.meta.periodDays);

  const revenue = round2(projected.orders * economics.revenuePerOrder * periodDays);
  const baselineRevenue = round2(baseline.orders * economics.revenuePerOrder * periodDays);
  const operatingCost = round2(
    projected.activeRiders * economics.costPerActiveRiderDay * periodDays
  );
  const hiringCost = round2(hireRiders * economics.hiringCostPerRider);
  const trainingCost = round2(hireRiders * economics.trainingCostPerRider);
  const equipmentCost = round2(hireRiders * economics.equipmentCostPerRider);
  const totalInvestment = round2(hiringCost + trainingCost + equipmentCost);
  const profit = round2(revenue - operatingCost - totalInvestment);
  const incrementalDailyProfit = round2(
    (projected.orders - baseline.orders) * economics.revenuePerOrder -
      (projected.activeRiders - baseline.activeRiders) * economics.costPerActiveRiderDay
  );
  const paybackDays =
    totalInvestment > 0 && incrementalDailyProfit > 0
      ? Math.ceil(totalInvestment / incrementalDailyProfit)
      : totalInvestment === 0
        ? 0
        : null;
  const roiPercent =
    totalInvestment > 0
      ? round2(((profit - (baselineRevenue - baseline.activeRiders * economics.costPerActiveRiderDay * periodDays)) / totalInvestment) * 100)
      : incrementalDailyProfit > 0
        ? 100
        : 0;

  return {
    revenue,
    operatingCost,
    hiringCost,
    trainingCost,
    equipmentCost,
    totalInvestment,
    profit,
    roiPercent,
    paybackDays,
    breakEvenDays: paybackDays,
    currency: economics.currency,
    assumptionsNoteAr: `افتراضات مالية (${economics.source}): إيراد/طلب ${economics.revenuePerOrder}، تكلفة طيار/يوم ${economics.costPerActiveRiderDay}، تعيين ${economics.hiringCostPerRider}+تدريب ${economics.trainingCostPerRider}+معدات ${economics.equipmentCostPerRider}`,
  };
}

export function investmentForHires(twin: DigitalTwinState, hireRiders: number): number {
  return totalHireInvestment(twin.economics, hireRiders);
}
