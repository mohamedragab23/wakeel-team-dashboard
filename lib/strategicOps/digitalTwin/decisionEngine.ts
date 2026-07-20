import type { ExecutiveDecision, ScenarioLevers, SimulationImpact } from './types';

export function buildExecutiveDecision(
  impact: SimulationImpact,
  levers: ScenarioLevers
): ExecutiveDecision {
  const { deltas, financial, risk, projected, baseline } = impact;
  const hoursGain = deltas.hours;
  const achGain = deltas.achievement;
  const roi = financial.roiPercent;
  const overallRisk = risk.overallRisk;

  let shouldDoIt = false;
  let answerAr: ExecutiveDecision['answerAr'] = 'لا';

  if (hoursGain > 0 && achGain >= 0 && overallRisk < 70 && (roi >= 0 || (levers.hireRiders ?? 0) === 0)) {
    shouldDoIt = true;
    answerAr = overallRisk > 45 || risk.confidence < 60 ? 'بحذر' : 'نعم';
  } else if (hoursGain > 0 && overallRisk < 55) {
    answerAr = 'بحذر';
    shouldDoIt = true;
  }

  const benefitsAr: string[] = [];
  if (hoursGain > 0) benefitsAr.push(`زيادة ساعات يومية متوقعة ~${hoursGain}`);
  if (deltas.orders > 0) benefitsAr.push(`زيادة طلبات يومية ~${deltas.orders}`);
  if (achGain > 0) benefitsAr.push(`تحسن الإنجاز ~${achGain} نقطة`);
  if (financial.profit > 0) benefitsAr.push(`ربح تقديري للفترة ${financial.profit} ${financial.currency}`);
  if (benefitsAr.length === 0) benefitsAr.push('لا مكاسب تشغيلية واضحة في هذا السيناريو');

  const risksAr: string[] = [
    `مخاطر تشغيلية ${risk.operationalRisk}/100`,
    `مخاطر مالية ${risk.financialRisk}/100`,
  ];
  if ((levers.hireRiders ?? 0) > 0) risksAr.push(`مخاطر التعيين ${risk.hiringRisk}/100`);
  if ((levers.terminateRiders ?? 0) > 0) risksAr.push(`مخاطر التسرب ${risk.attritionRisk}/100`);

  const alternativeAr =
    (levers.hireRiders ?? 0) > 20
      ? 'جرّب تحسين الإنتاجية وخفض الغياب قبل تعيين بهذا الحجم'
      : projected.achievement < baseline.achievement
        ? 'راجع رفع الهدف أو خفض الطلب قبل تطبيق التغيير'
        : 'قارن مع سيناريو رفع الساعات/خفض الاستراحة قبل الاستثمار';

  const whyAr = shouldDoIt
    ? `السيناريو يحسّن الساعات/الإنجاز بمخاطر ${overallRisk < 45 ? 'مقبولة' : 'متوسطة'} وثقة ${risk.confidence}%`
    : `العائد غير كافٍ أو المخاطر مرتفعة (مخاطر ${overallRisk}/100، ROI ${roi}%)`;

  return {
    shouldDoIt,
    answerAr,
    whyAr,
    benefitsAr,
    risksAr,
    alternativeAr,
    expectedResultAr: `ساعات ${projected.actualHours} (من ${baseline.actualHours}) — إنجاز ${projected.achievement}% — صحة ${projected.healthScore}/100`,
    confidence: risk.confidence,
    confidenceLevel: risk.confidenceLevel,
  };
}
