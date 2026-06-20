import { getAllRiders, getAllSupervisors, type Rider, type Supervisor } from '@/lib/adminService';
import { getSheetData } from '@/lib/googleSheets';
import {
  getSupervisorPerformanceFiltered,
  parseDailySheetDate,
  normalizeRiderCodeForPerformance,
} from '@/lib/dataFilter';
import { loadAllCandidates } from '@/lib/recruitment/recruitmentService';
import type { Candidate } from '@/lib/recruitment/types';
import { supervisorRowMatchesZoneFilter } from '@/lib/zones';
import { HOUR_BUCKET_DEFS_AR } from '@/lib/strategicOps/labelsAr';
import { isApprovedResignationStatus, isSheetSuspendedStatus } from '@/lib/strategicOps/resignationStatus';
import { buildOperationalFormulaAudit, type ResignationAuditRecord, type RiderLifetimeSample } from '@/lib/strategicOps/formulaAudit';

export type StrategicOpsFilters = {
  startDate: string;
  endDate: string;
  zone: string;
  supervisorCode: string;
  allowedSupervisorCodes?: Set<string> | null;
};

export type HourBucket = {
  label: string;
  key: string;
  count: number;
  percent: number;
  hoursContribution: number;
};

export type RiderRankRow = {
  code: string;
  name: string;
  supervisorCode: string;
  supervisorName: string;
  region: string;
  hours: number;
  orders: number;
  avgDailyHours: number;
  workDays: number;
  trendDelta?: number;
  consistencyScore?: number;
};

export type SupervisorOpsRow = {
  code: string;
  name: string;
  region: string;
  assignedRiders: number;
  activeRiders: number;
  inactiveRiders: number;
  suspendedRiders: number;
  newHires: number;
  resignations: number;
  totalHours: number;
  avgHoursPerRider: number;
  avgOrders: number;
  attendancePercent: number;
  targetAchievementPercent: number;
  productivityScore: number;
  riskScore: number;
  riskLevel: 'green' | 'yellow' | 'red';
};

