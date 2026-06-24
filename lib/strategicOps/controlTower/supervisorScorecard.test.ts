import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  buildBottomPerformerDiagnosis,
  computeCompositeScore,
  computeSupervisorLostHoursDaily,
  computeSupervisorNoShowPercent,
  buildSupervisorScorecards,
} from '@/lib/strategicOps/controlTower/supervisorScorecard';
import { supervisorLostTargetDaily } from '@/lib/strategicOps/controlTower/supervisorMetrics';
import type { SupervisorOpsRow } from '@/lib/strategicOps/buildReport';
import type { ControlTowerBuildContext } from '@/lib/strategicOps/controlTower/types';

const baseFleet = {
  headcount: 100,
  activeRiders: 80,
  noShowRiders: 5,
  actualHours: 400,
  targetHours: 500,
  achievementPercent: 80,
  avgHoursPerActiveRider: 5,
  utilizationPercent: 80,
  dailySeries: [],
  calendarDays: 30,
  operationalDays: 30,
  uniqueActiveRidersInPeriod: 80,
};

function mkSupervisor(partial: Partial<SupervisorOpsRow> & Pick<SupervisorOpsRow, 'code' | 'name'>): SupervisorOpsRow {
  return {
    region: 'Alexandria',
    headcount: 40,
    assignedRiders: 40,
    activeRiders: 25,
    noShowRiders: 8,
    inactiveRiders: 5,
    suspendedRiders: 0,
    newHires: 0,
    resignations: 0,
    totalHours: 3000,
    dailyHours: 120,
    avgHoursPerRider: 75,
    avgHoursPerRiderDaily: 4.8,
    avgOrders: 0,
    avgOrdersDaily: 0,
    totalHoursDual: { daily: 100, period: 3000 },
    avgHoursPerRiderDual: { daily: 2.5, period: 75 },
    avgOrdersDual: { daily: 0, period: 0 },
    attendancePercent: 62,
    utilizationPercent: 62,
    targetAchievementPercent: 55,
    achievementPercent: 55,
    productivityScore: 50,
    riskScore: 40,
    riskLevel: 'yellow',
    ...partial,
  };
}

describe('supervisorScorecard', () => {
  it('computes no-show percent from operational fields only', () => {
    const s = mkSupervisor({ code: 'S1', name: 'Sup One', noShowRiders: 10, headcount: 50 });
    assert.equal(computeSupervisorNoShowPercent(s), 20);
  });

  it('computes lost hours daily from team expected hours', () => {
    const s = mkSupervisor({ code: 'S1', name: 'Sup One', headcount: 10, dailyHours: 40 });
    assert.equal(computeSupervisorLostHoursDaily(s, 5), 10);
  });

  it('ranks top performers by composite score descending', () => {
    const good = mkSupervisor({
      code: 'GOOD',
      name: 'Good Sup',
      achievementPercent: 90,
      utilizationPercent: 85,
      noShowRiders: 2,
      headcount: 40,
      dailyHours: 200,
    });
    const bad = mkSupervisor({
      code: 'BAD',
      name: 'Bad Sup',
      achievementPercent: 40,
      utilizationPercent: 45,
      noShowRiders: 15,
      headcount: 40,
      dailyHours: 80,
      inactiveRiders: 12,
    });
    const ctx: ControlTowerBuildContext = {
      startDate: '2026-06-01',
      endDate: '2026-06-30',
      operationalPeriodDays: 30,
      operationalCoveragePercent: 100,
      metadataCoveragePercent: 14,
      overallReadinessPercent: 14,
      operationalAnalyticsEnabled: true,
      metadataAnalyticsEnabled: false,
      dataCoveragePercent: 100,
      strategicKpisEnabled: false,
      fleetTalabat: baseFleet,
      supervisorRows: [bad, good],
      riders: [],
      performance: [],
      assignedRiderCodes: new Set(),
      fleetDailyTargetHours: 500,
      headcount: 100,
      inactiveRiders: 10,
      avgHoursPerActiveRider: 5,
      supervisorNameByCode: new Map(),
    };
    const report = buildSupervisorScorecards({
      ctx,
      kpiRootCauses: [],
      topNegativeImpactRiders: [],
      allActions: [],
    });
    assert.equal(report.topPerformers[0].code, 'GOOD');
    assert.equal(report.bottomPerformers[0].code, 'BAD');
    assert.ok(report.bottomPerformers[0].bottomPerformerDiagnosis);
    assert.equal(report.all.length, 2);
    assert.equal(report.all[0].scorecardRank, 1);
  });

  it('provides drill-down with linked actions for supervisor', () => {
    const s = mkSupervisor({ code: 'KERO', name: 'Kero', noShowRiders: 18, headcount: 40 });
    const ctx: ControlTowerBuildContext = {
      startDate: '2026-06-01',
      endDate: '2026-06-30',
      operationalPeriodDays: 30,
      operationalCoveragePercent: 100,
      metadataCoveragePercent: 0,
      overallReadinessPercent: 0,
      operationalAnalyticsEnabled: true,
      metadataAnalyticsEnabled: false,
      dataCoveragePercent: 100,
      strategicKpisEnabled: false,
      fleetTalabat: baseFleet,
      supervisorRows: [s],
      riders: [],
      performance: [],
      assignedRiderCodes: new Set(),
      fleetDailyTargetHours: 500,
      headcount: 40,
      inactiveRiders: 5,
      avgHoursPerActiveRider: 5,
      supervisorNameByCode: new Map(),
    };
    const actions = [
      {
        id: 'sup-noshow-KERO',
        priority: 'critical' as const,
        entityType: 'supervisor' as const,
        entityId: 'KERO',
        entityName: 'Kero',
        problemAr: 'no show',
        actionAr: 'call',
        expectedRecoveryHours: 50,
        rawRecoveryHours: 50,
        deduplicatedRecoveryHours: 50,
        evidence: '',
      },
    ];
    const report = buildSupervisorScorecards({
      ctx,
      kpiRootCauses: [],
      topNegativeImpactRiders: [],
      allActions: actions,
    });
    const drill = report.drillDownByCode.KERO;
    assert.ok(drill);
    assert.equal(drill.executiveActions.length, 1);
    assert.equal(drill.kpiBreakdown.teamSize, 40);
  });

  it('diagnosis includes missing hours and recommended action', () => {
    const s = mkSupervisor({
      code: 'X',
      name: 'X',
      noShowRiders: 20,
      headcount: 40,
      utilizationPercent: 50,
      achievementPercent: 45,
    });
    const lostH = computeSupervisorLostHoursDaily(s, 5);
    const lostT = supervisorLostTargetDaily(s);
    const d = buildBottomPerformerDiagnosis(s, lostH, lostT);
    assert.ok(d.whyAr.length > 0);
    assert.ok(d.missingHoursDaily >= 0);
    assert.ok(d.mainIssueAr.length > 0);
    assert.ok(d.recommendedActionAr.length > 0);
  });

  it('composite score increases with better achievement', () => {
    const low = mkSupervisor({ code: 'L', name: 'L', achievementPercent: 40, utilizationPercent: 40 });
    const high = mkSupervisor({ code: 'H', name: 'H', achievementPercent: 90, utilizationPercent: 85 });
    const maxLost = 100;
    const lowScore = computeCompositeScore(low, supervisorLostTargetDaily(low), maxLost);
    const highScore = computeCompositeScore(high, supervisorLostTargetDaily(high), maxLost);
    assert.ok(highScore > lowScore);
  });
});
