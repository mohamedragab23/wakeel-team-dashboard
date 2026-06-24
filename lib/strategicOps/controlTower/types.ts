import type { SupervisorOpsRow } from '@/lib/strategicOps/buildReport';
import type { TalabatFleetMetrics } from '@/lib/strategicOps/talabatOpsMetrics';
import type { SupervisorMappingHealth } from '@/lib/strategicOps/controlTower/supervisorMapping';
import type { ControlTowerReliability } from '@/lib/strategicOps/controlTower/reliability';

export type ActionPriority = 'critical' | 'high' | 'medium' | 'low';

export type RiderImpactLevel = 'critical' | 'high' | 'medium' | 'low';

export type RootCauseConfidence = 'high' | 'medium' | 'low';

export type ManagementAction = {
  id: string;
  priority: ActionPriority;
  entityType: 'supervisor' | 'rider' | 'zone' | 'fleet';
  entityId: string;
  entityName: string;
  problemAr: string;
  actionAr: string;
  expectedRecoveryHours: number;
  rawRecoveryHours: number;
  deduplicatedRecoveryHours: number;
  evidence: string;
};

export type KpiTrendComparison = {
  kpiKey: string;
  kpiLabelAr: string;
  current: number;
  prior7: number | null;
  prior14: number | null;
  prior30: number | null;
  delta7: number | null;
  delta14: number | null;
  delta30: number | null;
  deltaPercent7: number | null;
  deltaPercent14: number | null;
  deltaPercent30: number | null;
};

export type KpiContributor = {
  code: string;
  name: string;
  contribution: number;
  unit: string;
};

export type KpiRootCause = {
  kpiKey: string;
  kpiLabelAr: string;
  summaryAr: string;
  confidenceLevel: RootCauseConfidence;
  factors: Array<{ labelAr: string; value: string; impactAr: string }>;
  topSupervisors: KpiContributor[];
  topCities: Array<{ zone: string; contribution: number; unit: string }>;
  trend: KpiTrendComparison;
};

export type AchievementDecomposition = {
  achievementPercent: number;
  gapHoursDaily: number;
  gapRidersDaily: number;
  gapShiftsTotal: number;
  topSupervisorsByLoss: Array<{ code: string; name: string; lostTargetHoursDaily: number }>;
  topRidersByLoss: Array<{ code: string; name: string; lostHoursDaily: number }>;
};

export type NegativeImpactRider = {
  code: string;
  name: string;
  supervisorCode: string;
  supervisorName: string;
  region: string;
  expectedHoursDaily: number;
  actualHoursDaily: number;
  lostHoursDaily: number;
  lostHoursPeriod: number;
  scheduledDays: number;
  noShowCount: number;
  impactLevel: RiderImpactLevel;
  impactLabelAr: string;
};

export type ExecutiveFocusAudit = {
  rawRecoveryHoursTotal: number;
  deduplicatedRecoveryHoursTotal: number;
  actionsBeforeDedup: number;
  actionsAfterDedup: number;
};

export type BottomPerformerDiagnosis = {
  whyAr: string;
  missingHoursDaily: number;
  missingHoursLabelAr: string;
  mainIssueAr: string;
  recommendedActionAr: string;
};

export type SupervisorScorecard = {
  code: string;
  name: string;
  region: string;
  teamSize: number;
  activeRiders: number;
  noShowPercent: number;
  achievementPercent: number;
  utilizationPercent: number;
  lostHoursDaily: number;
  lostTargetDaily: number;
  compositeScore: number;
  scorecardRank: number;
  bottomPerformerDiagnosis?: BottomPerformerDiagnosis;
};

export type SupervisorScorecardKpiBreakdown = {
  teamSize: number;
  activeRiders: number;
  noShowRiders: number;
  noShowPercent: number;
  inactiveRiders: number;
  dailyHours: number;
  achievementPercent: number;
  utilizationPercent: number;
  lostHoursDaily: number;
  lostTargetDaily: number;
  avgHoursPerRiderDaily: number;
  resignations: number;
};

export type SupervisorScorecardDrillDown = {
  supervisorCode: string;
  supervisorName: string;
  kpiBreakdown: SupervisorScorecardKpiBreakdown;
  rootCauses: KpiRootCause[];
  riderImpact: NegativeImpactRider[];
  executiveActions: ManagementAction[];
};

export type SupervisorScorecardsReport = {
  topPerformers: SupervisorScorecard[];
  bottomPerformers: SupervisorScorecard[];
  all: SupervisorScorecard[];
  drillDownByCode: Record<string, SupervisorScorecardDrillDown>;
};

export type ControlTowerReport = {
  disabled: boolean;
  disabledReasonAr: string | null;
  metadataLimitedReasonAr: string | null;
  insightsEnabled: boolean;
  /** Operational coverage (daily sheet completeness) */
  operationalCoveragePercent: number;
  /** Join-date / rider metadata coverage */
  metadataCoveragePercent: number;
  /** min(operational, metadata) — informational */
  overallReadinessPercent: number;
  /** @deprecated Use operationalCoveragePercent */
  dataCoveragePercent: number;
  mappingHealth: SupervisorMappingHealth;
  reliability: ControlTowerReliability;
  executiveFocus: ManagementAction[];
  executiveFocusAudit: ExecutiveFocusAudit;
  kpiRootCauses: KpiRootCause[];
  achievementDecomposition: AchievementDecomposition;
  topNegativeImpactRiders: NegativeImpactRider[];
  periodComparisons: KpiTrendComparison[];
  supervisorScorecards: SupervisorScorecardsReport;
  generatedAt: string;
};

export type ControlTowerRiderInput = {
  code: string;
  name: string;
  region: string;
  supervisorCode: string;
  supervisorName: string;
  totalHours: number;
  totalOrders: number;
};

export type ControlTowerBuildContext = {
  startDate: string;
  endDate: string;
  operationalPeriodDays: number;
  operationalCoveragePercent: number;
  metadataCoveragePercent: number;
  overallReadinessPercent: number;
  operationalAnalyticsEnabled: boolean;
  metadataAnalyticsEnabled: boolean;
  /** @deprecated Use operationalCoveragePercent */
  dataCoveragePercent: number;
  strategicKpisEnabled: boolean;
  fleetTalabat: TalabatFleetMetrics;
  supervisorRows: SupervisorOpsRow[];
  riders: ControlTowerRiderInput[];
  performance: Array<{ date: string; riderCode: string; hours: number; orders: number }>;
  assignedRiderCodes: Set<string>;
  fleetDailyTargetHours: number;
  headcount: number;
  inactiveRiders: number;
  avgHoursPerActiveRider: number;
  supervisorNameByCode: Map<string, string>;
};

export const KPI_KEYS = [
  'headcount',
  'activeRiders',
  'noShowRiders',
  'actualHours',
  'targetHours',
  'achievementPercent',
  'utilizationPercent',
] as const;

export type KpiKey = (typeof KPI_KEYS)[number];

export function extractFleetKpiValues(fleet: TalabatFleetMetrics): Record<KpiKey, number> {
  return {
    headcount: fleet.headcount,
    activeRiders: fleet.activeRiders,
    noShowRiders: fleet.noShowRiders,
    actualHours: fleet.actualHours,
    targetHours: fleet.targetHours,
    achievementPercent: fleet.achievementPercent,
    utilizationPercent: fleet.utilizationPercent,
  };
}
