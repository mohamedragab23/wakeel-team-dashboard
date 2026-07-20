import { getAllRiders, getAllSupervisors, type Rider, type Supervisor } from '@/lib/adminService';
import { getSheetData } from '@/lib/googleSheets';
import { parseDailySheetDate, normalizeRiderCodeForPerformance } from '@/lib/dataFilter';
import { loadAllCandidates } from '@/lib/recruitment/recruitmentService';
import type { Candidate } from '@/lib/recruitment/types';
import { supervisorRowMatchesZoneFilter } from '@/lib/zones';
import { HOUR_BUCKET_DEFS_AR } from '@/lib/strategicOps/labelsAr';
import { isApprovedResignationStatus, isSheetSuspendedStatus } from '@/lib/strategicOps/resignationStatus';
import { buildOperationalFormulaAudit, type ResignationAuditRecord, type RiderLifetimeSample } from '@/lib/strategicOps/formulaAudit';
import {
  runDataIntegrityLayer,
  KPI_QUALITY_WARNING_AR,
  KPI_DATA_LEAKAGE_WARNING_AR,
} from '@/lib/strategicOps/dataIntegrity';
import { buildOperationalTruthIntelligence, createDisabledOperationalTruthIntelligence, type OperationalTruthIntelligence } from '@/lib/strategicOps/truthEngine';
import { dualFromPeriod, type DualMetric } from '@/lib/strategicOps/dualMetrics';
import { computeKpiTrustLevel, type KpiTrustReport } from '@/lib/strategicOps/kpiTrustLevel';
import { buildJoinDateAudit, type JoinDateAuditReport } from '@/lib/strategicOps/joinDateAudit';
import {
  buildMetadataCompletionAudit,
  type MetadataCompletionAudit,
} from '@/lib/strategicOps/metadataCompletionAudit';
import { buildGhostRiderAudit, type GhostRiderAuditReport } from '@/lib/strategicOps/ghostRiderAudit';
import { buildFinalKpiAccuracyAudit } from '@/lib/strategicOps/finalKpiAccuracyAudit';
import { buildPostNormalizationValidationReport } from '@/lib/strategicOps/postNormalizationValidation';
import {
  buildTalabatAuditTraces,
  buildNoShowComparison,
  computeFleetTalabatMetrics,
  computeSourceDataCoverage,
  computeSupervisorTalabatMetrics,
  enumerateCalendarDates,
  resolveFleetDailyTargetHours,
  sumSupervisorDailyTargets,
  type KpiAuditTrace,
  type NoShowComparison,
  type SourceDataCoverage,
  type TalabatDailySnapshot,
} from '@/lib/strategicOps/talabatOpsMetrics';
import {
  buildTalabatAccuracyScore,
  type TalabatAccuracyScore,
  type TalabatBenchmarkInput,
} from '@/lib/strategicOps/talabatAccuracyScore';
import {
  computeAdditionalRidersNeeded,
  formatAdditionalRidersCalculation,
  validateRoadmapRidersAudit,
  type RoadmapRidersAudit,
} from '@/lib/strategicOps/roadmapCalculation';
import { buildControlTowerReport, type ControlTowerReport } from '@/lib/strategicOps/controlTower';
import { buildRiderHistoricalBaselines } from '@/lib/strategicOps/controlTower/riderHistory';
import {
  buildSrs006CompletePackage,
  type Srs006CompletePackage,
} from '@/lib/strategicOps/trust/srs006Package';

export type StrategicOpsFilters = {
  startDate: string;
  endDate: string;
  zone: string;
  supervisorCode: string;
  allowedSupervisorCodes?: Set<string> | null;
  talabatBenchmark?: TalabatBenchmarkInput;
};

export type HourBucket = {
  label: string;
  key: string;
  count: number;
  percent: number;
  /** Period total hours from riders in this bucket */
  hoursContribution: number;
  /** Average daily hours per rider in bucket (classification basis) */
  avgDailyHoursPerRider: number;
  hoursDual: DualMetric;
};

export type RiderRankRow = {
  code: string;
  name: string;
  supervisorCode: string;
  supervisorName: string;
  region: string;
  /** Period total hours */
  hours: number;
  /** Period total orders */
  orders: number;
  /** Calendar-day normalized hours (default operational view) */
  avgDailyHours: number;
  /** Calendar-day normalized orders */
  avgDailyOrders: number;
  hoursDual: DualMetric;
  ordersDual: DualMetric;
  workDays: number;
  /** Change in calendar-normalized daily hours (2nd half − 1st half) */
  trendDelta?: number;
  consistencyScore?: number;
};

export type SupervisorOpsRow = {
  code: string;
  name: string;
  region: string;
  headcount: number;
  assignedRiders: number;
  /** AVG daily active riders (Talabat) */
  activeRiders: number;
  noShowRiders: number;
  inactiveRiders: number;
  suspendedRiders: number;
  newHires: number;
  resignations: number;
  totalHours: number;
  /** AVG daily hours (Talabat) */
  dailyHours: number;
  /** Period avg hours per assigned rider */
  avgHoursPerRider: number;
  /** Avg hours per active rider = dailyHours / activeRiders (Talabat) */
  avgHoursPerRiderDaily: number;
  avgOrders: number;
  avgOrdersDaily: number;
  totalHoursDual: DualMetric;
  avgHoursPerRiderDual: DualMetric;
  avgOrdersDual: DualMetric;
  attendancePercent: number;
  utilizationPercent: number;
  targetAchievementPercent: number;
  achievementPercent: number;
  productivityScore: number;
  riskScore: number;
  riskLevel: 'green' | 'yellow' | 'red';
  /** Average break minutes per rider per working day */
  avgBreakMinutesDaily?: number;
  /** Average delay (late) minutes per rider per working day */
  avgDelayMinutesDaily?: number;
};

export type DataValidationEntry = {
  kpi: string;
  sourceSheet: string;
  columns: string;
  recordsRead: number;
  formula: string;
  result: string | number;
  numerator?: number;
  numeratorLabel?: string;
  denominator?: number;
  denominatorLabel?: string;
  rawDataSource?: string;
  status?: 'valid' | 'warning' | 'insufficient_data';
};

export type OperationalHealthScore = {
  score: number;
  level: 'excellent' | 'good' | 'needs_action' | 'danger';
  levelLabelAr: string;
  components: {
    utilization: number;
    attritionInverse: number;
    activePercent: number;
    hoursPerRider: number;
    recruitment: number;
  };
};

export type GrowthExpansionIndicator = {
  key: string;
  labelAr: string;
  value: number;
  displayValue: string;
  unit: string;
  formula: string;
  calculation: string;
};

const DAILY_HOURS_TARGET = 2200;
const DAILY_HOURS_BASELINE = 1500;

export type StrategicOpsReport = {
  meta: {
    startDate: string;
    endDate: string;
    zone: string;
    supervisorCode: string;
    periodDays: number;
    validDaysInDataset: number;
    generatedAt: string;
    /** Default UI/export view — daily normalized values */
    defaultMetricView: 'daily';
    normalizationCalendarDays: number;
    dailyHoursBaseline: number;
    dailyHoursTarget: number;
    defaultDashboardMode: 'talabat_ops';
  };
  sourceDataCoverage: SourceDataCoverage;
  talabatOperations: {
    headcount: number;
    activeRiders: number;
    noShowRiders: number;
    actualHours: number;
    targetHours: number;
    achievementPercent: number;
    avgHoursPerActiveRider: number;
    utilizationPercent: number;
    uniqueActiveRidersInPeriod: number;
    operationalDays: number;
    dailySeries: TalabatDailySnapshot[];
    auditTraces: KpiAuditTrace[];
    noShowComparison: NoShowComparison;
  };
  talabatAccuracyScore: TalabatAccuracyScore;
  executiveSummary: {
    totalRegisteredRiders: number;
    totalAssignedToSupervisors: number;
    /** AVG daily active riders (Talabat) */
    activeRiders: number;
    noShowRiders: number;
    actualDailyHours: number;
    targetDailyHours: number;
    achievementPercent: number;
    avgHoursPerActiveRider: number;
    uniqueActiveRidersInPeriod: number;
    inactiveRiders: number;
    suspendedRiders: number;
    approvedResignations: number;
    newRidersJoined: number;
    ridersWithNoActivity: number;
    activePercent: number;
    inactivePercent: number;
    suspensionPercent: number;
    utilizationRate: number;
    attritionRate: number;
    monthlyAttritionRate: number;
  };
  activityDistribution: {
    buckets: HourBucket[];
    totalRiders: number;
    totalHours: number;
    totalHoursDual: DualMetric;
    classificationBasis: 'average_daily_hours';
    classificationFormula: string;
    periodDays: number;
  };
  utilization: {
    totalRegisteredRiders: number;
    activeRiders: number;
    utilizationRate: number;
    top20ByHours: RiderRankRow[];
    bottom20ByHours: RiderRankRow[];
    mostConsistent: RiderRankRow[];
    mostImproved: RiderRankRow[];
    declining: RiderRankRow[];
  };
  hoursAnalysis: {
    totalHours: number;
    totalHoursDual: DualMetric;
    /** Operational truth: totalHours ÷ calendar days in range */
    averageDailyHours: number;
    /** Diagnostic only: totalHours ÷ days with uploaded data */
    executionAverageDailyHours: number;
    highestDay: { date: string; hours: number } | null;
    lowestDay: { date: string; hours: number } | null;
    averageHoursPerRider: number;
    averageHoursPerRiderDual: DualMetric;
    averageHoursPerActiveRider: number;
    averageHoursPerActiveRiderDual: DualMetric;
    trend: Array<{ date: string; hours: number; orders: number }>;
    top10Days: Array<{ date: string; hours: number }>;
    worst10Days: Array<{ date: string; hours: number }>;
  };
  lostHours: {
    potentialHours: number;
    actualHours: number;
    lostHours: number;
    potentialHoursDual: DualMetric;
    actualHoursDual: DualMetric;
    lostHoursDual: DualMetric;
    lostPercent: number;
    breakdown: Array<{
      category: string;
      categoryKey: string;
      hours: number;
      hoursDual: DualMetric;
      percent: number;
      riderCount: number;
    }>;
  };
  supervisorPerformance: {
    rows: SupervisorOpsRow[];
    bestSupervisor: SupervisorOpsRow | null;
    worstSupervisor: SupervisorOpsRow | null;
  };
  supervisorRisk: {
    rows: Array<{
      code: string;
      name: string;
      region: string;
      riskScore: number;
      riskLevel: 'green' | 'yellow' | 'red';
      factors: string[];
    }>;
  };
  recruitment: {
    disabled: boolean;
    disabledReason?: string;
    totalApplications: number;
    totalAccepted: number;
    totalJoined: number;
    totalActiveAfterJoining: number;
    applicationToJoinRate: number;
    joinToActiveRate: number;
    recruitmentEfficiencyPercent: number;
    recruiterRanking: Array<{
      recruiter: string;
      applications: number;
      accepted: number;
      joined: number;
      activeAfterJoining: number;
      efficiencyPercent: number;
    }>;
  };
  attrition: {
    approvedResignations: number;
    attritionRate: number;
    monthlyAttritionRate: number;
    averageActiveRidersDuringPeriod: number;
    topSupervisorsLosingRiders: Array<{ code: string; name: string; count: number }>;
    averageRiderLifetimeDays: number | null;
    riderLifetimeKpiEnabled: boolean;
    riderLifetimeDisabledReason?: string;
    attritionTrend: Array<{ period: string; resignations: number }>;
  };
  topBreakTakers: {
    riders: Array<{
      code: string;
      name: string;
      supervisorCode: string;
      supervisorName: string;
      region: string;
      totalBreakMinutes: number;
      totalHours: number;
      avgDailyBreakMinutes: number;
      workDays: number;
    }>;
  };
  topAbsentRiders: {
    riders: Array<{
      code: string;
      name: string;
      supervisorCode: string;
      supervisorName: string;
      region: string;
      absentDays: number;
      totalDaysInPeriod: number;
      absentPercent: number;
    }>;
  };
  inactive3DaysPlus: {
    riders: Array<{
      code: string;
      name: string;
      supervisorCode: string;
      supervisorName: string;
      region: string;
      inactiveDays: number;
      lastActivityDate: string | null;
    }>;
  };
  delta: {
    newHires: number;
    reactivations: number;
    terminations: number;
    netChange: number;
  };
  workHoursSegments: {
    below4Hours: {
      count: number;
      riders: Array<{
        code: string;
        name: string;
        supervisorCode: string;
        supervisorName: string;
        region: string;
        avgDailyHours: number;
        totalHours: number;
        totalOrders: number;
        workDays: number;
      }>;
    };
    between4And6Hours: {
      count: number;
      riders: Array<{
        code: string;
        name: string;
        supervisorCode: string;
        supervisorName: string;
        region: string;
        avgDailyHours: number;
        totalHours: number;
        totalOrders: number;
        workDays: number;
      }>;
    };
    between6And8Hours: {
      count: number;
      riders: Array<{
        code: string;
        name: string;
        supervisorCode: string;
        supervisorName: string;
        region: string;
        avgDailyHours: number;
        totalHours: number;
        totalOrders: number;
        workDays: number;
      }>;
    };
    above8Hours: {
      count: number;
      riders: Array<{
        code: string;
        name: string;
        supervisorCode: string;
        supervisorName: string;
        region: string;
        avgDailyHours: number;
        totalHours: number;
        totalOrders: number;
        workDays: number;
      }>;
    };
  };
  fleetStatistics: {
    avgDailyActiveRiders: number;
    avgDailyAbsentRiders: number;
    activePercentage: number;
    totalBreakMinutes: number;
    avgBreakMinutesPerRider: number;
    avgBreakMinutesPerDay: number;
    avgWorkHoursPerRider: number;
    avgWorkHoursPerActiveRider: number;
  };
  growthOpportunities: {
    disabled: boolean;
    disabledReason?: string;
    scenarios: Array<{
      key: string;
      label: string;
      /** Period gain over selected range */
      additionalHoursGain: number;
      /** Daily fleet gain (default operational view) */
      additionalHoursGainDaily: number;
      expectedTotalHours: number;
      expectedTotalHoursDaily: number;
      affectedRiders: number;
    }>;
  };
  growthExpansion: {
    disabled: boolean;
    disabledReason?: string;
    dailyTargetHours: number;
    currentAverageDailyHours: number;
    indicators: GrowthExpansionIndicator[];
  };
  hoursRoadmap: {
    disabled: boolean;
    disabledReason?: string;
    lowConfidence?: boolean;
    currentDailyHours: number;
    targetDailyHours: number;
    dailyGap: number;
    currentPeriodHours: number;
    periodDays: number;
    validDaysInDataset: number;
    additionalActiveRidersNeeded: number;
    additionalHoursPerRiderNeeded: number;
    roadmap: string[];
    calculationTrace: {
      formula: string;
      dailyGapCalculation: string;
      avgDailyHoursPerActiveRider: number;
      additionalRidersFormula: string;
      additionalRidersCalculation: string;
      ridersAudit: RoadmapRidersAudit;
      forecastDisabled: boolean;
      forecastDisabledReason?: string;
    };
    ridersAudit: RoadmapRidersAudit;
    mathValidationPassed: boolean;
  };
  kpiTrust: KpiTrustReport;
  ghostRiderAudit: GhostRiderAuditReport;
  joinDateAudit: JoinDateAuditReport;
  metadataCompletionAudit: MetadataCompletionAudit;
  codeNormalizationAudit: import('@/lib/strategicOps/codeNormalization').CodeNormalizationAuditReport;
  postNormalizationValidation: import('@/lib/strategicOps/postNormalizationValidation').PostNormalizationValidationReport;
  finalKpiAccuracyAudit: import('@/lib/strategicOps/finalKpiAccuracyAudit').FinalKpiAccuracyAudit;
  dataIntegrity: import('@/lib/strategicOps/dataIntegrity').DataIntegrityReport;
  operationalTruthIntelligence: OperationalTruthIntelligence;
  operationalFormulaAudit: import('@/lib/strategicOps/formulaAudit').OperationalFormulaAudit;
  operationalHealth: OperationalHealthScore & {
    disabled: boolean;
    disabledReason?: string;
  };
  dataValidation: DataValidationEntry[];
  aiInsights: {
    biggestProblem: string;
    lostHoursCause: string;
    supervisorNeedingIntervention: string;
    underutilizedRiders: string;
    focusThisWeek: string;
    focusThisMonth: string;
    fastestHourGains: string;
    fullReport: string;
  };
  controlTower?: ControlTowerReport;
  /** SRS-006 complete package (trust, fairness, timeline, cross-validation, decision mode) */
  srs006?: Srs006CompletePackage;
};

