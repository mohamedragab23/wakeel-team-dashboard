/**
 * SRS-006 §5 — Decision Confidence Engine for recommendations / actions.
 */

export type DecisionConfidenceLevel = 'low' | 'medium' | 'high' | 'very_high';

export type DecisionConfidence = {
  confidencePercent: number;
  confidenceLevel: DecisionConfidenceLevel;
  evidenceAr: string[];
  historicalBasisAr: string;
  businessRuleUsedAr: string;
  dataSampleSize: number;
  expectedGainAr: string;
  expectedRiskAr: string;
  whyExistsAr: string;
};

function level(p: number): DecisionConfidenceLevel {
  if (p >= 85) return 'very_high';
  if (p >= 70) return 'high';
  if (p >= 50) return 'medium';
  return 'low';
}

export function buildDecisionConfidence(input: {
  recoveryHours?: number;
  priority?: string;
  coveragePercent?: number;
  ghostLeakagePercent?: number;
  sampleSize?: number;
  trendSupport?: boolean;
  ruleLabelAr?: string;
  expectedGainAr?: string;
  expectedRiskAr?: string;
  evidenceAr?: string[];
}): DecisionConfidence {
  let score = 55;
  const coverage = input.coveragePercent ?? 85;
  const ghost = input.ghostLeakagePercent ?? 0;
  const sample = input.sampleSize ?? 0;

  score += Math.min(20, (coverage - 70) * 0.5);
  score -= Math.min(25, ghost * 2);
  if (sample >= 100) score += 10;
  else if (sample >= 30) score += 5;
  if (input.trendSupport) score += 8;
  if ((input.recoveryHours ?? 0) > 50) score += 5;
  if (input.priority === 'critical' || input.priority === 'P0') score += 3;

  const confidencePercent = Math.round(Math.max(15, Math.min(95, score)));

  return {
    confidencePercent,
    confidenceLevel: level(confidencePercent),
    evidenceAr: input.evidenceAr?.length
      ? input.evidenceAr
      : [
          `تغطية البيانات ${coverage}%`,
          `تسرب Ghost ${ghost}%`,
          `حجم العينة ${sample}`,
          input.recoveryHours != null ? `استرداد متوقع ${input.recoveryHours} ساعة` : 'لا تقدير استرداد',
        ],
    historicalBasisAr: input.trendSupport
      ? 'الاتجاه التاريخي يدعم التوصية (7/14 يوم)'
      : 'أساس تاريخي محدود — اعتمد على الفترة الحالية',
    businessRuleUsedAr: input.ruleLabelAr ?? 'قواعد التشغيل الاستراتيجية / Management Actions',
    dataSampleSize: sample,
    expectedGainAr: input.expectedGainAr ?? 'تحسن تشغيلي متوقع',
    expectedRiskAr: input.expectedRiskAr ?? 'مخاطر تنفيذ متوسطة إن لم تُراقب الجودة',
    whyExistsAr: 'التوصية ناتجة عن فجوة تشغيلية قابلة للقياس مقابل الهدف/الأسطول',
  };
}

export function enrichActionsWithConfidence<
  T extends {
    estimatedRecoveryHours?: number;
    expectedRecoveryHours?: number;
    deduplicatedRecoveryHours?: number;
    priority?: string;
    reasonAr?: string;
    problemAr?: string;
    actionAr?: string;
  },
>(
  actions: T[],
  meta: { coveragePercent: number; ghostLeakagePercent: number; sampleSize: number }
): Array<T & { decisionConfidence: DecisionConfidence }> {
  return actions.map((a) => {
    const recovery =
      a.deduplicatedRecoveryHours ?? a.expectedRecoveryHours ?? a.estimatedRecoveryHours;
    return {
      ...a,
      decisionConfidence: buildDecisionConfidence({
        recoveryHours: recovery,
        priority: a.priority,
        coveragePercent: meta.coveragePercent,
        ghostLeakagePercent: meta.ghostLeakagePercent,
        sampleSize: meta.sampleSize,
        expectedGainAr: recovery != null ? `${recovery} ساعة/يوم` : undefined,
        evidenceAr: a.reasonAr ? [a.reasonAr] : a.problemAr ? [a.problemAr] : undefined,
        ruleLabelAr: a.actionAr,
      }),
    };
  });
}
