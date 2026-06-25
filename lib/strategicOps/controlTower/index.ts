import { buildAchievementDecomposition } from '@/lib/strategicOps/controlTower/achievementDecomposition';
import {
  COVERAGE_GATE_DISABLED_AR,
  METADATA_COVERAGE_LIMITED_AR,
} from '@/lib/strategicOps/controlTower/coverageGate';
import { buildExecutiveFocus } from '@/lib/strategicOps/controlTower/executiveFocus';
import { buildExecutiveHealthSummary, buildSupervisorIntelligence } from '@/lib/strategicOps/controlTower/executiveHealth';
import { buildKpiRootCauses } from '@/lib/strategicOps/controlTower/kpiRootCause';
import { buildManagementActions, rankActionsByImpact } from '@/lib/strategicOps/controlTower/managementActions';
import { buildOperationalIntelligenceFeed } from '@/lib/strategicOps/controlTower/operationalIntelligence';
import { buildPeriodComparisons } from '@/lib/strategicOps/controlTower/periodComparison';
import { buildRecruitmentAnalysis } from '@/lib/strategicOps/controlTower/recruitmentAnalysis';
import {
  computeControlTowerReliability,
  emptyExecutiveFocusAudit,
} from '@/lib/strategicOps/controlTower/reliability';
import {
  buildRiderIntelligence,
  buildRiderLostHoursRank,
  buildTopNegativeImpactRiders,
} from '@/lib/strategicOps/controlTower/riderImpact';
import { resolveRiderSupervisorNames } from '@/lib/strategicOps/controlTower/supervisorMapping';
import { buildSupervisorScorecards, emptySupervisorScorecardsReport } from '@/lib/strategicOps/controlTower/supervisorScorecard';
import type { ControlTowerBuildContext, ControlTowerReport, OperationalHealthSummary, RecruitmentAnalysis, SupervisorIntelligence } from '@/lib/strategicOps/controlTower/types';

export type { ControlTowerBuildContext, ControlTowerReport } from '@/lib/strategicOps/controlTower/types';

const EMPTY_HEALTH: OperationalHealthSummary = {
  healthScore: 0,
  statusLabel: 'Critical',
  statusLabelAr: '🔴 حرج',
  riskLevel: 'severe',
  achievementPercent: 0,
  hoursGap: 0,
  hoursGapDirection: 'below',
  ordersGap: 0,
  supervisorHealthScore: 0,
  fleetHealthScore: 0,
  situationSummaryAr: 'لا تتوفر بيانات كافية لتقييم الوضع التشغيلي.',
};

const EMPTY_RECRUITMENT: RecruitmentAnalysis = {
  currentHoursGap: 0,
  recoverableByReactivation: 0,
  recoverableByNoShowReduction: 0,
  recoverableByHoursPush: 0,
  recoverableBySupervision: 0,
  remainingGapAfterLevers: 0,
  hiringRequirementRiders: 0,
  hiringRequirementHours: 0,
  recommendHiring: false,
  summaryAr: '',
};

export function buildControlTowerReport(ctx: ControlTowerBuildContext): ControlTowerReport {
  const insightsEnabled = ctx.operationalAnalyticsEnabled;
  const metadataLimited = insightsEnabled && !ctx.metadataAnalyticsEnabled;
  const { riders, mapping } = resolveRiderSupervisorNames(ctx.riders, ctx.supervisorNameByCode);
  const enrichedCtx: ControlTowerBuildContext = { ...ctx, riders };

  const periodComparisons = buildPeriodComparisons({
    startDate: enrichedCtx.startDate,
    fleetTalabat: enrichedCtx.fleetTalabat,
    performance: enrichedCtx.performance,
    assignedRiderCodes: enrichedCtx.assignedRiderCodes,
    fleetDailyTargetHours: enrichedCtx.fleetDailyTargetHours,
    headcount: enrichedCtx.headcount,
  });

  const topNegativeImpactRiders = insightsEnabled
    ? buildTopNegativeImpactRiders(enrichedCtx, 20)
    : [];
  const topRidersByLoss = insightsEnabled ? buildRiderLostHoursRank(enrichedCtx, 10) : [];

  // Layer 5: full rider intelligence with per-rider historical expected hours
  const riderIntelligence = insightsEnabled ? buildRiderIntelligence(enrichedCtx) : [];

  const achievementDecomposition = buildAchievementDecomposition(
    enrichedCtx,
    enrichedCtx.supervisorRows,
    topRidersByLoss
  );

  const kpiRootCauses = insightsEnabled
    ? buildKpiRootCauses(enrichedCtx, enrichedCtx.supervisorRows, periodComparisons)
    : [];

  const allActions = insightsEnabled
    ? rankActionsByImpact(
        buildManagementActions(enrichedCtx, enrichedCtx.supervisorRows, topNegativeImpactRiders)
      )
    : [];

  const focusResult = insightsEnabled
    ? buildExecutiveFocus(allActions, 10)
    : { executiveFocus: [], audit: emptyExecutiveFocusAudit() };

  const supervisorScorecards = insightsEnabled
    ? buildSupervisorScorecards({
        ctx: enrichedCtx,
        kpiRootCauses,
        topNegativeImpactRiders,
        allActions,
      })
    : emptySupervisorScorecardsReport();

  // Layer 2: intelligence feed
  const intelligenceFeed = insightsEnabled
    ? buildOperationalIntelligenceFeed(enrichedCtx, enrichedCtx.supervisorRows)
    : [];

  // Layer 1: executive health summary
  const executiveHealth = insightsEnabled
    ? buildExecutiveHealthSummary(enrichedCtx, enrichedCtx.supervisorRows)
    : EMPTY_HEALTH;

  // Layer 6+7: supervisor intelligence & accountability
  const supervisorIntelligence: SupervisorIntelligence[] = insightsEnabled
    ? buildSupervisorIntelligence(enrichedCtx.supervisorRows)
    : [];

  // Layer 9: recruitment analysis
  const recruitmentAnalysis = insightsEnabled
    ? buildRecruitmentAnalysis(enrichedCtx, enrichedCtx.supervisorRows)
    : EMPTY_RECRUITMENT;

  const reliability = computeControlTowerReliability({
    coveragePercent: ctx.operationalCoveragePercent,
    insightsEnabled,
    mapping,
    kpiRootCauses,
    rawRecoveryHoursTotal: focusResult.audit.rawRecoveryHoursTotal,
    deduplicatedRecoveryHoursTotal: focusResult.audit.deduplicatedRecoveryHoursTotal,
  });

  return {
    disabled: !insightsEnabled,
    disabledReasonAr: insightsEnabled ? null : COVERAGE_GATE_DISABLED_AR,
    metadataLimitedReasonAr: metadataLimited ? METADATA_COVERAGE_LIMITED_AR : null,
    insightsEnabled,
    operationalCoveragePercent: ctx.operationalCoveragePercent,
    metadataCoveragePercent: ctx.metadataCoveragePercent,
    overallReadinessPercent: ctx.overallReadinessPercent,
    dataCoveragePercent: ctx.operationalCoveragePercent,
    mappingHealth: mapping,
    reliability,
    executiveFocus: focusResult.executiveFocus,
    executiveFocusAudit: focusResult.audit,
    kpiRootCauses,
    achievementDecomposition,
    topNegativeImpactRiders,
    riderIntelligence,
    periodComparisons: insightsEnabled ? periodComparisons : [],
    supervisorScorecards,
    supervisorIntelligence,
    intelligenceFeed,
    executiveHealth,
    recruitmentAnalysis,
    generatedAt: new Date().toISOString(),
  };
}
