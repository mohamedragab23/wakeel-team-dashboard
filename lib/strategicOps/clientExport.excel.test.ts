import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { readWorkbook } from '@/lib/excelAdapter';
import type { StrategicOpsReport } from '@/lib/strategicOps/buildReport';
import {
  STRATEGIC_OPS_EXCEL_SHEET_NAMES,
  buildStrategicOpsExcelBuffer,
} from '@/lib/strategicOps/clientExport';

function stubReport(): StrategicOpsReport {
  return {
    meta: {
      startDate: '2026-08-01',
      endDate: '2026-08-07',
      zone: 'all',
      supervisorCode: 'all',
      validDaysInDataset: 7,
      periodDays: 7,
    },
    executiveSummary: {
      totalRegisteredRiders: 10,
      activeRiders: 8,
      noShowRiders: 2,
      actualDailyHours: 80,
      targetDailyHours: 100,
      achievementPercent: 80,
      avgHoursPerActiveRider: 10,
      utilizationRate: 70,
      uniqueActiveRidersInPeriod: 9,
      approvedResignations: 1,
      attritionRate: 5,
    },
    operationalHealth: { disabled: false, score: 88 },
    talabatOperations: {
      headcount: 10,
      activeRiders: 8,
      noShowRiders: 2,
      actualHours: 80,
      targetHours: 100,
      achievementPercent: 80,
      avgHoursPerActiveRider: 10,
      utilizationPercent: 70,
    },
    talabatAccuracyScore: { overallAccuracyPercent: 99, matches: [] },
    dataIntegrity: {
      dataQualityScore: 90,
      operationalAverageHoursPerDay: 80,
      executionAverageHoursPerDay: 82,
      totalRows: 100,
      officialRows: 90,
      shadowRows: 10,
      deduplication: { recordsRemoved: 1 },
      ghostRiderLeakageHours: 3,
      ghostLeakagePercent: 2,
      completenessPercentage: 100,
      missingDates: [],
      ghostRidersCount: 1,
      unassignedRiderCount: 0,
    },
    ghostRiderAudit: {
      riders: [
        {
          rawRiderCode: 'RAW-1',
          riderCode: 'R1',
          riderName: 'مندوب شبح',
          supervisorName: 'مشرف',
          supervisorCode: 'S1',
          totalHours: 12,
          totalOrders: 4,
          workDays: 2,
          category: 'missing_master',
          reasonAr: 'غائب من المناديب',
          masterCodeIfFound: null,
        },
      ],
      totalGhostRiders: 1,
      totalScopeExcludedRiders: 0,
      rootCauseSummary: {
        codeMismatchPercent: 0,
        missingMasterPercent: 100,
        normalizationFailedPercent: 0,
        zoneFilteringPercent: 0,
        supervisorMappingPercent: 0,
      },
    },
    joinDateAudit: {
      riders: [{ riderCode: 'R1', name: 'مندوب', joinDate: '2026-01-01', supervisorCode: 'S1', hasValidJoinDate: true }],
    },
    kpiTrust: {
      level: 'high',
      labelAr: 'ثقة عالية',
      dataQualityScore: 90,
      ghostLeakagePercent: 2,
      fullStrategicKpis: true,
      disableStiOrpsGrowthRoadmap: false,
    },
    hoursRoadmap: {
      dailyGap: 20,
      additionalActiveRidersNeeded: 2,
      calculationTrace: {
        avgDailyHoursPerActiveRider: 10,
        formula: 'gap / avg',
        dailyGapCalculation: '100-80',
        additionalRidersCalculation: '20/10',
      },
      ridersAudit: {
        gapHours: 20,
        avgHoursPerActiveRider: 10,
        rawCalculation: 2,
        roundedResult: 2,
        validationPassed: true,
      },
    },
    postNormalizationValidation: {
      generatedAt: '2026-08-08T00:00:00.000Z',
      proofStatementAr: 'تم التحقق',
      ghostBefore: { ridersCount: 5, hours: 50, orders: 10, percent: 10 },
      ghostAfter: { ridersCount: 1, hours: 12, orders: 4, percent: 2 },
      recovery: { riders: 4, hours: 38, orders: 6, improvementPercent: 80 },
      rootCauseFixes: { directMatch: 2, suffixRemoval: 1, numericExtraction: 1, manualReview: 0 },
      confidenceDistribution: { pct100: 2, pct95: 1, pct90: 1, below90: 0 },
      executiveConclusion: {
        primaryCauseAr: 'تنسيق الكود',
        codeFormattingProblemPercent: 80,
        missingRidersInMasterPercent: 20,
      },
      trustImpact: {
        before: { trustLevel: 'low', executiveAccuracyScore: 40, canTrustAnswerAr: 'لا' },
        after: { trustLevel: 'high', executiveAccuracyScore: 90, canTrustAnswerAr: 'نعم' },
        accuracyScoreDelta: 50,
        ghostLeakageDelta: -8,
      },
      top50Recovered: [
        {
          originalCode: 'RAW-2',
          normalizedCode: 'R2',
          hoursRecovered: 10,
          ordersRecovered: 3,
          confidence: 100,
          matchMethod: 'direct_match',
        },
      ],
      remainingGhosts: {
        riders: [
          {
            originalCode: 'RAW-1',
            legacyCode: 'RAW-1',
            effectiveCode: 'RAW-1',
            hours: 12,
            orders: 4,
            reasonAr: 'غائب من المناديب',
          },
        ],
      },
    },
    codeNormalizationAudit: {
      pipelinePath: 'v2',
      codesNormalized: 10,
      codesMatched: 9,
      codesRejected: 1,
      codesManualReview: 0,
      ghostLeakagePercentBefore: 10,
      ghostLeakagePercentAfter: 2,
      improvementPercent: 80,
      recoveredHours: 38,
      recoveredOrders: 6,
      recoveredRiders: 4,
      entries: [
        {
          originalCode: 'RAW-2',
          legacyNormalizedCode: 'RAW2',
          normalizedCode: 'R2',
          effectiveCode: 'R2',
          matchMethod: 'direct_match',
          confidence: 100,
          matched: true,
          manualReviewRequired: false,
          matchedRiderName: 'مندوب',
          matchedSupervisorName: 'مشرف',
          matchedMasterCode: 'R2',
          totalHours: 10,
          totalOrders: 3,
          rowCount: 1,
          rejectionReason: null,
        },
      ],
    },
    finalKpiAccuracyAudit: {
      executiveAccuracyScore: { score: 90, gradeLabelAr: 'ممتاز' },
      managementTrust: { answerAr: 'نعم', reasons: ['Ghost منخفض'] },
      ghostVerification: {
        actualGhostRiders: 1,
        codeMismatchCount: 0,
        missingFromMasterCount: 1,
        zoneFilterExcludedCount: 0,
        supervisorFilterExcludedCount: 0,
        ghostLeakageHours: 12,
        ghostLeakageOrders: 4,
        ghostLeakagePercent: 2,
        top100: [{ code: 'RAW-1', name: 'مندوب شبح', hours: 12, orders: 4, rootCauseLabelAr: 'غائب' }],
      },
      joinDateValidation: {
        joinDateCoveragePercent: 100,
        validJoinDates: 10,
        missingJoinDates: 0,
        lifetimeDisplayBlocked: false,
      },
      activeRidersConsistency: {
        uniqueActiveRidersInPeriod: 9,
        averageDailyActiveRiders: 8,
        dailyActiveMin: 6,
        dailyActiveMax: 9,
        dailyActiveStdDev: 1,
      },
      roadmapValidation: {
        dailyGap: 20,
        additionalRidersNeeded: 2,
        zeroValidationPassed: true,
      },
      kpiTrustVerification: {
        trustLevel: 'high',
        dataQualityScore: 90,
        gateStatusAr: 'مفتوح',
        kpiGates: [{ kpiAr: 'STI', enabled: true, reasonAr: 'ثقة كافية' }],
      },
    },
    operationalTruthIntelligence: {
      supervisorTruthIndex: [
        {
          supervisorName: 'مشرف',
          stiScore: 80,
          rank: 1,
          ghostDependencyRatio: 0.1,
          retentionScore: 90,
          riskLevel: 'low',
        },
      ],
      operationalRiskPrediction: [
        { supervisorName: 'مشرف', orpsScore: 20, riskLevel: 'low', primaryRiskDriver: 'لا يوجد' },
      ],
    },
    activityDistribution: {
      buckets: [
        { label: 'عالي', count: 3, percent: 30, avgDailyHoursPerRider: 12, hoursContribution: 40 },
      ],
    },
    lostHours: {
      breakdown: [
        { category: 'غياب', hoursDual: { daily: 2, period: 14 }, hours: 14, percent: 10, riderCount: 2 },
      ],
    },
    growthExpansion: {
      indicators: [{ labelAr: 'مؤشر نمو', displayValue: '1.2', formula: 'a/b', calculation: '12/10' }],
    },
    supervisorPerformance: {
      rows: [
        {
          code: 'S1',
          name: 'مشرف',
          assignedRiders: 5,
          activeRiders: 4,
          inactiveRiders: 1,
          totalHoursDual: { daily: 40, period: 280 },
          totalHours: 280,
          avgHoursPerRiderDaily: 10,
          avgOrdersDaily: 20,
          resignations: 0,
          productivityScore: 80,
        },
      ],
    },
    operationalFormulaAudit: {
      validationTable: [
        { kpi: 'Headcount', formula: 'count', rawData: '10', result: '10', status: 'valid', statusReason: '' },
      ],
      approvedResignations: {
        records: [
          {
            sheetRow: 2,
            riderCode: 'R9',
            riderName: 'مقال',
            supervisorCode: 'S1',
            statusRaw: 'معتمد',
            approvalDate: '2026-08-02',
            included: true,
            dedupeNote: '',
          },
        ],
      },
    },
    dataValidation: [
      { kpi: 'Headcount', sourceSheet: 'المناديب', columns: 'code', recordsRead: 10, formula: 'count', result: '10' },
    ],
  } as unknown as StrategicOpsReport;
}

