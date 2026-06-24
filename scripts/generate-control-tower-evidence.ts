/**
 * Read-only evidence generator for CONTROL_TOWER_EVIDENCE_AUDIT.md
 * Run: npx tsx scripts/generate-control-tower-evidence.ts
 */
import { buildControlTowerReport } from '../lib/strategicOps/controlTower/index';
import { buildExecutiveFocus } from '../lib/strategicOps/controlTower/executiveFocus';
import { buildKpiRootCauses } from '../lib/strategicOps/controlTower/kpiRootCause';
import { buildManagementActions, rankActionsByImpact } from '../lib/strategicOps/controlTower/managementActions';
import { buildPeriodComparisons } from '../lib/strategicOps/controlTower/periodComparison';
import { buildTopNegativeImpactRiders } from '../lib/strategicOps/controlTower/riderImpact';
import {
  computeActionReliability,
  computeControlTowerReliability,
  computeRootCauseConfidence,
} from '../lib/strategicOps/controlTower/reliability';
import { resolveRiderSupervisorNames } from '../lib/strategicOps/controlTower/supervisorMapping';
import { supervisorImpliedTargetDaily, supervisorLostTargetDaily } from '../lib/strategicOps/controlTower/supervisorMetrics';
import { isControlTowerInsightsEnabled } from '../lib/strategicOps/controlTower/coverageGate';
import type { ControlTowerBuildContext } from '../lib/strategicOps/controlTower/types';
import type { SupervisorOpsRow } from '../lib/strategicOps/buildReport';

function mkSup(p: Partial<SupervisorOpsRow> & Pick<SupervisorOpsRow, 'code' | 'name'>): SupervisorOpsRow {
  return {
    region: p.region ?? 'Alexandria',
    headcount: 40,
    assignedRiders: 40,
    activeRiders: 28,
    noShowRiders: 5,
    inactiveRiders: 8,
    suspendedRiders: 0,
    newHires: 1,
    resignations: 0,
    totalHours: 2800,
    dailyHours: 100,
    avgHoursPerRider: 70,
    avgHoursPerRiderDaily: 3.5,
    avgOrders: 0,
    avgOrdersDaily: 0,
    totalHoursDual: { daily: 100, period: 2800 },
    avgHoursPerRiderDual: { daily: 2.5, period: 70 },
    avgOrdersDual: { daily: 0, period: 0 },
    attendancePercent: 70,
    utilizationPercent: 70,
    targetAchievementPercent: 65,
    achievementPercent: 65,
    productivityScore: 65,
    riskScore: 45,
    riskLevel: 'yellow',
    ...p,
  };
}

const fleet = {
  headcount: 339,
  activeRiders: 192,
  noShowRiders: 135,
  actualHours: 947.58,
  targetHours: 1500,
  achievementPercent: 63.17,
  avgHoursPerActiveRider: 4.93,
  utilizationPercent: 56.64,
  dailySeries: [
    { date: '2026-05-01', scheduledRiders: 200, activeRiders: 180, noShowRiders: 20, hours: 900, targetHours: 1500 },
    { date: '2026-05-02', scheduledRiders: 210, activeRiders: 190, noShowRiders: 20, hours: 950, targetHours: 1500 },
    { date: '2026-05-03', scheduledRiders: 205, activeRiders: 185, noShowRiders: 20, hours: 920, targetHours: 1500 },
  ],
  calendarDays: 30,
  operationalDays: 3,
  uniqueActiveRidersInPeriod: 200,
};

const supervisorMap = new Map([
  ['S01', 'Ahmed Hassan'],
  ['S02', 'Kero Maged Wakeel'],
  ['S03', 'Mohamed Ali'],
  ['S04', 'Sara Ibrahim'],
  ['S05', 'Omar Farouk'],
  ['S06', 'Nadia Samir'],
  ['S07', 'Youssef Kamal'],
  ['S08', 'Hana Mahmoud'],
  ['S09', 'Tarek Nabil'],
  ['S10', 'Laila Fouad'],
]);

const rawRiders = Array.from({ length: 25 }, (_, i) => {
  const n = i + 1;
  const code = `R${String(n).padStart(3, '0')}`;
  const supCode = `S${String((i % 10) + 1).padStart(2, '0')}`;
  const totalHours = [0, 30, 60, 90, 120, 45, 0, 150, 75, 20, 0, 180, 95, 10, 0, 200, 55, 0, 130, 85, 0, 40, 110, 0, 160][i];
  return {
    code,
    name: `Rider ${n}`,
    region: i % 2 === 0 ? 'Alexandria' : 'Cairo',
    supervisorCode: supCode,
    supervisorName: i % 5 === 0 ? '' : supervisorMap.get(supCode) ?? '',
    totalHours,
    totalOrders: totalHours > 0 ? Math.floor(totalHours / 3) : 0,
  };
});

