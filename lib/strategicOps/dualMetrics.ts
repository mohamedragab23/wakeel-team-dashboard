/** Dual-mode metrics: period totals vs calendar-day normalized values. */

export type DualMetric = {
  period: number;
  daily: number;
};

export function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/** Normalize a period total by calendar days in the selected range. */
export function dualFromPeriod(periodValue: number, calendarDays: number): DualMetric {
  const period = round2(periodValue);
  const daily = calendarDays > 0 ? round2(periodValue / calendarDays) : 0;
  return { period, daily };
}

export function formatDualPrimary(dm: DualMetric, unit = ''): string {
  return `${dm.daily}${unit ? ` ${unit}` : ''}`;
}

export function formatDualSub(dm: DualMetric, unit = ''): string {
  return `فترة: ${dm.period}${unit ? ` ${unit}` : ''}`;
}
