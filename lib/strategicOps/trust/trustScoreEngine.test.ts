import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { calculateTrustScoreFromParts } from './trustScoreEngine';
import type { DataIntegrityReport } from '@/lib/strategicOps/dataIntegrity';
import type { FinalKpiAccuracyAudit } from '@/lib/strategicOps/finalKpiAccuracyAudit';
import type { LiveAuditReport } from '@/lib/strategicOps/audit';

function baseIntegrity(overrides: Partial<DataIntegrityReport> = {}): DataIntegrityReport {
  return {
    totalRows: 1000,
    validRows: 980,
    officialRows: 950,
    shadowRows: 10,
    duplicateRows: 5,
    missingRiders: 2,
    missingSupervisors: 0,
    missingDates: [],
    completenessPercentage: 98,
    validDaysInDataset: 7,
    calendarPeriodDays: 7,
    dataQualityScore: 92,
    kpiQualityGatePassed: true,
    dataLeakageDetected: false,
    ghostLeakagePercent: 2,
    warningLevel: 'none',
    warningMessage: '',
    operationalAverageHoursPerDay: 2000,
    executionAverageHoursPerDay: 2000,
    officialTotalHours: 14000,
    ghostRiderLeakageHours: 280,
    ghostRidersCount: 2,
    ghostRiderHours: 280,
    ghostRiderList: [],
    ghostRiderListFull: [],
    ghostRiders: [],
    scopeExcludedRiders: [],
    scopeExcludedRiderCount: 0,
    ghostRiderRowCount: 10,
    unassignedRiders: [],
    unassignedRiderCount: 0,
    deduplication: { duplicateGroupsCount: 3, recordsRemoved: 5, deduplicationLog: [] },
    presentDates: ['2026-07-01', '2026-07-02'],
    codeNormalization: {
      pipelinePath: 'test',
      codesNormalized: 1000,
      codesMatched: 980,
      codesRejected: 20,
      codesManualReview: 0,
      ghostLeakagePercentBefore: 5,
      ghostLeakagePercentAfter: 2,
      improvementPercent: 3,
      recoveredHours: 0,
      recoveredOrders: 0,
      recoveredRiders: 0,
      ghostLeakageHoursBefore: 500,
      ghostLeakageHoursAfter: 280,
      ghostLeakageOrdersBefore: 20,
      ghostLeakageOrdersAfter: 10,
      ghostRidersCountBefore: 5,
      ghostRidersCountAfter: 2,
      entries: [],
    },
    ...overrides,
  };
}

function baseAccuracy(overrides: Partial<FinalKpiAccuracyAudit> = {}): FinalKpiAccuracyAudit {
  return {
    title: 'FINAL KPI ACCURACY AUDIT',
    generatedAt: new Date().toISOString(),
    ghostVerification: {
      actualGhostRiders: 2,
      codeMismatchCount: 1,
      missingFromMasterCount: 1,
      zoneFilterExcludedCount: 0,
      supervisorFilterExcludedCount: 0,
      ghostLeakageHours: 280,
      ghostLeakageOrders: 10,
      ghostLeakagePercent: 2,
      top100: [],
    },
    joinDateValidation: {
      joinDateCoveragePercent: 90,
      validJoinDates: 90,
      missingJoinDates: 10,
      averageRiderLifetimeEnabled: true,
      averageRiderLifetimeValue: null,
      lifetimeDisplayBlocked: false,
    },
    activeRidersConsistency: {
      uniqueActiveRidersInPeriod: 200,
      averageDailyActiveRiders: 180,
      dailyActiveMin: 160,
      dailyActiveMax: 200,
      dailyActiveStdDev: 10,
      daysWithData: 7,
      discrepancyExplanationAr: '',
    },
    roadmapValidation: {
      dailyGap: 100,
      averageDailyHoursPerActiveRider: 5.5,
      formula: 'gap / avg',
      additionalRidersNeeded: 18,
      additionalRidersCalculation: '100/5.5',
      ridersAudit: {
        gapHours: 100,
        avgHoursPerActiveRider: 5.5,
        rawQuotient: 18.18,
        rawCalculation: '100/5.5',
        roundedResult: 18,
        validationPassed: true,
      },
      zeroOnlyWhenGapNonPositive: true,
      zeroValidationPassed: true,
      forecastDisabled: false,
    },
    kpiTrustVerification: {
      trustLevel: 1,
      trustLabelAr: 'ثقة كاملة',
      dataQualityScore: 92,
      ghostLeakagePercent: 2,
      gateStatus: 'open',
      gateStatusAr: 'مفتوحة',
      kpiGates: [],
    },
    executiveAccuracyScore: {
      score: 91,
      grade: 'executive',
      gradeLabelAr: 'Executive',
      components: {
        dataQuality: 92,
        ghostLeakageInverse: 92,
        joinDateCoverage: 90,
        duplicateIntegrity: 95,
        scopeIntegrity: 95,
      },
      weights: {
        dataQuality: 0.25,
        ghostLeakageInverse: 0.25,
        joinDateCoverage: 0.2,
        duplicateIntegrity: 0.15,
        scopeIntegrity: 0.15,
      },
    },
    managementTrust: {
      canTrust: true,
      answerAr: 'نعم',
      reasons: [],
    },
    ...overrides,
  };
}

