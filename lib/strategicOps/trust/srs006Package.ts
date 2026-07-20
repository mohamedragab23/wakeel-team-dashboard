/**
 * Aggregates all SRS-006 Phase 2 engines into one package for the report/UI.
 */

import type { StrategicOpsReport } from '@/lib/strategicOps/buildReport';
import { enrichActionsWithConfidence, type DecisionConfidence } from './decisionConfidence';
import { validateAllForecasts, type ForecastValidation } from './forecastValidation';
import { expandRootCauseExplainability, type RootCauseExplanation } from './rootCauseExplainability';
import { buildExecutiveTimeline, type TimelineEvent } from './executiveTimeline';
import { buildCrossValidationReport, type CrossValidationReport } from './crossValidation';
import { buildCityIntelligence, type CityIntelligenceReport } from './cityIntelligence';
import { buildSupervisorFairnessRanking, type FairSupervisorScore } from './supervisorFairness';
import { buildExecutiveDecisionBrief, type ExecutiveDecisionBrief } from './executiveDecisionMode';
import type { ManagementAction } from '@/lib/strategicOps/controlTower/types';

export type Srs006CompletePackage = {
  decisionConfidenceActions: Array<ManagementAction & { decisionConfidence: DecisionConfidence }>;
  forecastValidations: ForecastValidation[];
  rootCauseExplanations: RootCauseExplanation[];
  executiveTimeline: TimelineEvent[];
  crossValidation: CrossValidationReport;
  cityIntelligence: CityIntelligenceReport;
  supervisorFairness: FairSupervisorScore[];
  executiveDecisionBrief: ExecutiveDecisionBrief;
  generatedAt: string;
};

export function buildSrs006CompletePackage(report: StrategicOpsReport): Srs006CompletePackage {
  const ct = report.controlTower;
  const tal = report.talabatOperations;
  const coverage = report.sourceDataCoverage?.coverage ?? report.dataIntegrity.completenessPercentage;
  const ghost = report.dataIntegrity.ghostLeakagePercent;
  const sample = report.dataIntegrity.officialRows || report.dataIntegrity.totalRows;

  const actions = ct?.executiveFocus ?? [];
  const decisionConfidenceActions = enrichActionsWithConfidence(actions, {
    coveragePercent: coverage,
    ghostLeakagePercent: ghost,
    sampleSize: sample,
  });

  const forecastValidations = validateAllForecasts(ct?.forecastMetrics ?? []);
  const rootCauseExplanations = expandRootCauseExplainability(ct?.kpiRootCauses ?? [], {
    ordersPerHour: tal.avgHoursPerActiveRider > 0 ? tal.actualHours > 0 ? (report.hoursAnalysis?.trend?.reduce((s, d) => s + d.orders, 0) ?? 0) / Math.max(1, report.meta.periodDays) / tal.actualHours : 2 : 2,
  });

  const criticalAlerts: string[] = [];
  if (coverage < 80) criticalAlerts.push(`تغطية بيانات ${coverage}%`);
  if (ghost > 5) criticalAlerts.push(`تسرب Ghost ${ghost}%`);
  if (tal.achievementPercent < 70) criticalAlerts.push(`إنجاز ${tal.achievementPercent}%`);

  const executiveTimeline = buildExecutiveTimeline({
    presentDates: report.dataIntegrity.presentDates ?? [],
    missingDates: report.dataIntegrity.missingDates ?? [],
    newHires: report.executiveSummary.newRidersJoined,
    resignations: report.executiveSummary.approvedResignations,
    criticalAlerts,
    achievement: tal.achievementPercent,
    targetHours: tal.targetHours,
    forecastTrend: ct?.forecastMetrics?.[0]?.trend,
    generatedAt: report.meta.generatedAt,
  });

  const ordersDaily =
    (report.hoursAnalysis?.trend?.reduce((s, d) => s + d.orders, 0) ?? 0) /
    Math.max(1, report.meta.periodDays);

  const crossValidation = buildCrossValidationReport({
    dailySheetActiveRiders: tal.activeRiders,
    ridersSheetHeadcount: tal.headcount,
    hiringJoined: report.recruitment?.totalJoined,
    executiveNewHires: report.executiveSummary.newRidersJoined,
    terminations: report.executiveSummary.approvedResignations,
    executiveResignations: report.executiveSummary.approvedResignations,
    targetFromSupervisors: tal.targetHours,
    targetFromFleet: tal.targetHours,
    ordersFromTrend: ordersDaily,
    hoursFromFleet: tal.actualHours,
  });

  const cityIntelligence = buildCityIntelligence({
    zone: report.meta.zone,
    actualHours: tal.actualHours,
    targetHours: tal.targetHours,
    avgHours: tal.avgHoursPerActiveRider,
    ordersPerHour: tal.actualHours > 0 ? ordersDaily / tal.actualHours : 0,
  });

  const supervisorFairness = buildSupervisorFairnessRanking(report.supervisorPerformance.rows);

  const biggestOpp = ct?.recruitmentAnalysis
    ? `تعيين ~${ct.recruitmentAnalysis.hiringRequirementRiders} أو استرداد No-Show`
    : cityIntelligence.adaptedRecommendationsAr[0];

  const executiveDecisionBrief = buildExecutiveDecisionBrief({
    healthScore: ct?.executiveHealth?.healthScore ?? report.operationalHealth?.score ?? 0,
    achievement: tal.achievementPercent,
    hoursGap: Math.max(0, tal.targetHours - tal.actualHours),
    topLossCauseAr: report.lostHours.breakdown[0]?.category,
    biggestOpportunityAr: biggestOpp,
    biggestRiskAr: criticalAlerts[0] ?? report.supervisorPerformance.worstSupervisor?.name,
    weekOutlookAr: forecastValidations[0]
      ? `توقع 7 أيام (${forecastValidations[0].metricKey}): ${forecastValidations[0].expectedCase} — موثوقية ${forecastValidations[0].reliability}`
      : undefined,
    monthOutlookAr: `هدف مدينة ${cityIntelligence.city.labelAr}: ${cityIntelligence.achievementVsCityTarget}% من معيار المدينة`,
    confidence: report.finalKpiAccuracyAudit?.executiveAccuracyScore?.score ?? coverage,
    canTrust: report.finalKpiAccuracyAudit?.managementTrust?.canTrust ?? coverage >= 80,
  });

  return {
    decisionConfidenceActions,
    forecastValidations,
    rootCauseExplanations,
    executiveTimeline,
    crossValidation,
    cityIntelligence,
    supervisorFairness,
    executiveDecisionBrief,
    generatedAt: new Date().toISOString(),
  };
}
