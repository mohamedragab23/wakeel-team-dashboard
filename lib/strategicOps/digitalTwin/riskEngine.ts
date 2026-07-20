import type { DigitalTwinState, RiskImpact, ScenarioLevers } from './types';

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function confidenceLevel(c: number): RiskImpact['confidenceLevel'] {
  if (c >= 85) return 'very_high';
  if (c >= 70) return 'high';
  if (c >= 50) return 'medium';
  return 'low';
}

export function computeRiskImpact(
  baseline: DigitalTwinState,
  projected: DigitalTwinState,
  levers: ScenarioLevers
): RiskImpact {
  const hire = levers.hireRiders ?? 0;
  const term = levers.terminateRiders ?? 0;
  const demand = levers.demandPercentChange ?? 0;

  const operationalRisk = round2(
    Math.min(
      100,
      projected.fleet.lostHoursPercent * 0.8 +
        Math.max(0, 100 - projected.fleet.achievement) * 0.4 +
        projected.fleet.noShowRiders * 0.5
    )
  );

  const financialRisk = round2(
    Math.min(100, hire * 0.8 + Math.max(0, -demand) * 0.5 + (projected.fleet.achievement < 70 ? 20 : 0))
  );

  const hiringRisk = round2(Math.min(100, hire * 1.2 + (baseline.quality.coveragePercent < 80 ? 15 : 0)));
  const attritionRisk = round2(
    Math.min(100, term * 2 + projected.ridersSummary.resignations * 0.5 + projected.fleet.inactiveRiders * 0.3)
  );

  const avgSupRisk =
    projected.supervisors.length > 0
      ? projected.supervisors.reduce((s, r) => s + r.riskScore, 0) / projected.supervisors.length
      : 30;
  const supervisorRisk = round2(Math.min(100, avgSupRisk + (levers.replaceWeakSupervisor ? 10 : 0)));

  const capacityRisk = round2(
    Math.min(
      100,
      Math.max(0, projected.fleet.targetHours - projected.fleet.actualHours) /
        Math.max(1, projected.fleet.targetHours) *
        100
    )
  );

  const overallRisk = round2(
    operationalRisk * 0.25 +
      financialRisk * 0.2 +
      hiringRisk * 0.15 +
      attritionRisk * 0.15 +
      supervisorRisk * 0.1 +
      capacityRisk * 0.15
  );

  const confidence = round2(
    Math.max(
      20,
      Math.min(
        95,
        baseline.quality.trustScoreHint * 0.6 +
          baseline.quality.coveragePercent * 0.3 +
          (100 - overallRisk) * 0.1 -
          (hire > 50 ? 10 : 0)
      )
    )
  );

  return {
    operationalRisk,
    financialRisk,
    hiringRisk,
    attritionRisk,
    supervisorRisk,
    capacityRisk,
    overallRisk,
    confidence,
    confidenceLevel: confidenceLevel(confidence),
  };
}
