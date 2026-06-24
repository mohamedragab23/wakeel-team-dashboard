import type { ControlTowerReport, KpiRootCause } from '@/lib/strategicOps/controlTower/types';
import type { SupervisorMappingHealth } from '@/lib/strategicOps/controlTower/supervisorMapping';

export type ReliabilityClassification = 'excellent' | 'good' | 'warning' | 'unreliable';

export type ControlTowerReliability = {
  coverageScore: number;
  mappingHealthScore: number;
  rootCauseConfidenceScore: number;
  actionReliabilityScore: number;
  overallScore: number;
  classification: ReliabilityClassification;
  classificationLabelAr: string;
};

const CLASS_LABELS: Record<ReliabilityClassification, string> = {
  excellent: 'ممتاز',
  good: 'جيد',
  warning: 'تحذير',
  unreliable: 'غير موثوق',
};

function classify(score: number): ReliabilityClassification {
  if (score >= 90) return 'excellent';
  if (score >= 80) return 'good';
  if (score >= 70) return 'warning';
  return 'unreliable';
}

export function computeRootCauseConfidence(kpiRootCauses: KpiRootCause[], insightsEnabled: boolean): number {
  if (!insightsEnabled) return 100;
  if (kpiRootCauses.length === 0) return 0;
  const withFactors = kpiRootCauses.filter((k) => k.factors.length >= 2 && k.topSupervisors.length > 0);
  return Math.round((withFactors.length / kpiRootCauses.length) * 100);
}

export function computeActionReliability(
  rawRecoveryHoursTotal: number,
  deduplicatedRecoveryHoursTotal: number,
  insightsEnabled: boolean
): number {
  if (!insightsEnabled) return 100;
  if (rawRecoveryHoursTotal <= 0) return 100;
  const ratio = deduplicatedRecoveryHoursTotal / rawRecoveryHoursTotal;
  if (ratio >= 0.85) return 100;
  if (ratio >= 0.65) return 85;
  if (ratio >= 0.45) return 70;
  return 50;
}

export function computeControlTowerReliability(input: {
  coveragePercent: number;
  insightsEnabled: boolean;
  mapping: SupervisorMappingHealth;
  kpiRootCauses: KpiRootCause[];
  rawRecoveryHoursTotal: number;
  deduplicatedRecoveryHoursTotal: number;
}): ControlTowerReliability {
  const coverageScore = input.insightsEnabled
    ? Math.min(100, Math.round((input.coveragePercent / 80) * 100))
    : input.coveragePercent < 80
      ? 100
      : 100;

  const mappingHealthScore = input.insightsEnabled
    ? input.mapping.score
    : input.mapping.totalRiders > 0
      ? input.mapping.score
      : 100;

  const rootCauseConfidenceScore = computeRootCauseConfidence(
    input.kpiRootCauses,
    input.insightsEnabled
  );

  const actionReliabilityScore = computeActionReliability(
    input.rawRecoveryHoursTotal,
    input.deduplicatedRecoveryHoursTotal,
    input.insightsEnabled
  );

  const overallScore = Math.round(
    coverageScore * 0.3 +
      mappingHealthScore * 0.2 +
      rootCauseConfidenceScore * 0.25 +
      actionReliabilityScore * 0.25
  );

  const classification = classify(overallScore);

  return {
    coverageScore,
    mappingHealthScore,
    rootCauseConfidenceScore,
    actionReliabilityScore,
    overallScore,
    classification,
    classificationLabelAr: CLASS_LABELS[classification],
  };
}

export function emptyExecutiveFocusAudit(): ControlTowerReport['executiveFocusAudit'] {
  return {
    rawRecoveryHoursTotal: 0,
    deduplicatedRecoveryHoursTotal: 0,
    actionsBeforeDedup: 0,
    actionsAfterDedup: 0,
  };
}
