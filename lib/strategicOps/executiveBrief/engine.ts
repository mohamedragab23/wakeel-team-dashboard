import type { StrategicOpsReport } from '@/lib/strategicOps/buildReport';
import type { ManagementAction } from '@/lib/strategicOps/controlTower/types';
import type { DecisionConfidence } from '@/lib/strategicOps/trust/decisionConfidence';
import { getUnitEconomicsConfig } from '@/lib/strategicOps/digitalTwin/config/unitEconomics';
import type { ExecutiveBrief } from './types';

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v));
}

function urgencyDeadlineAr(urgency?: string): string {
  if (urgency === 'immediate') return 'اليوم — قبل نهاية الشيفت الحالي';
  if (urgency === 'this_week') return 'خلال هذا الأسبوع';
  if (urgency === 'this_month') return 'خلال هذا الشهر';
  return 'غير محدد — راجع مركز الإجراءات الإدارية';
}

function confidenceLabelToPercent(level?: string): number | null {
  if (level === 'very_high') return 92;
  if (level === 'high') return 82;
  if (level === 'medium') return 65;
  if (level === 'low') return 45;
  return null;
}

/**
 * Builds the "Today's Executive Brief" narrative (SRS-010 Part 1).
 * Every value is derived from the live StrategicOpsReport — nothing is
 * hardcoded except connector words ("لأن", "بسبب", ...).
 */