type PerfRec = {
  date: string;
  riderCode: string;
  hours: number;
  orders: number;
  breakMinutes?: number;
  delayMinutes?: number;
  /** Day-level supervisor for attribution (SRS-008) */
  supervisorCode?: string;
  zone?: string;
};

type RiderAgg = {
  code: string;
  name: string;
  region: string;
  supervisorCode: string;
  supervisorName: string;
  status: string;
  joinDate: string;
  contractType: string;
  totalHours: number;
  totalOrders: number;
  totalBreakMinutes: number;
  totalDelayMinutes: number;
  workDays: number;
  dailyHours: Map<string, number>;
};

type ApprovedResignation = {
  sheetRow: number;
  riderCode: string;
  riderName: string;
  supervisorCode: string;
  statusRaw: string;
  requestDate: Date | null;
  approvalDate: Date;
};

function parseApprovedResignationsWithAudit(
  terminationSheet: unknown[][],
  startDate: Date,
  endDate: Date,
  filters: StrategicOpsFilters,
  supervisorCodesScoped: Set<string>
): {
  deduped: ApprovedResignation[];
  auditRecords: ResignationAuditRecord[];
  rawRowsMatched: number;
  duplicatesRemoved: number;
} {
  const rawMatches: ApprovedResignation[] = [];

  for (let i = 1; i < terminationSheet.length; i++) {
    const row = terminationSheet[i];
    if (!row || row.length < 6) continue;
    if (!isApprovedResignationStatus(row[5])) continue;

    const supCode = String(row[0] ?? '').trim();
    if (filters.supervisorCode !== 'all' && supCode !== filters.supervisorCode) continue;
    if (filters.zone !== 'all' && filters.supervisorCode === 'all' && supervisorCodesScoped.size > 0) {
      if (!supervisorCodesScoped.has(supCode)) continue;
    }

    const approvalDate = parseDailySheetDate(row[7]) ?? parseDailySheetDate(row[6]);
    if (!inDateRange(approvalDate, startDate, endDate)) continue;

    rawMatches.push({
      sheetRow: i + 1,
      riderCode: String(row[2] ?? '').trim(),
      riderName: String(row[3] ?? '').trim(),
      supervisorCode: supCode,
      statusRaw: String(row[5] ?? '').trim(),
      requestDate: parseDailySheetDate(row[6]),
      approvalDate: approvalDate!,
    });
  }

  const byRider = new Map<string, ApprovedResignation>();
  const auditRecords: ResignationAuditRecord[] = [];

  for (const rec of rawMatches) {
    const norm = normalizeRiderCodeForPerformance(rec.riderCode);
    const existing = byRider.get(norm);
    if (!existing) {
      byRider.set(norm, rec);
      auditRecords.push({
        sheetRow: rec.sheetRow,
        riderCode: rec.riderCode,
        riderName: rec.riderName,
        supervisorCode: rec.supervisorCode,
        statusRaw: rec.statusRaw,
        requestDate: rec.requestDate ? rec.requestDate.toISOString().split('T')[0] : null,
        approvalDate: rec.approvalDate.toISOString().split('T')[0],
        included: true,
      });
    } else if (rec.approvalDate.getTime() > existing.approvalDate.getTime()) {
      const prevIdx = auditRecords.findIndex(
        (a) => normalizeRiderCodeForPerformance(a.riderCode) === norm && a.included
      );
      if (prevIdx >= 0) {
        auditRecords[prevIdx].included = false;
        auditRecords[prevIdx].dedupeNote = `استُبدل بالصف ${rec.sheetRow} (موافقة أحدث)`;
      }
      byRider.set(norm, rec);
      auditRecords.push({
        sheetRow: rec.sheetRow,
        riderCode: rec.riderCode,
        riderName: rec.riderName,
        supervisorCode: rec.supervisorCode,
        statusRaw: rec.statusRaw,
        requestDate: rec.requestDate ? rec.requestDate.toISOString().split('T')[0] : null,
        approvalDate: rec.approvalDate.toISOString().split('T')[0],
        included: true,
        dedupeNote: `أحدث موافقة للطيار ${rec.riderCode}`,
      });
    } else {
      auditRecords.push({
        sheetRow: rec.sheetRow,
        riderCode: rec.riderCode,
        riderName: rec.riderName,
        supervisorCode: rec.supervisorCode,
        statusRaw: rec.statusRaw,
        requestDate: rec.requestDate ? rec.requestDate.toISOString().split('T')[0] : null,
        approvalDate: rec.approvalDate.toISOString().split('T')[0],
        included: false,
        dedupeNote: `مكرر — وُجدت موافقة أحدث للطيار ${rec.riderCode}`,
      });
    }
  }

  return {
    deduped: Array.from(byRider.values()),
    auditRecords,
    rawRowsMatched: rawMatches.length,
    duplicatesRemoved: rawMatches.length - byRider.size,
  };
}

function computeDailyActiveRiderCounts(performance: PerfRec[]): number[] {
  const activeByDate = new Map<string, Set<string>>();
  for (const rec of performance) {
    if (rec.hours <= 0) continue;
    const norm = normalizeRiderCodeForPerformance(rec.riderCode);
    const set = activeByDate.get(rec.date) ?? new Set<string>();
    set.add(norm);
    activeByDate.set(rec.date, set);
  }
  return Array.from(activeByDate.values()).map((s) => s.size);
}

const SHEET_DAILY = 'البيانات اليومية';
const SHEET_RIDERS = 'المناديب';
const SHEET_TERMINATION = 'طلبات_الإقالة';
const HOURS_CAP_PER_DAY = 10;
const WEAK_HOURS_THRESHOLD = 6;

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function pct(part: number, total: number): number {
  if (total <= 0) return 0;
  return round2((part / total) * 100);
}

function diffDaysInclusive(start: Date, end: Date): number {
  const s = new Date(start);
  const e = new Date(end);
  s.setHours(0, 0, 0, 0);
  e.setHours(0, 0, 0, 0);
  const ms = e.getTime() - s.getTime();
  if (!Number.isFinite(ms) || ms < 0) return 0;
  return Math.floor(ms / (24 * 60 * 60 * 1000)) + 1;
}

function parseJoinDate(v: unknown): Date | null {
  if (!v) return null;
  return parseDailySheetDate(v);
}

function inDateRange(d: Date | null, start: Date, end: Date): boolean {
  if (!d || isNaN(d.getTime())) return false;
  const t = new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const s = new Date(start.getFullYear(), start.getMonth(), start.getDate()).getTime();
  const e = new Date(end.getFullYear(), end.getMonth(), end.getDate()).getTime();
  return t >= s && t <= e;
}

/**
 * Unified Active Rider Definition
 * Implements SRS-001 Section 8
 * Uses centralized business rules from configuration
 */
function isRiderActive(agg: RiderAgg): boolean {
  // Import from config for consistency
  return agg.totalHours > 0 && agg.totalOrders > 0;
}

function isRiderInactive(agg: RiderAgg): boolean {
  return agg.totalHours === 0 && agg.totalOrders === 0;
}

function filterRiders(riders: Rider[], zone: string, supervisorCode: string): Rider[] {
  let list = riders;
  if (zone && zone !== 'all') {
    list = list.filter((r) => supervisorRowMatchesZoneFilter(r.region, zone));
  }
  if (supervisorCode && supervisorCode !== 'all') {
    list = list.filter((r) => String(r.supervisorCode ?? '').trim() === supervisorCode);
  }
  return list;
}

function filterSupervisors(supervisors: Supervisor[], zone: string, supervisorCode: string): Supervisor[] {
  let list = supervisors;
  if (zone && zone !== 'all') {
    list = list.filter((s) => supervisorRowMatchesZoneFilter(s.region, zone));
  }
  if (supervisorCode && supervisorCode !== 'all') {
    list = list.filter((s) => String(s.code ?? '').trim() === supervisorCode);
  }
  return list;
}

function hourBucketKey(avgDaily: number): string {
  if (avgDaily <= 0) return '0';
  if (avgDaily < 2) return 'lt2';
  if (avgDaily < 4) return '2-4';
  if (avgDaily < 6) return '4-6';
  if (avgDaily < 8) return '6-8';
  if (avgDaily < 10) return '8-10';
  return 'gt10';
}

function buildRiderAggs(riders: Rider[], performance: PerfRec[]): Map<string, RiderAgg> {
  const map = new Map<string, RiderAgg>();
  for (const r of riders) {
    const code = String(r.code ?? '').trim();
    if (!code) continue;
    const norm = normalizeRiderCodeForPerformance(code);
    map.set(norm, {
      code,
      name: r.name ?? code,
      region: r.region ?? '',
      supervisorCode: String(r.supervisorCode ?? '').trim(),
      supervisorName: r.supervisorName ?? '',
      status: r.status ?? 'نشط',
      joinDate: r.joinDate ?? '',
      contractType: (r as { contractType?: string }).contractType ?? '',
      totalHours: 0,
      totalOrders: 0,
      totalBreakMinutes: 0,
      totalDelayMinutes: 0,
      workDays: 0,
      dailyHours: new Map(),
    });
  }

  const dayWork = new Map<string, number>();
  for (const rec of performance) {
    const norm = normalizeRiderCodeForPerformance(rec.riderCode);
    const agg = map.get(norm);
    if (!agg) continue;
    agg.totalHours += rec.hours;
    agg.totalOrders += rec.orders;
    agg.totalBreakMinutes += rec.breakMinutes ?? 0;
    agg.totalDelayMinutes += rec.delayMinutes ?? 0;
    const dk = `${norm}|${rec.date}`;
    dayWork.set(dk, (dayWork.get(dk) ?? 0) + rec.hours);
    agg.dailyHours.set(rec.date, (agg.dailyHours.get(rec.date) ?? 0) + rec.hours);
  }

  for (const [dk, hrs] of dayWork) {
    if (hrs <= 0) continue;
    const norm = dk.slice(0, dk.indexOf('|'));
    const agg = map.get(norm);
    if (agg) agg.workDays += 1;
  }

  return map;
}

