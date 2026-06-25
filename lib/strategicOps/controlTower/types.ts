import type { SupervisorOpsRow } from '@/lib/strategicOps/buildReport';
import type { TalabatFleetMetrics } from '@/lib/strategicOps/talabatOpsMetrics';
import type { SupervisorMappingHealth } from '@/lib/strategicOps/controlTower/supervisorMapping';
import type { ControlTowerReliability } from '@/lib/strategicOps/controlTower/reliability';

export type ActionPriority = 'critical' | 'high' | 'medium' | 'low';
export type ActionConfidence = 'high' | 'medium' | 'low';
export type ActionUrgency = 'immediate' | 'this_week' | 'this_month';

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
  whyAr?: string;
  expectedRecoveryHours: number;
  expectedRecoveryOrders?: number;
  riderCount?: number;
  rawRecoveryHours: number;
  deduplicatedRecoveryHours: number;
  confidence?: ActionConfidence;
  urgency?: ActionUrgency;
  evidence: string;
};

/** Per-rider historical baseline from lookback window (30 days before period). */
export type RiderHistoricalBaseline = {
  riderCode: string;
  avgHoursDaily: number;
  avgOrdersDaily: number;
  activeDays: number;
  lookbackDays: number;
  hasHistory: boolean;
  /** Source of expected hours: own 30-day history, partial history, or fleet average fallback. */
  baselineSource: 'historical_30d' | 'historical_partial' | 'fleet_average';
};

export type SupervisorTrendStatus = 'improving' | 'stable' | 'declining' | 'critical';

/** Supervisor period-over-period comparison. */
export type SupervisorIntelligence = {
  code: string;
  name: string;
  region: string;
  headcount: number;
  activeRiders: number;
  noShowCount: number;
  actualHours: number;
  targetHours: number;
  achievementPercent: number;
  utilizationPercent: number;
  lostTargetHours: number;
  retentionRate: number;
  newHires: number;
  reactivations: number;
  trendStatus: SupervisorTrendStatus;
  rootCauseAr: string;
  priorityRank: number;
};

/** Operational intelligence feed item. */
export type IntelligenceFeedItem = {
  id: string;
  priority: ActionPriority;
  titleAr: string;
  explanationAr: string;
  quantifiedImpact: {
    hoursLost: number;
    ridersAffected: number;
    achievementDelta?: number;
  };
  recommendedActionAr: string;
  expectedRecoveryHours: number;
};

/** Executive health summary. */
export type OperationalHealthSummary = {
  healthScore: number;
  statusLabel: 'Healthy' | 'Warning' | 'Critical';
  statusLabelAr: '✅ وضع جيد' | '⚠️ تحذير' | '🔴 حرج';
  riskLevel: 'low' | 'medium' | 'high' | 'severe';
  achievementPercent: number;
  hoursGap: number;
  hoursGapDirection: 'above' | 'below';
  ordersGap: number;
  supervisorHealthScore: number;
  fleetHealthScore: number;
  situationSummaryAr: string;
};

/** Rider classification category. */
export type RiderClassification =
  | 'high_performer'
  | 'stable'
  | 'improving'
  | 'declining'
  | 'sudden_drop'
  | 'chronic_underperformer'
  | 'inactive'
  | 'no_show_risk'
  | 'new_joiner'
  | 'reactivated';

/** Enriched rider with classification + risk score + history-based impact. */
export type RiderIntelligence = {
  code: string;
  name: string;
  supervisorCode: string;
  supervisorName: string;
  region: string;
  classification: RiderClassification;
  classificationLabelAr: string;
  riskScore: number;
  expectedHoursDaily: number;
  actualHoursDaily: number;
  lostHoursDaily: number;
  lostHoursPeriod: number;
  expectedOrdersDaily: number;
  actualOrdersDaily: number;
  lostOrdersDaily: number;
  noShowCount: number;
  scheduledDays: number;
  attendanceRate: number;
  utilizationPercent: number;
  trendDirection: 'improving' | 'stable' | 'declining';
  baselineSource: 'historical_30d' | 'historical_partial' | 'fleet_average';
  impactLevel: RiderImpactLevel;
  impactLabelAr: string;
};

/** A single recovery lever in the recruitment waterfall. */
export type RecoveryLever = {
  label: string;
  labelAr: string;
  recoveryHours: number;
  pctOfGap: number;
  realismNote: string;
};

/** Recruitment needs waterfall (daily hours). */
export type RecruitmentAnalysis = {
  currentHoursGap: number;
  levers: RecoveryLever[];
  recoverableByReactivation: number;
  recoverableByNoShowReduction: number;
  recoverableByHoursPush: number;
  recoverableBySupervision: number;
  remainingGapAfterLevers: number;
  hiringRequirementRiders: number;
  hiringRequirementHours: number;
  recommendHiring: boolean;
  summaryAr: string;
  validationPassed: boolean;
};

