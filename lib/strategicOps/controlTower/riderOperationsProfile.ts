/**
 * Phase 2 — Rider Operations Intelligence
 *
 * Builds a full operational profile for every rider in the selected period,
 * including a day-by-day timeline, classification, risk score, and
 * contribution to the fleet gap.
 */
import { normalizeRiderCodeForPerformance } from '@/lib/dataFilter';
import { resolveRiderExpected } from '@/lib/strategicOps/controlTower/riderHistory';
import type {
  ControlTowerBuildContext,
  RiderDayRecord,
  RiderOperationsProfile,
  RiderOpsClassification,
} from '@/lib/strategicOps/controlTower/types';

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function pct(num: number, denom: number): number {
  return denom > 0 ? round2((num / denom) * 100) : 0;
}

/** Enumerate every ISO date in [start, end] inclusive. */
function enumerateDates(start: string, end: string): string[] {
  const dates: string[] = [];
  const s = new Date(start);
  const e = new Date(end);
  for (let d = new Date(s); d <= e; d.setDate(d.getDate() + 1)) {
    dates.push(d.toISOString().split('T')[0]);
  }
  return dates;
}

const OPS_CLASS_LABELS: Record<RiderOpsClassification, string> = {
  excellent: 'ممتاز',
  healthy: 'جيد',
  needs_coaching: 'يحتاج متابعة',
  frequently_late: 'يتأخر كثيراً',
  long_breaks: 'استراحات طويلة',
  low_hours: 'ساعات منخفضة',
  frequently_absent: 'يغيب كثيراً',
  inactive: 'غير نشط',
  high_potential: 'إمكانات عالية',
  declining: 'في تراجع',
  recovering: 'في تعافٍ',
};

function classifyRider(
  attendancePct: number,
  actualHoursDaily: number,
  expectedHoursDaily: number,
  avgDelayMinutesPerDay: number,
  avgBreakMinutesPerDay: number,
  fleetAvgDelay: number,
  fleetAvgBreak: number,
  workingDays: number,
  periodDays: number
): RiderOpsClassification {
  if (workingDays === 0) return 'inactive';

  const utilizationRatio = expectedHoursDaily > 0 ? actualHoursDaily / expectedHoursDaily : 1;
  const activeRatio = workingDays / Math.max(1, periodDays);

  const isFrequentlyAbsent = attendancePct < 60;
  const isFrequentlyLate = avgDelayMinutesPerDay > fleetAvgDelay + 10;
  const hasLongBreaks = avgBreakMinutesPerDay > fleetAvgBreak + 15;
  const isLowHours = utilizationRatio < 0.7 && !isFrequentlyAbsent;
  const isDeclining = utilizationRatio < 0.7 && activeRatio >= 0.5;

  if (isFrequentlyAbsent) return 'frequently_absent';
  if (isDeclining) return 'declining';
  if (isFrequentlyLate && hasLongBreaks) return 'needs_coaching';
  if (isFrequentlyLate) return 'frequently_late';
  if (hasLongBreaks) return 'long_breaks';
  if (isLowHours) return 'low_hours';

  if (attendancePct >= 90 && utilizationRatio >= 0.95 && avgDelayMinutesPerDay < 5) {
    return 'excellent';
  }
  if (utilizationRatio >= 0.85 && attendancePct >= 75) return 'healthy';
  if (utilizationRatio >= 0.6 && activeRatio > 0.7) return 'recovering';
  if (utilizationRatio >= 0.85 && attendancePct < 75) return 'high_potential';

  return 'needs_coaching';
}

function computeRiskScore(
  attendancePct: number,
  utilizationRatio: number,
  avgDelayMinutesPerDay: number,
  avgBreakMinutesPerDay: number,
  fleetAvgDelay: number,
  fleetAvgBreak: number
): number {
  let score = 0;

  // Absence risk (0–40 pts)
  score += Math.min(40, Math.max(0, (100 - attendancePct) * 0.5));

  // Utilization risk (0–30 pts)
  const utilizationShortfall = Math.max(0, 1 - utilizationRatio);
  score += Math.min(30, utilizationShortfall * 60);

  // Late penalty (0–15 pts)
  const excessDelay = Math.max(0, avgDelayMinutesPerDay - fleetAvgDelay);
  score += Math.min(15, excessDelay * 0.5);

  // Break penalty (0–15 pts)
  const excessBreak = Math.max(0, avgBreakMinutesPerDay - fleetAvgBreak);
  score += Math.min(15, excessBreak * 0.3);

  return round2(Math.min(100, score));
}

