import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { simulateCityExpansion } from './cityExpansion';
import { computeLearningMetrics } from './modelLearning';
import { generateOptimalPlan } from './matureOptimization';
import { getUnitEconomicsConfig } from './config/unitEconomics';
import type { DigitalTwinState } from './types';

function stubTwin(): DigitalTwinState {
  return {
    meta: {
      generatedAt: new Date().toISOString(),
      filters: {
        startDate: '2026-07-01',
        endDate: '2026-07-07',
        zone: 'Alexandria',
        supervisorCode: 'all',
      },
      sourceReportGeneratedAt: new Date().toISOString(),
      version: '1.0.0',
      periodDays: 7,
    },
    fleet: {
      headcount: 100,
      activeRiders: 70,
      actualHours: 1400,
      targetHours: 2000,
      orders: 2800,
      ordersPerHour: 2,
      avgHours: 5,
      utilization: 70,
      lostHours: 200,
      lostHoursPercent: 12,
      achievement: 70,
      healthScore: 65,
      noShowRiders: 15,
      inactiveRiders: 10,
      operationalDays: 7,
    },
    supervisors: [],
    ridersSummary: {
      inactive: 10,
      noShow: 15,
      suspended: 2,
      newHires: 5,
      resignations: 1,
    },
    economics: getUnitEconomicsConfig(),
    quality: {
      coveragePercent: 90,
      ghostLeakagePercent: 1,
      dataQualityScore: 88,
      trustScoreHint: 85,
    },
  };
}

describe('SRS-007 Phase 2 engines', () => {
  it('city expansion open break-even', () => {
    const r = simulateCityExpansion(getUnitEconomicsConfig(), {
      action: 'open',
      cityKey: 'Alexandria',
      seedHeadcount: 80,
    });
    assert.equal(r.action, 'open');
    assert.ok(r.cost.totalSetup > 0);
    assert.ok(r.breakEvenMonths == null || r.breakEvenMonths >= 0);
  });

  it('city expansion close', () => {
    const r = simulateCityExpansion(
      getUnitEconomicsConfig(),
      { action: 'close', cityKey: 'Alexandria' },
      { headcount: 50, actualHours: 800, orders: 1600 }
    );
    assert.equal(r.breakEvenMonths, 0);
    assert.equal(r.operationalComplexity, 'severe');
  });

  it('learning metrics empty', () => {
    const m = computeLearningMetrics([]);
    assert.equal(m.sampleSize, 0);
    assert.equal(m.accuracyScore, 0);
  });

  it('learning metrics with actuals', () => {
    const m = computeLearningMetrics([
      {
        scenarioId: '1',
        predictedAt: '2026-07-01',
        predictedHours: 100,
        predictedOrders: 200,
        predictedAchievement: 80,
        actualHours: 90,
        actualOrders: 180,
        actualAchievement: 75,
        recordedAt: '2026-07-10',
      },
    ]);
    assert.equal(m.sampleSize, 1);
    assert.ok(m.mapeHours != null && m.mapeHours > 0);
    assert.ok(m.accuracyScore > 0);
  });

  it('mature optimal plan', () => {
    const plan = generateOptimalPlan(stubTwin());
    assert.ok(plan.recommendedLevers);
    assert.ok(plan.rationaleAr.length >= 1);
    assert.ok(plan.expectedAchievement >= 0);
  });
});