export type DataValidationEntry = {
  kpi: string;
  sourceSheet: string;
  columns: string;
  recordsRead: number;
  formula: string;
  result: string | number;
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

export type StrategicOpsReport = {
  meta: {
    startDate: string;
    endDate: string;
    zone: string;
    supervisorCode: string;
    periodDays: number;
    generatedAt: string;
  };
  executiveSummary: {
    totalRegisteredRiders: number;
    totalAssignedToSupervisors: number;
    activeRiders: number;
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
    averageDailyHours: number;
    highestDay: { date: string; hours: number } | null;
    lowestDay: { date: string; hours: number } | null;
    averageHoursPerRider: number;
    averageHoursPerActiveRider: number;
    trend: Array<{ date: string; hours: number; orders: number }>;
    top10Days: Array<{ date: string; hours: number }>;
    worst10Days: Array<{ date: string; hours: number }>;
  };
  lostHours: {
    potentialHours: number;
    actualHours: number;
    lostHours: number;
    lostPercent: number;
    breakdown: Array<{
      category: string;
      categoryKey: string;
      hours: number;
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
    averageRiderLifetimeDays: number;
    attritionTrend: Array<{ period: string; resignations: number }>;
  };
  growthOpportunities: {
    scenarios: Array<{
      key: string;
      label: string;
      additionalHoursGain: number;
      expectedTotalHours: number;
      affectedRiders: number;
    }>;
  };
  growthExpansion: {
    dailyTargetHours: number;
    currentAverageDailyHours: number;
    indicators: GrowthExpansionIndicator[];
  };
  hoursRoadmap: {
    currentDailyHours: number;
    targetDailyHours: number;
    dailyGap: number;
    currentPeriodHours: number;
    periodDays: number;
    additionalActiveRidersNeeded: number;
    additionalHoursPerRiderNeeded: number;
    roadmap: string[];
  };
  operationalFormulaAudit: import('@/lib/strategicOps/formulaAudit').OperationalFormulaAudit;
  operationalHealth: OperationalHealthScore;
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
};

type PerfRec = {
  date: string;
  riderCode: string;
  hours: number;
  orders: number;
};

type RiderAgg = {
  code: string;
  name: string;
  region: string;
  supervisorCode: string;
  supervisorName: string;
  status: string;
  joinDate: string;
  totalHours: number;
  totalOrders: number;
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

function isRiderActive(agg: RiderAgg): boolean {
  return agg.totalHours > 0;
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
      totalHours: 0,
      totalOrders: 0,
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
  const mid = new Date(startDate);
  mid.setDate(mid.getDate() + Math.floor(diffDaysInclusive(startDate, endDate) / 2));
  let first = 0;
  let firstDays = 0;
  let second = 0;
  let secondDays = 0;
  for (const [dateStr, hrs] of dailyHours) {
    const d = parseDailySheetDate(dateStr);
    if (!d) continue;
    if (d < mid) {
      first += hrs;
      if (hrs > 0) firstDays += 1;
    } else {
      second += hrs;
      if (hrs > 0) secondDays += 1;
    }
  }
  const avgFirst = firstDays > 0 ? first / firstDays : 0;
  const avgSecond = secondDays > 0 ? second / secondDays : 0;
  return round2(avgSecond - avgFirst);
}

function toRiderRankRow(agg: RiderAgg, periodDays: number, extra?: Partial<RiderRankRow>): RiderRankRow {
  return {
    code: agg.code,
    name: agg.name,
    supervisorCode: agg.supervisorCode,
    supervisorName: agg.supervisorName,
    region: agg.region,
    hours: round2(agg.totalHours),
    orders: agg.totalOrders,
    avgDailyHours: round2(periodDays > 0 ? agg.totalHours / periodDays : 0),
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

  if (row.avgHoursPerRider < 4) {
    score += 20;
    factors.push('متوسط ساعات منخفض للطيارين');
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
}): StrategicOpsReport['growthExpansion'] {
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
  } = input;

  const activeCoverage = pct(activeRiders, totalRegistered);
  const retentionRate = pct(Math.max(0, totalRegistered - approvedResignations), totalRegistered);
  const avgHoursPerActive = activeRiders > 0 ? round2(totalHours / activeRiders) : 0;
  const avgOrdersPerActive = activeRiders > 0 ? round2(totalOrders / activeRiders) : 0;
  const hoursPerSupervisor = supervisorCount > 0 ? round2(totalHours / supervisorCount) : 0;
  const ridersPerSupervisor = supervisorCount > 0 ? round2(totalAssigned / supervisorCount) : 0;
  const recruitmentActivation = pct(recruitmentActiveAfterJoining, recruitmentApplications);

  const avgDailyHoursPerActiveRider =
    activeRiders > 0 && periodDays > 0 ? round2(totalHours / activeRiders / periodDays) : 0;
  const dailyGap = Math.max(0, DAILY_HOURS_TARGET - averageDailyHours);
  const additionalRidersForDailyTarget =
    avgDailyHoursPerActiveRider > 0 ? Math.ceil(dailyGap / avgDailyHoursPerActiveRider) : 0;
  const additionalHoursForDailyTarget = round2(dailyGap);
  const inactiveGrowthPotentialDaily = round2(inactiveRiders * avgDailyHoursPerActiveRider);
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
      `⌈(${DAILY_HOURS_TARGET} − ${averageDailyHours}) ÷ ${avgDailyHoursPerActiveRider}⌉ = ${additionalRidersForDailyTarget} طيار`
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

function generateInsights(report: Omit<StrategicOpsReport, 'aiInsights'>): StrategicOpsReport['aiInsights'] {
  const es = report.executiveSummary;
  const lh = report.lostHours;
  const worstSup = report.supervisorPerformance.worstSupervisor;
  const bottomRiders = report.utilization.bottom20ByHours.slice(0, 5);
  const topScenario = [...report.growthOpportunities.scenarios].sort((a, b) => b.additionalHoursGain - a.additionalHoursGain)[0];

  const biggestProblem =
    lh.lostPercent > 40
      ? `فقدان ${lh.lostPercent}% من الساعات المحتملة (${round2(lh.lostHours)} ساعة) خلال الفترة.`
      : es.inactiveRiders > es.totalRegisteredRiders * 0.2
        ? `${es.inactiveRiders} طياراً غير نشط (ساعات=٠ وطلبات=٠) أي ${es.inactivePercent}% من المسجلين.`
        : `معدل الاستغلال ${es.utilizationRate}% فقط — أقل من المستوى التشغيلي المطلوب.`;

  const lostHoursCause = lh.breakdown
    .filter((b) => b.hours > 0)
    .map((b) => `${b.category}: ${round2(b.hours)} ساعة (${b.percent}%)`)
    .join('؛ ') || 'لا توجد بيانات كافية عن الساعات المهدرة.';

  const supervisorNeedingIntervention = worstSup
    ? `المشرف ${worstSup.name} (${worstSup.code}) — مخاطر ${worstSup.riskScore}، نشطون ${worstSup.activeRiders}/${worstSup.assignedRiders}، إقالات ${worstSup.resignations}.`
    : 'لا يوجد مشرف ضمن النطاق.';

  const underutilizedRiders =
    bottomRiders.map((r) => `${r.name} (${r.code}): ${r.hours} ساعة`).join(' | ') || '—';

  const focusThisWeek = `تفعيل ${es.inactiveRiders} طيار غير نشط؛ رفع الاستغلال من ${es.utilizationRate}%؛ متابعة ${worstSup?.name ?? '—'}؛ معالجة ${es.approvedResignations} إقالة معتمدة.`;

  const focusThisMonth = `خفض التسرب (${es.attritionRate}%)؛ سد فجوة ${report.hoursRoadmap.dailyGap} ساعة/يوم؛ تنفيذ «${topScenario?.label ?? '—'}» (+${topScenario?.additionalHoursGain ?? 0} ساعة)؛ رفع درجة الصحة التشغيلية (${report.operationalHealth.score}).`;

  const fastestHourGains = topScenario
    ? `${topScenario.label}: +${topScenario.additionalHoursGain} ساعة. بديل: ${report.hoursRoadmap.additionalActiveRidersNeeded} طيار إضافي.`
    : 'تفعيل الطيارين غير النشطين ورفع متوسط الساعات.';

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

  const [allRiders, allSupervisors, performanceRaw, terminationSheet, candidates, dailySheetRaw] =
    await Promise.all([
      getAllRiders(false),
      getAllSupervisors(false),
      getSupervisorPerformanceFiltered(null, startDate, endDate, { useCache: false }),
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

  const riderCodeSet = new Set(ridersInScope.map((r) => normalizeRiderCodeForPerformance(r.code)));

  const performance: PerfRec[] = [];
  for (const rec of performanceRaw) {
    const norm = normalizeRiderCodeForPerformance(rec.riderCode);
    if (!riderCodeSet.has(norm)) continue;
    let dateStr = '';
    if (rec.date instanceof Date) {
      dateStr = rec.date.toISOString().split('T')[0];
    } else {
      const parsed = parseDailySheetDate(rec.date);
      dateStr = parsed ? parsed.toISOString().split('T')[0] : String(rec.date ?? '').slice(0, 10);
    }
    performance.push({
      date: dateStr,
      riderCode: String(rec.riderCode ?? '').trim(),
      hours: Number(rec.hours) || 0,
      orders: Number(rec.orders) || 0,
    });
  }

  const assignedRiders = ridersInScope.filter((r) => String(r.supervisorCode ?? '').trim());
  const riderAggs = buildRiderAggs(ridersInScope, performance);
  const aggList = Array.from(riderAggs.values());

  const activeRiders = aggList.filter(isRiderActive).length;
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
  const utilizationRate = pct(activeRiders, totalRegistered);

  const dailyActiveCounts = computeDailyActiveRiderCounts(performance);
  const avgActiveDuringPeriod = computeAvgActiveRidersDuringPeriod(dailyActiveCounts);
  const attritionRate = pct(approvedResignations, avgActiveDuringPeriod || activeRiders || 1);
  const monthlyAttritionRate = round2(attritionRate * (30 / Math.max(periodDays, 1)));

  const executiveSummary = {
    totalRegisteredRiders: totalRegistered,
    totalAssignedToSupervisors: totalAssigned,
    activeRiders,
    inactiveRiders,
    suspendedRiders,
    approvedResignations,
    newRidersJoined: newJoined,
    ridersWithNoActivity: inactiveRiders,
    activePercent: pct(activeRiders, totalRegistered),
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
    const avgDaily = periodDays > 0 ? agg.totalHours / periodDays : 0;
    const b = bucketCounts.get(hourBucketKey(avgDaily))!;
    b.count += 1;
    b.hours += agg.totalHours;
  }

  const activityDistribution = {
    totalRiders: aggList.length,
    totalHours: round2(totalHours),
    classificationBasis: 'average_daily_hours' as const,
    classificationFormula: 'متوسط يومي = إجمالي ساعات الطيار ÷ عدد أيام الفترة',
    periodDays,
    buckets: HOUR_BUCKET_DEFS_AR.map((def) => {
      const b = bucketCounts.get(def.key)!;
      return {
        label: def.label,
        key: def.key,
        count: b.count,
        percent: pct(b.count, aggList.length),
        hoursContribution: round2(b.hours),
      };
    }),
  };

  const rankRows = aggList.map((agg) =>
    toRiderRankRow(agg, periodDays, {
      consistencyScore: computeConsistencyScore(agg.dailyHours),
      trendDelta: computeTrendDelta(agg.dailyHours, startDate, endDate),
    })
  );

  const utilization = {
    totalRegisteredRiders: totalRegistered,
    activeRiders,
    utilizationRate,
    top20ByHours: [...rankRows].sort((a, b) => b.hours - a.hours).slice(0, 20),
    bottom20ByHours: [...rankRows].sort((a, b) => a.hours - b.hours).slice(0, 20),
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

  const hoursAnalysis = {
    totalHours: round2(totalHours),
    averageDailyHours: round2(periodDays > 0 ? totalHours / periodDays : 0),
    highestDay: sortedDays[0] ?? null,
    lowestDay: sortedDays.length ? sortedDays[sortedDays.length - 1] : null,
    averageHoursPerRider: round2(aggList.length > 0 ? totalHours / aggList.length : 0),
    averageHoursPerActiveRider: round2(activeRiders > 0 ? totalHours / activeRiders : 0),
    trend,
    top10Days: sortedDays.slice(0, 10),
    worst10Days: [...sortedDays].reverse().slice(0, 10),
  };

  const potentialHours = totalRegistered * HOURS_CAP_PER_DAY * periodDays;
  const actualHours = totalHours;
  const lostHoursTotal = Math.max(0, potentialHours - actualHours);

  const zeroHourRiders = aggList.filter((a) => a.totalHours <= 0);
  const weakRiders = aggList.filter((a) => {
    const avg = periodDays > 0 ? a.totalHours / periodDays : 0;
    return avg > 0 && avg < WEAK_HOURS_THRESHOLD;
  });

  const lostFromNoOperation = zeroHourRiders.length * HOURS_CAP_PER_DAY * periodDays;
  const lostFromWeak = weakRiders.reduce((s, a) => {
    const avg = periodDays > 0 ? a.totalHours / periodDays : 0;
    return s + (WEAK_HOURS_THRESHOLD - avg) * periodDays;
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
    lostPercent: pct(lostHoursTotal, potentialHours),
    breakdown: lostBreakdown.map((b) => ({
      ...b,
      hours: round2(b.hours),
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
    const supAggs = supRiders.map((r) => riderAggs.get(normalizeRiderCodeForPerformance(r.code))).filter(Boolean) as RiderAgg[];

    const supActive = supAggs.filter(isRiderActive).length;
    const supInactive = supAggs.filter(isRiderInactive).length;
    const supHours = supAggs.reduce((s, a) => s + a.totalHours, 0);
    const supOrders = supAggs.reduce((s, a) => s + a.totalOrders, 0);
    const supSuspended = supRiders.filter((r) => isSheetSuspendedStatus(r.status)).length;
    const supNewHires = supRiders.filter((r) => inDateRange(parseJoinDate(r.joinDate), startDate, endDate)).length;
    const supResignations = resignationsBySup.get(code) ?? 0;

    const targetDaily = Number.isFinite(Number(sup.target)) ? Number(sup.target) : 0;
    const targetTotal = targetDaily * periodDays;
    const targetAchievement = targetTotal > 0 ? pct(supHours, targetTotal) : 0;
    const attendancePercent = pct(supActive, supRiders.length || 1);
    const avgOrders = supRiders.length > 0 ? round2(supOrders / supRiders.length) : 0;
    const productivityScore = round2(attendancePercent * 0.3 + targetAchievement * 0.4 + Math.min(100, avgOrders * 5) * 0.3);

    const base: Omit<SupervisorOpsRow, 'riskScore' | 'riskLevel'> = {
      code,
      name: sup.name || code,
      region: sup.region || '',
      assignedRiders: supRiders.length,
      activeRiders: supActive,
      inactiveRiders: supInactive,
      suspendedRiders: supSuspended,
      newHires: supNewHires,
      resignations: supResignations,
      totalHours: round2(supHours),
      avgHoursPerRider: round2(supRiders.length > 0 ? supHours / supRiders.length : 0),
      avgOrders,
      attendancePercent,
      targetAchievementPercent: targetAchievement,
      productivityScore,
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

  const recruitment = recruitmentMetrics(candidates, riderAggs);

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
    averageActiveRidersDuringPeriod: avgActiveDuringPeriod || activeRiders,
    topSupervisorsLosingRiders: Array.from(resignationsBySup.entries())
      .map(([code, count]) => {
        const sup = supervisorsScoped.find((s) => String(s.code ?? '').trim() === code);
        return { code, name: sup?.name ?? code, count };
      })
      .sort((a, b) => b.count - a.count)
      .slice(0, 10),
    averageRiderLifetimeDays: lifetimeDays.length > 0 ? round2(lifetimeDays.reduce((a, b) => a + b, 0) / lifetimeDays.length) : 0,
    attritionTrend: Array.from(trendMap.entries()).map(([period, resignations]) => ({ period, resignations })).sort((a, b) => a.period.localeCompare(b.period)),
  };

  const below4 = aggList.filter((a) => { const avg = periodDays > 0 ? a.totalHours / periodDays : 0; return avg > 0 && avg < 4; });
  const below6 = aggList.filter((a) => { const avg = periodDays > 0 ? a.totalHours / periodDays : 0; return avg > 0 && avg < 6; });
  const inactiveAggs = aggList.filter(isRiderInactive);

  const growthOpportunities = {
    scenarios: [
      { key: 'A', label: 'رفع الطيارين دون ٤ ساعات إلى ٦ ساعات يومياً', additionalHoursGain: round2(below4.reduce((s, a) => s + (6 - a.totalHours / periodDays) * periodDays, 0)), expectedTotalHours: 0, affectedRiders: below4.length },
      { key: 'B', label: 'رفع الطيارين دون ٦ ساعات إلى ٨ ساعات يومياً', additionalHoursGain: round2(below6.reduce((s, a) => s + (8 - a.totalHours / periodDays) * periodDays, 0)), expectedTotalHours: 0, affectedRiders: below6.length },
      { key: 'C', label: 'تفعيل الطيارين غير النشطين (٦ ساعات/يوم)', additionalHoursGain: round2(inactiveAggs.length * 6 * periodDays), expectedTotalHours: 0, affectedRiders: inactiveAggs.length },
      { key: 'D', label: 'إضافة ٢٠ طيار جديد (٦ ساعات/يوم)', additionalHoursGain: round2(20 * 6 * periodDays), expectedTotalHours: 0, affectedRiders: 20 },
    ].map((s) => ({ ...s, expectedTotalHours: round2(totalHours + s.additionalHoursGain) })),
  };

  const currentDailyHours = hoursAnalysis.averageDailyHours;
  const dailyGap = Math.max(0, DAILY_HOURS_TARGET - currentDailyHours);
  const avgDailyHoursPerActiveRider =
    activeRiders > 0 && periodDays > 0 ? round2(totalHours / activeRiders / periodDays) : 0;
  const additionalActiveRidersNeeded =
    avgDailyHoursPerActiveRider > 0 ? Math.ceil(dailyGap / avgDailyHoursPerActiveRider) : 0;
  const additionalHoursPerRiderDaily =
    totalRegistered > 0 ? round2(dailyGap / totalRegistered) : 0;

  const roadmap: string[] = [];
  if (dailyGap <= 0) {
    roadmap.push(`تم تجاوز هدف ${DAILY_HOURS_TARGET} ساعة يومياً (المتوسط الحالي: ${currentDailyHours}).`);
  } else {
    roadmap.push(`فجوة يومية: ${round2(dailyGap)} ساعة (هدف ${DAILY_HOURS_TARGET} − متوسط يومي ${currentDailyHours}).`);
    roadmap.push(`مرجع الفترة: ${round2(totalHours)} ساعة إجمالية خلال ${periodDays} يوم — لا يُقارن مباشرة بالهدف اليومي.`);
    roadmap.push(`خيار ١: إضافة ${additionalActiveRidersNeeded} طيار نشط بمتوسط ${avgDailyHoursPerActiveRider} ساعة/يوم.`);
    roadmap.push(`خيار ٢: رفع متوسط الساعات +${additionalHoursPerRiderDaily} ساعة/يوم لكل طيار مسجل.`);
  }

  const hoursRoadmap = {
    currentDailyHours,
    targetDailyHours: DAILY_HOURS_TARGET,
    dailyGap: round2(dailyGap),
    currentPeriodHours: round2(totalHours),
    periodDays,
    additionalActiveRidersNeeded,
    additionalHoursPerRiderNeeded: additionalHoursPerRiderDaily,
    roadmap,
  };

  const totalOrders = aggList.reduce((s, a) => s + a.totalOrders, 0);
  const growthExpansion = computeGrowthExpansionMetrics({
    totalRegistered,
    totalAssigned,
    activeRiders,
    inactiveRiders,
    approvedResignations,
    totalHours,
    totalOrders,
    periodDays,
    supervisorCount: supervisorsScoped.length,
    recruitmentApplications: recruitment.totalApplications,
    recruitmentActiveAfterJoining: recruitment.totalActiveAfterJoining,
    averageDailyHours: hoursAnalysis.averageDailyHours,
  });

  const operationalHealth = computeOperationalHealth(
    utilizationRate,
    attritionRate,
    pct(activeRiders, totalRegistered),
    periodDays > 0 ? totalHours / totalRegistered / periodDays : 0,
    recruitment.recruitmentEfficiencyPercent
  );

  const performanceRecordsInRange = performance.length;
  const dailySheetRows = Math.max(0, (dailySheetRaw?.length ?? 1) - 1);
  const terminationRows = Math.max(0, terminationSheet.length - 1);

  const dataValidation: DataValidationEntry[] = [
    {
      kpi: 'الطيارون النشطون',
      sourceSheet: SHEET_DAILY,
      columns: 'التاريخ (0)، كود المندوب (1)، ساعات العمل (2)',
      recordsRead: performanceRecordsInRange,
      formula: 'SUM(ساعات العمل) > 0 خلال الفترة المحددة',
      result: activeRiders,
    },
    {
      kpi: 'الطيارون غير النشطين',
      sourceSheet: SHEET_DAILY,
      columns: 'ساعات العمل (2)، الطلبات (6)',
      recordsRead: performanceRecordsInRange,
      formula: 'SUM(ساعات)=0 AND SUM(طلبات)=0 خلال الفترة',
      result: inactiveRiders,
    },
    {
      kpi: 'عدد الإقالات المعتمدة',
      sourceSheet: SHEET_TERMINATION,
      columns: 'كود المشرف (0)، كود المندوب (2)، الحالة (5)، تاريخ الموافقة (7)',
      recordsRead: terminationRows,
      formula: 'الحالة: Approved / Accepted / تمت الموافقة / مقبول + ضمن الفترة',
      result: approvedResignations,
    },
    {
      kpi: 'معدل الاستغلال',
      sourceSheet: `${SHEET_DAILY} + ${SHEET_RIDERS}`,
      columns: 'ساعات العمل + كود المندوب',
      recordsRead: dailySheetRows,
      formula: 'النشطون ÷ إجمالي المسجلين × 100',
      result: `${utilizationRate}%`,
    },
    {
      kpi: 'نسبة التسرب',
      sourceSheet: SHEET_TERMINATION,
      columns: 'الحالة (5)، تاريخ الموافقة (7)',
      recordsRead: terminationRows,
      formula: 'الإقالات المعتمدة ÷ متوسط الطيارين النشطين يومياً × 100',
      result: `${attritionRate}%`,
    },
    {
      kpi: 'إجمالي الساعات',
      sourceSheet: SHEET_DAILY,
      columns: 'ساعات العمل (2)',
      recordsRead: performanceRecordsInRange,
      formula: 'SUM(ساعات العمل) للفترة',
      result: round2(totalHours),
    },
    {
      kpi: 'متوسط الساعات لكل طيار',
      sourceSheet: SHEET_DAILY,
      columns: 'ساعات العمل (2)',
      recordsRead: performanceRecordsInRange,
      formula: 'إجمالي الساعات ÷ عدد الطيارين المسجلين',
      result: hoursAnalysis.averageHoursPerRider,
    },
    {
      kpi: 'درجة صحة التشغيل',
      sourceSheet: 'محسوب من مؤشرات متعددة',
      columns: 'الاستغلال، التسرب، النشاط، الساعات، التعيين',
      recordsRead: performanceRecordsInRange + terminationRows,
      formula: 'مركّب مرجّح (٠–١٠٠)',
      result: operationalHealth.score,
    },
    ...growthExpansion.indicators.map((ind) => ({
      kpi: ind.labelAr,
      sourceSheet: SHEET_DAILY,
      columns: 'حسب المؤشر',
      recordsRead: performanceRecordsInRange,
      formula: ind.formula,
      result: ind.displayValue,
    })),
  ];

  const partial = {
    meta: {
      startDate: filters.startDate,
      endDate: filters.endDate,
      zone: filters.zone,
      supervisorCode: filters.supervisorCode,
      periodDays,
      generatedAt: new Date().toISOString(),
    },
    executiveSummary,
    activityDistribution,
    utilization,
    hoursAnalysis,
    lostHours: lostHoursSection,
    supervisorPerformance,
    supervisorRisk,
    recruitment,
    attrition,
    growthOpportunities,
    growthExpansion,
    hoursRoadmap,
    operationalHealth,
    dataValidation,
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
    periodDays,
  });

  const aiInsights = generateInsights({ ...partial, operationalFormulaAudit });
  aiInsights.fullReport = '';

  return { ...partial, operationalFormulaAudit, aiInsights };
}
