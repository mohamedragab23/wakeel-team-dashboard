/**
 * Control Tower validation audit V2 — read-only formula checks.
 * Run: npx tsx scripts/validate-control-tower-audit.ts
 */
import assert from 'node:assert/strict';
import { buildAchievementDecomposition } from '../lib/strategicOps/controlTower/achievementDecomposition';
import { buildExecutiveFocus } from '../lib/strategicOps/controlTower/executiveFocus';
import { buildControlTowerReport } from '../lib/strategicOps/controlTower/index';
import { buildKpiRootCauses } from '../lib/strategicOps/controlTower/kpiRootCause';
import { buildManagementActions, rankActionsByImpact } from '../lib/strategicOps/controlTower/managementActions';
import { buildPeriodComparisons } from '../lib/strategicOps/controlTower/periodComparison';
import { buildTopNegativeImpactRiders } from '../lib/strategicOps/controlTower/riderImpact';
import { supervisorImpliedTargetDaily } from '../lib/strategicOps/controlTower/supervisorMetrics';
import { resolveRiderSupervisorNames } from '../lib/strategicOps/controlTower/supervisorMapping';
import { computeSourceDataCoverage } from '../lib/strategicOps/talabatOpsMetrics';
import type { ControlTowerBuildContext } from '../lib/strategicOps/controlTower/types';
import type { SupervisorOpsRow } from '../lib/strategicOps/buildReport';

type CheckResult = { name: string; pass: boolean; detail: string };

const results: CheckResult[] = [];

function check(name: string, pass: boolean, detail: string) {
  results.push({ name, pass, detail });
  console.log(`[${pass ? 'PASS' : 'FAIL'}] ${name}: ${detail}`);
}

function mkSupervisor(partial: Partial<SupervisorOpsRow> & Pick<SupervisorOpsRow, 'code' | 'name'>): SupervisorOpsRow {
  return {
    region: 'Alexandria',
    headcount: 50,
    assignedRiders: 50,
    activeRiders: 30,
    noShowRiders: 5,
    inactiveRiders: 10,
    suspendedRiders: 0,
    newHires: 0,
    resignations: 0,
    totalHours: 3000,
    dailyHours: 100,
    avgHoursPerRider: 60,
    avgHoursPerRiderDaily: 3.33,
    avgOrders: 0,
    avgOrdersDaily: 0,
    totalHoursDual: { daily: 100, period: 3000 },
    avgHoursPerRiderDual: { daily: 2, period: 60 },
    avgOrdersDual: { daily: 0, period: 0 },
    attendancePercent: 60,
    utilizationPercent: 60,
    targetAchievementPercent: 50,
    achievementPercent: 50,
    productivityScore: 50,
    riskScore: 50,
    riskLevel: 'yellow',
    ...partial,
  };
}

const fleetTalabat = {
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
  ],
  calendarDays: 30,
  operationalDays: 2,
  uniqueActiveRidersInPeriod: 200,
};

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

const lowCoverageCtx: ControlTowerBuildContext = {
  startDate: '2026-05-01',
  endDate: '2026-05-30',
  operationalPeriodDays: 30,
  ...mkCoverageFields(14.49, 95),
  fleetTalabat,
  supervisorRows: [],
  riders: [
    { code: 'R1', name: 'Rider A', region: 'Z', supervisorCode: 'S1', supervisorName: '', totalHours: 0, totalOrders: 0 },
    { code: 'R2', name: 'Rider B', region: 'Z', supervisorCode: 'S2', supervisorName: 'Supervisor B', totalHours: 50, totalOrders: 5 },
  ],
  performance: [],
  assignedRiderCodes: new Set(['R1', 'R2']),
  fleetDailyTargetHours: 1500,
  headcount: 339,
  inactiveRiders: 50,
  avgHoursPerActiveRider: 4.93,
  supervisorNameByCode: new Map([['S1', 'Resolved Supervisor']]),
};

