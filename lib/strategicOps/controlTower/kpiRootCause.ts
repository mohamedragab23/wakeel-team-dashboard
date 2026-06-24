import type { SupervisorOpsRow } from '@/lib/strategicOps/buildReport';
import type {
  ControlTowerBuildContext,
  KpiKey,
  KpiRootCause,
  KpiTrendComparison,
} from '@/lib/strategicOps/controlTower/types';
import {
  round2,
  supervisorImpliedTargetDaily,
  supervisorLostTargetDaily,
} from '@/lib/strategicOps/controlTower/supervisorMetrics';

function trendForKey(comparisons: KpiTrendComparison[], kpiKey: KpiKey): KpiTrendComparison {
  return comparisons.find((c) => c.kpiKey === kpiKey)!;
}

function aggregateByCity(supervisorRows: SupervisorOpsRow[]): Map<string, SupervisorOpsRow[]> {
  const map = new Map<string, SupervisorOpsRow[]>();
  for (const s of supervisorRows) {
    const zone = String(s.region ?? '').trim() || 'غير محدد';
    const list = map.get(zone) ?? [];
    list.push(s);
    map.set(zone, list);
  }
  return map;
}

function topSupervisorsBy(
  rows: SupervisorOpsRow[],
  metric: (s: SupervisorOpsRow) => number,
  unit: string,
  limit = 5
) {
  return rows
    .map((s) => ({
      code: s.code,
      name: s.name,
      contribution: round2(metric(s)),
      unit,
    }))
    .filter((s) => s.contribution > 0)
    .sort((a, b) => b.contribution - a.contribution)
    .slice(0, limit);
}

function topCitiesBy(
  supervisorRows: SupervisorOpsRow[],
  metric: (rows: SupervisorOpsRow[]) => number,
  unit: string,
  limit = 5
) {
  const byCity = aggregateByCity(supervisorRows);
  return Array.from(byCity.entries())
    .map(([zone, rows]) => ({
      zone,
      contribution: round2(metric(rows)),
      unit,
    }))
    .filter((c) => c.contribution > 0)
    .sort((a, b) => b.contribution - a.contribution)
    .slice(0, limit);
}

export function formatKpiTrendSummary(trend: KpiTrendComparison): string {
  const parts: string[] = [];
  if (trend.deltaPercent7 !== null) {
    parts.push(`7d: ${trend.deltaPercent7 > 0 ? '+' : ''}${trend.deltaPercent7}%`);
  }
  if (trend.deltaPercent14 !== null) {
    parts.push(`14d: ${trend.deltaPercent14 > 0 ? '+' : ''}${trend.deltaPercent14}%`);
  }
  if (trend.deltaPercent30 !== null) {
    parts.push(`30d: ${trend.deltaPercent30 > 0 ? '+' : ''}${trend.deltaPercent30}%`);
  }
  return parts.join(' · ') || 'لا توجد بيانات سابقة كافية';
}