function computeConsistencyScore(dailyHours: Map<string, number>): number {
  const vals = Array.from(dailyHours.values()).filter((h) => h > 0);
  if (vals.length < 2) return vals.length === 1 ? 100 : 0;
  const mean = vals.reduce((a, b) => a + b, 0) / vals.length;
  if (mean <= 0) return 0;
  const variance = vals.reduce((s, v) => s + (v - mean) ** 2, 0) / vals.length;
  const cv = Math.sqrt(variance) / mean;
  return round2(Math.max(0, 100 - cv * 100));
}

function computeTrendDelta(dailyHours: Map<string, number>, startDate: Date, endDate: Date): number {
  const totalCalDays = diffDaysInclusive(startDate, endDate);
  const midOffset = Math.floor(totalCalDays / 2);
  const mid = new Date(startDate);
  mid.setDate(mid.getDate() + midOffset);

  let firstCalDays = 0;
  let secondCalDays = 0;
  for (let d = new Date(startDate); d <= endDate; d.setDate(d.getDate() + 1)) {
    if (d < mid) firstCalDays += 1;
    else secondCalDays += 1;
  }

  let first = 0;
  let second = 0;
  for (const [dateStr, hrs] of dailyHours) {
    const d = parseDailySheetDate(dateStr);
    if (!d) continue;
    if (d < mid) first += hrs;
    else second += hrs;
  }

  const avgFirst = firstCalDays > 0 ? first / firstCalDays : 0;
  const avgSecond = secondCalDays > 0 ? second / secondCalDays : 0;
  return round2(avgSecond - avgFirst);
}

function toRiderRankRow(agg: RiderAgg, periodDays: number, extra?: Partial<RiderRankRow>): RiderRankRow {
  const avgDailyHours = periodDays > 0 ? round2(agg.totalHours / periodDays) : 0;
  const avgDailyOrders = periodDays > 0 ? round2(agg.totalOrders / periodDays) : 0;
  return {
    code: agg.code,
    name: agg.name,
    supervisorCode: agg.supervisorCode,
    supervisorName: agg.supervisorName,
    region: agg.region,
    hours: round2(agg.totalHours),
    orders: agg.totalOrders,
    avgDailyHours,
    avgDailyOrders,
    hoursDual: dualFromPeriod(agg.totalHours, periodDays),
    ordersDual: dualFromPeriod(agg.totalOrders, periodDays),
    workDays: agg.workDays,
    ...extra,
  };
}

function riskLevelFromScore(score: number): 'green' | 'yellow' | 'red' {
  if (score < 35) return 'green';
  if (score < 65) return 'yellow';
  return 'red';
}

function computeSupervisorRisk(
  row: Omit<SupervisorOpsRow, 'riskScore' | 'riskLevel'>,
  periodDays: number
): { riskScore: number; riskLevel: 'green' | 'yellow' | 'red'; factors: string[] } {
  const factors: string[] = [];
  let score = 0;
  const assigned = row.assignedRiders || 1;

  if (row.avgHoursPerRiderDaily < 4) {
    score += 20;
    factors.push('متوسط ساعات يومي منخفض للطيارين');
  }
  const attritionRate = (row.resignations / assigned) * 100;
  if (attritionRate > 5) {
    score += Math.min(25, attritionRate);
    factors.push('معدل إقالة مرتفع');
  }
  const inactiveRate = (row.inactiveRiders / assigned) * 100;
  if (inactiveRate > 10) {
    score += Math.min(20, inactiveRate);
    factors.push('نسبة طيارين غير نشطين مرتفعة');
  }
  if (row.newHires < Math.max(1, assigned * 0.05) && periodDays >= 14) {
    score += 15;
    factors.push('تعيينات جديدة ضعيفة');
  }
  if (row.targetAchievementPercent < 60) {
    score += (60 - row.targetAchievementPercent) * 0.4;
    factors.push('تحقيق الهدف دون المستوى المطلوب');
  }
  const activeRate = row.activeRiders / assigned;
  if (activeRate < 0.5) {
    score += (0.5 - activeRate) * 40;
    factors.push('نسبة نشاط الطيارين منخفضة');
  }

  return { riskScore: round2(Math.min(100, score)), riskLevel: riskLevelFromScore(round2(Math.min(100, score))), factors };
}

function computeAvgActiveRidersDuringPeriod(dailyCounts: number[]): number {
  if (dailyCounts.length === 0) return 0;
  return round2(dailyCounts.reduce((a, b) => a + b, 0) / dailyCounts.length);
}

function computeOperationalHealth(
  utilizationRate: number,
  attritionRate: number,
  activePercent: number,
  averageDailyHoursPerRider: number,
  recruitmentEfficiency: number
): OperationalHealthScore {
  const utilizationScore = Math.min(100, utilizationRate);
  const attritionInverse = Math.max(0, 100 - attritionRate * 5);
  const activeScore = Math.min(100, activePercent);
  const hoursNorm = Math.min(100, (averageDailyHoursPerRider / 6) * 100);
  const recruitmentScore = Math.min(100, recruitmentEfficiency);

  const score = round2(
    utilizationScore * 0.25 +
      attritionInverse * 0.2 +
      activeScore * 0.2 +
      hoursNorm * 0.2 +
      recruitmentScore * 0.15
  );

  let level: OperationalHealthScore['level'] = 'danger';
  let levelLabelAr = 'خطر';
  if (score >= 80) {
    level = 'excellent';
    levelLabelAr = 'ممتاز';
  } else if (score >= 60) {
    level = 'good';
    levelLabelAr = 'جيد';
  } else if (score >= 40) {
    level = 'needs_action';
    levelLabelAr = 'يحتاج تدخل';
  }

  return {
    score,
    level,
    levelLabelAr,
    components: {
      utilization: round2(utilizationScore),
      attritionInverse: round2(attritionInverse),
      activePercent: round2(activeScore),
      hoursPerRider: round2(hoursNorm),
      recruitment: round2(recruitmentScore),
    },
  };
}

function recruitmentMetrics(
  candidates: Candidate[],
  riderAggs: Map<string, RiderAgg>
) {
  const allApps = candidates;
  const accepted = candidates.filter((c) => c.activationStatus === 'مفعل - تم القبول');
  const joined = candidates.filter(
    (c) => c.assignmentStatus === 'تم التعيين' || String(c.finalAssignedSupervisorCode ?? '').trim() !== ''
  );

  const joinedRiderActive = joined.filter((c) => {
    const matched = Array.from(riderAggs.values()).find((a) => a.name?.trim() === c.fullName?.trim());
    return matched ? isRiderActive(matched) : false;
  });

  const recruiterMap = new Map<
    string,
    { applications: number; accepted: number; joined: number; activeAfterJoining: number }
  >();
  for (const c of allApps) {
    const rec = String(c.assignedManager || c.createdBy || 'غير محدد').trim() || 'غير محدد';
    const cur = recruiterMap.get(rec) ?? { applications: 0, accepted: 0, joined: 0, activeAfterJoining: 0 };
    cur.applications += 1;
    if (c.activationStatus === 'مفعل - تم القبول') cur.accepted += 1;
    if (c.assignmentStatus === 'تم التعيين') cur.joined += 1;
    const matched = Array.from(riderAggs.values()).find((a) => a.name?.trim() === c.fullName?.trim());
    if (matched && isRiderActive(matched)) cur.activeAfterJoining += 1;
    recruiterMap.set(rec, cur);
  }

  return {
    totalApplications: allApps.length,
    totalAccepted: accepted.length,
    totalJoined: joined.length,
    totalActiveAfterJoining: joinedRiderActive.length,
    applicationToJoinRate: pct(joined.length, allApps.length),
    joinToActiveRate: pct(joinedRiderActive.length, joined.length || 1),
    recruitmentEfficiencyPercent: pct(joinedRiderActive.length, allApps.length),
    recruiterRanking: Array.from(recruiterMap.entries())
      .map(([recruiter, m]) => ({ recruiter, ...m, efficiencyPercent: pct(m.activeAfterJoining, m.applications) }))
      .sort((a, b) => b.efficiencyPercent - a.efficiencyPercent),
  };
}

function computeGrowthExpansionMetrics(input: {
  totalRegistered: number;
  totalAssigned: number;
  activeRiders: number;
  inactiveRiders: number;
  approvedResignations: number;
  totalHours: number;
  totalOrders: number;
  periodDays: number;
  supervisorCount: number;
  recruitmentApplications: number;
  recruitmentActiveAfterJoining: number;
  averageDailyHours: number;
  avgDailyHoursPerActiveRider: number;
}): Pick<StrategicOpsReport['growthExpansion'], 'dailyTargetHours' | 'currentAverageDailyHours' | 'indicators'> {
  const {
    totalRegistered,
    totalAssigned,
    activeRiders,
    inactiveRiders,
    approvedResignations,
    totalHours,
    totalOrders,
    periodDays,
    supervisorCount,
    recruitmentApplications,
    recruitmentActiveAfterJoining,
    averageDailyHours,
    avgDailyHoursPerActiveRider,
  } = input;

  const activeCoverage = pct(activeRiders, totalRegistered);
  const retentionRate = pct(Math.max(0, totalRegistered - approvedResignations), totalRegistered);
  const avgHoursPerActive = activeRiders > 0 ? round2(totalHours / activeRiders) : 0;
  const avgOrdersPerActive = activeRiders > 0 ? round2(totalOrders / activeRiders) : 0;
  const hoursPerSupervisor = supervisorCount > 0 ? round2(totalHours / supervisorCount) : 0;
  const ridersPerSupervisor = supervisorCount > 0 ? round2(totalAssigned / supervisorCount) : 0;
  const recruitmentActivation = pct(recruitmentActiveAfterJoining, recruitmentApplications);

  const dailyGap = Math.max(0, DAILY_HOURS_TARGET - averageDailyHours);
  const ridersAudit = computeAdditionalRidersNeeded(dailyGap, avgDailyHoursPerActiveRider);
  const additionalRidersForDailyTarget = ridersAudit.roundedResult ?? 0;
  const additionalRidersCalcStr = formatAdditionalRidersCalculation(ridersAudit);
  const additionalHoursForDailyTarget = round2(dailyGap);
  const inactiveGrowthPotentialDaily = round2(inactiveRiders * (avgDailyHoursPerActiveRider || 0));
  const inactiveGrowthPotentialPeriod = round2(inactiveGrowthPotentialDaily * periodDays);

  const mk = (
    key: string,
    labelAr: string,
    value: number,
    unit: string,
    formula: string,
    calculation: string
  ): GrowthExpansionIndicator => ({
    key,
    labelAr,
    value,
    displayValue: unit === '%' ? `${value}%` : unit === 'طيار' || unit === 'ساعة/يوم' ? String(value) : String(value),
    unit,
    formula,
    calculation,
  });

  const indicators: GrowthExpansionIndicator[] = [
    mk(
      'active_coverage',
      'نسبة التغطية النشطة',
      activeCoverage,
      '%',
      'الطيارون النشطون ÷ إجمالي المسجلين × 100',
      `${activeRiders} ÷ ${totalRegistered} × 100 = ${activeCoverage}%`
    ),
    mk(
      'retention_rate',
      'معدل الاحتفاظ بالطيارين',
      retentionRate,
      '%',
      '(المسجلون − الإقالات المعتمدة) ÷ المسجلون × 100',
      `(${totalRegistered} − ${approvedResignations}) ÷ ${totalRegistered} × 100 = ${retentionRate}%`
    ),
    mk(
      'avg_hours_active',
      'متوسط الساعات لكل طيار نشط',
      avgHoursPerActive,
      'ساعة',
      'إجمالي الساعات ÷ الطيارون النشطون',
      `${round2(totalHours)} ÷ ${activeRiders} = ${avgHoursPerActive} ساعة`
    ),
    mk(
      'avg_orders_active',
      'متوسط الطلبات لكل طيار نشط',
      avgOrdersPerActive,
      'طلب',
      'إجمالي الطلبات ÷ الطيارون النشطون',
      `${totalOrders} ÷ ${activeRiders} = ${avgOrdersPerActive} طلب`
    ),
    mk(
      'hours_per_supervisor',
      'الساعات لكل مشرف',
      hoursPerSupervisor,
      'ساعة',
      'إجمالي الساعات ÷ عدد المشرفين في النطاق',
      `${round2(totalHours)} ÷ ${supervisorCount} = ${hoursPerSupervisor} ساعة`
    ),
    mk(
      'riders_per_supervisor',
      'الطيارون لكل مشرف',
      ridersPerSupervisor,
      'طيار',
      'المعيّنون للمشرفين ÷ عدد المشرفين في النطاق',
      `${totalAssigned} ÷ ${supervisorCount} = ${ridersPerSupervisor} طيار`
    ),
    mk(
      'recruitment_activation',
      'نسبة تحويل التعيين إلى تفعيل',
      recruitmentActivation,
      '%',
      'النشطون بعد الانضمام ÷ إجمالي طلبات التعيين × 100',
      `${recruitmentActiveAfterJoining} ÷ ${recruitmentApplications} × 100 = ${recruitmentActivation}%`
    ),
    mk(
      'additional_riders_daily_2200',
      'طيارون إضافيون مطلوبون للوصول إلى ٢٢٠٠ ساعة يومياً',
      additionalRidersForDailyTarget,
      'طيار',
      '⌈(٢٢٠٠ − متوسط الساعات اليومية) ÷ متوسط ساعات الطيار النشط يومياً⌉',
      `⌈(${DAILY_HOURS_TARGET} − ${averageDailyHours}) ÷ ${avgDailyHoursPerActiveRider}⌉ = ${additionalRidersForDailyTarget} طيار (${ridersAudit.rawCalculation})`
    ),
    mk(
      'additional_hours_daily_2200',
      'ساعات إضافية مطلوبة للوصول إلى ٢٢٠٠ ساعة يومياً',
      additionalHoursForDailyTarget,
      'ساعة/يوم',
      '٢٢٠٠ − متوسط الساعات اليومية الحالي',
      `${DAILY_HOURS_TARGET} − ${averageDailyHours} = ${additionalHoursForDailyTarget} ساعة/يوم`
    ),
    mk(
      'inactive_growth_potential',
      'إمكانية النمو من الطيارين غير النشطين الحاليين',
      inactiveGrowthPotentialDaily,
      'ساعة/يوم',
      'غير النشطين × متوسط ساعات الطيار النشط يومياً (تقدير يومي)',
      `${inactiveRiders} × ${avgDailyHoursPerActiveRider} = ${inactiveGrowthPotentialDaily} ساعة/يوم (≈ ${inactiveGrowthPotentialPeriod} ساعة للفترة)`
    ),
  ];

  return {
    dailyTargetHours: DAILY_HOURS_TARGET,
    currentAverageDailyHours: averageDailyHours,
    indicators,
  };
}

