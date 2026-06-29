import { buildAchievementDecomposition } from '@/lib/strategicOps/controlTower/achievementDecomposition';
import { buildContractIntelligence } from '@/lib/strategicOps/controlTower/contractIntelligence';
import {
  COVERAGE_GATE_DISABLED_AR,
  METADATA_COVERAGE_LIMITED_AR,
} from '@/lib/strategicOps/controlTower/coverageGate';
import { buildDailyContactList } from '@/lib/strategicOps/controlTower/dailyContactList';
import { buildExecutiveFocus } from '@/lib/strategicOps/controlTower/executiveFocus';
import { buildExecutiveHealthSummary, buildSupervisorIntelligence } from '@/lib/strategicOps/controlTower/executiveHealth';
import { buildForecastMetrics } from '@/lib/strategicOps/controlTower/forecastEngine';
import { buildGapAttribution } from '@/lib/strategicOps/controlTower/gapAttribution';
import { buildKpiRootCauses } from '@/lib/strategicOps/controlTower/kpiRootCause';
import { buildManagementActions, rankActionsByImpact } from '@/lib/strategicOps/controlTower/managementActions';
import { buildOperationalIntelligenceFeed } from '@/lib/strategicOps/controlTower/operationalIntelligence';
import { buildOrderCollapseView } from '@/lib/strategicOps/controlTower/orderCollapseView';
import { buildPeriodComparisons } from '@/lib/strategicOps/controlTower/periodComparison';
import { buildRecruitmentAnalysis } from '@/lib/strategicOps/controlTower/recruitmentAnalysis';
import { buildRecoverySimulatorInputs } from '@/lib/strategicOps/controlTower/recoverySimulator';
import {
  computeControlTowerReliability,
  emptyExecutiveFocusAudit,
} from '@/lib/strategicOps/controlTower/reliability';
import { buildRiderDeclineView } from '@/lib/strategicOps/controlTower/riderDeclineView';
import { summarizeBaselineSources } from '@/lib/strategicOps/controlTower/riderHistory';
import {
  buildRiderIntelligence,
  buildRiderLostHoursRank,
  buildTopNegativeImpactRiders,
} from '@/lib/strategicOps/controlTower/riderImpact';
import { buildRiderOperationsProfiles } from '@/lib/strategicOps/controlTower/riderOperationsProfile';
import { resolveRiderSupervisorNames } from '@/lib/strategicOps/controlTower/supervisorMapping';
import { buildSupervisorAccountabilityBreakdowns } from '@/lib/strategicOps/controlTower/supervisorAccountability';
import { buildSupervisorScorecards, emptySupervisorScorecardsReport } from '@/lib/strategicOps/controlTower/supervisorScorecard';
import type {
  BaselineCoverageStats,
  ContractIntelligence,
  ControlTowerBuildContext,
  ControlTowerReport,
  GapAttribution,
  OperationalHealthSummary,
  RecruitmentAnalysis,
  RecoverySimulatorInputs,
  SupervisorIntelligence,
} from '@/lib/strategicOps/controlTower/types';

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
  levers: [],
  recoverableByReactivation: 0,
  recoverableByNoShowReduction: 0,
  recoverableByHoursPush: 0,
  recoverableBySupervision: 0,
  remainingGapAfterLevers: 0,
  hiringRequirementRiders: 0,
  hiringRequirementHours: 0,
  recommendHiring: false,
  summaryAr: '',
  validationPassed: true,
};

const EMPTY_COVERAGE: BaselineCoverageStats = {
  historical30d: 0,
  historicalPartial: 0,
  fleetAverage: 0,
  total: 0,
  historicalPct: 0,
  fleetAvgPct: 0,
  qualityWarning: false,
};

const EMPTY_GAP_ATTRIBUTION: GapAttribution = {
  totalGap: 0,
  causes: [
    { causeKey: 'absence', causeLabelAr: 'غياب (No Show)', hoursLost: 0, pctOfGap: 0 },
    { causeKey: 'inactive', causeLabelAr: 'طيارون غير نشطون', hoursLost: 0, pctOfGap: 0 },
    { causeKey: 'late', causeLabelAr: 'تأخير في الوصول', hoursLost: 0, pctOfGap: 0 },
    { causeKey: 'break', causeLabelAr: 'استراحات زائدة', hoursLost: 0, pctOfGap: 0 },
    { causeKey: 'low_hours', causeLabelAr: 'ساعات منخفضة', hoursLost: 0, pctOfGap: 0 },
  ],
  validationPassed: true,
};

