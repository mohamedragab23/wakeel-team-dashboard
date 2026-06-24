import { buildAchievementDecomposition } from '@/lib/strategicOps/controlTower/achievementDecomposition';
import {
  COVERAGE_GATE_DISABLED_AR,
  METADATA_COVERAGE_LIMITED_AR,
} from '@/lib/strategicOps/controlTower/coverageGate';
import { buildExecutiveFocus } from '@/lib/strategicOps/controlTower/executiveFocus';
import { buildKpiRootCauses } from '@/lib/strategicOps/controlTower/kpiRootCause';
import { buildManagementActions, rankActionsByImpact } from '@/lib/strategicOps/controlTower/managementActions';
import { buildPeriodComparisons } from '@/lib/strategicOps/controlTower/periodComparison';
import {
  computeControlTowerReliability,
  emptyExecutiveFocusAudit,
} from '@/lib/strategicOps/controlTower/reliability';
import { buildRiderLostHoursRank, buildTopNegativeImpactRiders } from '@/lib/strategicOps/controlTower/riderImpact';
import { resolveRiderSupervisorNames } from '@/lib/strategicOps/controlTower/supervisorMapping';
import { buildSupervisorScorecards, emptySupervisorScorecardsReport } from '@/lib/strategicOps/controlTower/supervisorScorecard';
import type { ControlTowerBuildContext, ControlTowerReport } from '@/lib/strategicOps/controlTower/types';

export type { ControlTowerBuildContext, ControlTowerReport } from '@/lib/strategicOps/controlTower/types';

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
    periodComparisons: insightsEnabled ? periodComparisons : [],
    supervisorScorecards,
    generatedAt: new Date().toISOString(),
  };
}