export function buildExecutiveBrief(report: StrategicOpsReport): ExecutiveBrief {
  const now = new Date().toISOString();
  const ct = report.controlTower;
  const economics = getUnitEconomicsConfig();

  if (!ct || !ct.insightsEnabled || !ct.executiveHealth) {
    return {
      generatedAt: now,
      hasData: false,
      overallStatus: 'Unknown',
      overallStatusAr: 'غير متاح',
      healthScore: 0,
      greetingAr: 'لا تتوفر بيانات كافية حاليًا لتوليد ملخص الصباح.',
      priorityCount: 0,
      mainReasonAr:
        ct?.disabledReasonAr ??
        ct?.metadataLimitedReasonAr ??
        'لا تتوفر بيانات كافية حاليًا لبناء موجز تنفيذي تلقائي موثوق.',
      causeChainAr: [],
      impactHours: null,
      impactHoursAr: '—',
      ridersUnderFourHours: 0,
      ridersUnderFourHoursAr: '—',
      financialImpactEgp: null,
      financialImpactAr: '—',
      projectionIfIgnoredAr: '—',
      projectedAchievementPercent: null,
      topPriorityAr: 'فعّل Control Tower / زد تغطية البيانات لتوليد أولويات تلقائية.',
      topPriorityDeadlineAr: '—',
      expectedGainHours: null,
      expectedGainAr: '—',
      confidencePercent: 0,
      kpiId: 'target_achievement',
      actionId: null,
      assumptionsAr: [],
    };
  }

  const health = ct.executiveHealth;
  const comparisons = ct.periodComparisons ?? [];
  const rootCauseExpl = report.srs006?.rootCauseExplanations ?? [];
  const decisionActions: Array<ManagementAction & { decisionConfidence?: DecisionConfidence }> =
    report.srs006?.decisionConfidenceActions ?? ct.executiveFocus ?? [];
  const fleetDistribution = ct.fleetDistribution;

  // SRS-011 Part 1 — operational currency: how many priorities need a human
  // decision today, and how many riders are the actual driver behind the gap.
  const priorityCount = (ct.executiveFocus ?? []).filter(
    (a) => a.priority === 'critical' || a.priority === 'high'
  ).length;
  const ridersUnderFourHours =
    (fleetDistribution?.buckets.find((b) => b.id === 'under_2')?.count ?? 0) +
    (fleetDistribution?.buckets.find((b) => b.id === 'under_4')?.count ?? 0);
  const ridersUnderFourHoursAr =
    ridersUnderFourHours > 0
      ? `${ridersUnderFourHours} طيار يعملون أقل من 4 ساعات/يوم`
      : 'لا يوجد طيارون تحت 4 ساعات/يوم حاليًا';
  const greetingAr =
    priorityCount > 0
      ? `صباح الخير. اليوم يوجد ${priorityCount} ${priorityCount === 1 ? 'أولوية تشغيلية' : 'أولويات تشغيلية'} تحتاج تدخل.`
      : 'صباح الخير. لا توجد أولويات عاجلة اليوم — الوضع مستقر، تابع الأداء الاعتيادي.';

  const achievementTrend = comparisons.find((c) => c.kpiKey === 'achievementPercent') ?? null;
  const hoursTrend = comparisons.find((c) => c.kpiKey === 'actualHours') ?? null;

  const primaryCause =
    rootCauseExpl.find((r) => r.kpiKey === 'achievementPercent') ?? rootCauseExpl[0] ?? null;

  const topAction = decisionActions[0] ?? null;

  // ── Causal chain — every line only appears if the underlying evidence exists ──
  const causeChainAr: string[] = [];

  if (achievementTrend && achievementTrend.delta7 != null && achievementTrend.delta7 < 0) {
    causeChainAr.push(
      `نسبة تحقيق الهدف انخفضت ${round2(Math.abs(achievementTrend.delta7))} نقطة خلال آخر 7 أيام (الآن ${achievementTrend.current}%)`
    );
  } else {
    causeChainAr.push(`نسبة تحقيق الهدف حاليًا ${health.achievementPercent}%`);
  }

  if (hoursTrend && hoursTrend.deltaPercent7 != null && hoursTrend.deltaPercent7 < 0) {
    causeChainAr.push(`لأن الساعات الفعلية انخفضت ${round2(Math.abs(hoursTrend.deltaPercent7))}% خلال نفس الفترة`);
  }

  if (ridersUnderFourHours > 0) {
    causeChainAr.push(`بسبب وجود ${ridersUnderFourHours} طيار يعملون أقل من 4 ساعات/يوم فعليًا`);
  }

  if (topAction) {
    causeChainAr.push(
      topAction.entityType === 'supervisor'
        ? `بسبب أن المشرف "${topAction.entityName}" ${topAction.problemAr}`
        : `بسبب: ${topAction.problemAr}`
    );
  } else if (health.riskLevel === 'high' || health.riskLevel === 'severe') {
    causeChainAr.push(health.situationSummaryAr);
  }

  const impactHours = primaryCause?.hoursLost ?? topAction?.deduplicatedRecoveryHours ?? null;
  const impactHoursAr = impactHours != null ? `-${impactHours} ساعة/يوم` : 'غير متاح حاليًا';

  const financialImpactEgp = primaryCause?.financialCostEstimate ?? null;
  const financialImpactAr =
    financialImpactEgp != null
      ? `≈ ${Math.round(financialImpactEgp).toLocaleString('ar-EG')} ${economics.currency} (تقديري)`
      : 'يتطلب مزيدًا من البيانات للتقدير المالي';

  // ── Linear projection if nothing changes (disclosed as a simplified assumption) ──
  let projectedAchievementPercent: number | null = null;
  if (achievementTrend && achievementTrend.delta7 != null && achievementTrend.delta7 < 0) {
    projectedAchievementPercent = round2(
      clamp(achievementTrend.current + achievementTrend.delta7, 0, 100)
    );
  }
  const projectionIfIgnoredAr =
    projectedAchievementPercent != null
      ? `إذا استمر نفس معدل الانخفاض دون تدخل، من المتوقع أن تصل نسبة تحقيق الهدف إلى ~${projectedAchievementPercent}% خلال الأيام القادمة.`
      : health.riskLevel === 'low'
        ? 'لا يوجد اتجاه سلبي واضح حاليًا — الوضع مستقر عند الأداء الحالي إن لم يتغيّر شيء.'
        : 'البيانات التاريخية غير كافية حاليًا لحساب تقدير موثوق لما سيحدث إذا لم يتغيّر شيء.';

  const topActionConfidence =
    topAction?.decisionConfidence?.confidencePercent ?? confidenceLabelToPercent(topAction?.confidence);

  const topPriorityAr = topAction
    ? topAction.actionAr
    : health.riskLevel === 'low'
      ? 'لا توجد أولوية عاجلة اليوم — استمر بالمتابعة الدورية.'
      : 'راجع مركز الإجراءات الإدارية لتحديد أولوية اليوم.';

  const topPriorityDeadlineAr = topAction ? urgencyDeadlineAr(topAction.urgency) : '—';

  const expectedGainHours = topAction?.deduplicatedRecoveryHours ?? topAction?.expectedRecoveryHours ?? null;
  const expectedGainAr = expectedGainHours != null ? `+${expectedGainHours} ساعة/يوم` : '—';

  const confidencePercent = topActionConfidence ?? Math.round(health.healthScore);

  const assumptionsAr = [
    `التقدير المالي مبني على افتراض ${economics.revenuePerOrder} ${economics.currency}/طلب و ${economics.costPerActiveRiderDay} ${economics.currency}/طيار نشط/يوم (${
      economics.source === 'env' ? 'مُعدَّل من متغيرات البيئة' : 'قيمة افتراضية — قابلة للتعديل عبر DT_REVENUE_PER_ORDER'
    }).`,
    projectedAchievementPercent != null
      ? 'التوقّع أعلاه امتداد خطي مبسّط لآخر 7 أيام — ليس نموذج تنبؤ احتمالي كامل.'
      : '',
  ].filter(Boolean);

  return {
    generatedAt: now,
    hasData: true,
    overallStatus: health.statusLabel,
    overallStatusAr: health.statusLabelAr,
    healthScore: health.healthScore,
    greetingAr,
    priorityCount,
    mainReasonAr: causeChainAr[0] ?? health.situationSummaryAr,
    causeChainAr,
    impactHours,
    impactHoursAr,
    ridersUnderFourHours,
    ridersUnderFourHoursAr,
    financialImpactEgp,
    financialImpactAr,
    projectionIfIgnoredAr,
    projectedAchievementPercent,
    topPriorityAr,
    topPriorityDeadlineAr,
    expectedGainHours,
    expectedGainAr,
    confidencePercent,
    kpiId: 'target_achievement',
    actionId: topAction?.id ?? null,
    assumptionsAr,
  };
}
