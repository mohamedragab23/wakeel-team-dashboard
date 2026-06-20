import type { CodeNormalizationAuditReport, CodeNormalizationEntry, MatchMethod } from '@/lib/strategicOps/codeNormalization';
import { computeKpiTrustLevel, type KpiTrustReport } from '@/lib/strategicOps/kpiTrustLevel';
import type { JoinDateAuditReport } from '@/lib/strategicOps/joinDateAudit';
import type { DataIntegrityReport } from '@/lib/strategicOps/dataIntegrity';

export type RemainingGhostReason =
  | 'not_found_in_master'
  | 'low_confidence'
  | 'multiple_matches'
  | 'invalid_code';

export const REMAINING_GHOST_LABELS_AR: Record<RemainingGhostReason, string> = {
  not_found_in_master: 'غير موجود في المناديب',
  low_confidence: 'ثقة منخفضة (<90%)',
  multiple_matches: 'تطابقات متعددة',
  invalid_code: 'كود غير صالح',
};

export type RecoveredRiderRow = {
  originalCode: string;
  normalizedCode: string;
  hoursRecovered: number;
  ordersRecovered: number;
  confidence: number;
  matchMethod: MatchMethod;
};

export type RemainingGhostRow = {
  originalCode: string;
  legacyCode: string;
  effectiveCode: string;
  hours: number;
  orders: number;
  reason: RemainingGhostReason;
  reasonAr: string;
};

export type PostNormalizationValidationReport = {
  title: 'POST-NORMALIZATION VALIDATION REPORT';
  generatedAt: string;
  proofStatementAr: string;
  ghostBefore: {
    ridersCount: number;
    hours: number;
    orders: number;
    percent: number;
  };
  ghostAfter: {
    ridersCount: number;
    hours: number;
    orders: number;
    percent: number;
  };
  recovery: {
    riders: number;
    hours: number;
    orders: number;
    improvementPercent: number;
  };
  rootCauseFixes: {
    directMatch: number;
    suffixRemoval: number;
    numericExtraction: number;
    manualReview: number;
  };
  confidenceDistribution: {
    pct100: number;
    pct95: number;
    pct90: number;
    below90: number;
    counts: { pct100: number; pct95: number; pct90: number; below90: number };
  };
  top50Recovered: RecoveredRiderRow[];
  remainingGhosts: {
    count: number;
    hours: number;
    orders: number;
    byReason: Record<RemainingGhostReason, number>;
    riders: RemainingGhostRow[];
  };
  executiveConclusion: {
    primaryCauseAr: string;
    codeFormattingProblemPercent: number;
    missingRidersInMasterPercent: number;
    codeFormattingHours: number;
    missingInMasterHours: number;
    explanationAr: string;
  };
  trustImpact: {
    before: {
      trustLevel: number;
      trustLabelAr: string;
      executiveAccuracyScore: number;
      executiveGradeAr: string;
      canTrust: boolean;
      canTrustAnswerAr: 'نعم' | 'لا';
      reasons: string[];
    };
    after: {
      trustLevel: number;
      trustLabelAr: string;
      executiveAccuracyScore: number;
      executiveGradeAr: string;
      canTrust: boolean;
      canTrustAnswerAr: 'نعم' | 'لا';
      reasons: string[];
    };
    trustLevelImproved: boolean;
    accuracyScoreDelta: number;
    ghostLeakageDelta: number;
  };
};

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function pct(part: number, total: number): number {
  return total > 0 ? round2((part / total) * 100) : 0;
}

function gradeLabelAr(score: number): string {
  if (score >= 90) return 'Executive Grade';
  if (score >= 80) return 'Operational Grade';
  if (score >= 70) return 'Use With Caution';
  return 'Not Decision Ready';
}

