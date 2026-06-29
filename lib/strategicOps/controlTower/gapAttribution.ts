/**
 * Phase 2 — Gap Attribution
 *
 * Breaks the total fleet hours gap into 5 mutually exclusive, exhaustive causes.
 * No double-counting is enforced by sequential allocation (residual method).
 *
 * Attribution order (highest-certainty first):
 *   1. absence   — riders who did not appear at all (no-show)
 *   2. inactive  — riders who have been absent for 3+ consecutive days (not officially departed)
 *   3. late      — verified delay minutes converted to hours (only riders who actually worked)
 *   4. break     — excess break minutes above fleet average (only riders who actually worked)
 *   5. low_hours — residual: everything else in the gap that could not be attributed above
 */
import { normalizeRiderCodeForPerformance } from '@/lib/dataFilter';
import type {
  ControlTowerBuildContext,
  GapAttribution,
} from '@/lib/strategicOps/controlTower/types';

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

const CAUSE_LABELS: Record<string, string> = {
  absence: 'غياب (No Show)',
  inactive: 'طيارون غير نشطون',
  late: 'تأخير في الوصول',
  break: 'استراحات زائدة',
  low_hours: 'ساعات منخفضة',
};

export function buildGapAttribution(ctx: ControlTowerBuildContext): GapAttribution {
  const {
    fleetTalabat,
    richPerformance,
    riders,
    avgHoursPerActiveRider,
    operationalPeriodDays,
    startDate,
    endDate,
  } = ctx;

  const totalGap = round2(Math.max(0, fleetTalabat.targetHours - fleetTalabat.actualHours));

  if (totalGap <= 0 || !richPerformance || richPerformance.length === 0) {
    return {
      totalGap: 0,
      causes: ['absence', 'inactive', 'late', 'break', 'low_hours'].map((key) => ({
        causeKey: key as GapAttribution['causes'][number]['causeKey'],
        causeLabelAr: CAUSE_LABELS[key],
        hoursLost: 0,
        pctOfGap: 0,
      })),
      validationPassed: true,
    };
  }

  const periodDays = Math.max(1, operationalPeriodDays);
  const fleetAvgHours = avgHoursPerActiveRider > 0 ? avgHoursPerActiveRider : 5;

  // Enumerate all dates in the period
  const allDates: string[] = [];
  const s = new Date(startDate);
  const e = new Date(endDate);
  for (let d = new Date(s); d <= e; d.setDate(d.getDate() + 1)) {
    allDates.push(d.toISOString().split('T')[0]);
  }

  // Build rider-date performance map from richPerformance
  const byRiderDate = new Map<string, { hours: number; breakMinutes: number; delayMinutes: number }>();
  for (const rec of richPerformance) {
    const norm = normalizeRiderCodeForPerformance(rec.riderCode);
    if (!norm) continue;
    const key = `${norm}|${rec.date}`;
    const existing = byRiderDate.get(key);
    if (!existing) {
      byRiderDate.set(key, {
        hours: rec.hours,
        breakMinutes: rec.breakMinutes,
        delayMinutes: rec.delayMinutes,
      });
    } else {
      existing.hours += rec.hours;
      existing.breakMinutes += rec.breakMinutes;
      existing.delayMinutes += rec.delayMinutes;
    }
  }

  // Compute fleet average break per working day for excess calculation
  let fleetTotalBreak = 0;
  let fleetWorkingDays = 0;
  for (const [, data] of byRiderDate) {
    if (data.hours > 0) {
      fleetTotalBreak += data.breakMinutes;
      fleetWorkingDays++;
    }
  }
  const fleetAvgBreakPerDay = fleetWorkingDays > 0 ? fleetTotalBreak / fleetWorkingDays : 20;

  // Categorize each rider-day
  let absenceGap = 0;
  let inactiveGap = 0;
  let lateGap = 0;
  let breakGap = 0;

  // Track consecutive inactive days for each rider
  const riderLastActiveDate = new Map<string, string>();
  const riderNorms = new Set(
    riders
      .map((r) => normalizeRiderCodeForPerformance(r.code))
      .filter((n): n is string => Boolean(n))
  );

  // Process each rider × each date
  for (const norm of riderNorms) {
    let consecutiveAbsent = 0;

    for (const date of allDates) {
      const key = `${norm}|${date}`;
      const dayData = byRiderDate.get(key);

      if (!dayData || dayData.hours === 0) {
        consecutiveAbsent++;

        if (consecutiveAbsent >= 3) {
          // Inactive: 3+ consecutive absent days → inactiveGap
          inactiveGap += fleetAvgHours;
        } else {
          // Absent (no-show): counted as absenceGap
          absenceGap += fleetAvgHours;
        }
      } else {
        // Rider worked this day
        consecutiveAbsent = 0;
        riderLastActiveDate.set(norm, date);

        // Late gap: delay minutes converted to hours
        const delayHours = dayData.delayMinutes / 60;
        lateGap += delayHours;

        // Break gap: excess above fleet average
        const excessBreakMinutes = Math.max(0, dayData.breakMinutes - fleetAvgBreakPerDay);
        const excessBreakHours = excessBreakMinutes / 60;
        breakGap += excessBreakHours;
      }
    }
  }

  // All gap values are in hours — average to daily
  absenceGap = round2(absenceGap / periodDays);
  inactiveGap = round2(inactiveGap / periodDays);
  lateGap = round2(lateGap / periodDays);
  breakGap = round2(breakGap / periodDays);

  // Cap each cause so they don't exceed total gap individually
  absenceGap = Math.min(absenceGap, totalGap);
  inactiveGap = Math.min(inactiveGap, Math.max(0, totalGap - absenceGap));
  lateGap = Math.min(lateGap, Math.max(0, totalGap - absenceGap - inactiveGap));
  breakGap = Math.min(breakGap, Math.max(0, totalGap - absenceGap - inactiveGap - lateGap));

  // Residual: low_hours (everything not attributed above)
  const attributed = absenceGap + inactiveGap + lateGap + breakGap;
  const lowHoursGap = round2(Math.max(0, totalGap - attributed));

  // Normalize to get percentages
  const causes: GapAttribution['causes'] = [
    { causeKey: 'absence', causeLabelAr: CAUSE_LABELS.absence, hoursLost: absenceGap, pctOfGap: totalGap > 0 ? round2((absenceGap / totalGap) * 100) : 0 },
    { causeKey: 'inactive', causeLabelAr: CAUSE_LABELS.inactive, hoursLost: inactiveGap, pctOfGap: totalGap > 0 ? round2((inactiveGap / totalGap) * 100) : 0 },
    { causeKey: 'late', causeLabelAr: CAUSE_LABELS.late, hoursLost: lateGap, pctOfGap: totalGap > 0 ? round2((lateGap / totalGap) * 100) : 0 },
    { causeKey: 'break', causeLabelAr: CAUSE_LABELS.break, hoursLost: breakGap, pctOfGap: totalGap > 0 ? round2((breakGap / totalGap) * 100) : 0 },
    { causeKey: 'low_hours', causeLabelAr: CAUSE_LABELS.low_hours, hoursLost: lowHoursGap, pctOfGap: totalGap > 0 ? round2((lowHoursGap / totalGap) * 100) : 0 },
  ];

  const sumAttributed = absenceGap + inactiveGap + lateGap + breakGap + lowHoursGap;
  const validationPassed = Math.abs(sumAttributed - totalGap) <= totalGap * 0.01 + 0.5;

  return { totalGap, causes, validationPassed };
}