export function buildKpiRootCauses(
  ctx: ControlTowerBuildContext,
  supervisorRows: SupervisorOpsRow[],
  periodComparisons: KpiTrendComparison[]
): KpiRootCause[] {
  const { fleetTalabat, inactiveRiders, operationalPeriodDays } = ctx;
  const gapHours = Math.max(0, fleetTalabat.targetHours - fleetTalabat.actualHours);
  const gapRiders = Math.max(0, fleetTalabat.headcount - fleetTalabat.activeRiders);
  const gapShifts = fleetTalabat.dailySeries.reduce(
    (s, d) => s + Math.max(0, d.scheduledRiders - d.activeRiders),
    0
  );

  const builders: Array<Omit<KpiRootCause, 'trend'> & { key: KpiKey }> = [
    {
      key: 'headcount',
      kpiKey: 'headcount',
      kpiLabelAr: 'Headcount',
      summaryAr: `${fleetTalabat.headcount} طيار مسجل — ${inactiveRiders} بدون نشاط (${round2((inactiveRiders / Math.max(fleetTalabat.headcount, 1)) * 100)}%).`,
      confidenceLevel: 'medium',
      factors: [
        { labelAr: 'غير نشطين', value: String(inactiveRiders), impactAr: 'يخفض الاستغلال' },
        { labelAr: 'إجمالي المسجلين', value: String(fleetTalabat.headcount), impactAr: 'قاعدة Headcount' },
        {
          labelAr: 'جدد',
          value: String(supervisorRows.reduce((s, r) => s + r.newHires, 0)),
          impactAr: 'قد يحتاجون تفعيل',
        },
      ],
      topSupervisors: topSupervisorsBy(supervisorRows, (s) => s.inactiveRiders, 'طيار'),
      topCities: topCitiesBy(supervisorRows, (rows) => rows.reduce((s, r) => s + r.inactiveRiders, 0), 'طيار'),
    },
    {
      key: 'activeRiders',
      kpiKey: 'activeRiders',
      kpiLabelAr: 'الطيارون النشطون',
      summaryAr: `${fleetTalabat.activeRiders} نشط/يوم — فجوة ${round2(gapRiders)} طيار/يوم.`,
      confidenceLevel: 'high',
      factors: [
        { labelAr: 'فجوة الطيارين', value: `${round2(gapRiders)}/يوم`, impactAr: 'headcount − active' },
        { labelAr: 'No Show', value: String(fleetTalabat.noShowRiders), impactAr: 'مجدول ولم يعمل' },
        { labelAr: 'غير نشطين', value: String(inactiveRiders), impactAr: 'صفر ساعات' },
      ],
      topSupervisors: topSupervisorsBy(
        supervisorRows,
        (s) => Math.max(0, s.headcount - s.activeRiders),
        'طيار/يوم'
      ),
      topCities: topCitiesBy(
        supervisorRows,
        (rows) => rows.reduce((s, r) => s + Math.max(0, r.headcount - r.activeRiders), 0),
        'طيار/يوم'
      ),
    },
    {
      key: 'noShowRiders',
      kpiKey: 'noShowRiders',
      kpiLabelAr: 'No Show',
      summaryAr: `${fleetTalabat.noShowRiders} no-show/يوم — ≈ ${round2(fleetTalabat.noShowRiders * ctx.avgHoursPerActiveRider)} ساعة/يوم مفقودة.`,
      confidenceLevel: 'high',
      factors: [
        {
          labelAr: 'ساعات مفقودة',
          value: `${round2(fleetTalabat.noShowRiders * ctx.avgHoursPerActiveRider)}/يوم`,
          impactAr: 'no-show × متوسط النشط',
        },
        { labelAr: 'متوسط No Show', value: String(fleetTalabat.noShowRiders), impactAr: 'يومياً' },
        { labelAr: 'أيام تشغيل', value: String(fleetTalabat.operationalDays), impactAr: 'بجدولة' },
      ],
      topSupervisors: topSupervisorsBy(supervisorRows, (s) => s.noShowRiders, 'no-show/يوم'),
      topCities: topCitiesBy(
        supervisorRows,
        (rows) => rows.reduce((s, r) => s + r.noShowRiders, 0),
        'no-show/يوم'
      ),
    },
    {
      key: 'actualHours',
      kpiKey: 'actualHours',
      kpiLabelAr: 'الساعات الفعلية',
      summaryAr: `${fleetTalabat.actualHours} س/يوم — أقل من الهدف بـ ${round2(gapHours)} س/يوم.`,
      confidenceLevel: 'high',
      factors: [
        { labelAr: 'فجوة الساعات', value: `${round2(gapHours)}/يوم`, impactAr: 'هدف − فعلي' },
        { labelAr: 'No Show', value: String(fleetTalabat.noShowRiders), impactAr: 'غياب مجدول' },
        { labelAr: 'غير نشطين', value: String(inactiveRiders), impactAr: 'طيارون بصفر' },
      ],
      topSupervisors: topSupervisorsBy(supervisorRows, supervisorLostTargetDaily, 'س/يوم'),
      topCities: topCitiesBy(
        supervisorRows,
        (rows) => rows.reduce((s, r) => s + supervisorLostTargetDaily(r), 0),
        'س/يوم'
      ),
    },
    {
      key: 'targetHours',
      kpiKey: 'targetHours',
      kpiLabelAr: 'الهدف',
      summaryAr: `الهدف ${fleetTalabat.targetHours} س/يوم — تحقيق ${fleetTalabat.achievementPercent}%.`,
      confidenceLevel: 'high',
      factors: [
        { labelAr: 'التحقيق', value: `${fleetTalabat.achievementPercent}%`, impactAr: 'فعلي ÷ هدف' },
        { labelAr: 'فجوة الساعات', value: `${round2(gapHours)}/يوم`, impactAr: 'ناقص' },
        { labelAr: 'مشرفون', value: String(supervisorRows.length), impactAr: 'مجموع الأهداف' },
      ],
      topSupervisors: topSupervisorsBy(supervisorRows, supervisorImpliedTargetDaily, 'س/يوم هدف'),
      topCities: topCitiesBy(
        supervisorRows,
        (rows) => rows.reduce((s, r) => s + supervisorImpliedTargetDaily(r), 0),
        'س/يوم هدف'
      ),
    },
    {
      key: 'achievementPercent',
      kpiKey: 'achievementPercent',
      kpiLabelAr: 'نسبة تحقيق الهدف',
      summaryAr: `التحقيق ${fleetTalabat.achievementPercent}% — نقص ${round2(gapHours)} س/يوم، ${round2(gapRiders)} طيار/يوم، ${gapShifts} وردية-طيار (تقدير).`,
      confidenceLevel: 'high',
      factors: [
        { labelAr: 'ساعات ناقصة', value: `${round2(gapHours)}/يوم`, impactAr: 'السبب الرئيسي' },
        { labelAr: 'طيارون ناقصون', value: `${round2(gapRiders)}/يوم`, impactAr: 'استغلال' },
        {
          labelAr: 'No Show',
          value: String(fleetTalabat.noShowRiders),
          impactAr: `≈ ${round2(fleetTalabat.noShowRiders * ctx.avgHoursPerActiveRider)} س/يوم`,
        },
      ],
      topSupervisors: topSupervisorsBy(supervisorRows, supervisorLostTargetDaily, 'س/يوم'),
      topCities: topCitiesBy(
        supervisorRows,
        (rows) => rows.reduce((s, r) => s + supervisorLostTargetDaily(r), 0),
        'س/يوم'
      ),
    },
    {
      key: 'utilizationPercent',
      kpiKey: 'utilizationPercent',
      kpiLabelAr: 'معدل الاستغلال',
      summaryAr: `الاستغلال ${fleetTalabat.utilizationPercent}% — ${round2(gapRiders)} طيار/يوم غير مُستغَل.`,
      confidenceLevel: 'medium',
      factors: [
        { labelAr: 'فجوة الطيارين', value: `${round2(gapRiders)}/يوم`, impactAr: 'headcount − active' },
        { labelAr: 'غير نشطين', value: String(inactiveRiders), impactAr: 'بالفترة' },
        { labelAr: 'أيام الفترة', value: String(operationalPeriodDays), impactAr: 'نطاق التحليل' },
      ],
      topSupervisors: topSupervisorsBy(
        supervisorRows,
        (s) => Math.max(0, s.headcount - s.activeRiders),
        'طيار/يوم'
      ),
      topCities: topCitiesBy(
        supervisorRows,
        (rows) => rows.reduce((s, r) => s + Math.max(0, r.headcount - r.activeRiders), 0),
        'طيار/يوم'
      ),
    },
  ];

  return builders.map((b) => ({
    kpiKey: b.kpiKey,
    kpiLabelAr: b.kpiLabelAr,
    summaryAr: b.summaryAr,
    confidenceLevel: b.confidenceLevel,
    factors: b.factors,
    topSupervisors: b.topSupervisors,
    topCities: b.topCities,
    trend: trendForKey(periodComparisons, b.key),
  }));
}
