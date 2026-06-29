/**
 * Phase 2 — Recovery Simulator (server-side inputs)
 *
 * Precomputes the maximum recoverable hours per intervention lever at 100%
 * effectiveness. The UI handles sliders as pure React state — no API calls.
 *
 * Levers:
 *   1. No-show recovery    — if all no-show riders return to their average hours
 *   2. Break reduction     — if all excess break minutes above fleet avg are eliminated
 *   3. Late reduction      — if all late minutes are eliminated
 *   4. Inactive recovery   — if inactive riders return to their historical average
 *
 * Hiring gap = totalGap − (sum of all lever recoveries, capped at totalGap)
 */
import { normalizeRiderCodeForPerformance } from '@/lib/dataFilter';
import { resolveRiderExpected } from '@/lib/strategicOps/controlTower/riderHistory';
import type {
  ControlTowerBuildContext,
  RecoverySimulatorInputs,
} from '@/lib/strategicOps/controlTower/types';

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

export function buildRecoverySimulatorInputs(
  ctx: ControlTowerBuildContext
): RecoverySimulatorInputs {
  const {
    fleetTalabat,
    richPerformance,
    riders,
    riderHistoricalBaselines,
    avgHoursPerActiveRider,
    operationalPeriodDays,
  } = ctx;

  const totalGap = round2(Math.max(0, fleetTalabat.targetHours - fleetTalabat.actualHours));
  const periodDays = Math.max(1, operationalPeriodDays);
  const fleetAvgHours = avgHoursPerActiveRider > 0 ? avgHoursPerActiveRider : 5;
  const avgHoursPerNewRider = round2(fleetAvgHours);

  if (totalGap <= 0 || !richPerformance || richPerformance.length === 0) {
    return {
      totalGap: 0,
      maxRecoveryByNoShow: 0,
      maxRecoveryByBreak: 0,
      maxRecoveryByLate: 0,
      maxRecoveryByInactive: 0,
      hiringGap: 0,
      avgHoursPerNewRider,
    };
  }

  // Build per-rider performance summary from rich records
  const riderPerfMap = new Map<string, {
    totalHours: number;
    workingDays: number;
    totalBreakMinutes: number;
    totalDelayMinutes: number;
  }>();

  for (const rec of richPerformance) {
    const norm = normalizeRiderCodeForPerformance(rec.riderCode);
    if (!norm) continue;
    const existing = riderPerfMap.get(norm) ?? {
      totalHours: 0,
      workingDays: 0,
      totalBreakMinutes: 0,
      totalDelayMinutes: 0,
    };
    existing.totalHours += rec.hours;
    if (rec.hours > 0) {
      existing.workingDays++;
      existing.totalBreakMinutes += rec.breakMinutes;
      existing.totalDelayMinutes += rec.delayMinutes;
    }
    riderPerfMap.set(norm, existing);
  }

  // Fleet average break per working day
  let fleetTotalBreak = 0;
  let fleetWorkingDays = 0;
  for (const [, p] of riderPerfMap) {
    fleetTotalBreak += p.totalBreakMinutes;
    fleetWorkingDays += p.workingDays;
  }
  const fleetAvgBreakPerDay = fleetWorkingDays > 0 ? fleetTotalBreak / fleetWorkingDays : 20;

  // Lever 1: No-show recovery
  // Riders with zero hours in period → their expected hours represent potential recovery
  let maxRecoveryByNoShow = 0;
  for (const rider of riders) {
    const norm = normalizeRiderCodeForPerformance(rider.code);
    if (!norm) continue;
    const perf = riderPerfMap.get(norm);
    if (!perf || perf.totalHours === 0) {
      const expected = resolveRiderExpected(
        rider.code,
        riderHistoricalBaselines ?? new Map(),
        fleetAvgHours,
        0
      );
      maxRecoveryByNoShow += expected.hours; // daily
    }
  }
  maxRecoveryByNoShow = round2(Math.min(maxRecoveryByNoShow, totalGap));

  // Lever 2: Break reduction
  // Sum of excess break per working rider, converted to daily hours
  let totalExcessBreakHours = 0;
  for (const [, perf] of riderPerfMap) {
    if (perf.workingDays === 0) continue;
    const avgBreakPerDay = perf.totalBreakMinutes / perf.workingDays;
    const excessBreakPerDay = Math.max(0, avgBreakPerDay - fleetAvgBreakPerDay);
    // Total excess over period → convert to daily average
    totalExcessBreakHours += (excessBreakPerDay / 60) * perf.workingDays;
  }
  const maxRecoveryByBreak = round2(Math.min(totalExcessBreakHours / periodDays, totalGap));

  // Lever 3: Late reduction
  let totalLateHours = 0;
  for (const [, perf] of riderPerfMap) {
    if (perf.workingDays === 0) continue;
    totalLateHours += perf.totalDelayMinutes / 60;
  }
  const maxRecoveryByLate = round2(Math.min(totalLateHours / periodDays, totalGap));

  // Lever 4: Inactive rider recovery
  // Riders who have SOME hours but not full period — potential recovery to their expected
  let maxRecoveryByInactive = 0;
  for (const rider of riders) {
    const norm = normalizeRiderCodeForPerformance(rider.code);
    if (!norm) continue;
    const perf = riderPerfMap.get(norm);
    if (!perf || perf.totalHours === 0) continue; // no-show handled above
    if (perf.workingDays < periodDays * 0.5) {
      // Inactive: worked less than half the period
      const expected = resolveRiderExpected(
        rider.code,
        riderHistoricalBaselines ?? new Map(),
        fleetAvgHours,
        0
      );
      const actualDaily = perf.totalHours / periodDays;
      const potentialGain = Math.max(0, expected.hours - actualDaily);
      maxRecoveryByInactive += potentialGain;
    }
  }
  maxRecoveryByInactive = round2(Math.min(maxRecoveryByInactive, totalGap));

  // Hiring gap = what remains after all levers at 100%
  const totalOperationalRecovery = round2(
    Math.min(
      totalGap,
      maxRecoveryByNoShow + maxRecoveryByBreak + maxRecoveryByLate + maxRecoveryByInactive
    )
  );
  const hiringGap = round2(Math.max(0, totalGap - totalOperationalRecovery));

  return {
    totalGap,
    maxRecoveryByNoShow,
    maxRecoveryByBreak,
    maxRecoveryByLate,
    maxRecoveryByInactive,
    hiringGap,
    avgHoursPerNewRider,
  };
}
