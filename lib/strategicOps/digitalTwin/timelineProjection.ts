import { recomputeDerivedFleet } from './twinBuilder';
import type { TimelineProjection, TwinFleetMetrics } from './types';

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/** Simple compound projection from steady-state scenario fleet. */
export function projectTimeline(steady: TwinFleetMetrics): TimelineProjection {
  const project = (factor: number): TwinFleetMetrics => {
    const f = { ...steady };
    f.actualHours = round2(steady.actualHours * factor);
    f.orders = round2(steady.orders * factor);
    f.activeRiders = round2(steady.activeRiders * Math.min(1.05, factor));
    // Target assumed constant unless demand/target changed already in steady
    return recomputeDerivedFleet(f);
  };

  return {
    nextWeek: project(1.0),
    nextMonth: project(1.02),
    nextQuarter: project(1.05),
    nextSixMonths: project(1.08),
    yearEnd: project(1.12),
  };
}
