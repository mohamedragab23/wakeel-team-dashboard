import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { buildDecisionConfidence } from './decisionConfidence';
import { validateAllForecasts } from './forecastValidation';
import { buildCrossValidationReport } from './crossValidation';
import { buildSupervisorFairnessRanking } from './supervisorFairness';
import { buildExecutiveDecisionBrief } from './executiveDecisionMode';
import { buildCityIntelligence } from './cityIntelligence';
import { buildExecutiveTimeline } from './executiveTimeline';
import { expandRootCauseExplainability } from './rootCauseExplainability';
import { lineageFromAuditTrace } from '../audit/traceToLineage';

describe('SRS-006 Phase 2 engines', () => {
  it('decision confidence levels', () => {
    const high = buildDecisionConfidence({
      coveragePercent: 95,
      ghostLeakagePercent: 0,
      sampleSize: 200,
      recoveryHours: 80,
      trendSupport: true,
    });
    assert.ok(high.confidencePercent >= 70);
    assert.ok(['high', 'very_high'].includes(high.confidenceLevel));
  });

  it('forecast validation mape', () => {
    const rows = validateAllForecasts([
      {
        metricKey: 'hours',
        labelAr: 'ساعات',
        currentValue: 100,
        day7Forecast: 110,
        day14Forecast: 120,
        trend: 'up',
        confidence: 'medium',
        rSquared: 0.8,
      } as never,
    ]);
    assert.equal(rows.length, 1);
    assert.ok(rows[0].reliabilityScore >= 0);
    assert.ok(rows[0].mape > 0);
  });

  it('cross validation report', () => {
    const r = buildCrossValidationReport({
      dailySheetActiveRiders: 100,
      ridersSheetHeadcount: 120,
      hiringJoined: 5,
      executiveNewHires: 5,
      terminations: 2,
      executiveResignations: 2,
      targetFromSupervisors: 2000,
      targetFromFleet: 2000,
      ordersFromTrend: 4000,
      hoursFromFleet: 1800,
    });
    assert.ok(r.checks.length >= 3);
  });

  it('supervisor fairness ranking', () => {
    const base = {
      assignedRiders: 0,
      noShowRiders: 0,
      inactiveRiders: 0,
      suspendedRiders: 0,
      newHires: 0,
      resignations: 0,
      totalHours: 0,
      avgHoursPerRider: 0,
      avgHoursPerRiderDaily: 0,
      avgOrders: 0,
      avgOrdersDaily: 0,
      totalHoursDual: { official: 0, all: 0 },
      avgHoursPerRiderDual: { official: 0, all: 0 },
      avgOrdersDual: { official: 0, all: 0 },
      attendancePercent: 0,
      targetAchievementPercent: 0,
      productivityScore: 0,
      riskLevel: 'green' as const,
    };
    const rows = buildSupervisorFairnessRanking([
      {
        ...base,
        code: 'S1',
        name: 'A',
        region: 'Alexandria',
        headcount: 40,
        activeRiders: 30,
        dailyHours: 200,
        achievementPercent: 80,
        utilizationPercent: 70,
        riskScore: 20,
      },
      {
        ...base,
        code: 'S2',
        name: 'B',
        region: 'Alexandria',
        headcount: 10,
        activeRiders: 9,
        dailyHours: 80,
        achievementPercent: 90,
        utilizationPercent: 85,
        riskScore: 10,
      },
    ]);
    assert.equal(rows.length, 2);
    assert.equal(rows[0].rank, 1);
  });

  it('executive decision brief max 10', () => {
    const b = buildExecutiveDecisionBrief({
      healthScore: 70,
      achievement: 75,
      hoursGap: 200,
      confidence: 80,
      canTrust: true,
    });
    assert.ok(b.bullets.length <= 10);
    assert.ok(b.bullets.length >= 1);
  });

  it('city intelligence', () => {
    const c = buildCityIntelligence({
      zone: 'Alexandria',
      actualHours: 1800,
      targetHours: 2200,
      avgHours: 5,
      ordersPerHour: 2,
    });
    assert.equal(c.city.cityKey, 'Alexandria');
  });

  it('executive timeline', () => {
    const t = buildExecutiveTimeline({
      presentDates: ['2026-07-01'],
      missingDates: ['2026-07-02'],
      newHires: 3,
      resignations: 1,
      criticalAlerts: ['تغطية منخفضة'],
      achievement: 70,
      targetHours: 2000,
      generatedAt: new Date().toISOString(),
    });
    assert.ok(t.length >= 2);
  });

  it('root cause explainability', () => {
    const rows = expandRootCauseExplainability([
      {
        kpiKey: 'achievementPercent',
        summaryAr: 'إنجاز منخفض',
        factors: [{ labelAr: 'No-Show', value: '20', impactAr: 'فقدان ساعات' }],
        trend: { deltaPercent7: -5, deltaPercent14: -8 },
        topSupervisors: [{ code: 'S1', name: 'A', contribution: 30, unit: 'س' }],
        topCities: [],
      } as never,
    ]);
    assert.equal(rows[0].kpiKey, 'achievementPercent');
    assert.ok(rows[0].suggestedFixAr);
  });

  it('lineage from audit trace', () => {
    const lin = lineageFromAuditTrace({
      kpi: 'actualHours',
      formula: 'sum(hours)',
      numerator: 100,
      numeratorLabel: 'hours',
      denominator: 1,
      denominatorLabel: 'day',
      result: 100,
      rawDataSource: 'Daily Performance',
      recordsRead: 50,
      status: 'valid',
    } as never);
    assert.equal(lin.kpi, 'actualHours');
    assert.ok(lin.calculationSteps.length >= 3);
  });
});
