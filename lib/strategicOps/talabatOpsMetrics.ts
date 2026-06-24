import { normalizeRiderCodeForPerformance } from '@/lib/dataFilter';

export const DAILY_HOURS_BASELINE = 1500;
export const STRATEGIC_KPI_COVERAGE_THRESHOLD = 80;

export type PerfDayRec = {
  date: string;
  riderCode: string;
  hours: number;
  orders: number;
};

export type TalabatDailySnapshot = {
  date: string;
  /** Riders with a daily row on this day (scheduled/expected to work) */
  scheduledRiders: number;
  activeRiders: number;
  noShowRiders: number;
  hours: number;
  targetHours: number;
};

export type TalabatFleetMetrics = {
  headcount: number;
  activeRiders: number;
  noShowRiders: number;
  actualHours: number;
  targetHours: number;
  achievementPercent: number;
  avgHoursPerActiveRider: number;
  utilizationPercent: number;
  dailySeries: TalabatDailySnapshot[];
  calendarDays: number;
  /** Days with at least one scheduled rider (operational days) */
  operationalDays: number;
  uniqueActiveRidersInPeriod: number;
};

export type NoShowComparison = {
  dashboardNoShow: number;
  talabatNoShow: number | null;
  deviationPercent: number | null;
  matchPercent: number | null;
  withinTolerance: boolean | null;
  tolerancePercent: number;
};

export type KpiAuditTrace = {
  kpi: string;
  formula: string;
  numerator: number;
  numeratorLabel: string;
  denominator: number;
  denominatorLabel: string;
  rawDataSource: string;
  recordsRead: number;
  result: number;
  status: 'valid' | 'warning' | 'insufficient_data';
};

export type SourceDataCoverage = {
  completenessPercentage: number;
  joinDateCoveragePercent: number;
  operationalCoveragePercent: number;
  metadataCoveragePercent: number;
  /** min(operational, metadata) — informational / legacy */
  coverage: number;
  overallReadinessPercent: number;
  operationalAnalyticsEnabled: boolean;
  metadataAnalyticsEnabled: boolean;
  /** Legacy combined gate — still min(operational, metadata) for non–Control Tower sections */
  strategicKpisEnabled: boolean;
  insufficientDataLabelAr: string;
};

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function pct(part: number, total: number): number {
  if (total <= 0) return 0;
  return round2((part / total) * 100);
}

function avg(values: number[]): number {
  if (values.length === 0) return 0;
  return round2(values.reduce((a, b) => a + b, 0) / values.length);
}

export function enumerateCalendarDates(start: Date, end: Date): string[] {
  const dates: string[] = [];
  const cur = new Date(start);
  cur.setHours(0, 0, 0, 0);
  const endD = new Date(end);
  endD.setHours(0, 0, 0, 0);
  while (cur.getTime() <= endD.getTime()) {
    const y = cur.getFullYear();
    const m = String(cur.getMonth() + 1).padStart(2, '0');
    const day = String(cur.getDate()).padStart(2, '0');
    dates.push(`${y}-${m}-${day}`);
    cur.setDate(cur.getDate() + 1);
  }
  return dates;
}

function buildDailyPerformanceMap(
  performance: PerfDayRec[]
): Map<string, Map<string, { hours: number; orders: number }>> {
  const byDate = new Map<string, Map<string, { hours: number; orders: number }>>();
  for (const rec of performance) {
    const norm = normalizeRiderCodeForPerformance(rec.riderCode);
    if (!norm) continue;
    const dayMap = byDate.get(rec.date) ?? new Map();
    const existing = dayMap.get(norm) ?? { hours: 0, orders: 0 };
    existing.hours += rec.hours;
    existing.orders += rec.orders;
    dayMap.set(norm, existing);
    byDate.set(rec.date, dayMap);
  }
  return byDate;
}

function countUniqueActiveInPeriod(performance: PerfDayRec[], assignedCodes: Set<string>): number {
  const active = new Set<string>();
  for (const rec of performance) {
    if (rec.hours <= 0) continue;
    const norm = normalizeRiderCodeForPerformance(rec.riderCode);
    if (!norm || !assignedCodes.has(norm)) continue;
    active.add(norm);
  }
  return active.size;
}

