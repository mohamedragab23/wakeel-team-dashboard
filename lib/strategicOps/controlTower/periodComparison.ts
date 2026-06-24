import { normalizeRiderCodeForPerformance } from '@/lib/dataFilter';
import {
  aggregateTalabatFromDailySeries,
  computeDailyTalabatSeries,
  enumerateCalendarDates,
  type TalabatFleetMetrics,
} from '@/lib/strategicOps/talabatOpsMetrics';
import {
  extractFleetKpiValues,
  KPI_KEYS,
  type KpiKey,
  type KpiTrendComparison,
} from '@/lib/strategicOps/controlTower/types';

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function pctDelta(current: number, prior: number | null): number | null {
  if (prior === null || prior === 0) return null;
  return round2(((current - prior) / Math.abs(prior)) * 100);
}

function addDaysIso(isoDate: string, days: number): string {
  const d = new Date(isoDate + 'T00:00:00');
  d.setDate(d.getDate() + days);
  return d.toISOString().split('T')[0];
}

function computeWindowMetrics(input: {
  performance: Array<{ date: string; riderCode: string; hours: number; orders: number }>;
  windowStart: string;
  windowEnd: string;
  assignedRiderCodes: Set<string>;
  fleetDailyTargetHours: number;
  headcount: number;
}): TalabatFleetMetrics {
  const start = new Date(input.windowStart + 'T00:00:00');
  const end = new Date(input.windowEnd + 'T23:59:59');
  const calendarDates = enumerateCalendarDates(start, end);
  if (calendarDates.length === 0) {
    return aggregateTalabatFromDailySeries([], input.headcount, 0);
  }

  const filtered = input.performance.filter(
    (p) => p.date >= input.windowStart && p.date <= input.windowEnd
  );

  const dailySeries = computeDailyTalabatSeries({
    calendarDates,
    performance: filtered,
    assignedRiderCodes: input.assignedRiderCodes,
    dailyTargetHours: input.fleetDailyTargetHours,
  });

  const uniqueActive = new Set<string>();
  for (const rec of filtered) {
    if (rec.hours > 0) {
      const norm = normalizeRiderCodeForPerformance(rec.riderCode);
      if (norm) uniqueActive.add(norm);
    }
  }

  return aggregateTalabatFromDailySeries(dailySeries, input.headcount, uniqueActive.size);
}

const KPI_LABELS_AR: Record<KpiKey, string> = {
  headcount: 'Headcount',
  activeRiders: 'الطيارون النشطون',
  noShowRiders: 'No Show',
  actualHours: 'الساعات الفعلية',
  targetHours: 'الهدف',
  achievementPercent: 'نسبة تحقيق الهدف',
  utilizationPercent: 'معدل الاستغلال',
};

export function buildPeriodComparisons(ctx: {
  startDate: string;
  fleetTalabat: TalabatFleetMetrics;
  performance: Array<{ date: string; riderCode: string; hours: number; orders: number }>;
  assignedRiderCodes: Set<string>;
  fleetDailyTargetHours: number;
  headcount: number;
}): KpiTrendComparison[] {
  const dayBeforeStart = addDaysIso(ctx.startDate, -1);

  const prior7Start = addDaysIso(ctx.startDate, -7);
  const prior14Start = addDaysIso(ctx.startDate, -14);
  const prior30Start = addDaysIso(ctx.startDate, -30);

  const base = {
    performance: ctx.performance,
    assignedRiderCodes: ctx.assignedRiderCodes,
    fleetDailyTargetHours: ctx.fleetDailyTargetHours,
    headcount: ctx.headcount,
  };

  const metrics7 = computeWindowMetrics({ ...base, windowStart: prior7Start, windowEnd: dayBeforeStart });
  const metrics14 = computeWindowMetrics({ ...base, windowStart: prior14Start, windowEnd: dayBeforeStart });
  const metrics30 = computeWindowMetrics({ ...base, windowStart: prior30Start, windowEnd: dayBeforeStart });

  const current = extractFleetKpiValues(ctx.fleetTalabat);
  const prior7 = extractFleetKpiValues(metrics7);
  const prior14 = extractFleetKpiValues(metrics14);
  const prior30 = extractFleetKpiValues(metrics30);

  return KPI_KEYS.map((kpiKey) => {
    const cur = current[kpiKey];
    const p7 = prior7[kpiKey];
    const p14 = prior14[kpiKey];
    const p30 = prior30[kpiKey];

    return {
      kpiKey,
      kpiLabelAr: KPI_LABELS_AR[kpiKey],
      current: cur,
      prior7: p7,
      prior14: p14,
      prior30: p30,
      delta7: p7 !== null ? round2(cur - p7) : null,
      delta14: p14 !== null ? round2(cur - p14) : null,
      delta30: p30 !== null ? round2(cur - p30) : null,
      deltaPercent7: pctDelta(cur, p7),
      deltaPercent14: pctDelta(cur, p14),
      deltaPercent30: pctDelta(cur, p30),
    };
  });
}