function main() {
  console.log('=== CONTROL TOWER VALIDATION AUDIT V2 (read-only) ===\n');

  const cov = computeSourceDataCoverage(100, 14.41);
  check(
    'Coverage split fields',
    cov.operationalAnalyticsEnabled &&
      !cov.metadataAnalyticsEnabled &&
      cov.overallReadinessPercent === 14.41 &&
      !cov.strategicKpisEnabled,
    `operational=${cov.operationalAnalyticsEnabled}, metadata=${cov.metadataAnalyticsEnabled}, overall=${cov.overallReadinessPercent}%`
  );

  const lowReport = buildControlTowerReport(lowCoverageCtx);
  check(
    'Operational gate disables insights when ops coverage low',
    !lowReport.insightsEnabled &&
      lowReport.executiveFocus.length === 0 &&
      lowReport.kpiRootCauses.length === 0 &&
      lowReport.topNegativeImpactRiders.length === 0,
    `insightsEnabled=${lowReport.insightsEnabled}, disabledReason set=${Boolean(lowReport.disabledReasonAr)}`
  );

  const alexCtx: ControlTowerBuildContext = {
    ...lowCoverageCtx,
    ...mkCoverageFields(100, 14.41),
  };
  const alexReport = buildControlTowerReport(alexCtx);
  check(
    'Alexandria scenario — ops 100% / metadata 14.41% enables insights',
    alexReport.insightsEnabled && !alexReport.disabled && Boolean(alexReport.metadataLimitedReasonAr),
    `insightsEnabled=${alexReport.insightsEnabled}, metadataLimited=${Boolean(alexReport.metadataLimitedReasonAr)}`
  );
  check(
    'Achievement decomposition remains when gated',
    lowReport.achievementDecomposition.gapHoursDaily === 552.42,
    `gapHoursDaily=${lowReport.achievementDecomposition.gapHoursDaily}`
  );

  const riderCtx: ControlTowerBuildContext = {
    ...lowCoverageCtx,
    ...mkCoverageFields(90, 90),
    riders: [
      { code: 'R1', name: 'Zero Rider', region: 'Z', supervisorCode: 'S1', supervisorName: '', totalHours: 0, totalOrders: 0 },
      { code: 'R2', name: 'Partial', region: 'Z', supervisorCode: 'S1', supervisorName: 'Sup', totalHours: 150, totalOrders: 10 },
    ],
    performance: [
      { date: '2026-05-01', riderCode: 'R1', hours: 0, orders: 0 },
      { date: '2026-05-02', riderCode: 'R1', hours: 0, orders: 0 },
    ],
    supervisorNameByCode: new Map([['S1', 'Resolved Supervisor']]),
  };

  const { riders: resolvedRiders, mapping } = resolveRiderSupervisorNames(riderCtx.riders, riderCtx.supervisorNameByCode);
  check(
    'Supervisor secondary resolution',
    resolvedRiders[0].supervisorName === 'Resolved Supervisor' && mapping.resolvedFromSecondarySource === 1,
    `mapped=${mapping.mappedCount}, unmapped=${mapping.unmappedCount}, secondary=${mapping.resolvedFromSecondarySource}`
  );

  const negativeRiders = buildTopNegativeImpactRiders({ ...riderCtx, riders: resolvedRiders }, 20);
  const zeroRider = negativeRiders.find((r) => r.code === 'R1');
  check(
    'Rider impact uses operational loss not 10h cap',
    zeroRider != null && zeroRider.lostHoursDaily !== 10 && zeroRider.expectedHoursDaily === 4.93,
    `expected=${zeroRider?.expectedHoursDaily}, actual=${zeroRider?.actualHoursDaily}, lost=${zeroRider?.lostHoursDaily}`
  );

  const kero = mkSupervisor({
    code: 'KERO',
    name: 'Kero Maged Wakeel',
    noShowRiders: 18,
    dailyHours: 200,
    achievementPercent: 65,
    inactiveRiders: 12,
    headcount: 40,
    activeRiders: 22,
    utilizationPercent: 55,
  });
  const actCtx = { ...riderCtx, supervisorRows: [kero] };
  const topRiders = buildTopNegativeImpactRiders(actCtx, 5);
  const rawActions = rankActionsByImpact(buildManagementActions(actCtx, [kero], topRiders));
  const focus = buildExecutiveFocus(rawActions, 10);
  const keroInFocus = focus.executiveFocus.filter((a) => a.entityId === 'KERO');
  check(
    'Executive focus one action per supervisor',
    keroInFocus.length <= 1,
    `KERO actions in focus=${keroInFocus.length}, rawTotal=${focus.audit.rawRecoveryHoursTotal}, dedupTotal=${focus.audit.deduplicatedRecoveryHoursTotal}`
  );
  check(
    'Recovery hours deduplicated',
    focus.audit.deduplicatedRecoveryHoursTotal <= focus.audit.rawRecoveryHoursTotal,
    `raw=${focus.audit.rawRecoveryHoursTotal}, dedup=${focus.audit.deduplicatedRecoveryHoursTotal}`
  );

  const periodComparisons = buildPeriodComparisons({
    startDate: actCtx.startDate,
    fleetTalabat: actCtx.fleetTalabat,
    performance: actCtx.performance,
    assignedRiderCodes: actCtx.assignedRiderCodes,
    fleetDailyTargetHours: actCtx.fleetDailyTargetHours,
    headcount: actCtx.headcount,
  });
  const rootCauses = buildKpiRootCauses(actCtx, [kero], periodComparisons);
  const targetHoursCause = rootCauses.find((r) => r.kpiKey === 'targetHours');
  const impliedTarget = supervisorImpliedTargetDaily(kero);
  const topTargetContributor = targetHoursCause?.topSupervisors[0]?.contribution ?? 0;
  check(
    'Target Hours root cause uses implied target metric',
    topTargetContributor === impliedTarget,
    `top contributor=${topTargetContributor}, impliedTarget=${impliedTarget}`
  );

  const highCoverageReport = buildControlTowerReport(actCtx);
  check(
    'Overall reliability score >= 85',
    highCoverageReport.reliability.overallScore >= 85,
    `overall=${highCoverageReport.reliability.overallScore}, classification=${highCoverageReport.reliability.classification}`
  );

  const gatedReliability = lowReport.reliability.overallScore;
  check(
    'Gated low-coverage reliability score >= 85',
    gatedReliability >= 85,
    `overall=${gatedReliability} (gate active, insights N/A scored at 100)`
  );

  const passCount = results.filter((r) => r.pass).length;
  const failCount = results.filter((r) => !r.pass).length;
  console.log(`\n=== SUMMARY: ${passCount} PASS, ${failCount} FAIL ===`);
  console.log(`Reliability (low coverage): ${lowReport.reliability.overallScore}/100`);
  console.log(`Reliability (high coverage sample): ${highCoverageReport.reliability.overallScore}/100`);

  if (failCount > 0) process.exitCode = 1;
}

main();