/** Rider was scheduled for the day: has an official row AND is assigned in scope. */
function isScheduledAssignedRider(code: string, inScopeAssignedCodes: Set<string>): boolean {
  return inScopeAssignedCodes.has(code);
}

/** Talabat no-show: scheduled for the day, did not work at all (no hours, no orders). */
function isTalabatNoShow(vals: { hours: number; orders: number }): boolean {
  return vals.hours === 0 && vals.orders === 0;
}

export function computeDailyTalabatSeries(input: {
  calendarDates: string[];
  performance: PerfDayRec[];
  /** Assigned riders in المناديب within scope — required for schedule eligibility */
  assignedRiderCodes: Set<string>;
  dailyTargetHours: number;
}): TalabatDailySnapshot[] {
  const { calendarDates, performance, assignedRiderCodes, dailyTargetHours } = input;
  const byDate = buildDailyPerformanceMap(performance);

  return calendarDates.map((date) => {
    const dayMap = byDate.get(date);
    let scheduledRiders = 0;
    let activeRiders = 0;
    let noShowRiders = 0;
    let hours = 0;

    if (dayMap) {
      // Only riders with a row on this day were scheduled/expected to work.
      // Assigned riders without a row are excluded (not expected that day).
      for (const [code, vals] of dayMap) {
        if (!isScheduledAssignedRider(code, assignedRiderCodes)) continue;

        scheduledRiders += 1;
        hours += vals.hours;

        if (vals.hours > 0) {
          activeRiders += 1;
        } else if (isTalabatNoShow(vals)) {
          noShowRiders += 1;
        }
        // hours=0 with orders>0: worked partially — not no-show, not active by hours
      }
    }

    return {
      date,
      scheduledRiders,
      activeRiders,
      noShowRiders,
      hours: round2(hours),
      targetHours: dailyTargetHours,
    };
  });
}

export function aggregateTalabatFromDailySeries(
  dailySeries: TalabatDailySnapshot[],
  headcount: number,
  uniqueActiveRidersInPeriod: number
): TalabatFleetMetrics {
  const activeRiders = avg(dailySeries.map((d) => d.activeRiders));
  const operationalDays = dailySeries.filter((d) => d.scheduledRiders > 0);
  const noShowRiders =
    operationalDays.length > 0
      ? avg(operationalDays.map((d) => d.noShowRiders))
      : 0;
  const actualHours = avg(dailySeries.map((d) => d.hours));
  const targetHours = avg(dailySeries.map((d) => d.targetHours));
  const avgHoursPerActiveRider = activeRiders > 0 ? round2(actualHours / activeRiders) : 0;
  const utilizationPercent = pct(activeRiders, headcount);
  const achievementPercent = pct(actualHours, targetHours);

  return {
    headcount,
    activeRiders,
    noShowRiders,
    actualHours,
    targetHours,
    achievementPercent,
    avgHoursPerActiveRider,
    utilizationPercent,
    dailySeries,
    calendarDays: dailySeries.length,
    operationalDays: operationalDays.length,
    uniqueActiveRidersInPeriod,
  };
}

export function computeFleetTalabatMetrics(input: {
  calendarDates: string[];
  performance: PerfDayRec[];
  assignedRiderCodes: Set<string>;
  fleetDailyTargetHours: number;
  headcount: number;
}): TalabatFleetMetrics {
  const dailySeries = computeDailyTalabatSeries({
    calendarDates: input.calendarDates,
    performance: input.performance,
    assignedRiderCodes: input.assignedRiderCodes,
    dailyTargetHours: input.fleetDailyTargetHours,
  });
  const uniqueActiveRidersInPeriod = countUniqueActiveInPeriod(
    input.performance,
    input.assignedRiderCodes
  );
  return aggregateTalabatFromDailySeries(
    dailySeries,
    input.headcount,
    uniqueActiveRidersInPeriod
  );
}