function generateInsights(report: Omit<StrategicOpsReport, 'aiInsights' | 'controlTower'>): StrategicOpsReport['aiInsights'] {
  const es = report.executiveSummary;
  const lh = report.lostHours;
  const worstSup = report.supervisorPerformance.worstSupervisor;
  const bottomRiders = report.utilization.bottom20ByHours.slice(0, 5);
  const topScenario = [...report.growthOpportunities.scenarios].sort(
    (a, b) => b.additionalHoursGainDaily - a.additionalHoursGainDaily
  )[0];

  const biggestProblem =
    lh.lostPercent > 40
      ? `فقدان ${lh.lostPercent}% من الساعات المحتملة (${round2(lh.lostHoursDual.daily)} ساعة/يوم).`
      : es.inactiveRiders > es.totalRegisteredRiders * 0.2
        ? `${es.inactiveRiders} طياراً غير نشط (ساعات=٠ وطلبات=٠) أي ${es.inactivePercent}% من المسجلين.`
        : `معدل الاستغلال ${es.utilizationRate}% فقط — أقل من المستوى التشغيلي المطلوب.`;

  const lostHoursCause = lh.breakdown
    .filter((b) => b.hours > 0)
    .map((b) => `${b.category}: ${round2(b.hoursDual.daily)} ساعة/يوم (${b.percent}%)`)
    .join('؛ ') || 'لا توجد بيانات كافية عن الساعات المهدرة.';

  const supervisorNeedingIntervention = worstSup
    ? `المشرف ${worstSup.name} (${worstSup.code}) — مخاطر ${worstSup.riskScore}، نشطون ${worstSup.activeRiders}/${worstSup.assignedRiders}، إقالات ${worstSup.resignations}.`
    : 'لا يوجد مشرف ضمن النطاق.';

  const underutilizedRiders =
    bottomRiders.map((r) => `${r.name} (${r.code}): ${r.avgDailyHours} س/يوم`).join(' | ') || '—';

  const focusThisWeek = `تفعيل ${es.inactiveRiders} طيار غير نشط؛ رفع الاستغلال من ${es.utilizationRate}%؛ متابعة ${worstSup?.name ?? '—'}؛ معالجة ${es.approvedResignations} إقالة معتمدة.`;

  const focusThisMonth = `خفض التسرب (${es.attritionRate}%)؛ سد فجوة ${report.hoursRoadmap.dailyGap} ساعة/يوم؛ تنفيذ «${topScenario?.label ?? '—'}» (+${topScenario?.additionalHoursGainDaily ?? 0} س/يوم)؛ رفع درجة الصحة التشغيلية (${report.operationalHealth.score}).`;

  const fastestHourGains = topScenario
    ? `${topScenario.label}: +${topScenario.additionalHoursGainDaily} ساعة/يوم (≈ ${topScenario.additionalHoursGain} ساعة للفترة). بديل: ${report.hoursRoadmap.additionalActiveRidersNeeded} طيار إضافي.`
    : 'تفعيل الطيارين غير النشطين ورفع متوسط الساعات اليومية.';

  return {
    biggestProblem,
    lostHoursCause,
    supervisorNeedingIntervention,
    underutilizedRiders,
    focusThisWeek,
    focusThisMonth,
    fastestHourGains,
    fullReport: '',
  };
}