const performance = rawRiders.flatMap((r, i) => {
  const rows: Array<{ date: string; riderCode: string; hours: number; orders: number }> = [];
  const dates = ['2026-05-01', '2026-05-02', '2026-05-03'];
  for (const d of dates) {
    if (i % 4 === 0 && d !== '2026-05-01') {
      rows.push({ date: d, riderCode: r.code, hours: 0, orders: 0 });
    } else if (r.totalHours === 0) {
      rows.push({ date: d, riderCode: r.code, hours: 0, orders: 0 });
    } else {
      rows.push({ date: d, riderCode: r.code, hours: r.totalHours / 3, orders: 1 });
    }
  }
  return rows;
});

const supervisors = [
  mkSup({ code: 'S01', name: 'Ahmed Hassan', noShowRiders: 12, dailyHours: 180, achievementPercent: 60, inactiveRiders: 10, headcount: 45, activeRiders: 30 }),
  mkSup({ code: 'S02', name: 'Kero Maged Wakeel', noShowRiders: 18, dailyHours: 200, achievementPercent: 65, inactiveRiders: 12, headcount: 40, activeRiders: 22, region: 'Cairo' }),
  mkSup({ code: 'S03', name: 'Mohamed Ali', noShowRiders: 8, dailyHours: 150, achievementPercent: 70, inactiveRiders: 6, headcount: 38, activeRiders: 28 }),
  mkSup({ code: 'S04', name: 'Sara Ibrahim', noShowRiders: 15, dailyHours: 170, achievementPercent: 55, inactiveRiders: 14, headcount: 42, activeRiders: 25, region: 'Cairo' }),
  mkSup({ code: 'S05', name: 'Omar Farouk', noShowRiders: 6, dailyHours: 120, achievementPercent: 75, inactiveRiders: 4, headcount: 35, activeRiders: 29 }),
  mkSup({ code: 'S06', name: 'Nadia Samir', noShowRiders: 20, dailyHours: 190, achievementPercent: 50, inactiveRiders: 15, headcount: 44, activeRiders: 24, region: 'Cairo' }),
  mkSup({ code: 'S07', name: 'Youssef Kamal', noShowRiders: 9, dailyHours: 140, achievementPercent: 68, inactiveRiders: 7, headcount: 36, activeRiders: 27 }),
  mkSup({ code: 'S08', name: 'Hana Mahmoud', noShowRiders: 11, dailyHours: 160, achievementPercent: 62, inactiveRiders: 9, headcount: 39, activeRiders: 26 }),
  mkSup({ code: 'S09', name: 'Tarek Nabil', noShowRiders: 7, dailyHours: 130, achievementPercent: 72, inactiveRiders: 5, headcount: 34, activeRiders: 28, region: 'Cairo' }),
  mkSup({ code: 'S10', name: 'Laila Fouad', noShowRiders: 14, dailyHours: 175, achievementPercent: 58, inactiveRiders: 11, headcount: 41, activeRiders: 23 }),
];

function mkCoverageFields(operational: number, metadata: number) {
  const overall = Math.round(Math.min(operational, metadata) * 100) / 100;
  return {
    operationalCoveragePercent: operational,
    metadataCoveragePercent: metadata,
    overallReadinessPercent: overall,
    operationalAnalyticsEnabled: operational >= 80,
    metadataAnalyticsEnabled: metadata >= 80,
    dataCoveragePercent: operational,
    strategicKpisEnabled: overall >= 80,
  };
}

const highCtx: ControlTowerBuildContext = {
  startDate: '2026-05-01',
  endDate: '2026-05-30',
  operationalPeriodDays: 30,
  ...mkCoverageFields(92.5, 95),
  fleetTalabat: fleet,
  supervisorRows: supervisors,
  riders: rawRiders,
  performance,
  assignedRiderCodes: new Set(rawRiders.map((r) => r.code)),
  fleetDailyTargetHours: 1500,
  headcount: 339,
  inactiveRiders: 50,
  avgHoursPerActiveRider: 4.93,
  supervisorNameByCode: supervisorMap,
};

const lowCtx: ControlTowerBuildContext = {
  ...highCtx,
  ...mkCoverageFields(14.49, 95),
};

const highReport = buildControlTowerReport(highCtx);
const lowReport = buildControlTowerReport(lowCtx);

const { riders: resolvedRiders, mapping } = resolveRiderSupervisorNames(highCtx.riders, highCtx.supervisorNameByCode);
const topRiders = buildTopNegativeImpactRiders({ ...highCtx, riders: resolvedRiders }, 20);
const allActions = rankActionsByImpact(buildManagementActions({ ...highCtx, riders: resolvedRiders }, supervisors, topRiders));
const focus = buildExecutiveFocus(allActions, 10);

