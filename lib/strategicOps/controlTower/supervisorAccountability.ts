/**
 * Priority 4: Supervisor Accountability Breakdown
 * Decomposes each supervisor's total lost hours into 4 contributing causes,
 * normalized to 100%. Generates a data-driven recommendation.
 */
import { normalizeRiderCodeForPerformance } from '@/lib/dataFilter';
import { resolveRiderExpected } from '@/lib/strategicOps/controlTower/riderHistory';
import type {
  ControlTowerBuildContext,
  SupervisorAccountabilityBreakdown,
} from '@/lib/strategicOps/controlTower/types';
import type { SupervisorOpsRow } from '@/lib/strategicOps/buildReport';

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

export function buildSupervisorAccountabilityBreakdowns(
  ctx: ControlTowerBuildContext,
  supervisorRows: SupervisorOpsRow[]
): SupervisorAccountabilityBreakdown[] {
  const { riders, performance, avgHoursPerActiveRider, operationalPeriodDays } = ctx;
  const baselines = ctx.riderHistoricalBaselines ?? new Map();
  const days = Math.max(1, operationalPeriodDays);

  // Index performance by normalized rider code
  const perfByRider = new Map<string, Array<{ date: string; hours: number; orders: number }>>();
  for (const row of performance) {
    const norm = normalizeRiderCodeForPerformance(row.riderCode);
    if (!norm) continue;
    const list = perfByRider.get(norm) ?? [];
    list.push({ date: row.date, hours: row.hours, orders: row.orders });
    perfByRider.set(norm, list);
  }

  // Get all dates in the current period (sorted)
  const allDates = Array.from(
    new Set(performance.map((p) => p.date))
  ).sort();
  const periodDateCount = allDates.length > 0 ? allDates.length : days;

  const results: SupervisorAccountabilityBreakdown[] = [];

  for (const sup of supervisorRows) {
    const supRiders = riders.filter((r) => {
      const rSup = String(r.supervisorCode ?? '').trim();
      return rSup === String(sup.code ?? '').trim();
    });

    if (supRiders.length === 0) continue;

    // Compute avg expected hours for this supervisor's team
    let teamExpectedSum = 0;
    let teamRiderCount = 0;
    for (const r of supRiders) {
      const { hours: exp } = resolveRiderExpected(r.code, baselines, avgHoursPerActiveRider, 0);
      if (exp > 0) { teamExpectedSum += exp; teamRiderCount++; }
    }
    const avgExpectedPerRider = teamRiderCount > 0 ? round2(teamExpectedSum / teamRiderCount) : avgHoursPerActiveRider;

    // Categorize each rider's contribution to lost hours
    let noShowLost = 0;
    let lowHoursLost = 0;
    let inactiveLost = 0;

    for (const r of supRiders) {
      const norm = normalizeRiderCodeForPerformance(r.code);
      if (!norm) continue;
      const { hours: expectedH } = resolveRiderExpected(r.code, baselines, avgHoursPerActiveRider, 0);
      const riderPerf = perfByRider.get(norm) ?? [];
      const totalRiderHours = riderPerf.reduce((s, p) => s + p.hours, 0);

      if (riderPerf.length === 0) {
        // Rider has no data in performance sheet at all — inactive
        inactiveLost += expectedH * days;
      } else {
        // Check each day
        const riderDateSet = new Set(riderPerf.map((p) => p.date));
        for (const date of allDates) {
          const dayRec = riderPerf.find((p) => p.date === date);
          if (!dayRec) {
            // Date exists in fleet data but not for this rider — no-show day
            noShowLost += expectedH;
          } else if (dayRec.hours === 0) {
            // Explicit zero — no-show
            noShowLost += expectedH;
          } else if (dayRec.hours < expectedH) {
            // Worked but below expected
            lowHoursLost += expectedH - dayRec.hours;
          }
        }
      }
    }

    // Attrition: not available in context — treated as 0
    const attritionLost = 0;

    const totalComponents = noShowLost + lowHoursLost + inactiveLost + attritionLost;

    // If no loss components, skip
    if (totalComponents <= 0.1) continue;

    // Normalize to 100%
    const noShowPct = Math.round((noShowLost / totalComponents) * 100);
    const lowHoursPct = Math.round((lowHoursLost / totalComponents) * 100);
    const inactivePct = Math.round((inactiveLost / totalComponents) * 100);
    // Adjust for rounding to ensure exactly 100
    const attritionPct = Math.max(0, 100 - noShowPct - lowHoursPct - inactivePct);

    const dominantMap: [number, 'noShow' | 'lowHours' | 'inactive' | 'attrition'][] = [
      [noShowPct, 'noShow'],
      [lowHoursPct, 'lowHours'],
      [inactivePct, 'inactive'],
      [attritionPct, 'attrition'],
    ];
    const dominantCause = dominantMap.sort((a, b) => b[0] - a[0])[0][1];

    const RECOMMENDATIONS: Record<typeof dominantCause, string> = {
      noShow: 'أولوية اليوم: متابعة الغائبين فوراً — اتصال مباشر قبل بداية الشفت',
      lowHours: 'أولوية اليوم: دفع ساعات العمل للمناديب النشطين — مراقبة الأداء اللحظي',
      inactive: 'أولوية اليوم: إعادة تفعيل المناديب المتوقفين — حملة تواصل فورية',
      attrition: 'أولوية اليوم: فتح تعيينات جديدة عاجلة — التنسيق مع قسم التوظيف',
    };

    const supervisorTargetHoursDaily = sup.dailyHours > 0 && sup.achievementPercent > 0
      ? round2(sup.dailyHours / (sup.achievementPercent / 100))
      : 0;
    const totalLostHours = round2(Math.max(0, supervisorTargetHoursDaily - sup.dailyHours));

    results.push({
      supervisorCode: String(sup.code ?? '').trim(),
      supervisorName: sup.name,
      totalLostHours,
      noShowLostHours: round2(noShowLost / periodDateCount),
      noShowPct,
      lowHoursLostHours: round2(lowHoursLost / periodDateCount),
      lowHoursPct,
      inactiveLostHours: round2(inactiveLost / periodDateCount),
      inactivePct,
      attritionLostHours: 0,
      attritionPct,
      dominantCause,
      recommendationAr: RECOMMENDATIONS[dominantCause],
    });
  }

  return results.sort((a, b) => b.totalLostHours - a.totalLostHours);
}
