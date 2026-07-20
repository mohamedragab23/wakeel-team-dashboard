/**
 * Executive Trust Score Engine — SRS-006 Section 1
 *
 * Answers: "Can I trust today's numbers?"
 */

import type { StrategicOpsReport } from '@/lib/strategicOps/buildReport';
import type { DataIntegrityReport } from '@/lib/strategicOps/dataIntegrity';
import type { FinalKpiAccuracyAudit } from '@/lib/strategicOps/finalKpiAccuracyAudit';
import type { LiveAuditReport } from '@/lib/strategicOps/audit';
import {
  TRUST_WEIGHTS,
  type TrustComponentDetail,
  type TrustGrade,
  type TrustScore,
  type TrustScoreComponents,
  type TrustStatus,
  type TrustTrend,
} from './types';

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function clamp100(n: number): number {
  return round2(Math.max(0, Math.min(100, n)));
}

function colorFor(score: number): 'green' | 'amber' | 'red' {
  if (score >= 85) return 'green';
  if (score >= 70) return 'amber';
  return 'red';
}

function gradeFromScore(score: number): { grade: TrustGrade; labelAr: string } {
  if (score >= 90) return { grade: 'executive', labelAr: 'درجة تنفيذية' };
  if (score >= 80) return { grade: 'operational', labelAr: 'درجة تشغيلية' };
  if (score >= 70) return { grade: 'caution', labelAr: 'استخدام بحذر' };
  return { grade: 'not_ready', labelAr: 'غير جاهز للقرار' };
}

function statusFromScore(score: number): { status: TrustStatus; labelAr: string } {
  if (score >= 85) return { status: 'healthy', labelAr: 'صحي' };
  if (score >= 70) return { status: 'warning', labelAr: 'تحذير' };
  return { status: 'critical', labelAr: 'حرج' };
}

function trendFromHistory(history: number[]): TrustTrend {
  if (history.length < 2) return 'stable';
  const recent = history[history.length - 1];
  const prev = history[history.length - 2];
  const delta = recent - prev;
  if (delta >= 2) return 'improving';
  if (delta <= -2) return 'declining';
  return 'stable';
}

function auditRecencyScore(lastAuditIso?: string | null): number {
  if (!lastAuditIso) return 40;
  const ageMs = Date.now() - new Date(lastAuditIso).getTime();
  if (!Number.isFinite(ageMs) || ageMs < 0) return 40;
  const ageHours = ageMs / (60 * 60 * 1000);
  if (ageHours <= 1) return 100;
  if (ageHours <= 4) return 90;
  if (ageHours <= 12) return 75;
  if (ageHours <= 24) return 55;
  if (ageHours <= 72) return 35;
  return 15;
}

export type TrustScoreInput = {
  dataIntegrity: DataIntegrityReport;
  accuracyAudit: FinalKpiAccuracyAudit;
  coveragePercent: number;
  liveAudit?: LiveAuditReport | null;
  apiHealthScore?: number;
  previousScores?: number[];
  lastCalculatedAt?: string;
};