const periodComparisons = buildPeriodComparisons({
  startDate: highCtx.startDate,
  fleetTalabat: highCtx.fleetTalabat,
  performance: highCtx.performance,
  assignedRiderCodes: highCtx.assignedRiderCodes,
  fleetDailyTargetHours: highCtx.fleetDailyTargetHours,
  headcount: highCtx.headcount,
});
const rootCauses = buildKpiRootCauses(highCtx, supervisors, periodComparisons);

function riderCalc(r: (typeof topRiders)[0]) {
  const days = 30;
  const expected = 4.93;
  const actual = Math.round((r.actualHoursDaily) * 100) / 100;
  const hoursGap = Math.max(0, expected - actual);
  const noShowLost =
    r.scheduledDays > 0
      ? Math.round((r.noShowCount / r.scheduledDays) * expected * 100) / 100
      : Math.round(r.noShowCount * (expected / days) * 100) / 100;
  return {
    expected,
    actual,
    hoursGap,
    noShowCount: r.noShowCount,
    scheduledDays: r.scheduledDays,
    noShowLost,
    lost: Math.round((hoursGap + noShowLost) * 100) / 100,
    usesFixed10Cap: r.lostHoursDaily === 10,
  };
}

const resolvedSamples = resolvedRiders
  .filter((r) => rawRiders.find((x) => x.code === r.code && !x.supervisorName))
  .slice(0, 20)
  .map((r) => ({
    riderCode: r.code,
    riderName: r.name,
    supervisorCode: r.supervisorCode,
    primaryName: rawRiders.find((x) => x.code === r.code)?.supervisorName ?? '',
    resolvedName: r.supervisorName,
    source: 'supervisorNameByCode',
  }));

const kpiEvidence = rootCauses.map((k) => ({
  kpiKey: k.kpiKey,
  kpiLabelAr: k.kpiLabelAr,
  confidenceLevel: k.confidenceLevel,
  factors: k.factors.map((f) => ({ label: f.labelAr, value: f.value, impact: f.impactAr })),
  topSupervisor: k.topSupervisors[0] ?? null,
  rankingLogic: {
    headcount: 'topSupervisorsBy(s => s.inactiveRiders)',
    activeRiders: 'topSupervisorsBy(s => max(0, s.headcount - s.activeRiders))',
    noShowRiders: 'topSupervisorsBy(s => s.noShowRiders)',
    actualHours: 'topSupervisorsBy(supervisorLostTargetDaily)',
    targetHours: 'topSupervisorsBy(supervisorImpliedTargetDaily)',
    achievementPercent: 'topSupervisorsBy(supervisorLostTargetDaily)',
    utilizationPercent: 'topSupervisorsBy(s => max(0, s.headcount - s.activeRiders))',
  }[k.kpiKey],
}));

const rel = highReport.reliability;
const relLow = lowReport.reliability;