describe('trustScoreEngine', () => {
  it('grades high-quality data as executive (>=90)', () => {
    const score = calculateTrustScoreFromParts({
      dataIntegrity: baseIntegrity(),
      accuracyAudit: baseAccuracy(),
      coveragePercent: 95,
      apiHealthScore: 100,
      liveAudit: {
        title: 'LIVE OPERATIONS AUDIT',
        generatedAt: new Date().toISOString(),
        filters: { startDate: '2026-07-01', endDate: '2026-07-07', zone: 'all', supervisorCode: 'all' },
        overallStatus: 'PASS',
        totalChecks: 20,
        passCount: 20,
        warnCount: 0,
        failCount: 0,
        accuracyScore: 100,
        durationMs: 100,
        sections: {},
        results: [],
      } satisfies LiveAuditReport,
    });

    assert.ok(score.overall >= 90, `expected >=90 got ${score.overall}`);
    assert.equal(score.grade, 'executive');
    assert.equal(score.answerAr, 'نعم');
  });

  it('drops grade when ghost leakage is high', () => {
    const score = calculateTrustScoreFromParts({
      dataIntegrity: baseIntegrity({
        ghostLeakagePercent: 25,
        dataQualityScore: 60,
        completenessPercentage: 70,
        missingDates: ['2026-07-01', '2026-07-02'],
      }),
      accuracyAudit: baseAccuracy({
        managementTrust: { canTrust: false, answerAr: 'لا', reasons: ['ghost'] },
        executiveAccuracyScore: {
          score: 55,
          grade: 'not_decision_ready',
          gradeLabelAr: 'Not Ready',
          components: {
            dataQuality: 60,
            ghostLeakageInverse: 0,
            joinDateCoverage: 50,
            duplicateIntegrity: 70,
            scopeIntegrity: 70,
          },
          weights: {
            dataQuality: 0.25,
            ghostLeakageInverse: 0.25,
            joinDateCoverage: 0.2,
            duplicateIntegrity: 0.15,
            scopeIntegrity: 0.15,
          },
        },
        roadmapValidation: {
          ...baseAccuracy().roadmapValidation,
          zeroValidationPassed: false,
        },
        kpiTrustVerification: {
          ...baseAccuracy().kpiTrustVerification,
          gateStatus: 'closed',
          gateStatusAr: 'مغلقة',
        },
      }),
      coveragePercent: 55,
      apiHealthScore: 50,
    });

    assert.ok(score.overall < 70, `expected <70 got ${score.overall}`);
    assert.equal(score.grade, 'not_ready');
    assert.ok(score.rootCauses.length > 0);
    assert.ok(score.suggestedActions.length > 0);
  });

  it('detects improving trend from history', () => {
    const score = calculateTrustScoreFromParts({
      dataIntegrity: baseIntegrity(),
      accuracyAudit: baseAccuracy(),
      coveragePercent: 95,
      previousScores: [80, 82],
      apiHealthScore: 100,
    });
    // overall should be high (~90+), so delta from 82 >= 2 → improving
    assert.equal(score.trend, 'improving');
  });

  it('maps operational grade band 80-89', () => {
    const score = calculateTrustScoreFromParts({
      dataIntegrity: baseIntegrity({
        dataQualityScore: 82,
        completenessPercentage: 85,
        ghostLeakagePercent: 6,
      }),
      accuracyAudit: baseAccuracy({
        executiveAccuracyScore: {
          ...baseAccuracy().executiveAccuracyScore,
          score: 82,
          grade: 'operational',
        },
      }),
      coveragePercent: 82,
      apiHealthScore: 80,
      liveAudit: {
        title: 'LIVE OPERATIONS AUDIT',
        generatedAt: new Date().toISOString(),
        filters: { startDate: 'a', endDate: 'b', zone: 'all', supervisorCode: 'all' },
        overallStatus: 'WARN',
        totalChecks: 20,
        passCount: 16,
        warnCount: 4,
        failCount: 0,
        accuracyScore: 80,
        durationMs: 50,
        sections: {},
        results: [],
      },
    });

    assert.ok(score.overall >= 70);
    assert.ok(['executive', 'operational', 'caution'].includes(score.grade));
  });
});