function computePerformanceScore(
  attendancePct: number,
  utilizationRatio: number,
  avgDelayMinutesPerDay: number,
  avgBreakMinutesPerDay: number,
  fleetAvgDelay: number,
  fleetAvgBreak: number
): number {
  let score = 100;

  // Attendance component (max 40 pts)
  score -= Math.min(40, Math.max(0, (100 - attendancePct) * 0.5));

  // Hours performance (max 35 pts)
  const hoursPenalty = Math.max(0, 1 - utilizationRatio) * 50;
  score -= Math.min(35, hoursPenalty);

  // Delay penalty (max 15 pts)
  const excessDelay = Math.max(0, avgDelayMinutesPerDay - fleetAvgDelay);
  score -= Math.min(15, excessDelay * 0.4);

  // Break penalty (max 10 pts)
  const excessBreak = Math.max(0, avgBreakMinutesPerDay - fleetAvgBreak);
  score -= Math.min(10, excessBreak * 0.2);

  return round2(Math.max(0, Math.min(100, score)));
}

export function buildRiderOperationsProfiles(
  ctx: ControlTowerBuildContext
): RiderOperationsProfile[] {
  const {
    riders,
    richPerformance,
    riderHistoricalBaselines,
    avgHoursPerActiveRider,
    operationalPeriodDays,
    startDate,
    endDate,
    fleetTalabat,
  } = ctx;

  if (!richPerformance || richPerformance.length === 0) return [];

  const periodDays = Math.max(1, operationalPeriodDays);
  const fleetAvgHours = avgHoursPerActiveRider > 0 ? avgHoursPerActiveRider : 5;
  const totalGap = Math.max(0, fleetTalabat.targetHours - fleetTalabat.actualHours);
  const allDates = enumerateDates(startDate, endDate);

  // Build per-rider performance map keyed by normalized code + date
  const byRiderDate = new Map<string, { hours: number; orders: number; breakMinutes: number; delayMinutes: number }>();
  const riderDates = new Map<string, Set<string>>();

  for (const rec of richPerformance) {
    const norm = normalizeRiderCodeForPerformance(rec.riderCode);
    if (!norm) continue;
    const key = `${norm}|${rec.date}`;
    const existing = byRiderDate.get(key);
    if (!existing) {
      byRiderDate.set(key, {
        hours: rec.hours,
        orders: rec.orders,
        breakMinutes: rec.breakMinutes,
        delayMinutes: rec.delayMinutes,
      });
    } else {
      existing.hours += rec.hours;
      existing.orders += rec.orders;
      existing.breakMinutes += rec.breakMinutes;
      existing.delayMinutes += rec.delayMinutes;
    }
    const dates = riderDates.get(norm) ?? new Set<string>();
    dates.add(rec.date);
    riderDates.set(norm, dates);
  }

  // Fleet-level averages for classification thresholds
  let fleetTotalDelay = 0;
  let fleetTotalBreak = 0;
  let fleetActiveRiderDays = 0;

  for (const [, data] of byRiderDate) {
    if (data.hours > 0) {
      fleetTotalDelay += data.delayMinutes;
      fleetTotalBreak += data.breakMinutes;
      fleetActiveRiderDays++;
    }
  }

  const fleetAvgDelay = fleetActiveRiderDays > 0 ? fleetTotalDelay / fleetActiveRiderDays : 10;
  const fleetAvgBreak = fleetActiveRiderDays > 0 ? fleetTotalBreak / fleetActiveRiderDays : 20;

  const profiles: RiderOperationsProfile[] = [];

  for (const rider of riders) {
    const norm = normalizeRiderCodeForPerformance(rider.code);
    if (!norm) continue;

    const supervisorName = rider.supervisorName || ctx.supervisorNameByCode.get(rider.supervisorCode) || rider.supervisorCode;

    // Build day-by-day timeline
    const timeline: RiderDayRecord[] = [];
    let totalHours = 0;
    let totalOrders = 0;
    let totalBreakMinutes = 0;
    let totalDelayMinutes = 0;
    let workingDays = 0;
    let absentDays = 0;

    for (const date of allDates) {
      const key = `${norm}|${date}`;
      const dayData = byRiderDate.get(key);

      if (dayData) {
        const status =
          dayData.hours > 0
            ? 'worked'
            : dayData.orders > 0
            ? 'partial'
            : 'no_show';

        timeline.push({
          date,
          status,
          hours: round2(dayData.hours),
          orders: dayData.orders,
          breakMinutes: round2(dayData.breakMinutes),
          delayMinutes: round2(dayData.delayMinutes),
        });

        if (dayData.hours > 0) {
          workingDays++;
          totalHours += dayData.hours;
          totalOrders += dayData.orders;
          totalBreakMinutes += dayData.breakMinutes;
          totalDelayMinutes += dayData.delayMinutes;
        } else {
          absentDays++;
        }
      } else {
        timeline.push({
          date,
          status: 'absent',
          hours: 0,
          orders: 0,
          breakMinutes: 0,
          delayMinutes: 0,
        });
        absentDays++;
      }
    }

    const inactiveDays = Math.max(0, periodDays - workingDays - absentDays);
    const attendancePct = pct(workingDays, periodDays);
    const avgHoursPerWorkingDay = workingDays > 0 ? round2(totalHours / workingDays) : 0;
    const actualHoursDaily = round2(totalHours / periodDays);
    const avgBreakMinutesPerDay = workingDays > 0 ? round2(totalBreakMinutes / workingDays) : 0;
    const avgDelayMinutesPerDay = workingDays > 0 ? round2(totalDelayMinutes / workingDays) : 0;

    // Resolve expected hours from historical baseline
    const expected = resolveRiderExpected(
      rider.code,
      riderHistoricalBaselines ?? new Map(),
      fleetAvgHours,
      0
    );
    const expectedHoursDaily = expected.hours;

    const lostHoursDaily = round2(Math.max(0, expectedHoursDaily - actualHoursDaily));
    const lostHoursPeriod = round2(lostHoursDaily * periodDays);
    const utilizationPct = expectedHoursDaily > 0 ? pct(actualHoursDaily, expectedHoursDaily) : attendancePct;
    const utilizationRatio = expectedHoursDaily > 0 ? actualHoursDaily / expectedHoursDaily : actualHoursDaily / fleetAvgHours;

    const classification = classifyRider(
      attendancePct,
      actualHoursDaily,
      expectedHoursDaily,
      avgDelayMinutesPerDay,
      avgBreakMinutesPerDay,
      fleetAvgDelay,
      fleetAvgBreak,
      workingDays,
      periodDays
    );

    const riskScore = computeRiskScore(
      attendancePct,
      utilizationRatio,
      avgDelayMinutesPerDay,
      avgBreakMinutesPerDay,
      fleetAvgDelay,
      fleetAvgBreak
    );

    const performanceScore = computePerformanceScore(
      attendancePct,
      utilizationRatio,
      avgDelayMinutesPerDay,
      avgBreakMinutesPerDay,
      fleetAvgDelay,
      fleetAvgBreak
    );

    const attendanceStars = Math.min(5, Math.floor(attendancePct / 20));
    const contributionToFleetGap = totalGap > 0 ? round2((lostHoursDaily / totalGap) * 100) : 0;

    profiles.push({
      code: rider.code,
      name: rider.name,
      supervisorCode: rider.supervisorCode,
      supervisorName,
      zone: rider.region,
      contractType: rider.contractType ?? '',
      workingDays,
      absentDays,
      inactiveDays,
      totalHours: round2(totalHours),
      avgHoursPerWorkingDay,
      totalBreakMinutes: round2(totalBreakMinutes),
      avgBreakMinutesPerDay,
      totalDelayMinutes: round2(totalDelayMinutes),
      avgDelayMinutesPerDay,
      totalOrders,
      attendancePct,
      utilizationPct,
      expectedHoursDaily,
      actualHoursDaily,
      lostHoursDaily,
      lostHoursPeriod,
      classification,
      classificationLabelAr: OPS_CLASS_LABELS[classification],
      performanceScore,
      riskScore,
      contributionToFleetGap,
      timeline,
      attendanceStars,
    });
  }

  // Sort by lostHoursDaily descending
  profiles.sort((a, b) => b.lostHoursDaily - a.lostHoursDaily);
  return profiles;
}