export function computeExecutiveAccuracyScore(input: {
  dataQualityScore: number;
  ghostLeakagePercent: number;
  joinDateCoveragePercent: number;
  duplicatePercent: number;
  scopeAnomalyRatio: number;
}): number {
  const weights = {
    dataQuality: 0.25,
    ghostLeakageInverse: 0.25,
    joinDateCoverage: 0.2,
    duplicateIntegrity: 0.15,
    scopeIntegrity: 0.15,
  };
  const components = {
    dataQuality: input.dataQualityScore,
    ghostLeakageInverse: round2(Math.max(0, 100 - input.ghostLeakagePercent * 4)),
    joinDateCoverage: input.joinDateCoveragePercent,
    duplicateIntegrity: round2(Math.max(0, 100 - input.duplicatePercent * 3)),
    scopeIntegrity: round2(Math.max(0, 100 - Math.min(100, input.scopeAnomalyRatio * 100))),
  };
  return round2(
    components.dataQuality * weights.dataQuality +
      components.ghostLeakageInverse * weights.ghostLeakageInverse +
      components.joinDateCoverage * weights.joinDateCoverage +
      components.duplicateIntegrity * weights.duplicateIntegrity +
      components.scopeIntegrity * weights.scopeIntegrity
  );
}

function classifyRemainingGhost(entry: CodeNormalizationEntry): RemainingGhostReason {
  if (!entry.legacyNormalizedCode || entry.matchMethod === 'no_match' && entry.confidence === 0 && !entry.normalizedCode) {
    return 'invalid_code';
  }
  if (entry.rejectionReason?.includes('أكثر من')) {
    return 'multiple_matches';
  }
  if (entry.manualReviewRequired || entry.confidence < 90) {
    return 'low_confidence';
  }
  return 'not_found_in_master';
}

function isRecovered(entry: CodeNormalizationEntry, masterNormSet: Set<string>): boolean {
  const wasGhost = !masterNormSet.has(entry.legacyNormalizedCode);
  const isGhost = !masterNormSet.has(entry.effectiveCode);
  return wasGhost && !isGhost;
}

/** Rider still ghost after normalization: effective code not in master. */
function stillGhost(entry: CodeNormalizationEntry, masterNormSet: Set<string>): boolean {
  return !masterNormSet.has(entry.effectiveCode);
}

function wasGhostBefore(entry: CodeNormalizationEntry, masterNormSet: Set<string>): boolean {
  return !masterNormSet.has(entry.legacyNormalizedCode);
}

function buildTrustSnapshot(input: {
  trust: KpiTrustReport;
  executiveAccuracyScore: number;
  joinDateAudit: JoinDateAuditReport;
  zeroValidationPassed: boolean;
}): PostNormalizationValidationReport['trustImpact']['before'] {
  const blockers: string[] = [];
  if (input.executiveAccuracyScore < 80) {
    blockers.push(`درجة الدقة ${input.executiveAccuracyScore}/100 < 80`);
  }
  if (input.trust.level > 2) {
    blockers.push(`مستوى الثقة ${input.trust.level} — Ghost ${input.trust.ghostLeakagePercent}%`);
  }
  if (!input.joinDateAudit.riderLifetimeKpiEnabled) {
    blockers.push(`تغطية انضمام ${input.joinDateAudit.joinDateCoveragePercent}% < 80%`);
  }
  if (!input.zeroValidationPassed) {
    blockers.push('فشل تحقق خارطة 2200');
  }
  if (input.trust.ghostLeakagePercent >= 10) {
    blockers.push(`Ghost leakage ${input.trust.ghostLeakagePercent}% ≥ 10%`);
  }

  const canTrust = blockers.length === 0;
  return {
    trustLevel: input.trust.level,
    trustLabelAr: input.trust.labelAr,
    executiveAccuracyScore: input.executiveAccuracyScore,
    executiveGradeAr: gradeLabelAr(input.executiveAccuracyScore),
    canTrust,
    canTrustAnswerAr: canTrust ? 'نعم' : 'لا',
    reasons: canTrust
      ? [
          `درجة الدقة ${input.executiveAccuracyScore}/100`,
          `مستوى الثقة ${input.trust.level} — Ghost ${input.trust.ghostLeakagePercent}%`,
        ]
      : blockers,
  };
}

