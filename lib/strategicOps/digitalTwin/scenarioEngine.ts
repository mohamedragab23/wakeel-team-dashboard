/**
 * Core scenario engine — applies levers to an isolated twin clone.
 */

import { simulateHiring } from './hiringSimulation';
import { simulateTermination } from './terminationSimulation';
import { applyProductivityLevers } from './productivitySimulation';
import { simulateSupervisorChanges } from './supervisorSimulation';
import { computeFinancialImpact } from './financialEngine';
import { computeImpactDeltas } from './impactAnalysis';
import { computeRiskImpact } from './riskEngine';
import { buildExecutiveDecision } from './decisionEngine';
import { projectTimeline } from './timelineProjection';
import { buildOptimizationHints } from './optimizationHints';
import { cloneTwin, recomputeDerivedFleet } from './twinBuilder';
import type {
  DigitalTwinState,
  ScenarioLevers,
  ScenarioPresetId,
  SimulationResult,
} from './types';

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

export const SCENARIO_PRESETS: Record<
  Exclude<ScenarioPresetId, 'custom'>,
  { titleAr: string; levers: ScenarioLevers }
> = {
  A_hire_50: { titleAr: 'تعيين 50 طيار', levers: { hireRiders: 50 } },
  B_hours_6_5: { titleAr: 'رفع متوسط الساعات إلى 6.5', levers: { avgHoursDelta: 6.5 } },
  C_absenteeism_20: { titleAr: 'خفض الغياب 20%', levers: { absenteeismReductionPercent: 20 } },
  D_breaks_15: { titleAr: 'خفض الاستراحات 15%', levers: { breakReductionPercent: 15 } },
  E_active_plus_30: { titleAr: 'زيادة النشطين بـ 30', levers: { activeRidersDelta: 30 } },
  F_reallocate: { titleAr: 'نقل طيارين بين المشرفين', levers: { reallocateRiders: 20 } },
  G_replace_supervisor: {
    titleAr: 'استبدال المشرف الأضعف',
    levers: { replaceWeakSupervisor: true },
  },
  H_target_plus_10: { titleAr: 'رفع الهدف 10%', levers: { targetPercentChange: 10 } },
  I_demand_plus_25: { titleAr: 'ارتفاع الطلب 25%', levers: { demandPercentChange: 25 } },
  J_demand_minus_40: { titleAr: 'انخفاض الطلب 40%', levers: { demandPercentChange: -40 } },
};