const EMPTY_RECOVERY_SIMULATOR: RecoverySimulatorInputs = {
  totalGap: 0,
  maxRecoveryByNoShow: 0,
  maxRecoveryByBreak: 0,
  maxRecoveryByLate: 0,
  maxRecoveryByInactive: 0,
  hiringGap: 0,
  avgHoursPerNewRider: 5,
};

const EMPTY_CONTRACT_INTELLIGENCE: ContractIntelligence[] = [];

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

  // Baseline coverage stats
  const baselineCoverage = enrichedCtx.riderHistoricalBaselines
    ? summarizeBaselineSources(
        enrichedCtx.riderHistoricalBaselines,
        enrichedCtx.riders,
        enrichedCtx.avgHoursPerActiveRider
      )
    : EMPTY_COVERAGE;

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

  // Priority 4: supervisor accountability breakdown
  const supervisorAccountability = insightsEnabled
    ? buildSupervisorAccountabilityBreakdowns(enrichedCtx, enrichedCtx.supervisorRows)
    : [];

  // Priority 1: rider decline view
  const riderDeclineView = insightsEnabled ? buildRiderDeclineView(enrichedCtx) : [];

  // Priority 2: order collapse view
  const orderCollapseView = insightsEnabled ? buildOrderCollapseView(enrichedCtx, 25) : [];

  // Priority 3: daily contact list
  const dailyContactList = insightsEnabled ? buildDailyContactList(enrichedCtx) : [];

  // Priority 5: forecast metrics
  const forecastMetrics = insightsEnabled ? buildForecastMetrics(enrichedCtx) : [];

  // Layer 9: recruitment analysis
  const recruitmentAnalysis = insightsEnabled
    ? buildRecruitmentAnalysis(enrichedCtx, enrichedCtx.supervisorRows)
    : EMPTY_RECRUITMENT;

  // Phase 2: rider operations profiles (timeline + classification)
  const riderOperationsProfiles = insightsEnabled
    ? buildRiderOperationsProfiles(enrichedCtx)
    : [];

  // Phase 2: gap attribution (5-cause breakdown)
  const gapAttribution = insightsEnabled
    ? buildGapAttribution(enrichedCtx)
    : EMPTY_GAP_ATTRIBUTION;

  // Phase 2: contract intelligence
  const contractIntelligence: ContractIntelligence[] = insightsEnabled
    ? buildContractIntelligence(enrichedCtx)
    : EMPTY_CONTRACT_INTELLIGENCE;

  // Phase 2: recovery simulator inputs for UI sliders
  const recoverySimulatorInputs = insightsEnabled
    ? buildRecoverySimulatorInputs(enrichedCtx)
    : EMPTY_RECOVERY_SIMULATOR;

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
    supervisorAccountability,
    intelligenceFeed,
    executiveHealth,
    recruitmentAnalysis,
    riderDeclineView,
    orderCollapseView,
    dailyContactList,
    forecastMetrics,
    baselineCoverage,
    riderOperationsProfiles,
    gapAttribution,
    contractIntelligence,
    recoverySimulatorInputs,
    lookbackDiagnostic: {
      rowsFound: ctx.lookbackDiagnostic?.rowsFound ?? 0,
      uniqueDates: ctx.lookbackDiagnostic?.uniqueDates ?? 0,
      dateRange: ctx.lookbackDiagnostic?.dateRange ?? 'غير متوفر',
      dataAvailable: ctx.lookbackDiagnostic?.dataAvailable ?? false,
      rosterSize: ctx.lookbackDiagnostic?.rosterSize ?? ctx.riders.length,
      matchedRiders: ctx.lookbackDiagnostic?.matchedRiders ?? 0,
      unmatchedRiders: ctx.lookbackDiagnostic?.unmatchedRiders ?? ctx.riders.length,
      matchRate: ctx.lookbackDiagnostic?.matchRate ?? 0,
      sampleUnmatched: ctx.lookbackDiagnostic?.sampleUnmatched ?? [],
    },
    generatedAt: new Date().toISOString(),
  };
}