/** Priority 1: Rider decline entry (ranked by % decline). */
export type RiderDeclineEntry = {
  code: string;
  name: string;
  supervisorCode: string;
  supervisorName: string;
  prev30AvgHours: number;
  currentAvgHours: number;
  hoursDeclinePct: number;
  prev30AvgOrders: number;
  currentAvgOrders: number;
  ordersDeclinePct: number;
  declineStartDay: string | null;
  daysInDecline: number;
  riskLevel: 'critical' | 'high' | 'medium';
  riskLabelAr: string;
  baselineSource: 'historical_30d' | 'historical_partial' | 'fleet_average';
};

/** Priority 2: Order collapse entry (ranked by absolute lost orders). */
export type OrderCollapseEntry = {
  rank: number;
  code: string;
  name: string;
  supervisorCode: string;
  supervisorName: string;
  expectedOrdersDaily: number;
  actualOrdersDaily: number;
  lostOrdersDaily: number;
  ordersCollapsePct: number;
  hoursAlsoCollapsed: boolean;
  hoursDeclinePct: number;
};

/** Priority 3: Daily contact priority entry (specific riders to call today). */
export type DailyContactEntry = {
  priority: number;
  code: string;
  name: string;
  supervisorCode: string;
  supervisorName: string;
  prev30AvgHours: number;
  prev30AvgOrders: number;
  consecutiveInactiveDays: number;
  expectedRecoveryHours: number;
  expectedRecoveryOrders: number;
  priorityScore: number;
};

/** Priority 4: Supervisor accountability breakdown into 4 causes. */
export type SupervisorAccountabilityBreakdown = {
  supervisorCode: string;
  supervisorName: string;
  totalLostHours: number;
  noShowLostHours: number;
  noShowPct: number;
  lowHoursLostHours: number;
  lowHoursPct: number;
  inactiveLostHours: number;
  inactivePct: number;
  attritionLostHours: number;
  attritionPct: number;
  dominantCause: 'noShow' | 'lowHours' | 'inactive' | 'attrition';
  recommendationAr: string;
};

/** Priority 5: Metric forecast card (7-day and 14-day projection). */
export type MetricForecast = {
  metricKey: string;
  metricLabelAr: string;
  currentValue: number;
  day7Forecast: number;
  day14Forecast: number;
  trend: 'improving' | 'stable' | 'declining' | 'critical_decline';
  confidence: 'high' | 'medium' | 'low';
  alertAr: string | null;
  interpretationAr: string;
  rSquared: number;
};

/** Baseline coverage stats for the data quality panel. */
export type BaselineCoverageStats = {
  historical30d: number;
  historicalPartial: number;
  fleetAverage: number;
  total: number;
  historicalPct: number;
  fleetAvgPct: number;
  qualityWarning: boolean;
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
  /** Enriched rider list with per-rider history-based expected hours, classification, risk score. */
  riderIntelligence: RiderIntelligence[];
  periodComparisons: KpiTrendComparison[];
  supervisorScorecards: SupervisorScorecardsReport;
  supervisorIntelligence: SupervisorIntelligence[];
  supervisorAccountability: SupervisorAccountabilityBreakdown[];
  intelligenceFeed: IntelligenceFeedItem[];
  executiveHealth: OperationalHealthSummary;
  recruitmentAnalysis: RecruitmentAnalysis;
  riderDeclineView: RiderDeclineEntry[];
  orderCollapseView: OrderCollapseEntry[];
  dailyContactList: DailyContactEntry[];
  forecastMetrics: MetricForecast[];
  baselineCoverage: BaselineCoverageStats;
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
  /** Historical performance (lookback window before startDate) for per-rider baselines. */
  lookbackPerformance?: Array<{ date: string; riderCode: string; hours: number; orders: number }>;
  /** Pre-computed per-rider historical baselines. If not set, fleet avg is used. */
  riderHistoricalBaselines?: Map<string, RiderHistoricalBaseline>;
  assignedRiderCodes: Set<string>;
  fleetDailyTargetHours: number;
  headcount: number;
  inactiveRiders: number;
  avgHoursPerActiveRider: number;
  supervisorNameByCode: Map<string, string>;
  /** Join date map for rider lifecycle classification. */
  riderJoinDateByCode?: Map<string, string>;
  /** Target orders/day for revenue impact (default 0 = disabled). */
  avgRevenuePerOrder?: number;
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