describe('strategicOps client Excel export', () => {
  it('preserves all expected sheet names, Arabic fields, and row counts', async () => {
    const loaded = await readWorkbook(await buildStrategicOpsExcelBuffer(stubReport()));
    assert.deepEqual(loaded.sheetNames, [...STRATEGIC_OPS_EXCEL_SHEET_NAMES]);
    assert.equal(STRATEGIC_OPS_EXCEL_SHEET_NAMES.length, 25);

    const exec = loaded.sheetToMatrix('الملخص التنفيذي', { raw: true, defval: '' });
    assert.equal(exec[0][0], 'مركز العمليات الاستراتيجي');
    assert.equal(exec[1][0], 'الفترة');
    assert.equal(exec[1][1], '2026-08-01 → 2026-08-07');

    const ghosts = loaded.sheetToObjects('تدقيق Ghost Riders', { raw: true });
    assert.equal(ghosts.length, 1);
    assert.equal(ghosts[0]['الكود_الخام'], 'RAW-1');
    assert.equal(ghosts[0]['الاسم'], 'مندوب شبح');
    assert.equal(ghosts[0]['التصنيف_عربي'], 'B — غائب من شيت المناديب');

    const remaining = loaded.sheetToObjects('REMAINING GHOSTS', { raw: true });
    assert.equal(remaining.length, 1);
    assert.equal(remaining[0]['Reason'], 'غائب من المناديب');

    const sti = loaded.sheetToObjects('ذكاء الحقيقة STI', { raw: true });
    assert.equal(sti.length, 1);
    assert.equal(sti[0]['المشرف'], 'مشرف');

    const supervisors = loaded.sheetToObjects('المشرفون', { raw: true });
    assert.equal(supervisors.length, 1);
    assert.equal(supervisors[0]['الاسم'], 'مشرف');
    assert.equal(supervisors[0]['ساعات_يومياً'], 40);
  });
});