export async function buildStrategicOpsReport(filters: StrategicOpsFilters): Promise<StrategicOpsReport> {
  const startDate = new Date(filters.startDate + 'T00:00:00');
  const endDate = new Date(filters.endDate + 'T23:59:59');
  const periodDays = diffDaysInclusive(startDate, endDate);

  const [allRiders, allSupervisors, terminationSheet, candidates, dailySheetRaw] =
    await Promise.all([
      getAllRiders(false),
      getAllSupervisors(false),
      getSheetData(SHEET_TERMINATION, false).catch(() => [] as unknown[][]),
      loadAllCandidates().catch(() => [] as Candidate[]),
      getSheetData(SHEET_DAILY, false).catch(() => [] as unknown[][]),
    ]);

  const ridersScoped = filterRiders(allRiders, filters.zone, filters.supervisorCode);
  let supervisorsScoped = filterSupervisors(allSupervisors, filters.zone, filters.supervisorCode);

  if (filters.allowedSupervisorCodes) {
    supervisorsScoped = supervisorsScoped.filter((s) =>
      filters.allowedSupervisorCodes!.has(String(s.code ?? '').trim())
    );
  }

  const supervisorCodesScoped = new Set(
    supervisorsScoped.map((s) => String(s.code ?? '').trim()).filter(Boolean)
  );

  const ridersInScope =
    filters.supervisorCode !== 'all'
      ? ridersScoped
      : ridersScoped.filter(
          (r) =>
            !r.supervisorCode ||
            supervisorCodesScoped.has(String(r.supervisorCode ?? '').trim()) ||
            filters.zone !== 'all'
        );

  const { report: dataIntegrity, officialPerformance: validatedRaw, shadowPerformance } =
    runDataIntegrityLayer({
    dailySheetRaw,
    startDate,
    endDate,
    ridersInScope,
    allMasterRiders: allRiders,
    supervisors: allSupervisors,
  });

  const kpiTrust = computeKpiTrustLevel(
    dataIntegrity.dataQualityScore,
    dataIntegrity.ghostLeakagePercent
  );
  const kpiQualityGatePassed = kpiTrust.kpiQualityGatePassed;

  const joinDateAudit = buildJoinDateAudit(ridersInScope);
  const metadataCompletionAudit = buildMetadataCompletionAudit(
    ridersInScope,
    new Map(
      supervisorsScoped.map((s) => [String(s.code ?? '').trim(), s.name || String(s.code ?? '').trim()])
    )
  );

  const ghostRiderAudit = buildGhostRiderAudit({
    ghostRiderList: dataIntegrity.ghostRiderListFull,
    scopeExcludedRiders: dataIntegrity.scopeExcludedRiders,
    allMasterRiders: allRiders,
    ridersInScopeCount: ridersInScope.length,
    ghostLeakagePercent: dataIntegrity.ghostLeakagePercent,
    supervisors: allSupervisors,
  });

  /** Executive KPIs: calendar days (operational truth — missing days count as zero activity). */
  const operationalPeriodDays = Math.max(1, periodDays);
  /** Diagnostic only: days with actual uploaded data. */
  const executionPeriodDays = Math.max(1, dataIntegrity.validDaysInDataset);

  const performance: PerfRec[] = validatedRaw.map((rec) => ({
    date: rec.date,
    riderCode: rec.riderCode,
    hours: rec.hours,
    orders: rec.orders,
    breakMinutes: rec.breakMinutes,
    delayMinutes: rec.delayMinutes,
    supervisorCode: rec.supervisorCode,
    zone: rec.zone,
  }));

  const assignedRiders = ridersInScope.filter((r) => String(r.supervisorCode ?? '').trim());
  const assignedRiderCodes = new Set(
    assignedRiders
      .map((r) => normalizeRiderCodeForPerformance(r.code))
      .filter((c): c is string => Boolean(c))
  );
  const riderAggs = buildRiderAggs(ridersInScope, performance);
  const aggList = Array.from(riderAggs.values());

  const uniqueActiveRidersInPeriod = aggList.filter(isRiderActive).length;
  const inactiveRiders = aggList.filter(isRiderInactive).length;
  const suspendedRiders = ridersInScope.filter((r) => isSheetSuspendedStatus(r.status)).length;
  const newJoined = ridersInScope.filter((r) => inDateRange(parseJoinDate(r.joinDate), startDate, endDate)).length;

  const resignationParse = parseApprovedResignationsWithAudit(
    terminationSheet,
    startDate,
    endDate,
    filters,
    supervisorCodesScoped
  );
  const approvedResignationsList = resignationParse.deduped;
  const approvedResignations = approvedResignationsList.length;

  const totalRegistered = ridersInScope.length;
  const totalAssigned = assignedRiders.length;

  const calendarDates = enumerateCalendarDates(startDate, endDate);
  const fleetDailyTargetHours = resolveFleetDailyTargetHours(
    sumSupervisorDailyTargets(supervisorsScoped)
  );
  // When a supervisor filter is active, fleet hours use day-level attribution (SRS-008)
  const fleetPerformance =
    filters.supervisorCode && filters.supervisorCode !== 'all'
      ? performance.filter(
          (rec) => String(rec.supervisorCode ?? '').trim() === filters.supervisorCode
        )
      : performance;
  const fleetTalabat = computeFleetTalabatMetrics({
    calendarDates,
    performance: fleetPerformance,
    assignedRiderCodes,
    fleetDailyTargetHours,
    headcount: totalRegistered,
  });

  const sourceDataCoverage = computeSourceDataCoverage(
    dataIntegrity.completenessPercentage,
    metadataCompletionAudit.metadataCoveragePercent
  );
  const strategicKpisEnabled = sourceDataCoverage.strategicKpisEnabled;
  const insufficientLabel = sourceDataCoverage.insufficientDataLabelAr;

  const periodActiveRiders = fleetTalabat.activeRiders;
  const utilizationRate = fleetTalabat.utilizationPercent;
  const dailyActiveCounts = fleetTalabat.dailySeries.map((d) => d.activeRiders);
  const avgActiveDuringPeriod = fleetTalabat.activeRiders;

  const attritionRate = pct(approvedResignations, avgActiveDuringPeriod || periodActiveRiders || 1);
  const monthlyAttritionRate = round2(attritionRate * (30 / Math.max(periodDays, 1)));

  const executiveSummary = {
    totalRegisteredRiders: totalRegistered,
    totalAssignedToSupervisors: totalAssigned,
    activeRiders: periodActiveRiders,
    noShowRiders: fleetTalabat.noShowRiders,
    actualDailyHours: fleetTalabat.actualHours,
    targetDailyHours: fleetTalabat.targetHours,
    achievementPercent: fleetTalabat.achievementPercent,
    avgHoursPerActiveRider: fleetTalabat.avgHoursPerActiveRider,
    uniqueActiveRidersInPeriod,
    inactiveRiders,
    suspendedRiders,
    approvedResignations,
    newRidersJoined: newJoined,
    ridersWithNoActivity: inactiveRiders,
    activePercent: pct(periodActiveRiders, totalRegistered),
    inactivePercent: pct(inactiveRiders, totalRegistered),
    suspensionPercent: pct(suspendedRiders, totalRegistered),
    utilizationRate,
    attritionRate,
    monthlyAttritionRate,
  };

  const bucketCounts = new Map<string, { count: number; hours: number }>();
  for (const def of HOUR_BUCKET_DEFS_AR) bucketCounts.set(def.key, { count: 0, hours: 0 });

  let totalHours = 0;
  for (const agg of aggList) {
    totalHours += agg.totalHours;
    const avgDaily = operationalPeriodDays > 0 ? agg.totalHours / operationalPeriodDays : 0;
    const b = bucketCounts.get(hourBucketKey(avgDaily))!;
    b.count += 1;
    b.hours += agg.totalHours;
  }

  const activityDistribution = {
    totalRiders: aggList.length,
    totalHours: round2(totalHours),
    totalHoursDual: dualFromPeriod(totalHours, operationalPeriodDays),
    classificationBasis: 'average_daily_hours' as const,
    classificationFormula: `متوسط يومي = إجمالي ساعات الطيار ÷ أيام التقويم (${operationalPeriodDays} يوم) | متوسط تنفيذي تشخيصي ÷ ${executionPeriodDays} يوم بيانات`,
    periodDays: operationalPeriodDays,
    buckets: HOUR_BUCKET_DEFS_AR.map((def) => {
      const b = bucketCounts.get(def.key)!;
      const avgDailyInBucket =
        b.count > 0 && operationalPeriodDays > 0 ? round2(b.hours / b.count / operationalPeriodDays) : 0;
      return {
        label: def.label,
        key: def.key,
        count: b.count,
        percent: pct(b.count, aggList.length),
        hoursContribution: round2(b.hours),
        avgDailyHoursPerRider: avgDailyInBucket,
        hoursDual: dualFromPeriod(b.hours, operationalPeriodDays),
      };
    }),
  };

  const rankRows = aggList.map((agg) =>
    toRiderRankRow(agg, operationalPeriodDays, {
      consistencyScore: computeConsistencyScore(agg.dailyHours),
      trendDelta: computeTrendDelta(agg.dailyHours, startDate, endDate),
    })
  );

  const utilization = {
    totalRegisteredRiders: totalRegistered,
    activeRiders: periodActiveRiders,
    utilizationRate,
    top20ByHours: [...rankRows].sort((a, b) => b.avgDailyHours - a.avgDailyHours).slice(0, 20),
    bottom20ByHours: [...rankRows].sort((a, b) => a.avgDailyHours - b.avgDailyHours).slice(0, 20),
    mostConsistent: [...rankRows].filter((r) => r.workDays >= 3).sort((a, b) => (b.consistencyScore ?? 0) - (a.consistencyScore ?? 0)).slice(0, 20),
    mostImproved: [...rankRows].filter((r) => (r.trendDelta ?? 0) > 0).sort((a, b) => (b.trendDelta ?? 0) - (a.trendDelta ?? 0)).slice(0, 20),
    declining: [...rankRows].filter((r) => (r.trendDelta ?? 0) < 0).sort((a, b) => (a.trendDelta ?? 0) - (b.trendDelta ?? 0)).slice(0, 20),
  };

  const hoursByDate = new Map<string, { hours: number; orders: number }>();
  for (const rec of performance) {
    const cur = hoursByDate.get(rec.date) ?? { hours: 0, orders: 0 };
    cur.hours += rec.hours;
    cur.orders += rec.orders;
    hoursByDate.set(rec.date, cur);
  }

  const trend = Array.from(hoursByDate.entries())
    .map(([date, v]) => ({ date, hours: round2(v.hours), orders: v.orders }))
    .sort((a, b) => a.date.localeCompare(b.date));

  const sortedDays = [...trend.map((t) => ({ date: t.date, hours: t.hours }))].sort((a, b) => b.hours - a.hours);

  const avgHoursPerRiderPeriod = round2(aggList.length > 0 ? totalHours / aggList.length : 0);
  const avgHoursPerActiveRiderPeriod = fleetTalabat.avgHoursPerActiveRider;

  const hoursAnalysis = {
    totalHours: round2(totalHours),
    totalHoursDual: dualFromPeriod(totalHours, operationalPeriodDays),
    averageDailyHours: fleetTalabat.actualHours,
    executionAverageDailyHours: dataIntegrity.executionAverageHoursPerDay,
    highestDay: sortedDays[0] ?? null,
    lowestDay: sortedDays.length ? sortedDays[sortedDays.length - 1] : null,
    averageHoursPerRider: avgHoursPerRiderPeriod,
    averageHoursPerRiderDual: dualFromPeriod(avgHoursPerRiderPeriod, operationalPeriodDays),
    averageHoursPerActiveRider: avgHoursPerActiveRiderPeriod,
    averageHoursPerActiveRiderDual: dualFromPeriod(avgHoursPerActiveRiderPeriod, operationalPeriodDays),
    trend,
    top10Days: sortedDays.slice(0, 10),
    worst10Days: [...sortedDays].reverse().slice(0, 10),
  };

  const potentialHours = totalRegistered * HOURS_CAP_PER_DAY * operationalPeriodDays;
  const actualHours = totalHours;
  const lostHoursTotal = Math.max(0, potentialHours - actualHours);

  const zeroHourRiders = aggList.filter((a) => a.totalHours <= 0);
  const weakRiders = aggList.filter((a) => {
    const avg = operationalPeriodDays > 0 ? a.totalHours / operationalPeriodDays : 0;
    return avg > 0 && avg < WEAK_HOURS_THRESHOLD;
  });

  const lostFromNoOperation = zeroHourRiders.length * HOURS_CAP_PER_DAY * operationalPeriodDays;
  const lostFromWeak = weakRiders.reduce((s, a) => {
    const avg = operationalPeriodDays > 0 ? a.totalHours / operationalPeriodDays : 0;
    return s + (WEAK_HOURS_THRESHOLD - avg) * operationalPeriodDays;
  }, 0);

  const lostFromResignations = approvedResignationsList.reduce((s, r) => {
    const daysLost = diffDaysInclusive(r.approvalDate, endDate);
    return s + daysLost * HOURS_CAP_PER_DAY;
  }, 0);

  const lostBreakdown = [
    { category: 'ساعات مهدرة بسبب عدم التشغيل', categoryKey: 'no_operation', hours: lostFromNoOperation, riderCount: zeroHourRiders.length },
    { category: 'ساعات مهدرة بسبب ضعف التشغيل', categoryKey: 'weak_operation', hours: lostFromWeak, riderCount: weakRiders.length },
    { category: 'ساعات مهدرة بسبب الإقالات', categoryKey: 'resignations', hours: lostFromResignations, riderCount: approvedResignations },
  ];

  const lostHoursSection = {
    potentialHours: round2(potentialHours),
    actualHours: round2(actualHours),
    lostHours: round2(lostHoursTotal),
    potentialHoursDual: dualFromPeriod(potentialHours, operationalPeriodDays),
    actualHoursDual: dualFromPeriod(actualHours, operationalPeriodDays),
    lostHoursDual: dualFromPeriod(lostHoursTotal, operationalPeriodDays),
    lostPercent: pct(lostHoursTotal, potentialHours),
    breakdown: lostBreakdown.map((b) => ({
      ...b,
      hours: round2(b.hours),
      hoursDual: dualFromPeriod(b.hours, operationalPeriodDays),
      percent: pct(b.hours, lostHoursTotal || 1),
    })),
  };

  const resignationsBySup = new Map<string, number>();
  for (const r of approvedResignationsList) {
    resignationsBySup.set(r.supervisorCode, (resignationsBySup.get(r.supervisorCode) ?? 0) + 1);
  }

  const supervisorRows: SupervisorOpsRow[] = [];
  for (const sup of supervisorsScoped) {
    const code = String(sup.code ?? '').trim();
    const supRiders = assignedRiders.filter((r) => String(r.supervisorCode ?? '').trim() === code);
    const supRiderCodes = new Set(
      supRiders.map((r) => normalizeRiderCodeForPerformance(r.code)).filter((c): c is string => Boolean(c))
    );
    const supAggs = supRiders.map((r) => riderAggs.get(normalizeRiderCodeForPerformance(r.code))).filter(Boolean) as RiderAgg[];
    // SRS-008: hours attribution by day-level supervisor (sheet or master stamp), not current roster only
    const supPerformance = performance.filter(
      (rec) => String(rec.supervisorCode ?? '').trim() === code
    );

    const targetDaily = Number.isFinite(Number(sup.target)) ? Number(sup.target) : 0;
    const supTalabat = computeSupervisorTalabatMetrics({
      calendarDates,
      performance: supPerformance,
      assignedRiderCodes: supRiderCodes,
      targetDaily: targetDaily > 0 ? targetDaily : fleetDailyTargetHours,
      headcount: supRiders.length,
    });

    const supInactive = supAggs.filter(isRiderInactive).length;
    const supHours = supAggs.reduce((s, a) => s + a.totalHours, 0);
    const supOrders = supAggs.reduce((s, a) => s + a.totalOrders, 0);
    const supTotalBreakMinutes = supAggs.reduce((s, a) => s + a.totalBreakMinutes, 0);
    const supTotalDelayMinutes = supAggs.reduce((s, a) => s + a.totalDelayMinutes, 0);
    const supSuspended = supRiders.filter((r) => isSheetSuspendedStatus(r.status)).length;
    const supNewHires = supRiders.filter((r) => inDateRange(parseJoinDate(r.joinDate), startDate, endDate)).length;
    const supResignations = resignationsBySup.get(code) ?? 0;

    const attendancePercent = pct(supTalabat.activeRiders, supRiders.length || 1);
    const avgOrdersPeriod = supRiders.length > 0 ? round2(supOrders / supRiders.length) : 0;
    const avgHoursPerRiderPeriod = supRiders.length > 0 ? round2(supHours / supRiders.length) : 0;
    const avgHoursPerRiderDaily = supTalabat.avgHoursPerActiveRider;
    const avgOrdersDaily =
      operationalPeriodDays > 0 ? round2(avgOrdersPeriod / operationalPeriodDays) : 0;
    const productivityScore = round2(
      attendancePercent * 0.3 +
        supTalabat.achievementPercent * 0.4 +
        Math.min(100, avgHoursPerRiderDaily * 12) * 0.3
    );

    const supActiveWorkDayRiders = Math.max(1, supAggs.filter((a) => a.workDays > 0).length);
    const avgBreakMinutesDaily = round2(supTotalBreakMinutes / supActiveWorkDayRiders / Math.max(1, operationalPeriodDays));
    const avgDelayMinutesDaily = round2(supTotalDelayMinutes / supActiveWorkDayRiders / Math.max(1, operationalPeriodDays));

    const base: Omit<SupervisorOpsRow, 'riskScore' | 'riskLevel'> = {
      code,
      name: sup.name || code,
      region: sup.region || '',
      headcount: supRiders.length,
      assignedRiders: supRiders.length,
      activeRiders: supTalabat.activeRiders,
      noShowRiders: supTalabat.noShowRiders,
      inactiveRiders: supInactive,
      suspendedRiders: supSuspended,
      newHires: supNewHires,
      resignations: supResignations,
      totalHours: round2(supHours),
      dailyHours: supTalabat.actualHours,
      avgHoursPerRider: avgHoursPerRiderPeriod,
      avgHoursPerRiderDaily,
      avgOrders: avgOrdersPeriod,
      avgOrdersDaily,
      totalHoursDual: dualFromPeriod(supHours, operationalPeriodDays),
      avgHoursPerRiderDual: dualFromPeriod(avgHoursPerRiderPeriod, operationalPeriodDays),
      avgOrdersDual: dualFromPeriod(avgOrdersPeriod, operationalPeriodDays),
      attendancePercent,
      utilizationPercent: supTalabat.utilizationPercent,
      targetAchievementPercent: supTalabat.achievementPercent,
      achievementPercent: supTalabat.achievementPercent,
      productivityScore,
      avgBreakMinutesDaily,
      avgDelayMinutesDaily,
    };

    const risk = computeSupervisorRisk(base, periodDays);
    supervisorRows.push({ ...base, riskScore: risk.riskScore, riskLevel: risk.riskLevel });
  }

  const sortedSup = [...supervisorRows].sort((a, b) => b.productivityScore - a.productivityScore);
  const supervisorPerformance = {
    rows: supervisorRows,
    bestSupervisor: sortedSup[0] ?? null,
    worstSupervisor: sortedSup.length ? sortedSup[sortedSup.length - 1] : null,
  };

  const supervisorRisk = {
    rows: supervisorRows
      .map((s) => {
        const risk = computeSupervisorRisk(s, periodDays);
        return { code: s.code, name: s.name, region: s.region, riskScore: risk.riskScore, riskLevel: risk.riskLevel, factors: risk.factors };
      })
      .sort((a, b) => b.riskScore - a.riskScore),
  };

  const operationalTruthIntelligence =
    kpiTrust.disableStiOrpsGrowthRoadmap || !strategicKpisEnabled
      ? createDisabledOperationalTruthIntelligence(
          !strategicKpisEnabled
            ? `${insufficientLabel} — تغطية البيانات ${sourceDataCoverage.coverage}%`
            : kpiTrust.descriptionAr
        )
      : buildOperationalTruthIntelligence({
        dataIntegrity,
        officialPerformance: validatedRaw,
        shadowPerformance,
        supervisors: supervisorsScoped.map((s) => ({
          code: String(s.code ?? '').trim(),
          name: s.name || String(s.code ?? ''),
          region: s.region || '',
          targetDaily: Number.isFinite(Number(s.target)) ? Number(s.target) : 0,
        })),
        riderAggs: aggList.map((agg) => ({
          code: agg.code,
          name: agg.name,
          supervisorCode: agg.supervisorCode,
          totalHours: agg.totalHours,
          totalOrders: agg.totalOrders,
        })),
        resignationsBySupervisor: resignationsBySup,
        operationalPeriodDays,
      });

  const recruitmentRaw = recruitmentMetrics(candidates, riderAggs);
  const recruitment = {
    ...recruitmentRaw,
    disabled: !strategicKpisEnabled,
    disabledReason: !strategicKpisEnabled
      ? `${insufficientLabel} — تغطية البيانات ${sourceDataCoverage.coverage}%`
      : undefined,
    applicationToJoinRate: strategicKpisEnabled ? recruitmentRaw.applicationToJoinRate : 0,
    joinToActiveRate: strategicKpisEnabled ? recruitmentRaw.joinToActiveRate : 0,
    recruitmentEfficiencyPercent: strategicKpisEnabled
      ? recruitmentRaw.recruitmentEfficiencyPercent
      : 0,
  };

  const lifetimeSamples: RiderLifetimeSample[] = [];
  let ridersWithJoinDate = 0;
  let ridersWithoutJoinDate = 0;
  const lifetimeDays: number[] = [];

  for (const res of approvedResignationsList) {
    const rider = ridersInScope.find(
      (r) => normalizeRiderCodeForPerformance(r.code) === normalizeRiderCodeForPerformance(res.riderCode)
    );
    const join = rider ? parseJoinDate(rider.joinDate) : null;
    const approvalIso = res.approvalDate.toISOString().split('T')[0];
    if (join) {
      ridersWithJoinDate += 1;
      const days = diffDaysInclusive(join, res.approvalDate);
      lifetimeDays.push(days);
      lifetimeSamples.push({
        riderCode: res.riderCode,
        riderName: res.riderName || rider?.name || res.riderCode,
        joinDate: join.toISOString().split('T')[0],
        joinSource: 'المناديب — العمود G',
        approvalDate: approvalIso,
        approvalSource: 'طلبات_الإقالة — العمود H أو G',
        lifetimeDays: days,
      });
    } else {
      ridersWithoutJoinDate += 1;
      lifetimeSamples.push({
        riderCode: res.riderCode,
        riderName: res.riderName || res.riderCode,
        joinDate: null,
        joinSource: 'غير متوفر في المناديب',
        approvalDate: approvalIso,
        approvalSource: 'طلبات_الإقالة — العمود H أو G',
        lifetimeDays: 0,
      });
    }
  }

  const trendMap = new Map<string, number>();
  for (const r of approvedResignationsList) {
    const key = `${r.approvalDate.getFullYear()}-${String(r.approvalDate.getMonth() + 1).padStart(2, '0')}`;
    trendMap.set(key, (trendMap.get(key) ?? 0) + 1);
  }

  const attrition = {
    approvedResignations,
    attritionRate,
    monthlyAttritionRate,
    averageActiveRidersDuringPeriod: avgActiveDuringPeriod || periodActiveRiders,
    topSupervisorsLosingRiders: Array.from(resignationsBySup.entries())
      .map(([code, count]) => {
        const sup = supervisorsScoped.find((s) => String(s.code ?? '').trim() === code);
        return { code, name: sup?.name ?? code, count };
      })
      .sort((a, b) => b.count - a.count)
      .slice(0, 10),
    averageRiderLifetimeDays:
      sourceDataCoverage.metadataAnalyticsEnabled && lifetimeDays.length > 0
        ? round2(lifetimeDays.reduce((a, b) => a + b, 0) / lifetimeDays.length)
        : null,
    riderLifetimeKpiEnabled: sourceDataCoverage.metadataAnalyticsEnabled && lifetimeDays.length > 0,
    riderLifetimeDisabledReason: !sourceDataCoverage.metadataAnalyticsEnabled
      ? `تغطية البيانات الوصفية ${sourceDataCoverage.metadataCoveragePercent}% أقل من 80% — تم تعطيل KPI متوسط عمر الطيار`
      : joinDateAudit.riderLifetimeDisabledReason,
    attritionTrend: Array.from(trendMap.entries()).map(([period, resignations]) => ({ period, resignations })).sort((a, b) => a.period.localeCompare(b.period)),
  };

  // ── Top Break Takers ──────────────────────────────────────────────
  const topBreakTakers = {
    riders: [...aggList]
      .filter((agg) => agg.totalBreakMinutes > 0)
      .sort((a, b) => b.totalBreakMinutes - a.totalBreakMinutes)
      .slice(0, 10)
      .map((agg) => ({
        code: agg.code,
        name: agg.name,
        supervisorCode: agg.supervisorCode,
        supervisorName: agg.supervisorName,
        region: agg.region,
        totalBreakMinutes: agg.totalBreakMinutes,
        totalHours: round2(agg.totalHours),
        avgDailyBreakMinutes: operationalPeriodDays > 0 ? round2(agg.totalBreakMinutes / operationalPeriodDays) : 0,
        workDays: agg.workDays,
      })),
  };

  // ── Top Absent Riders ──────────────────────────────────────────────
  const dailyAbsenceByRider = new Map<string, Set<string>>();
  for (const dateStr of calendarDates) {
    const activeOnDate = new Set(
      performance.filter((p) => p.date === dateStr && (p.hours > 0 || p.orders > 0)).map((p) => normalizeRiderCodeForPerformance(p.riderCode))
    );
    for (const agg of aggList) {
      const norm = normalizeRiderCodeForPerformance(agg.code);
      if (norm && !activeOnDate.has(norm)) {
        if (!dailyAbsenceByRider.has(norm)) dailyAbsenceByRider.set(norm, new Set());
        dailyAbsenceByRider.get(norm)!.add(dateStr);
      }
    }
  }
  const topAbsentRiders = {
    riders: [...aggList]
      .map((agg) => {
        const norm = normalizeRiderCodeForPerformance(agg.code);
        const absentDays = norm ? dailyAbsenceByRider.get(norm)?.size ?? 0 : 0;
        return {
          code: agg.code,
          name: agg.name,
          supervisorCode: agg.supervisorCode,
          supervisorName: agg.supervisorName,
          region: agg.region,
          absentDays,
          totalDaysInPeriod: calendarDates.length,
          absentPercent: calendarDates.length > 0 ? round2((absentDays / calendarDates.length) * 100) : 0,
        };
      })
      .filter((r) => r.absentDays > 0)
      .sort((a, b) => b.absentDays - a.absentDays)
      .slice(0, 10),
  };

  // ── Inactive 3+ Days ──────────────────────────────────────────────
  const inactive3DaysPlus = {
    riders: [...aggList]
      .map((agg) => {
        const norm = normalizeRiderCodeForPerformance(agg.code);
        const absentDays = norm ? dailyAbsenceByRider.get(norm)?.size ?? 0 : 0;
        const lastActivityDates = performance
          .filter((p) => normalizeRiderCodeForPerformance(p.riderCode) === norm && (p.hours > 0 || p.orders > 0))
          .map((p) => p.date)
          .sort();
        const lastActivityDate = lastActivityDates.length > 0 ? lastActivityDates[lastActivityDates.length - 1] : null;
        return {
          code: agg.code,
          name: agg.name,
          supervisorCode: agg.supervisorCode,
          supervisorName: agg.supervisorName,
          region: agg.region,
          inactiveDays: absentDays,
          lastActivityDate,
        };
      })
      .filter((r) => r.inactiveDays >= 3)
      .sort((a, b) => b.inactiveDays - a.inactiveDays),
  };

  // ── Delta Calculation ──────────────────────────────────────────────
  // We need to read assignment, reactivation, and termination sheets to calculate delta
  const SHEET_ASSIGNMENT = 'طلبات التعيين';
  const SHEET_REACTIVATION = 'طلبات إعادة التفعيل';
  
  const [assignmentSheet, reactivationSheet] = await Promise.all([
    getSheetData(SHEET_ASSIGNMENT, false).catch(() => [] as unknown[][]),
    getSheetData(SHEET_REACTIVATION, false).catch(() => [] as unknown[][]),
  ]);

  // Count assignments in period
  let newHires = 0;
  for (let i = 1; i < assignmentSheet.length; i++) {
    const row = assignmentSheet[i];
    if (!row || row.length < 8) continue;
    const approvalDate = parseDailySheetDate(row[7]) ?? parseDailySheetDate(row[6]);
    if (inDateRange(approvalDate, startDate, endDate)) {
      newHires++;
    }
  }

  // Count reactivations in period
  let reactivations = 0;
  for (let i = 1; i < reactivationSheet.length; i++) {
    const row = reactivationSheet[i];
    if (!row || row.length < 8) continue;
    const approvalDate = parseDailySheetDate(row[7]) ?? parseDailySheetDate(row[6]);
    if (inDateRange(approvalDate, startDate, endDate)) {
      reactivations++;
    }
  }

  const delta = {
    newHires,
    reactivations,
    terminations: approvedResignations,
    netChange: newHires + reactivations - approvedResignations,
  };

  // ── Work Hours Segments (with detailed rider data) ──────────────────
  const below4Aggs = aggList.filter((a) => {
    const avg = operationalPeriodDays > 0 ? a.totalHours / operationalPeriodDays : 0;
    return avg > 0 && avg < 4;
  });
  const between4And6Aggs = aggList.filter((a) => {
    const avg = operationalPeriodDays > 0 ? a.totalHours / operationalPeriodDays : 0;
    return avg >= 4 && avg < 6;
  });
  const between6And8Aggs = aggList.filter((a) => {
    const avg = operationalPeriodDays > 0 ? a.totalHours / operationalPeriodDays : 0;
    return avg >= 6 && avg < 8;
  });
  const above8Aggs = aggList.filter((a) => {
    const avg = operationalPeriodDays > 0 ? a.totalHours / operationalPeriodDays : 0;
    return avg >= 8;
  });

  const mapToSegmentRider = (agg: RiderAgg) => ({
    code: agg.code,
    name: agg.name,
    supervisorCode: agg.supervisorCode,
    supervisorName: agg.supervisorName,
    region: agg.region,
    avgDailyHours: operationalPeriodDays > 0 ? round2(agg.totalHours / operationalPeriodDays) : 0,
    totalHours: round2(agg.totalHours),
    totalOrders: agg.totalOrders,
    workDays: agg.workDays,
  });

  const workHoursSegments = {
    below4Hours: {
      count: below4Aggs.length,
      riders: below4Aggs.map(mapToSegmentRider),
    },
    between4And6Hours: {
      count: between4And6Aggs.length,
      riders: between4And6Aggs.map(mapToSegmentRider),
    },
    between6And8Hours: {
      count: between6And8Aggs.length,
      riders: between6And8Aggs.map(mapToSegmentRider),
    },
    above8Hours: {
      count: above8Aggs.length,
      riders: above8Aggs.map(mapToSegmentRider),
    },
  };

  // ── Fleet Statistics (Basic Metrics Summary) ──────────────────────
  const totalBreakMinutes = aggList.reduce((sum, agg) => sum + agg.totalBreakMinutes, 0);
  const ridersWithBreaks = aggList.filter((a) => a.totalBreakMinutes > 0).length;
  
  const fleetStatistics = {
    avgDailyActiveRiders: periodActiveRiders,
    avgDailyAbsentRiders: fleetTalabat.noShowRiders,
    activePercentage: pct(periodActiveRiders, totalRegistered),
    totalBreakMinutes: round2(totalBreakMinutes),
    avgBreakMinutesPerRider: aggList.length > 0 ? round2(totalBreakMinutes / aggList.length) : 0,
    avgBreakMinutesPerDay: operationalPeriodDays > 0 ? round2(totalBreakMinutes / operationalPeriodDays) : 0,
    avgWorkHoursPerRider: round2(hoursAnalysis.averageHoursPerRider),
    avgWorkHoursPerActiveRider: round2(hoursAnalysis.averageHoursPerActiveRider),
  };

  const below4 = below4Aggs;
  const below6 = aggList.filter((a) => { const avg = operationalPeriodDays > 0 ? a.totalHours / operationalPeriodDays : 0; return avg > 0 && avg < 6; });
  const inactiveAggs = aggList.filter(isRiderInactive);

  const strategicForecastsDisabled =
    kpiTrust.disableStiOrpsGrowthRoadmap || !strategicKpisEnabled;

  const growthDisabledReason = !strategicKpisEnabled
    ? `${insufficientLabel} — تغطية البيانات ${sourceDataCoverage.coverage}% < 80%`
    : strategicForecastsDisabled
      ? kpiTrust.descriptionAr
      : kpiTrust.warningOnly || kpiTrust.lowConfidenceStrategic
        ? kpiTrust.descriptionAr
        : undefined;

  const growthOpportunities = !strategicKpisEnabled
    ? {
        disabled: true as const,
        disabledReason: `${insufficientLabel} — تغطية البيانات ${sourceDataCoverage.coverage}%`,
        scenarios: [],
      }
    : strategicForecastsDisabled
    ? {
        disabled: false as const,
        scenarios: [
          {
            key: 'A',
            label: 'رفع الطيارين دون ٤ ساعات/يوم إلى ٦ ساعات/يوم',
            additionalHoursGain: round2(
              below4.reduce((s, a) => s + (6 - a.totalHours / operationalPeriodDays) * operationalPeriodDays, 0)
            ),
            additionalHoursGainDaily: round2(
              below4.reduce((s, a) => s + Math.max(0, 6 - a.totalHours / operationalPeriodDays), 0)
            ),
            expectedTotalHours: 0,
            expectedTotalHoursDaily: 0,
            affectedRiders: below4.length,
          },
          {
            key: 'B',
            label: 'رفع الطيارين دون ٦ ساعات/يوم إلى ٨ ساعات/يوم',
            additionalHoursGain: round2(
              below6.reduce((s, a) => s + (8 - a.totalHours / operationalPeriodDays) * operationalPeriodDays, 0)
            ),
            additionalHoursGainDaily: round2(
              below6.reduce((s, a) => s + Math.max(0, 8 - a.totalHours / operationalPeriodDays), 0)
            ),
            expectedTotalHours: 0,
            expectedTotalHoursDaily: 0,
            affectedRiders: below6.length,
          },
          {
            key: 'C',
            label: 'تفعيل الطيارين غير النشطين (٦ ساعات/يوم)',
            additionalHoursGain: round2(inactiveAggs.length * 6 * operationalPeriodDays),
            additionalHoursGainDaily: round2(inactiveAggs.length * 6),
            expectedTotalHours: 0,
            expectedTotalHoursDaily: 0,
            affectedRiders: inactiveAggs.length,
          },
          {
            key: 'D',
            label: 'إضافة ٢٠ طيار جديد (٦ ساعات/يوم)',
            additionalHoursGain: round2(20 * 6 * operationalPeriodDays),
            additionalHoursGainDaily: round2(20 * 6),
            expectedTotalHours: 0,
            expectedTotalHoursDaily: 0,
            affectedRiders: 20,
          },
        ].map((s) => ({
          ...s,
          expectedTotalHours: round2(totalHours + s.additionalHoursGain),
          expectedTotalHoursDaily: round2(
            dataIntegrity.operationalAverageHoursPerDay + s.additionalHoursGainDaily
          ),
        })),
      }
    : {
        disabled: true,
        disabledReason: growthDisabledReason,
        scenarios: [],
      };

  const currentDailyHours = hoursAnalysis.averageDailyHours;
  const dailyGap = Math.max(0, DAILY_HOURS_TARGET - currentDailyHours);
  const avgDailyHoursPerActiveRider = fleetTalabat.avgHoursPerActiveRider;
  const ridersAudit = computeAdditionalRidersNeeded(dailyGap, avgDailyHoursPerActiveRider);
  const additionalActiveRidersNeeded = ridersAudit.roundedResult ?? 0;
  const mathValidationPassed = validateRoadmapRidersAudit(ridersAudit);
  const additionalHoursPerRiderDaily =
    totalRegistered > 0 ? round2(dailyGap / totalRegistered) : 0;

  const additionalRidersCalculation = formatAdditionalRidersCalculation(ridersAudit);

  const calculationTrace = {
    formula: 'فجوة يومية = 2200 − متوسط الساعات اليومية للأسطول',
    dailyGapCalculation: `${DAILY_HOURS_TARGET} − ${currentDailyHours} = ${round2(dailyGap)} ساعة/يوم`,
    avgDailyHoursPerActiveRider,
    additionalRidersFormula: '⌈فجوة يومية ÷ متوسط ساعات الطيار النشط يومياً⌉',
    additionalRidersCalculation,
    ridersAudit,
    forecastDisabled: strategicForecastsDisabled || !strategicKpisEnabled,
    forecastDisabledReason: !strategicKpisEnabled
      ? `${insufficientLabel} — تغطية البيانات ${sourceDataCoverage.coverage}%`
      : strategicForecastsDisabled
        ? kpiTrust.descriptionAr
        : undefined,
  };

  const roadmap: string[] = [];
  roadmap.push(`${kpiTrust.labelAr}: ${kpiTrust.descriptionAr}`);
  if (strategicForecastsDisabled) {
    if (dataIntegrity.dataLeakageDetected) {
      roadmap.push(
        `تسرب Ghost Riders: ${dataIntegrity.ghostRiderLeakageHours} ساعة (${dataIntegrity.ghostLeakagePercent}% من إجمالي الساعات المسجلة).`
      );
    }
    if (dataIntegrity.missingDates.length > 0) {
      roadmap.push(`أكمل رفع بيانات الأيام الناقصة (${dataIntegrity.missingDates.length} يوم) قبل تفعيل التوقعات.`);
    }
  } else if (dailyGap <= 0) {
    roadmap.push(`تم تجاوز هدف ${DAILY_HOURS_TARGET} ساعة يومياً (المتوسط الحالي: ${currentDailyHours}).`);
  } else {
    roadmap.push(`فجوة يومية: ${round2(dailyGap)} ساعة (هدف ${DAILY_HOURS_TARGET} − متوسط يومي ${currentDailyHours}).`);
    roadmap.push(`تتبع الحساب: ${additionalRidersCalculation}`);
    roadmap.push(`مرجع الفترة: ${round2(totalHours)} ساعة رسمية خلال ${operationalPeriodDays} يوم تقويم (${executionPeriodDays} يوم بيانات مرفوعة).`);
    roadmap.push(`خيار ١: إضافة ${additionalActiveRidersNeeded} طيار نشط بمتوسط ${avgDailyHoursPerActiveRider} ساعة/يوم.`);
    roadmap.push(`خيار ٢: رفع متوسط الساعات +${additionalHoursPerRiderDaily} ساعة/يوم لكل طيار مسجل.`);
    if (kpiTrust.lowConfidenceStrategic) {
      roadmap.push('⚠ ثقة منخفضة — استخدم هذه التوقعات للاتجاه العام فقط حتى تُحسَّن جودة البيانات.');
    }
  }

  const hoursRoadmap = {
    disabled: strategicForecastsDisabled || !strategicKpisEnabled,
    disabledReason: !strategicKpisEnabled
      ? `${insufficientLabel} — تغطية البيانات ${sourceDataCoverage.coverage}%`
      : strategicForecastsDisabled
        ? kpiTrust.descriptionAr
        : undefined,
    lowConfidence: kpiTrust.lowConfidenceStrategic,
    currentDailyHours,
    targetDailyHours: DAILY_HOURS_TARGET,
    dailyGap: round2(dailyGap),
    currentPeriodHours: round2(totalHours),
    periodDays,
    validDaysInDataset: executionPeriodDays,
    additionalActiveRidersNeeded,
    additionalHoursPerRiderNeeded: additionalHoursPerRiderDaily,
    roadmap,
    calculationTrace,
    ridersAudit,
    mathValidationPassed,
  };

  const totalOrders = aggList.reduce((s, a) => s + a.totalOrders, 0);
  const growthExpansionBase = computeGrowthExpansionMetrics({
    totalRegistered,
    totalAssigned,
    activeRiders: periodActiveRiders,
    inactiveRiders,
    approvedResignations,
    totalHours,
    totalOrders,
    periodDays: operationalPeriodDays,
    supervisorCount: supervisorsScoped.length,
    recruitmentApplications: recruitment.totalApplications,
    recruitmentActiveAfterJoining: recruitment.totalActiveAfterJoining,
    averageDailyHours: hoursAnalysis.averageDailyHours,
    avgDailyHoursPerActiveRider: fleetTalabat.avgHoursPerActiveRider,
  });
  const growthExpansion: StrategicOpsReport['growthExpansion'] =
    !strategicKpisEnabled || strategicForecastsDisabled
      ? {
          disabled: true,
          disabledReason:
            growthDisabledReason ??
            `${insufficientLabel} — تغطية البيانات ${sourceDataCoverage.coverage}%`,
          dailyTargetHours: growthExpansionBase.dailyTargetHours,
          currentAverageDailyHours: growthExpansionBase.currentAverageDailyHours,
          indicators: growthExpansionBase.indicators.map((ind) => ({
            ...ind,
            displayValue: insufficientLabel,
            calculation: insufficientLabel,
          })),
        }
      : {
          disabled: false,
          dailyTargetHours: growthExpansionBase.dailyTargetHours,
          currentAverageDailyHours: growthExpansionBase.currentAverageDailyHours,
          indicators: growthExpansionBase.indicators,
        };

  const operationalHealthBase = computeOperationalHealth(
    utilizationRate,
    attritionRate,
    pct(periodActiveRiders, totalRegistered),
    fleetTalabat.avgHoursPerActiveRider,
    recruitment.recruitmentEfficiencyPercent
  );
  const operationalHealth: StrategicOpsReport['operationalHealth'] = strategicKpisEnabled
    ? { ...operationalHealthBase, disabled: false }
    : {
        ...operationalHealthBase,
        score: 0,
        level: 'danger',
        levelLabelAr: insufficientLabel,
        disabled: true,
        disabledReason: `${insufficientLabel} — تغطية البيانات ${sourceDataCoverage.coverage}%`,
      };

  const performanceRecordsInRange = performance.length;
  const talabatAuditTraces = buildTalabatAuditTraces(
    fleetTalabat,
    performanceRecordsInRange,
    strategicKpisEnabled
  );
  const talabatOperations: StrategicOpsReport['talabatOperations'] = {
    headcount: fleetTalabat.headcount,
    activeRiders: fleetTalabat.activeRiders,
    noShowRiders: fleetTalabat.noShowRiders,
    actualHours: fleetTalabat.actualHours,
    targetHours: fleetTalabat.targetHours,
    achievementPercent: fleetTalabat.achievementPercent,
    avgHoursPerActiveRider: fleetTalabat.avgHoursPerActiveRider,
    utilizationPercent: fleetTalabat.utilizationPercent,
    uniqueActiveRidersInPeriod,
    operationalDays: fleetTalabat.operationalDays,
    dailySeries: fleetTalabat.dailySeries,
    auditTraces: talabatAuditTraces,
    noShowComparison: buildNoShowComparison(
      fleetTalabat.noShowRiders,
      filters.talabatBenchmark?.noShow
    ),
  };
  const talabatAccuracyScore = buildTalabatAccuracyScore(
    fleetTalabat,
    filters.talabatBenchmark ?? {}
  );
  const dailySheetRows = Math.max(0, (dailySheetRaw?.length ?? 1) - 1);
  const terminationRows = Math.max(0, terminationSheet.length - 1);

  const dataValidation: DataValidationEntry[] = [
    {
      kpi: 'جودة البيانات (DIL)',
      sourceSheet: SHEET_DAILY,
      columns: 'التاريخ (0)، كود المندوب (1)، ساعات (2)، طلبات (6)',
      recordsRead: dataIntegrity.totalRows,
      formula: 'RAW → smart dedup → official + shadow → KPI',
      result: `${dataIntegrity.dataQualityScore}/100 | تغطية: ${sourceDataCoverage.coverage}%`,
      status: strategicKpisEnabled ? 'valid' : 'insufficient_data',
    },
    ...talabatAuditTraces.map((trace) => ({
      kpi: trace.kpi,
      sourceSheet: trace.rawDataSource.split('—')[0]?.trim() ?? SHEET_DAILY,
      columns: trace.rawDataSource,
      recordsRead: trace.recordsRead,
      formula: trace.formula,
      result: trace.result,
      numerator: trace.numerator,
      numeratorLabel: trace.numeratorLabel,
      denominator: trace.denominator,
      denominatorLabel: trace.denominatorLabel,
      rawDataSource: trace.rawDataSource,
      status: trace.status,
    })),
    {
      kpi: 'الطيارون النشطون (تشخيص — فريدون بالفترة)',
      sourceSheet: SHEET_DAILY,
      columns: 'للتدقيق فقط — ليس KPI تشغيلي',
      recordsRead: performanceRecordsInRange,
      formula: 'COUNT(DISTINCT rider WHERE SUM(hours)>0 في الفترة)',
      result: uniqueActiveRidersInPeriod,
      status: 'warning',
    },
    {
      kpi: 'عدد الإقالات المعتمدة',
      sourceSheet: SHEET_TERMINATION,
      columns: 'كود المشرف (0)، كود المندوب (2)، الحالة (5)، تاريخ الموافقة (7)',
      recordsRead: terminationRows,
      formula: 'الحالة: Approved / Accepted / تمت الموافقة / مقبول + ضمن الفترة',
      result: approvedResignations,
      status: 'valid',
    },
    {
      kpi: 'نسبة التسرب',
      sourceSheet: SHEET_TERMINATION,
      columns: 'الحالة (5)، تاريخ الموافقة (7)',
      recordsRead: terminationRows,
      formula: 'الإقالات المعتمدة ÷ متوسط الطيارين النشطين يومياً × 100',
      result: `${attritionRate}%`,
      status: 'valid',
    },
    {
      kpi: 'درجة صحة التشغيل',
      sourceSheet: 'محسوب من مؤشرات متعددة',
      columns: 'الاستغلال، التسرب، النشاط، الساعات، التعيين',
      recordsRead: performanceRecordsInRange + terminationRows,
      formula: strategicKpisEnabled ? 'مركّب مرجّح (٠–١٠٠)' : insufficientLabel,
      result: strategicKpisEnabled ? operationalHealth.score : insufficientLabel,
      status: strategicKpisEnabled ? 'valid' : 'insufficient_data',
    },
    ...growthExpansion.indicators.map((ind) => ({
      kpi: ind.labelAr,
      sourceSheet: SHEET_DAILY,
      columns: 'حسب المؤشر',
      recordsRead: performanceRecordsInRange,
      formula: ind.formula,
      result: ind.displayValue,
      status: (growthExpansion.disabled ? 'insufficient_data' : 'valid') as DataValidationEntry['status'],
    })),
  ];

  const dataIntegrityFinal = {
    ...dataIntegrity,
    kpiQualityGatePassed: kpiTrust.kpiQualityGatePassed,
    warningMessage:
      kpiTrust.level > 1 ? kpiTrust.descriptionAr : dataIntegrity.warningMessage,
    warningLevel:
      kpiTrust.level >= 4
        ? ('red' as const)
        : kpiTrust.level >= 2
          ? ('amber' as const)
          : dataIntegrity.warningLevel,
  };

  const ghostLeakageOrders = shadowPerformance.reduce((s, r) => s + r.orders, 0);

  const finalKpiAccuracyAudit = buildFinalKpiAccuracyAudit({
    filters,
    dataIntegrity: dataIntegrityFinal,
    ghostRiderAudit,
    joinDateAudit,
    kpiTrust,
    allMasterRiders: allRiders,
    ridersScoped,
    ridersInScope,
    supervisorCodesScoped,
    uniqueActiveRidersInPeriod,
    averageDailyActiveRiders: avgActiveDuringPeriod,
    dailyActiveCounts,
    hoursRoadmap,
    ghostLeakageOrders,
    generatedAt: new Date().toISOString(),
    strategicKpisEnabled,
    sourceDataCoveragePercent: sourceDataCoverage.coverage,
  });

  const masterNormSet = new Set(
    allRiders
      .map((r) => normalizeRiderCodeForPerformance(r.code))
      .filter((c): c is string => Boolean(c))
  );

  const postNormalizationValidation = buildPostNormalizationValidationReport({
    codeNormalization: dataIntegrityFinal.codeNormalization,
    masterNormSet,
    dataIntegrity: dataIntegrityFinal,
    joinDateAudit,
    ridersInScopeCount: ridersInScope.length,
    ghostAnomalyCount: ghostRiderAudit.totalAnomalies,
    zeroValidationPassed: finalKpiAccuracyAudit.roadmapValidation.zeroValidationPassed,
    generatedAt: new Date().toISOString(),
  });

  const partial = {
    meta: {
      startDate: filters.startDate,
      endDate: filters.endDate,
      zone: filters.zone,
      supervisorCode: filters.supervisorCode,
      periodDays,
      validDaysInDataset: executionPeriodDays,
      generatedAt: new Date().toISOString(),
      defaultMetricView: 'daily' as const,
      normalizationCalendarDays: operationalPeriodDays,
      dailyHoursBaseline: DAILY_HOURS_BASELINE,
      dailyHoursTarget: DAILY_HOURS_TARGET,
      defaultDashboardMode: 'talabat_ops' as const,
    },
    sourceDataCoverage,
    talabatOperations,
    talabatAccuracyScore,
    executiveSummary,
    activityDistribution,
    utilization,
    hoursAnalysis,
    lostHours: lostHoursSection,
    supervisorPerformance,
    supervisorRisk,
    recruitment,
    attrition,
    topBreakTakers,
    topAbsentRiders,
    inactive3DaysPlus,
    delta,
    workHoursSegments,
    fleetStatistics,
    growthOpportunities,
    growthExpansion,
    hoursRoadmap,
    operationalHealth,
    dataValidation,
    dataIntegrity: dataIntegrityFinal,
    kpiTrust,
    ghostRiderAudit,
    joinDateAudit,
    metadataCompletionAudit,
    codeNormalizationAudit: dataIntegrityFinal.codeNormalization,
    postNormalizationValidation,
    finalKpiAccuracyAudit,
    operationalTruthIntelligence,
  };

  const operationalFormulaAudit = buildOperationalFormulaAudit({
    report: partial,
    approvedResignationRecords: resignationParse.auditRecords,
    lifetimeSamples,
    ridersWithJoinDate,
    ridersWithoutJoinDate,
    dailyActiveCounts,
    rawResignationRowsMatched: resignationParse.rawRowsMatched,
    duplicatesRemoved: resignationParse.duplicatesRemoved,
    zeroHourRiderCount: zeroHourRiders.length,
    weakRiderCount: weakRiders.length,
    avgDailyHoursPerActiveRider,
    periodDays: operationalPeriodDays,
  });

  const aiInsights = generateInsights({ ...partial, operationalFormulaAudit });
  aiInsights.fullReport = '';

  const supervisorNameByCode = new Map(
    supervisorsScoped.map((s) => [String(s.code ?? '').trim(), s.name || String(s.code ?? '').trim()])
  );

  // Build per-rider historical baselines from the lookback window before startDate.
  // Adaptive: tries 30-day window first, then falls back to any pre-period data
  // available in the sheet (the sheet may only contain the current period).
  const LOOKBACK_DAYS = 30;
  const lookbackEndDate = new Date(startDate.getTime() - 1);
  const lookbackStartDate = new Date(startDate.getTime() - LOOKBACK_DAYS * 24 * 60 * 60 * 1000);
  const lookbackStartIso = lookbackStartDate.toISOString().split('T')[0];
  const lookbackEndIso = lookbackEndDate.toISOString().split('T')[0];

  const headerOffset =
    dailySheetRaw.length > 0 && String(dailySheetRaw[0][0] ?? '').includes('تاريخ') ? 1 : 0;

  const lookbackPerformance: Array<{ date: string; riderCode: string; hours: number; orders: number; breakMinutes: number; delayMinutes: number }> = [];
  for (let i = headerOffset; i < dailySheetRaw.length; i++) {
    const row = dailySheetRaw[i];
    if (!row?.length) continue;
    const parsed = parseDailySheetDate(row[0]);
    if (!parsed) continue;
    const dateStr = parsed.toISOString().split('T')[0];
    if (dateStr < lookbackStartIso || dateStr > lookbackEndIso) continue;
    const riderCode = String(row[1] ?? '').trim();
    const norm = normalizeRiderCodeForPerformance(riderCode);
    if (!norm) continue;
    const hours = Math.max(0, parseFloat(String(row[2] ?? '0').replace(',', '.')) || 0);
    const orders = Math.max(0, parseInt(String(row[6] ?? '0'), 10) || 0);
    const breakMinutes = Math.max(0, parseFloat(String(row[3] ?? '0').replace(',', '.')) || 0);
    const delayMinutes = Math.max(0, parseFloat(String(row[4] ?? '0').replace(',', '.')) || 0);
    lookbackPerformance.push({ date: dateStr, riderCode: norm, hours, orders, breakMinutes, delayMinutes });
  }

  // If the 30-day window returned nothing, opportunistically try ANY pre-period
  // data in the sheet (handles cases where the sheet only holds recent history).
  if (lookbackPerformance.length === 0) {
    const periodStartIso = filters.startDate;
    for (let i = headerOffset; i < dailySheetRaw.length; i++) {
      const row = dailySheetRaw[i];
      if (!row?.length) continue;
      const parsed = parseDailySheetDate(row[0]);
      if (!parsed) continue;
      const dateStr = parsed.toISOString().split('T')[0];
      if (dateStr >= periodStartIso) continue; // must be strictly before current period
      const riderCode = String(row[1] ?? '').trim();
      const norm = normalizeRiderCodeForPerformance(riderCode);
      if (!norm) continue;
      const hours = Math.max(0, parseFloat(String(row[2] ?? '0').replace(',', '.')) || 0);
      const orders = Math.max(0, parseInt(String(row[6] ?? '0'), 10) || 0);
      const breakMinutes = Math.max(0, parseFloat(String(row[3] ?? '0').replace(',', '.')) || 0);
      const delayMinutes = Math.max(0, parseFloat(String(row[4] ?? '0').replace(',', '.')) || 0);
      lookbackPerformance.push({ date: dateStr, riderCode: norm, hours, orders, breakMinutes, delayMinutes });
    }
  }

  // Diagnostics — how much lookback history we actually have.
  const lookbackDatesFound = new Set(lookbackPerformance.map((r) => r.date));
  const lookbackDiagnostic = {
    rowsFound: lookbackPerformance.length,
    uniqueDates: lookbackDatesFound.size,
    dateRange: `${lookbackStartIso} → ${lookbackEndIso}`,
    dataAvailable: lookbackPerformance.length > 0,
  };

  const actualLookbackDays = lookbackDatesFound.size > 0 ? lookbackDatesFound.size : LOOKBACK_DAYS;
  const riderHistoricalBaselines = buildRiderHistoricalBaselines(lookbackPerformance, actualLookbackDays);

  // ── Baseline Match Diagnostic ──────────────────────────────────────────────
  // For each current-roster rider, check whether their normalized code exists
  // in the baselines Map. Unmatched = code normalization may differ between sheets.
  // DO NOT modify normalization here — collect evidence only.
  let baselineMatchedRiders = 0;
  let baselineUnmatchedRiders = 0;
  const baselineSampleUnmatched: string[] = [];
  for (const agg of aggList) {
    const norm = normalizeRiderCodeForPerformance(agg.code);
    if (norm && riderHistoricalBaselines.has(norm)) {
      baselineMatchedRiders++;
    } else {
      baselineUnmatchedRiders++;
      if (baselineSampleUnmatched.length < 10) {
        baselineSampleUnmatched.push(`"${agg.code}" → norm:"${norm ?? 'null'}"`);
      }
    }
  }
  const baselineMatchRate = aggList.length > 0
    ? Math.round((baselineMatchedRiders / aggList.length) * 100)
    : 0;
  if (lookbackDiagnostic.dataAvailable) {
    console.log(
      `[BaselineMatch] matched=${baselineMatchedRiders}/${aggList.length} (${baselineMatchRate}%), ` +
      `unmatched=${baselineUnmatchedRiders}. ` +
      (baselineUnmatchedRiders > 0 ? `Sample unmatched: ${baselineSampleUnmatched.join(', ')}` : 'All matched.')
    );
    if (baselineUnmatchedRiders > aggList.length * 0.1) {
      console.warn(
        `[BaselineMatch] WARNING: ${baselineUnmatchedRiders} riders (${100 - baselineMatchRate}%) ` +
        `not matched to lookback data — possible rider code normalization mismatch between sheets.`
      );
    }
  }

  // Attach match diagnostics to the lookback diagnostic object for UI display.
  const lookbackDiagnosticFull = {
    ...lookbackDiagnostic,
    rosterSize: aggList.length,
    matchedRiders: baselineMatchedRiders,
    unmatchedRiders: baselineUnmatchedRiders,
    matchRate: baselineMatchRate,
    sampleUnmatched: baselineSampleUnmatched,
  };

  // Build join-date map for rider lifecycle classification.
  const riderJoinDateByCode = new Map<string, string>();
  for (const r of ridersInScope) {
    const norm = normalizeRiderCodeForPerformance(r.code);
    if (norm && r.joinDate) riderJoinDateByCode.set(norm, r.joinDate);
  }

  const controlTower = buildControlTowerReport({
    startDate: filters.startDate,
    endDate: filters.endDate,
    operationalPeriodDays,
    operationalCoveragePercent: sourceDataCoverage.completenessPercentage,
    metadataCoveragePercent: sourceDataCoverage.metadataCoveragePercent,
    overallReadinessPercent: sourceDataCoverage.overallReadinessPercent,
    operationalAnalyticsEnabled: sourceDataCoverage.operationalAnalyticsEnabled,
    metadataAnalyticsEnabled: sourceDataCoverage.metadataAnalyticsEnabled,
    dataCoveragePercent: sourceDataCoverage.completenessPercentage,
    strategicKpisEnabled: sourceDataCoverage.strategicKpisEnabled,
    fleetTalabat,
    supervisorRows: supervisorPerformance.rows,
    riders: aggList.map((agg) => ({
      code: agg.code,
      name: agg.name,
      region: agg.region,
      supervisorCode: agg.supervisorCode,
      supervisorName: agg.supervisorName,
      totalHours: agg.totalHours,
      totalOrders: agg.totalOrders,
      contractType: agg.contractType,
    })),
    performance,
    richPerformance: performance.map((rec) => ({
      date: rec.date,
      riderCode: rec.riderCode,
      hours: rec.hours,
      orders: rec.orders,
      breakMinutes: rec.breakMinutes ?? 0,
      delayMinutes: rec.delayMinutes ?? 0,
      absenceFlag: '',
      supervisorCode: rec.supervisorCode ?? '',
      zone: rec.zone ?? '',
    })),
    lookbackPerformance,
    riderHistoricalBaselines,
    assignedRiderCodes,
    fleetDailyTargetHours,
    headcount: totalRegistered,
    inactiveRiders,
    avgHoursPerActiveRider: fleetTalabat.avgHoursPerActiveRider,
    supervisorNameByCode,
    riderJoinDateByCode,
    avgRevenuePerOrder: 0,
    lookbackDiagnostic: lookbackDiagnosticFull,
  });

  const withTower = { ...partial, operationalFormulaAudit, aiInsights, controlTower };
  const srs006 = buildSrs006CompletePackage(withTower as StrategicOpsReport);
  return { ...withTower, srs006 };
}
