import type { TwinFleetMetrics } from './types';

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

export type ProductivityLevers = {
  newAvgHours?: number;
  avgHoursPercentChange?: number;
  ordersPerHourPercentChange?: number;
  absenteeismReductionPercent?: number;
  breakReductionPercent?: number;
  lateReductionPercent?: number;
};

export function applyProductivityLevers(
  fleet: TwinFleetMetrics,
  levers: ProductivityLevers,
  recoveryCeilings?: {
    maxRecoveryByNoShow: number;
    maxRecoveryByBreak: number;
    maxRecoveryByLate: number;
  }
): TwinFleetMetrics {
  const f = { ...fleet };

  if (levers.newAvgHours != null && levers.newAvgHours > 0) {
    f.avgHours = round2(levers.newAvgHours);
    f.actualHours = round2(f.activeRiders * f.avgHours);
  } else if (levers.avgHoursPercentChange != null) {
    const factor = 1 + levers.avgHoursPercentChange / 100;
    f.avgHours = round2(f.avgHours * factor);
    f.actualHours = round2(f.actualHours * factor);
  }

  if (levers.ordersPerHourPercentChange != null) {
    const factor = 1 + levers.ordersPerHourPercentChange / 100;
    f.ordersPerHour = round2(f.ordersPerHour * factor);
    f.orders = round2(f.actualHours * f.ordersPerHour);
  } else {
    f.orders = round2(f.actualHours * (f.ordersPerHour || 0));
  }

  if (levers.absenteeismReductionPercent != null && levers.absenteeismReductionPercent > 0) {
    const pct = Math.min(100, levers.absenteeismReductionPercent) / 100;
    const recoveredActive = round2(f.noShowRiders * pct);
    f.noShowRiders = round2(Math.max(0, f.noShowRiders - recoveredActive));
    f.activeRiders = round2(f.activeRiders + recoveredActive);
    const hoursFromReturn = round2(recoveredActive * (f.avgHours || 5));
    f.actualHours = round2(f.actualHours + hoursFromReturn);
    f.orders = round2(f.actualHours * (f.ordersPerHour || 0));
  }

  if (recoveryCeilings) {
    if (levers.breakReductionPercent != null) {
      const pct = Math.min(100, Math.max(0, levers.breakReductionPercent)) / 100;
      const gain = round2(recoveryCeilings.maxRecoveryByBreak * pct);
      f.actualHours = round2(f.actualHours + gain);
      f.lostHours = round2(Math.max(0, f.lostHours - gain));
    }
    if (levers.lateReductionPercent != null) {
      const pct = Math.min(100, Math.max(0, levers.lateReductionPercent)) / 100;
      const gain = round2(recoveryCeilings.maxRecoveryByLate * pct);
      f.actualHours = round2(f.actualHours + gain);
      f.lostHours = round2(Math.max(0, f.lostHours - gain));
    }
  }

  return f;
}
