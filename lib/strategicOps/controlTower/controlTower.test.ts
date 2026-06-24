import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { buildExecutiveFocus } from '@/lib/strategicOps/controlTower/executiveFocus';
import { buildControlTowerReport } from '@/lib/strategicOps/controlTower/index';
import { rankActionsByImpact } from '@/lib/strategicOps/controlTower/managementActions';
import { buildTopNegativeImpactRiders } from '@/lib/strategicOps/controlTower/riderImpact';
import { resolveRiderSupervisorNames } from '@/lib/strategicOps/controlTower/supervisorMapping';
import type { ControlTowerBuildContext, ManagementAction } from '@/lib/strategicOps/controlTower/types';

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

function mkAction(partial: Partial<ManagementAction> & Pick<ManagementAction, 'id' | 'entityId'>): ManagementAction {
  return {
    priority: 'high',
    entityType: 'supervisor',
    entityName: partial.entityId,
    problemAr: 'p',
    actionAr: 'act',
    expectedRecoveryHours: 10,
    evidence: '',
    rawRecoveryHours: 10,
    deduplicatedRecoveryHours: 10,
    ...partial,
  };
}

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

describe('controlTower', () => {
  it('ranks actions by priority then recovery hours', () => {
    const actions: ManagementAction[] = [
      mkAction({ id: 'a', entityId: '1', priority: 'medium', expectedRecoveryHours: 100, rawRecoveryHours: 100, deduplicatedRecoveryHours: 100 }),
      mkAction({ id: 'b', entityId: '2', priority: 'critical', expectedRecoveryHours: 10, rawRecoveryHours: 10, deduplicatedRecoveryHours: 10 }),
    ];
    const ranked = rankActionsByImpact(actions);
    assert.equal(ranked[0].id, 'b');
    assert.equal(ranked[1].id, 'a');
  });

  it('deduplicates executive focus to one action per entity', () => {
    const actions: ManagementAction[] = [
      mkAction({ id: 'sup-hours-KERO', entityId: 'KERO', expectedRecoveryHours: 107, rawRecoveryHours: 107, deduplicatedRecoveryHours: 107 }),
      mkAction({ id: 'sup-inactive-KERO', entityId: 'KERO', expectedRecoveryHours: 72, rawRecoveryHours: 72, deduplicatedRecoveryHours: 72 }),
    ];
    const result = buildExecutiveFocus(actions, 10);
    assert.equal(result.executiveFocus.length, 1);
    assert.equal(result.executiveFocus[0].entityId, 'KERO');
    assert.ok(result.audit.rawRecoveryHoursTotal > result.audit.deduplicatedRecoveryHoursTotal);
  });

  it('caps executive focus at 10 unique entities', () => {
    const actions: ManagementAction[] = Array.from({ length: 15 }, (_, i) =>
      mkAction({
        id: String(i),
        entityId: String(i),
        expectedRecoveryHours: 15 - i,
        rawRecoveryHours: 15 - i,
        deduplicatedRecoveryHours: 15 - i,
      })
    );
    assert.equal(buildExecutiveFocus(actions, 10).executiveFocus.length, 10);
  });

  it('gates insights when operational coverage is below 80%', () => {
    const ctx: ControlTowerBuildContext = {
      startDate: '2026-05-01',
      endDate: '2026-05-30',
      operationalPeriodDays: 30,
      ...mkCoverageFields(14.49, 95),
      fleetTalabat: baseFleet,
      supervisorRows: [],
      riders: [],
      performance: [],
      assignedRiderCodes: new Set(),
      fleetDailyTargetHours: 500,
      headcount: 100,
      inactiveRiders: 10,
      avgHoursPerActiveRider: 5,
      supervisorNameByCode: new Map(),
    };
    const report = buildControlTowerReport(ctx);
    assert.equal(report.insightsEnabled, false);
    assert.equal(report.executiveFocus.length, 0);
    assert.equal(report.kpiRootCauses.length, 0);
    assert.equal(report.topNegativeImpactRiders.length, 0);
    assert.ok(report.achievementDecomposition.gapHoursDaily > 0);
  });

  it('enables insights when operational coverage is high even if metadata is low', () => {
    const ctx: ControlTowerBuildContext = {
      startDate: '2026-06-15',
      endDate: '2026-06-22',
      operationalPeriodDays: 8,
      ...mkCoverageFields(100, 14.41),
      fleetTalabat: baseFleet,
      supervisorRows: [],
      riders: [],
      performance: [],
      assignedRiderCodes: new Set(),
      fleetDailyTargetHours: 500,
      headcount: 100,
      inactiveRiders: 10,
      avgHoursPerActiveRider: 5,
      supervisorNameByCode: new Map(),
    };
    const report = buildControlTowerReport(ctx);
    assert.equal(report.insightsEnabled, true);
    assert.equal(report.disabled, false);
    assert.ok(report.metadataLimitedReasonAr);
    assert.ok(report.supervisorScorecards.all.length >= 0);
  });

  it('uses fleet avg hours for rider loss instead of fixed 10h cap', () => {
    const ctx: ControlTowerBuildContext = {
      startDate: '2026-05-01',
      endDate: '2026-05-30',
      operationalPeriodDays: 30,
      ...mkCoverageFields(90, 90),
      fleetTalabat: baseFleet,
      supervisorRows: [],
      riders: [
        { code: 'R1', name: 'Zero Rider', region: 'Z', supervisorCode: 'S1', supervisorName: 'Sup', totalHours: 0, totalOrders: 0 },
      ],
      performance: [
        { date: '2026-05-01', riderCode: 'R1', hours: 0, orders: 0 },
        { date: '2026-05-02', riderCode: 'R1', hours: 0, orders: 0 },
      ],
      assignedRiderCodes: new Set(['R1']),
      fleetDailyTargetHours: 500,
      headcount: 100,
      inactiveRiders: 10,
      avgHoursPerActiveRider: 4.93,
      supervisorNameByCode: new Map([['S1', 'Supervisor One']]),
    };
    const riders = buildTopNegativeImpactRiders(ctx, 20);
    const zeroRider = riders.find((r) => r.code === 'R1');
    assert.ok(zeroRider);
    assert.notEqual(zeroRider!.lostHoursDaily, 10);
    assert.equal(zeroRider!.expectedHoursDaily, 4.93);
    assert.equal(zeroRider!.actualHoursDaily, 0);
  });

  it('resolves empty supervisor names from mapping', () => {
    const { riders, mapping } = resolveRiderSupervisorNames(
      [
        {
          code: 'R1',
          name: 'Rider',
          region: 'Z',
          supervisorCode: 'S1',
          supervisorName: '',
          totalHours: 10,
          totalOrders: 1,
        },
      ],
      new Map([['S1', 'Mapped Supervisor']])
    );
    assert.equal(riders[0].supervisorName, 'Mapped Supervisor');
    assert.equal(mapping.resolvedFromSecondarySource, 1);
    assert.equal(mapping.mappedCount, 1);
  });
});
