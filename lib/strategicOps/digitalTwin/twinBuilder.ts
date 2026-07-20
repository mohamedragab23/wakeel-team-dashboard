/**
 * Build an isolated Digital Twin snapshot from a Strategic Ops report.
 * Never writes to production data sources.
 */

import type { StrategicOpsReport } from '@/lib/strategicOps/buildReport';
import { getUnitEconomicsConfig } from './config/unitEconomics';
import type {
  DigitalTwinState,
  TwinFilters,
  TwinFleetMetrics,
  TwinSupervisorRow,
} from './types';

const TWIN_VERSION = '1.0.0';

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function deriveHealth(achievement: number, utilization: number, lostPct: number): number {
  const score = achievement * 0.45 + utilization * 0.35 + Math.max(0, 100 - lostPct) * 0.2;
  return round2(Math.max(0, Math.min(100, score)));
}

export function cloneTwin(twin: DigitalTwinState): DigitalTwinState {
  return structuredClone(twin);
}

export function buildDigitalTwinSnapshot(
  report: StrategicOpsReport,
  filters: TwinFilters
): DigitalTwinState {
  const tal = report.talabatOperations;
  const es = report.executiveSummary;
  const lh = report.lostHours;
  const periodDays = Math.max(1, report.meta.periodDays || report.meta.normalizationCalendarDays || 1);

  const orders =
    report.hoursAnalysis?.trend?.reduce((s, d) => s + (d.orders || 0), 0) ?? 0;
  const dailyOrders = round2(orders / periodDays);
  const actualHours = tal.actualHours;
  const oph = actualHours > 0 ? round2(dailyOrders / actualHours) : 0;
  const lostHoursDaily = lh.lostHoursDual?.daily ?? round2(lh.lostHours / periodDays);
  const achievement = tal.achievementPercent;
  const utilization = tal.utilizationPercent;
  const healthScore =
    report.controlTower?.executiveHealth?.healthScore ??
    deriveHealth(achievement, utilization, lh.lostPercent);

  const fleet: TwinFleetMetrics = {
    headcount: tal.headcount,
    activeRiders: tal.activeRiders,
    actualHours,
    targetHours: tal.targetHours,
    orders: round2(dailyOrders),
    ordersPerHour: oph,
    avgHours: tal.avgHoursPerActiveRider,
    utilization,
    lostHours: lostHoursDaily,
    lostHoursPercent: lh.lostPercent,
    achievement,
    healthScore,
    noShowRiders: tal.noShowRiders,
    inactiveRiders: es.inactiveRiders,
    operationalDays: tal.operationalDays,
  };

  const supervisors: TwinSupervisorRow[] = (report.supervisorPerformance?.rows ?? []).map((s) => ({
    code: s.code,
    name: s.name,
    zone: s.region,
    headcount: s.headcount,
    activeRiders: s.activeRiders,
    hours: s.dailyHours,
    target: s.headcount > 0 ? round2((s.dailyHours / Math.max(0.01, s.achievementPercent / 100))) : 0,
    achievement: s.achievementPercent,
    riskScore: s.riskScore,
  }));

  // Prefer explicit target from achievement if available
  for (const s of supervisors) {
    const row = report.supervisorPerformance.rows.find((r) => r.code === s.code);
    if (row && row.achievementPercent > 0 && row.dailyHours > 0) {
      s.target = round2(row.dailyHours / (row.achievementPercent / 100));
    }
  }

  const rs = report.controlTower?.recoverySimulatorInputs;
  const coverage = report.sourceDataCoverage?.coverage ?? report.dataIntegrity.completenessPercentage;
  const ghost = report.dataIntegrity.ghostLeakagePercent;
  const dq = report.dataIntegrity.dataQualityScore;
  const trustHint = round2(
    dq * 0.5 + Math.max(0, 100 - ghost * 4) * 0.3 + coverage * 0.2
  );

  return {
    meta: {
      generatedAt: new Date().toISOString(),
      filters: { ...filters },
      sourceReportGeneratedAt: report.meta.generatedAt,
      version: TWIN_VERSION,
      periodDays,
    },
    fleet,
    supervisors,
    ridersSummary: {
      inactive: es.inactiveRiders,
      noShow: tal.noShowRiders,
      suspended: es.suspendedRiders,
      newHires: es.newRidersJoined,
      resignations: es.approvedResignations,
    },
    economics: getUnitEconomicsConfig(),
    quality: {
      coveragePercent: coverage,
      ghostLeakagePercent: ghost,
      dataQualityScore: dq,
      trustScoreHint: trustHint,
    },
    recoveryCeilings: rs
      ? {
          maxRecoveryByNoShow: rs.maxRecoveryByNoShow,
          maxRecoveryByBreak: rs.maxRecoveryByBreak,
          maxRecoveryByLate: rs.maxRecoveryByLate,
          maxRecoveryByInactive: rs.maxRecoveryByInactive,
        }
      : undefined,
  };
}

export function recomputeDerivedFleet(fleet: TwinFleetMetrics): TwinFleetMetrics {
  const f = { ...fleet };
  f.ordersPerHour = f.actualHours > 0 ? round2(f.orders / f.actualHours) : 0;
  f.avgHours = f.activeRiders > 0 ? round2(f.actualHours / f.activeRiders) : 0;
  f.utilization = f.headcount > 0 ? round2((f.activeRiders / f.headcount) * 100) : 0;
  f.achievement = f.targetHours > 0 ? round2((f.actualHours / f.targetHours) * 100) : 0;
  f.lostHoursPercent =
    f.actualHours + f.lostHours > 0
      ? round2((f.lostHours / (f.actualHours + f.lostHours)) * 100)
      : 0;
  f.healthScore = deriveHealth(f.achievement, f.utilization, f.lostHoursPercent);
  return f;
}