export function computeSupervisorTalabatMetrics(input: {
  calendarDates: string[];
  performance: PerfDayRec[];
  assignedRiderCodes: Set<string>;
  targetDaily: number;
  headcount: number;
}): Omit<TalabatFleetMetrics, 'uniqueActiveRidersInPeriod'> {
  const dailySeries = computeDailyTalabatSeries({
    calendarDates: input.calendarDates,
    performance: input.performance,
    assignedRiderCodes: input.assignedRiderCodes,
    dailyTargetHours: input.targetDaily,
  });
  const full = aggregateTalabatFromDailySeries(dailySeries, input.headcount, 0);
  const { uniqueActiveRidersInPeriod: _, ...rest } = full;
  return rest;
}

export function sumSupervisorDailyTargets(
  supervisors: Array<{ target?: number | string | null }>
): number {
  let sum = 0;
  for (const sup of supervisors) {
    const t = Number(sup.target);
    if (Number.isFinite(t) && t > 0) sum += t;
  }
  return round2(sum);
}

export function resolveFleetDailyTargetHours(
  supervisorTargetSum: number,
  fallback: number = DAILY_HOURS_BASELINE
): number {
  return supervisorTargetSum > 0 ? supervisorTargetSum : fallback;
}

export function computeSourceDataCoverage(
  completenessPercentage: number,
  metadataCoveragePercent: number
): SourceDataCoverage {
  const operational = round2(completenessPercentage);
  const metadata = round2(metadataCoveragePercent);
  const overallReadinessPercent = round2(Math.min(operational, metadata));
  const operationalAnalyticsEnabled = operational >= STRATEGIC_KPI_COVERAGE_THRESHOLD;
  const metadataAnalyticsEnabled = metadata >= STRATEGIC_KPI_COVERAGE_THRESHOLD;
  return {
    completenessPercentage: operational,
    joinDateCoveragePercent: metadata,
    operationalCoveragePercent: operational,
    metadataCoveragePercent: metadata,
    coverage: overallReadinessPercent,
    overallReadinessPercent,
    operationalAnalyticsEnabled,
    metadataAnalyticsEnabled,
    strategicKpisEnabled: overallReadinessPercent >= STRATEGIC_KPI_COVERAGE_THRESHOLD,
    insufficientDataLabelAr: 'بيانات غير كافية',
  };
}

const RAW_SOURCE = 'البيانات اليومية — التاريخ (0)، كود المندوب (1)، ساعات (2)، طلبات (6)';

