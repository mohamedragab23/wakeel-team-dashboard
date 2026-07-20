/**
 * SRS-007 §9 — Full City Expansion simulation (open / close / expand / reduce).
 */

import type { UnitEconomicsConfig } from './config/unitEconomics';
import { resolveCityConfig } from '@/lib/strategicOps/trust/cityIntelligence';

export type CityExpansionAction = 'open' | 'close' | 'expand' | 'reduce';

export type CityExpansionInput = {
  action: CityExpansionAction;
  cityKey: string;
  scaleFactor?: number; // expand/reduce multiplier (e.g. 1.25 or 0.75)
  seedHeadcount?: number; // for open
  monthsToBreakevenCap?: number;
};

export type CityExpansionResult = {
  action: CityExpansionAction;
  cityKey: string;
  cityLabelAr: string;
  resources: {
    headcount: number;
    supervisorsNeeded: number;
    dailyTargetHours: number;
  };
  cost: {
    hiring: number;
    training: number;
    equipment: number;
    monthlyOperating: number;
    totalSetup: number;
  };
  expectedRevenueMonthly: number;
  breakEvenMonths: number | null;
  operationalComplexity: 'low' | 'medium' | 'high' | 'severe';
  summaryAr: string;
};

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

export function simulateCityExpansion(
  economics: UnitEconomicsConfig,
  input: CityExpansionInput,
  baseline?: { headcount: number; actualHours: number; orders: number }
): CityExpansionResult {
  const city = resolveCityConfig(input.cityKey);
  const scale = input.scaleFactor ?? (input.action === 'expand' ? 1.25 : input.action === 'reduce' ? 0.75 : 1);
  const seed = input.seedHeadcount ?? 80;

  let headcount = seed;
  let dailyTarget = city.dailyHoursTarget;
  let complexity: CityExpansionResult['operationalComplexity'] = 'medium';

  if (input.action === 'open') {
    headcount = seed;
    dailyTarget = city.dailyHoursTarget;
    complexity = 'high';
  } else if (input.action === 'close') {
    headcount = baseline?.headcount ?? seed;
    dailyTarget = 0;
    complexity = 'severe';
  } else if (input.action === 'expand') {
    headcount = Math.round((baseline?.headcount ?? seed) * scale);
    dailyTarget = round2(city.dailyHoursTarget * scale);
    complexity = scale > 1.4 ? 'high' : 'medium';
  } else {
    headcount = Math.round((baseline?.headcount ?? seed) * scale);
    dailyTarget = round2(city.dailyHoursTarget * scale);
    complexity = 'low';
  }

  const supervisorsNeeded = Math.max(1, Math.ceil(headcount / 40));
  const mult = city.hiringCostMultiplier;
  const hiring = round2(headcount * economics.hiringCostPerRider * mult);
  const training = round2(headcount * economics.trainingCostPerRider * mult);
  const equipment = round2(headcount * economics.equipmentCostPerRider * mult);
  const totalSetup = round2(hiring + training + equipment);
  const monthlyOperating = round2(headcount * economics.costPerActiveRiderDay * 26);

  const expectedOrdersDaily = dailyTarget * city.expectedOph;
  const expectedRevenueMonthly = round2(expectedOrdersDaily * economics.revenuePerOrder * 26);
  const monthlyProfit = expectedRevenueMonthly - monthlyOperating;

  let breakEvenMonths: number | null = null;
  if (input.action !== 'close' && monthlyProfit > 0 && totalSetup > 0) {
    breakEvenMonths = Math.ceil(totalSetup / monthlyProfit);
    const cap = input.monthsToBreakevenCap ?? 36;
    if (breakEvenMonths > cap) breakEvenMonths = cap;
  }
  if (input.action === 'close') breakEvenMonths = 0;

  const summaryAr =
    input.action === 'open'
      ? `افتتاح ${city.labelAr}: ${headcount} طيار، إعداد ${totalSetup} ${economics.currency}، تعادل خلال ${breakEvenMonths ?? '—'} شهر`
      : input.action === 'close'
        ? `إغلاق ${city.labelAr}: تحرير ${headcount} طيار — تعقيد تشغيلي شديد خلال الانتقال`
        : input.action === 'expand'
          ? `توسيع ${city.labelAr} ×${scale}: هدف ${dailyTarget} س/يوم`
          : `تقليص ${city.labelAr} ×${scale}: هدف ${dailyTarget} س/يوم`;

  return {
    action: input.action,
    cityKey: city.cityKey,
    cityLabelAr: city.labelAr,
    resources: { headcount, supervisorsNeeded, dailyTargetHours: dailyTarget },
    cost: { hiring, training, equipment, monthlyOperating, totalSetup },
    expectedRevenueMonthly,
    breakEvenMonths,
    operationalComplexity: complexity,
    summaryAr,
  };
}
