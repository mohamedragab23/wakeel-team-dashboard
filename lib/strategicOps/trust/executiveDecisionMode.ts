/**
 * SRS-006 §13 — Executive Decision Mode (max 10 bullets).
 */

export type ExecutiveDecisionBrief = {
  bullets: string[];
  generatedAt: string;
  confidence: number;
};

export function buildExecutiveDecisionBrief(input: {
  healthScore: number;
  achievement: number;
  hoursGap: number;
  topLossCauseAr?: string;
  biggestOpportunityAr?: string;
  biggestRiskAr?: string;
  weekOutlookAr?: string;
  monthOutlookAr?: string;
  confidence: number;
  canTrust: boolean;
}): ExecutiveDecisionBrief {
  const healthy =
    input.healthScore >= 80 && input.achievement >= 85
      ? 'نعم — الوضع صحي نسبياً'
      : input.healthScore >= 65
        ? 'متوسط — يحتاج تدخلات مركزة'
        : 'لا — الوضع غير صحي لاتخاذ قرارات توسعية';

  const bullets = [
    `هل نحن بصحة جيدة؟ ${healthy} (صحة ${input.healthScore}/100 · إنجاز ${input.achievement}%)`,
    `أين نخسر؟ فجوة ${input.hoursGap} ساعة/يوم${input.topLossCauseAr ? ` — ${input.topLossCauseAr}` : ''}`,
    `ماذا نصلح اليوم؟ ${input.hoursGap > 0 ? 'خفض الغياب + رفع ساعات النشطين قبل التعيين الكبير' : 'حافظ على الاستقرار وراقب الجودة'}`,
    `أكبر فرصة: ${input.biggestOpportunityAr ?? 'استرداد No-Show / Inactive'}`,
    `أكبر خطر: ${input.biggestRiskAr ?? 'تسرب بيانات أو تراجع إنجاز'}`,
    `متوقع الأسبوع: ${input.weekOutlookAr ?? 'استقرار مع تقلب طفيف'}`,
    `متوقع الشهر: ${input.monthOutlookAr ?? 'تحسن مشروط بتنفيذ خطة الاسترداد'}`,
    `الثقة في الأرقام: ${input.confidence}% — ${input.canTrust ? 'يمكن الاعتماد بحذر تنفيذي' : 'لا تعتمد لقرارات استراتيجية قبل إصلاح البيانات'}`,
  ];

  return {
    bullets: bullets.slice(0, 10),
    generatedAt: new Date().toISOString(),
    confidence: input.confidence,
  };
}