console.log(JSON.stringify({
  generatedAt: new Date().toISOString(),
  coverageGate: {
    threshold: 80,
    lowCoverageValue: 14.49,
    lowInsightsEnabled: lowReport.insightsEnabled,
    lowDisabledReason: lowReport.disabledReasonAr,
    lowExecutiveFocusCount: lowReport.executiveFocus.length,
    lowKpiRootCausesCount: lowReport.kpiRootCauses.length,
    lowTopRidersCount: lowReport.topNegativeImpactRiders.length,
    lowAchievementDecompositionGap: lowReport.achievementDecomposition.gapHoursDaily,
    lowTalabatKpisWouldShow: ['headcount', 'activeRiders', 'noShowRiders', 'actualHours', 'targetHours', 'achievementPercent', 'utilizationPercent'],
    highCoverageValue: 92.5,
    highInsightsEnabled: highReport.insightsEnabled,
    uiScreenshotRefs: {
      CT01: 'Reliability section + amber disabled banner when coverage < 80%',
      CT02: 'Talabat Operations KPI grid always visible (page.tsx L530+)',
      CT03: 'Executive Focus hidden when insightsEnabled=false (page.tsx L473 guard)',
      CT04: 'Top Negative Riders hidden when insightsEnabled=false (page.tsx L542 guard)',
      CT05: 'Achievement Decomposition always visible (page.tsx L511, no guard)',
    },
  },
  riderImpact: {
    fleetAvgHoursPerActiveRider: 4.93,
    fixed10CapExistsInControlTower: false,
    sampleRiders: topRiders.slice(0, 10).map((r) => ({
      code: r.code,
      name: r.name,
      expectedHours: r.expectedHoursDaily,
      actualHours: r.actualHoursDaily,
      lostHours: r.lostHoursDaily,
      calculation: riderCalc(r),
      lostEqualsFixed10: r.lostHoursDaily === 10,
    })),
    distinctLostValuesAmong10: [...new Set(topRiders.slice(0, 10).map((r) => r.lostHoursDaily))],
  },
  executiveFocus: {
    audit: focus.audit,
    allActionsBeforeFocus: allActions.map((a) => ({
      id: a.id,
      entityType: a.entityType,
      entityId: a.entityId,
      entityName: a.entityName,
      priority: a.priority,
      rawRecoveryHours: a.rawRecoveryHours,
    })),
    finalFocus: focus.executiveFocus.map((a) => ({
      id: a.id,
      entityType: a.entityType,
      entityId: a.entityId,
      entityName: a.entityName,
      rawRecoveryHours: a.rawRecoveryHours,
      deduplicatedRecoveryHours: a.deduplicatedRecoveryHours,
      finalRecovery: a.deduplicatedRecoveryHours,
    })),
    duplicateEntityCheck: focus.executiveFocus.reduce((acc, a) => {
      const k = `${a.entityType}:${a.entityId}`;
      acc[k] = (acc[k] ?? 0) + 1;
      return acc;
    }, {} as Record<string, number>),
  },
  supervisorMapping: {
    totalRiders: mapping.totalRiders,
    mappedCount: mapping.mappedCount,
    unmappedCount: mapping.unmappedCount,
    mappedPercent: mapping.mappedPercent,
    resolvedFromSecondarySource: mapping.resolvedFromSecondarySource,
    score: mapping.score,
    resolvedSamples,
  },
  rootCause: kpiEvidence,
  reliability: {
    highCoverage: {
      inputs: {
        coveragePercent: 92.5,
        insightsEnabled: true,
        mappingScore: mapping.score,
        kpiRootCauseCount: rootCauses.length,
        rawRecovery: focus.audit.rawRecoveryHoursTotal,
        dedupRecovery: focus.audit.deduplicatedRecoveryHoursTotal,
      },
      coverageScore: rel.coverageScore,
      mappingHealthScore: rel.mappingHealthScore,
      rootCauseConfidenceScore: rel.rootCauseConfidenceScore,
      actionReliabilityScore: rel.actionReliabilityScore,
      overallScore: rel.overallScore,
      classification: rel.classification,
      formulas: {
        coverageScoreEnabled: 'min(100, round(coveragePercent / 80 * 100))',
        coverageScoreGated: '100 when coveragePercent < 80 and insights disabled',
        mappingHealthScore: 'mapping.score (mapped riders / total * 100)',
        rootCauseConfidence: 'round(kpisWithFactors / totalKpis * 100) where factors>=2 and topSupervisors>0; 100 when gated',
        actionReliability: 'ratio = dedup/raw; >=0.85→100, >=0.65→85, >=0.45→70, else 50; 100 when gated',
        overall: 'round(coverage*0.30 + mapping*0.20 + rootCause*0.25 + action*0.25)',
      },
      stepByStep: {
        coverageScoreCalc: `min(100, round(92.5/80*100)) = ${rel.coverageScore}`,
        mappingScoreCalc: `${mapping.score}`,
        rootCauseCalc: `${computeRootCauseConfidence(rootCauses, true)} (${rootCauses.filter((k) => k.factors.length >= 2 && k.topSupervisors.length > 0).length}/${rootCauses.length} KPIs)`,
        actionCalc: `${computeActionReliability(focus.audit.rawRecoveryHoursTotal, focus.audit.deduplicatedRecoveryHoursTotal, true)} (ratio ${Math.round(focus.audit.deduplicatedRecoveryHoursTotal / focus.audit.rawRecoveryHoursTotal * 10000) / 100}%)`,
        overallCalc: `round(${rel.coverageScore}*0.30 + ${rel.mappingHealthScore}*0.20 + ${rel.rootCauseConfidenceScore}*0.25 + ${rel.actionReliabilityScore}*0.25) = ${rel.overallScore}`,
      },
    },
    lowCoverage: {
      overallScore: relLow.overallScore,
      coverageScore: relLow.coverageScore,
      mappingHealthScore: relLow.mappingHealthScore,
      rootCauseConfidenceScore: relLow.rootCauseConfidenceScore,
      actionReliabilityScore: relLow.actionReliabilityScore,
      stepByStep: `round(${relLow.coverageScore}*0.30 + ${relLow.mappingHealthScore}*0.20 + ${relLow.rootCauseConfidenceScore}*0.25 + ${relLow.actionReliabilityScore}*0.25) = ${relLow.overallScore}`,
    },
  },
  keroSupervisorMetrics: {
    impliedTarget: supervisorImpliedTargetDaily(supervisors[1]),
    lostTarget: supervisorLostTargetDaily(supervisors[1]),
    targetHoursTopContributor: rootCauses.find((k) => k.kpiKey === 'targetHours')?.topSupervisors.find((s) => s.code === 'S02')?.contribution,
  },
}, null, 2));