export function applyLevers(twin: DigitalTwinState, levers: ScenarioLevers): DigitalTwinState {
  const projected = cloneTwin(twin);
  let fleet = { ...projected.fleet };

  // Recovery ceilings (align with Recovery Simulator)
  const ceilings = twin.recoveryCeilings;
  if (ceilings) {
    const noShowPct = (levers.noShowRecoveryPct ?? 0) / 100;
    const breakPct = (levers.breakRecoveryPct ?? 0) / 100;
    const latePct = (levers.lateRecoveryPct ?? 0) / 100;
    const inactivePct = (levers.inactiveRecoveryPct ?? 0) / 100;
    const recovered = round2(
      ceilings.maxRecoveryByNoShow * noShowPct +
        ceilings.maxRecoveryByBreak * breakPct +
        ceilings.maxRecoveryByLate * latePct +
        ceilings.maxRecoveryByInactive * inactivePct
    );
    fleet.actualHours = round2(fleet.actualHours + recovered);
    fleet.lostHours = round2(Math.max(0, fleet.lostHours - recovered));
  }

  fleet = applyProductivityLevers(
    fleet,
    {
      newAvgHours: levers.avgHoursDelta,
      avgHoursPercentChange: levers.avgHoursPercentChange,
      absenteeismReductionPercent: levers.absenteeismReductionPercent,
      breakReductionPercent: levers.breakReductionPercent,
      lateReductionPercent: levers.lateReductionPercent,
    },
    ceilings
  );

  if (levers.activeRidersDelta) {
    const d = levers.activeRidersDelta;
    fleet.activeRiders = round2(Math.max(0, fleet.activeRiders + d));
    fleet.actualHours = round2(fleet.actualHours + d * (fleet.avgHours || 5));
    fleet.orders = round2(fleet.actualHours * (fleet.ordersPerHour || 0));
  }

  if (levers.hireRiders && levers.hireRiders > 0) {
    const h = simulateHiring(fleet, twin.economics, levers.hireRiders);
    fleet.headcount += h.hireRiders;
    fleet.activeRiders = round2(fleet.activeRiders + h.hireRiders * 0.85);
    fleet.actualHours = round2(fleet.actualHours + h.hoursGained);
    fleet.orders = round2(fleet.orders + h.ordersGained);
  }

  if (levers.terminateRiders && levers.terminateRiders > 0) {
    const t = simulateTermination(fleet, levers.terminateRiders);
    fleet.headcount = Math.max(0, fleet.headcount - t.terminateRiders);
    fleet.activeRiders = Math.max(0, round2(fleet.activeRiders - t.terminateRiders * 0.7));
    fleet.actualHours = Math.max(0, round2(fleet.actualHours - t.hoursLost));
    fleet.orders = Math.max(0, round2(fleet.orders - t.ordersLost));
  }

  if (levers.newTargetHours != null) {
    fleet.targetHours = Math.max(0, levers.newTargetHours);
  } else if (levers.targetPercentChange != null) {
    fleet.targetHours = round2(fleet.targetHours * (1 + levers.targetPercentChange / 100));
  }

  if (levers.demandPercentChange != null) {
    const factor = 1 + levers.demandPercentChange / 100;
    fleet.orders = round2(fleet.orders * factor);
    // Demand shift also stresses hours slightly toward capacity
    if (factor > 1) {
      fleet.actualHours = round2(fleet.actualHours * Math.min(1.15, 1 + (factor - 1) * 0.3));
    }
  }

  if (levers.cityScaleFactor != null && levers.cityScaleFactor > 0) {
    const s = levers.cityScaleFactor;
    fleet.headcount = Math.round(fleet.headcount * s);
    fleet.activeRiders = round2(fleet.activeRiders * s);
    fleet.actualHours = round2(fleet.actualHours * s);
    fleet.targetHours = round2(fleet.targetHours * s);
    fleet.orders = round2(fleet.orders * s);
  }

  const sup = simulateSupervisorChanges(projected, {
    replaceWeakSupervisor: levers.replaceWeakSupervisor,
    reallocateRiders: levers.reallocateRiders,
    supervisorTargetPercentChange: levers.supervisorTargetPercentChange,
  });
  projected.supervisors = sup.supervisors;
  if (sup.expectedImprovementPercent > 0) {
    fleet.actualHours = round2(
      fleet.actualHours * (1 + Math.min(0.08, sup.expectedImprovementPercent / 200))
    );
  }

  fleet = recomputeDerivedFleet(fleet);
  projected.fleet = fleet;
  return projected;
}

export function runSimulation(
  baseline: DigitalTwinState,
  levers: ScenarioLevers
): SimulationResult {
  const projected = applyLevers(baseline, levers);
  const deltas = computeImpactDeltas(baseline.fleet, projected.fleet);
  const financial = computeFinancialImpact(
    baseline.fleet,
    projected.fleet,
    baseline,
    levers.hireRiders ?? 0
  );
  const risk = computeRiskImpact(baseline, projected, levers);
  const impact = {
    baseline: baseline.fleet,
    projected: projected.fleet,
    deltas,
    financial,
    risk,
  };
  const decision = buildExecutiveDecision(impact, levers);
  const timeline = projectTimeline(projected.fleet);
  const optimizationHints = buildOptimizationHints(baseline, projected, levers);

  return {
    baseline,
    projected,
    levers,
    impact,
    decision,
    timeline,
    optimizationHints,
    generatedAt: new Date().toISOString(),
  };
}