export function buildTalabatAuditTraces(
  metrics: TalabatFleetMetrics,
  recordsRead: number,
  strategicKpisEnabled: boolean
): KpiAuditTrace[] {
  const status: KpiAuditTrace['status'] = strategicKpisEnabled ? 'valid' : 'insufficient_data';
  return [
    {
      kpi: 'العدد الإجمالي (Headcount)',
      formula: 'COUNT(المناديب في النطاق)',
      numerator: metrics.headcount,
      numeratorLabel: 'طيارون مسجلون في النطاق',
      denominator: 1,
      denominatorLabel: '—',
      rawDataSource: 'المناديب — كود المندوب (A)',
      recordsRead,
      result: metrics.headcount,
      status,
    },
    {
      kpi: 'متوسط الطيارين النشطين يومياً',
      formula: 'AVG(COUNT(DISTINCT rider WHERE hours > 0 ON DAY))',
      numerator: round2(
        metrics.dailySeries.reduce((s, d) => s + d.activeRiders, 0)
      ),
      numeratorLabel: `مجموع النشطين اليومي (${metrics.calendarDays} يوم)`,
      denominator: metrics.calendarDays,
      denominatorLabel: 'أيام التقويم في الفترة',
      rawDataSource: RAW_SOURCE,
      recordsRead,
      result: metrics.activeRiders,
      status,
    },
    {
      kpi: 'متوسط No Show يومياً',
      formula:
        'AVG على أيام التشغيل فقط: COUNT(طيار مجدول/معيّن بصف يومي AND hours=0 AND orders=0) — يُستبعد المعيّن بلا صف',
      numerator: round2(
        metrics.dailySeries
          .filter((d) => d.scheduledRiders > 0)
          .reduce((s, d) => s + d.noShowRiders, 0)
      ),
      numeratorLabel: `مجموع No Show (${metrics.operationalDays} يوم تشغيل)`,
      denominator: metrics.operationalDays || 1,
      denominatorLabel: 'أيام بها طيارون مجدولون (صف يومي)',
      rawDataSource: `${RAW_SOURCE} + المناديب (معيّن للمشرف)`,
      recordsRead,
      result: metrics.noShowRiders,
      status,
    },
    {
      kpi: 'متوسط الساعات الفعلية يومياً',
      formula: 'AVG(SUM(hours) ON DAY)',
      numerator: round2(metrics.dailySeries.reduce((s, d) => s + d.hours, 0)),
      numeratorLabel: `مجموع الساعات اليومية (${metrics.calendarDays} يوم)`,
      denominator: metrics.calendarDays,
      denominatorLabel: 'أيام التقويم في الفترة',
      rawDataSource: RAW_SOURCE,
      recordsRead,
      result: metrics.actualHours,
      status,
    },
    {
      kpi: 'متوسط الهدف اليومي',
      formula: 'AVG(SUM(supervisor.target) per day) OR baseline 1500',
      numerator: round2(metrics.dailySeries.reduce((s, d) => s + d.targetHours, 0)),
      numeratorLabel: `مجموع الأهداف اليومية (${metrics.calendarDays} يوم)`,
      denominator: metrics.calendarDays,
      denominatorLabel: 'أيام التقويم في الفترة',
      rawDataSource: 'المشرفين — التارجت اليومي',
      recordsRead,
      result: metrics.targetHours,
      status,
    },
    {
      kpi: 'نسبة تحقيق الهدف',
      formula: 'متوسط الساعات الفعلية يومياً ÷ متوسط الهدف اليومي × 100',
      numerator: metrics.actualHours,
      numeratorLabel: 'متوسط الساعات الفعلية يومياً',
      denominator: metrics.targetHours,
      denominatorLabel: 'متوسط الهدف اليومي',
      rawDataSource: RAW_SOURCE,
      recordsRead,
      result: metrics.achievementPercent,
      status,
    },
    {
      kpi: 'متوسط الساعات لكل طيار نشط',
      formula: 'متوسط الساعات الفعلية يومياً ÷ متوسط الطيارين النشطين يومياً',
      numerator: metrics.actualHours,
      numeratorLabel: 'متوسط الساعات الفعلية يومياً',
      denominator: metrics.activeRiders,
      denominatorLabel: 'متوسط الطيارين النشطين يومياً',
      rawDataSource: RAW_SOURCE,
      recordsRead,
      result: metrics.avgHoursPerActiveRider,
      status,
    },
    {
      kpi: 'معدل الاستغلال',
      formula: 'متوسط الطيارين النشطين يومياً ÷ Headcount × 100',
      numerator: metrics.activeRiders,
      numeratorLabel: 'متوسط الطيارين النشطين يومياً',
      denominator: metrics.headcount,
      denominatorLabel: 'Headcount',
      rawDataSource: `${RAW_SOURCE} + المناديب`,
      recordsRead,
      result: metrics.utilizationPercent,
      status,
    },
  ];
}

const NO_SHOW_TOLERANCE_PERCENT = 2;

export function buildNoShowComparison(
  dashboardNoShow: number,
  talabatNoShow: number | undefined
): NoShowComparison {
  if (talabatNoShow === undefined || talabatNoShow === null || !Number.isFinite(talabatNoShow)) {
    return {
      dashboardNoShow: round2(dashboardNoShow),
      talabatNoShow: null,
      deviationPercent: null,
      matchPercent: null,
      withinTolerance: null,
      tolerancePercent: NO_SHOW_TOLERANCE_PERCENT,
    };
  }

  const deviationPercent =
    talabatNoShow === 0
      ? dashboardNoShow === 0
        ? 0
        : 100
      : round2((Math.abs(dashboardNoShow - talabatNoShow) / Math.abs(talabatNoShow)) * 100);
  const matchPercent = round2(Math.max(0, 100 - deviationPercent));

  return {
    dashboardNoShow: round2(dashboardNoShow),
    talabatNoShow: round2(talabatNoShow),
    deviationPercent,
    matchPercent,
    withinTolerance: deviationPercent < NO_SHOW_TOLERANCE_PERCENT,
    tolerancePercent: NO_SHOW_TOLERANCE_PERCENT,
  };
}