export function calculateTrustScoreFromParts(input: TrustScoreInput): TrustScore {
  const {
    dataIntegrity,
    accuracyAudit,
    coveragePercent,
    liveAudit,
    apiHealthScore = 100,
    previousScores = [],
    lastCalculatedAt,
  } = input;

  const missingDays = dataIntegrity.missingDates?.length ?? 0;
  const calendarDays = Math.max(1, dataIntegrity.calendarPeriodDays || 1);
  const missingUploadsScore = clamp100(100 - (missingDays / calendarDays) * 100);

  const dataCompleteness = clamp100(
    (dataIntegrity.completenessPercentage + dataIntegrity.dataQualityScore) / 2
  );

  const ghostPct = dataIntegrity.ghostLeakagePercent ?? 0;
  const ghostRiders = clamp100(100 - ghostPct * 4);

  const dupPct =
    dataIntegrity.totalRows > 0
      ? (dataIntegrity.duplicateRows / dataIntegrity.totalRows) * 100
      : 0;
  const duplicateRecords = clamp100(100 - dupPct * 3);

  const validationPass = liveAudit
    ? clamp100(
        liveAudit.totalChecks > 0
          ? (liveAudit.passCount / liveAudit.totalChecks) * 100
          : 100
      )
    : accuracyAudit.managementTrust.canTrust
      ? 95
      : clamp100(accuracyAudit.executiveAccuracyScore.score);

  const calculationSuccess = liveAudit
    ? clamp100(100 - liveAudit.failCount * 12 - liveAudit.warnCount * 3)
    : accuracyAudit.roadmapValidation.zeroValidationPassed
      ? 95
      : 60;

  const formulaValidation = accuracyAudit.roadmapValidation.zeroValidationPassed
    ? accuracyAudit.kpiTrustVerification.gateStatus === 'open'
      ? 100
      : accuracyAudit.kpiTrustVerification.gateStatus === 'warning'
        ? 80
        : 50
    : 40;

  const coverage = clamp100(coveragePercent);
  const lastAuditRecency = auditRecencyScore(
    liveAudit?.generatedAt ?? accuracyAudit.generatedAt ?? lastCalculatedAt
  );
  const apiHealth = clamp100(apiHealthScore);

  const components: TrustScoreComponents = {
    dataCompleteness,
    missingUploads: missingUploadsScore,
    ghostRiders,
    duplicateRecords,
    calculationSuccess,
    validationPass,
    apiHealth,
    lastAuditRecency,
    formulaValidation,
    coverage,
  };

  let overall = 0;
  for (const [key, weight] of Object.entries(TRUST_WEIGHTS) as Array<
    [keyof TrustScoreComponents, number]
  >) {
    overall += components[key] * weight;
  }
  // Redistribute missingUploads display into completeness already; weights sum to 1.0
  overall = clamp100(overall);

  const { grade, labelAr: gradeLabelAr } = gradeFromScore(overall);
  const { status, labelAr: statusLabelAr } = statusFromScore(overall);
  const history = [...previousScores, overall];
  const trend = trendFromHistory(history);
  const trendLabelAr =
    trend === 'improving' ? 'تحسن' : trend === 'declining' ? 'تراجع' : 'مستقر';

  const componentDetails: TrustComponentDetail[] = [
    {
      key: 'dataCompleteness',
      labelAr: 'اكتمال البيانات',
      score: dataCompleteness,
      color: colorFor(dataCompleteness),
      explanation: `جودة البيانات ${dataIntegrity.dataQualityScore}/100 — اكتمال ${dataIntegrity.completenessPercentage}%`,
      rootCause:
        dataCompleteness < 85
          ? 'أيام ناقصة أو صفوف غير مكتملة في البيانات اليومية'
          : 'التغطية والجودة ضمن الحدود المقبولة',
      suggestedAction:
        dataCompleteness < 85
          ? 'أكمل رفع الأيام الناقصة وراجع الصفوف المفقودة'
          : 'استمر في مراقبة جودة الرفع اليومي',
      trend,
    },
    {
      key: 'missingUploads',
      labelAr: 'الرفع الناقص',
      score: missingUploadsScore,
      color: colorFor(missingUploadsScore),
      explanation: `${missingDays} يوم ناقص من أصل ${calendarDays}`,
      rootCause: missingDays > 0 ? 'لم تُرفع بيانات يومية لكل أيام الفترة' : 'لا أيام ناقصة',
      suggestedAction: missingDays > 0 ? `ارفع بيانات: ${dataIntegrity.missingDates.slice(0, 5).join(', ')}` : 'لا إجراء مطلوب',
      trend,
    },
    {
      key: 'ghostRiders',
      labelAr: 'Ghost Riders',
      score: ghostRiders,
      color: colorFor(ghostRiders),
      explanation: `تسرب Ghost ${ghostPct}% — ${dataIntegrity.ghostRidersCount} طيار`,
      rootCause:
        ghostPct > 5
          ? 'أكواد في البيانات اليومية غير مطابقة لسجل المناديب'
          : 'تسرب Ghost ضمن الحد الآمن (<5%)',
      suggestedAction: ghostPct > 5 ? 'راجع تدقيق Ghost وأصلح تطابق الأكواد' : 'راقب التسرب أسبوعياً',
      trend,
    },
    {
      key: 'duplicateRecords',
      labelAr: 'التكرارات',
      score: duplicateRecords,
      color: colorFor(duplicateRecords),
      explanation: `${dataIntegrity.duplicateRows} صف مكرر محذوف`,
      rootCause: dataIntegrity.duplicateRows > 0 ? 'رفع مكرر لنفس الطيار/اليوم' : 'لا تكرارات حرجة',
      suggestedAction:
        dataIntegrity.duplicateRows > 0 ? 'منع الرفع المكرر من المصدر' : 'لا إجراء مطلوب',
      trend,
    },
    {
      key: 'validationPass',
      labelAr: 'نجاح التحقق',
      score: validationPass,
      color: colorFor(validationPass),
      explanation: liveAudit
        ? `${liveAudit.passCount}/${liveAudit.totalChecks} فحص ناجح`
        : `درجة الدقة التنفيذية ${accuracyAudit.executiveAccuracyScore.score}/100`,
      rootCause:
        validationPass < 85
          ? 'فروق بين القيم المحسوبة والقيم المتوقعة'
          : 'التحقق الرياضي متوافق',
      suggestedAction: validationPass < 85 ? 'افتح Live Operations Audit وراجع FAIL/WARN' : 'لا إجراء مطلوب',
      trend,
    },
    {
      key: 'calculationSuccess',
      labelAr: 'نجاح الحسابات',
      score: calculationSuccess,
      color: colorFor(calculationSuccess),
      explanation: liveAudit
        ? `${liveAudit.failCount} فشل — ${liveAudit.warnCount} تحذير`
        : accuracyAudit.roadmapValidation.zeroValidationPassed
          ? 'خارطة الساعات متسقة'
          : 'تناقض في خارطة الساعات',
      rootCause:
        calculationSuccess < 85 ? 'حسابات فاشلة أو تحذيرات في التدقيق' : 'المحرك أنجز بدون فشل حرج',
      suggestedAction: calculationSuccess < 85 ? 'راجع Failed Calculations في System Integrity' : 'لا إجراء مطلوب',
      trend,
    },
    {
      key: 'coverage',
      labelAr: 'التغطية',
      score: coverage,
      color: colorFor(coverage),
      explanation: `تغطية مصدر البيانات ${coveragePercent}%`,
      rootCause: coveragePercent < 80 ? 'تغطية أقل من حد 80% للقرارات التنفيذية' : 'التغطية كافية',
      suggestedAction: coveragePercent < 80 ? 'وسّع نطاق الرفع أو قلّص الفترة' : 'لا إجراء مطلوب',
      trend,
    },
    {
      key: 'apiHealth',
      labelAr: 'صحة الـ API',
      score: apiHealth,
      color: colorFor(apiHealth),
      explanation: `درجة صحة الـ API ${apiHealth}/100`,
      rootCause: apiHealth < 85 ? 'بطء أو أخطاء في الاستجابات' : 'الاستجابات مستقرة',
      suggestedAction: apiHealth < 85 ? 'راجع System Integrity → API Health' : 'لا إجراء مطلوب',
      trend,
    },
    {
      key: 'lastAuditRecency',
      labelAr: 'حداثة التدقيق',
      score: lastAuditRecency,
      color: colorFor(lastAuditRecency),
      explanation: `آخر تدقيق: ${liveAudit?.generatedAt ?? accuracyAudit.generatedAt ?? 'غير متوفر'}`,
      rootCause: lastAuditRecency < 70 ? 'التدقيق قديم نسبياً' : 'التدقيق حديث',
      suggestedAction: lastAuditRecency < 70 ? 'شغّل Live Audit الآن' : 'لا إجراء مطلوب',
      trend,
    },
    {
      key: 'formulaValidation',
      labelAr: 'تحقق المعادلات',
      score: formulaValidation,
      color: colorFor(formulaValidation),
      explanation: accuracyAudit.kpiTrustVerification.gateStatusAr,
      rootCause:
        formulaValidation < 80
          ? 'بوابة KPI مغلقة أو خارطة غير متسقة'
          : 'المعادلات والبوابات مفتوحة',
      suggestedAction:
        formulaValidation < 80 ? 'أصلح تسرب Ghost أو تناقض الخارطة' : 'لا إجراء مطلوب',
      trend,
    },
  ];

  const rootCauses = componentDetails
    .filter((c) => c.score < 85)
    .map((c) => `${c.labelAr}: ${c.rootCause}`);

  const suggestedActions = componentDetails
    .filter((c) => c.score < 85)
    .map((c) => c.suggestedAction)
    .filter((a, i, arr) => arr.indexOf(a) === i && a !== 'لا إجراء مطلوب');

  const canTrust = overall >= 80 && accuracyAudit.managementTrust.canTrust !== false;
  const answerAr: TrustScore['answerAr'] =
    overall >= 90 ? 'نعم' : overall >= 70 ? 'بحذر' : 'لا';

  const explanation =
    overall >= 90
      ? 'الأرقام موثوقة لاتخاذ قرارات تنفيذية اليوم.'
      : overall >= 80
        ? 'الأرقام صالحة للتشغيل اليومي مع مراقبة النقاط الصفراء.'
        : overall >= 70
          ? 'استخدم الأرقام بحذر — راجع الأسباب الجذرية قبل أي قرار استراتيجي.'
          : 'لا يُنصح بالاعتماد على الأرقام لاتخاذ قرارات حتى تُصلح جودة البيانات.';

  return {
    overall,
    grade,
    gradeLabelAr,
    status,
    statusLabelAr,
    components,
    componentDetails,
    explanation,
    rootCauses,
    suggestedActions,
    trend,
    trendLabelAr,
    lastCalculated: new Date().toISOString(),
    canTrust,
    answerAr,
  };
}

/** Convenience wrapper when full StrategicOpsReport is available. */
export function calculateTrustScore(input: {
  report: StrategicOpsReport;
  liveAudit?: LiveAuditReport | null;
  apiHealthScore?: number;
  previousScores?: number[];
}): TrustScore {
  const { report, liveAudit, apiHealthScore, previousScores } = input;
  return calculateTrustScoreFromParts({
    dataIntegrity: report.dataIntegrity,
    accuracyAudit: report.finalKpiAccuracyAudit,
    coveragePercent: report.sourceDataCoverage?.coverage ?? report.dataIntegrity.completenessPercentage,
    liveAudit,
    apiHealthScore,
    previousScores,
    lastCalculatedAt: report.meta.generatedAt,
  });
}
