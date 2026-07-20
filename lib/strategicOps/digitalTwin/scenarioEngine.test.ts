import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { applyLevers, runSimulation, SCENARIO_PRESETS } from './scenarioEngine';
import { compareScenarios, pickBestScenario } from './compareScenarios';
import { cloneTwin } from './twinBuilder';
import { simulateHiring } from './hiringSimulation';
import { simulateTarget } from './targetSimulation';
import type { DigitalTwinState } from './types';

function mockTwin(): DigitalTwinState {
  return {
    meta: {
      generatedAt: new Date().toISOString(),
      filters: { startDate: '2026-07-01', endDate: '2026-07-07', zone: 'all', supervisorCode: 'all' },
      sourceReportGeneratedAt: new Date().toISOString(),
      version: '1.0.0',
      periodDays: 7,
    },
    fleet: {
      headcount: 200,
      activeRiders: 150,
      actualHours: 800,
      targetHours: 1000,
      orders: 1600,
      ordersPerHour: 2,
      avgHours: 5.33,
      utilization: 75,
      lostHours: 200,
      lostHoursPercent: 20,
      achievement: 80,
      healthScore: 78,
      noShowRiders: 20,
      inactiveRiders: 30,
      operationalDays: 7,
    },
    supervisors: [
      {
        code: 'S1',
        name: 'Weak',
        zone: 'A',
        headcount: 50,
        activeRiders: 30,
        hours: 150,
        target: 250,
        achievement: 60,
        riskScore: 70,
      },
      {
        code: 'S2',
        name: 'Strong',
        zone: 'A',
        headcount: 50,
        activeRiders: 45,
        hours: 280,
        target: 250,
        achievement: 95,
        riskScore: 20,
      },
    ],
    ridersSummary: { inactive: 30, noShow: 20, suspended: 5, newHires: 10, resignations: 3 },
    economics: {
      revenuePerOrder: 18,
      costPerActiveRiderDay: 120,
      hiringCostPerRider: 1500,
      trainingCostPerRider: 500,
      equipmentCostPerRider: 800,
      currency: 'EGP',
      source: 'default',
    },
    quality: {
      coveragePercent: 92,
      ghostLeakagePercent: 2,
      dataQualityScore: 90,
      trustScoreHint: 88,
    },
    recoveryCeilings: {
      maxRecoveryByNoShow: 100,
      maxRecoveryByBreak: 40,
      maxRecoveryByLate: 30,
      maxRecoveryByInactive: 80,
    },
  };
}

describe('digitalTwin scenarioEngine', () => {
  it('clones twin — mutation does not affect baseline', () => {
    const baseline = mockTwin();
    const copy = cloneTwin(baseline);
    copy.fleet.actualHours = 9999;
    assert.equal(baseline.fleet.actualHours, 800);
  });

  it('hiring increases headcount and hours', () => {
    const twin = mockTwin();
    const projected = applyLevers(twin, { hireRiders: 10 });
    assert.ok(projected.fleet.headcount > twin.fleet.headcount);
    assert.ok(projected.fleet.actualHours > twin.fleet.actualHours);
  });

  it('hiring ROI estimate is finite', () => {
    const twin = mockTwin();
    const h = simulateHiring(twin.fleet, twin.economics, 20);
    assert.equal(h.hireRiders, 20);
    assert.ok(h.hoursGained > 0);
    assert.ok(Number.isFinite(h.roiPercent));
  });

  it('target simulation computes hiring need', () => {
    const twin = mockTwin();
    const t = simulateTarget(twin.fleet, 1200);
    assert.equal(t.newTargetHours, 1200);
    assert.ok(t.hiringNeed > 0);
    assert.ok(t.probabilityOfSuccess >= 5 && t.probabilityOfSuccess <= 95);
  });

  it('preset A hire 50 runs end-to-end', () => {
    const result = runSimulation(mockTwin(), SCENARIO_PRESETS.A_hire_50.levers);
    assert.ok(result.impact.deltas.headcount > 0);
    assert.ok(result.decision.confidence > 0);
    assert.ok(result.timeline.nextMonth.actualHours > 0);
    assert.ok(result.optimizationHints.length > 0);
  });

  it('compareScenarios marks a best row', () => {
    const a = runSimulation(mockTwin(), { hireRiders: 10 });
    const b = runSimulation(mockTwin(), { absenteeismReductionPercent: 20 });
    const rows = compareScenarios([
      { id: 'a', title: 'Hire', result: a },
      { id: 'b', title: 'Absence', result: b },
    ]);
    assert.equal(rows.filter((r) => r.isBest).length, 1);
    const best = pickBestScenario([
      { id: 'a', title: 'Hire', result: a },
      { id: 'b', title: 'Absence', result: b },
    ]);
    assert.ok(best);
  });

  it('recovery levers increase hours without changing production twin', () => {
    const twin = mockTwin();
    const before = twin.fleet.actualHours;
    const projected = applyLevers(twin, { noShowRecoveryPct: 50, breakRecoveryPct: 50 });
    assert.equal(twin.fleet.actualHours, before);
    assert.ok(projected.fleet.actualHours > before);
  });
});