export function buildPostNormalizationValidationReport(input: {
  codeNormalization: CodeNormalizationAuditReport;
  masterNormSet: Set<string>;
  dataIntegrity: DataIntegrityReport;
  joinDateAudit: JoinDateAuditReport;
  ridersInScopeCount: number;
  ghostAnomalyCount: number;
  zeroValidationPassed: boolean;
  generatedAt: string;
}): PostNormalizationValidationReport {
  const { codeNormalization: cn, masterNormSet } = input;

  const duplicatePercent =
    input.dataIntegrity.totalRows > 0
      ? pct(input.dataIntegrity.duplicateRows, input.dataIntegrity.totalRows)
      : 0;
  const scopeAnomalyRatio =
    input.ridersInScopeCount > 0
      ? input.ghostAnomalyCount / input.ridersInScopeCount
      : 0;

  const scoreBase = {
    dataQualityScore: input.dataIntegrity.dataQualityScore,
    joinDateCoveragePercent: input.joinDateAudit.joinDateCoveragePercent,
    duplicatePercent,
    scopeAnomalyRatio,
  };

  const trustBefore = computeKpiTrustLevel(
    scoreBase.dataQualityScore,
    cn.ghostLeakagePercentBefore
  );
  const trustAfter = computeKpiTrustLevel(
    scoreBase.dataQualityScore,
    cn.ghostLeakagePercentAfter
  );

  const accuracyBefore = computeExecutiveAccuracyScore({
    ...scoreBase,
    ghostLeakagePercent: cn.ghostLeakagePercentBefore,
  });
  const accuracyAfter = computeExecutiveAccuracyScore({
    ...scoreBase,
    ghostLeakagePercent: cn.ghostLeakagePercentAfter,
  });

  const rootCauseFixes = {
    directMatch: 0,
    suffixRemoval: 0,
    numericExtraction: 0,
    manualReview: 0,
  };

  const confidenceCounts = { pct100: 0, pct95: 0, pct90: 0, below90: 0 };
  const recoveredRows: RecoveredRiderRow[] = [];
  const remainingRows: RemainingGhostRow[] = [];

  for (const entry of cn.entries) {
    if (entry.confidence >= 100) confidenceCounts.pct100 += 1;
    else if (entry.confidence >= 95) confidenceCounts.pct95 += 1;
    else if (entry.confidence >= 90) confidenceCounts.pct90 += 1;
    else confidenceCounts.below90 += 1;

    if (isRecovered(entry, masterNormSet)) {
      if (entry.matchMethod === 'direct_match') rootCauseFixes.directMatch += 1;
      else if (entry.matchMethod === 'suffix_strip') rootCauseFixes.suffixRemoval += 1;
      else if (entry.matchMethod === 'regex_extraction') rootCauseFixes.numericExtraction += 1;
      else if (entry.matchMethod === 'manual_review') rootCauseFixes.manualReview += 1;

      recoveredRows.push({
        originalCode: entry.originalCode,
        normalizedCode: entry.effectiveCode,
        hoursRecovered: entry.totalHours,
        ordersRecovered: entry.totalOrders,
        confidence: entry.confidence,
        matchMethod: entry.matchMethod,
      });
    }

    if (stillGhost(entry, masterNormSet) && wasGhostBefore(entry, masterNormSet)) {
      const reason = classifyRemainingGhost(entry);
      remainingRows.push({
        originalCode: entry.originalCode,
        legacyCode: entry.legacyNormalizedCode,
        effectiveCode: entry.effectiveCode,
        hours: entry.totalHours,
        orders: entry.totalOrders,
        reason,
        reasonAr: REMAINING_GHOST_LABELS_AR[reason],
      });
    }
  }

  recoveredRows.sort((a, b) => b.hoursRecovered - a.hoursRecovered);
  remainingRows.sort((a, b) => b.hours - a.hours);

  const totalEntries = cn.entries.length || 1;
  const remainingByReason: Record<RemainingGhostReason, number> = {
    not_found_in_master: 0,
    low_confidence: 0,
    multiple_matches: 0,
    invalid_code: 0,
  };
  for (const r of remainingRows) {
    remainingByReason[r.reason] += 1;
  }

  const formattingHours = cn.recoveredHours;
  const missingHours = cn.ghostLeakageHoursAfter;
  const beforeGhostHours = cn.ghostLeakageHoursBefore || 1;

  const codeFormattingProblemPercent = pct(formattingHours, beforeGhostHours);
  const missingRidersInMasterPercent = pct(missingHours, beforeGhostHours);

  const primaryCauseAr =
    codeFormattingProblemPercent >= missingRidersInMasterPercent
      ? 'مشكلة تنسيق الأكواد (Code Formatting)'
      : 'بيانات مناديب ناقصة (Missing Master Data)';

  const beforeSnapshot = buildTrustSnapshot({
    trust: trustBefore,
    executiveAccuracyScore: accuracyBefore,
    joinDateAudit: input.joinDateAudit,
    zeroValidationPassed: input.zeroValidationPassed,
  });
  const afterSnapshot = buildTrustSnapshot({
    trust: trustAfter,
    executiveAccuracyScore: accuracyAfter,
    joinDateAudit: input.joinDateAudit,
    zeroValidationPassed: input.zeroValidationPassed,
  });

  const ghostDelta = round2(cn.ghostLeakagePercentBefore - cn.ghostLeakagePercentAfter);
  const proved = cn.recoveredHours > 0 && ghostDelta > 0;

  return {
    title: 'POST-NORMALIZATION VALIDATION REPORT',
    generatedAt: input.generatedAt,
    proofStatementAr: proved
      ? `إثبات رقمي: التطبيع خفّض Ghost من ${cn.ghostLeakagePercentBefore}% إلى ${cn.ghostLeakagePercentAfter}% (Δ ${ghostDelta}%) واسترد ${cn.recoveredHours} ساعة و${cn.recoveredRiders} طيار — ليس تغيير عرض فقط.`
      : `لم يُسجَّل تحسّن Ghost بعد التطبيع — راجع الأكواد المتبقية أو بيانات المناديب.`,
    ghostBefore: {
      ridersCount: cn.ghostRidersCountBefore,
      hours: cn.ghostLeakageHoursBefore,
      orders: cn.ghostLeakageOrdersBefore,
      percent: cn.ghostLeakagePercentBefore,
    },
    ghostAfter: {
      ridersCount: cn.ghostRidersCountAfter,
      hours: cn.ghostLeakageHoursAfter,
      orders: cn.ghostLeakageOrdersAfter,
      percent: cn.ghostLeakagePercentAfter,
    },
    recovery: {
      riders: cn.recoveredRiders,
      hours: cn.recoveredHours,
      orders: cn.recoveredOrders,
      improvementPercent: cn.improvementPercent,
    },
    rootCauseFixes,
    confidenceDistribution: {
      pct100: pct(confidenceCounts.pct100, totalEntries),
      pct95: pct(confidenceCounts.pct95, totalEntries),
      pct90: pct(confidenceCounts.pct90, totalEntries),
      below90: pct(confidenceCounts.below90, totalEntries),
      counts: confidenceCounts,
    },
    top50Recovered: recoveredRows.slice(0, 50),
    remainingGhosts: {
      count: remainingRows.length,
      hours: round2(remainingRows.reduce((s, r) => s + r.hours, 0)),
      orders: remainingRows.reduce((s, r) => s + r.orders, 0),
      byReason: remainingByReason,
      riders: remainingRows,
    },
    executiveConclusion: {
      primaryCauseAr,
      codeFormattingProblemPercent,
      missingRidersInMasterPercent,
      codeFormattingHours: formattingHours,
      missingInMasterHours: missingHours,
      explanationAr:
        `من إجمالي ${cn.ghostLeakageHoursBefore} ساعة Ghost قبل التطبيع: ` +
        `${codeFormattingProblemPercent}% (${formattingHours}س) كانت بسبب تنسيق الأكواد وتم استردادها، ` +
        `و${missingRidersInMasterPercent}% (${missingHours}س) ما زالت Ghost بعد التطبيع (بيانات مناديب ناقصة أو ثقة منخفضة). ` +
        `السبب الرئيسي: ${primaryCauseAr}.`,
    },
    trustImpact: {
      before: beforeSnapshot,
      after: afterSnapshot,
      trustLevelImproved: afterSnapshot.trustLevel < beforeSnapshot.trustLevel,
      accuracyScoreDelta: round2(accuracyAfter - accuracyBefore),
      ghostLeakageDelta: ghostDelta,
    },
  };
}
