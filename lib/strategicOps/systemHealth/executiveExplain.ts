/**
 * SRS-010 Part 5 — Executive Integrity Center.
 *
 * Converts a technical `AuditResult` (Formula / Expected / Calculated) into
 * a business-framed explanation: Problem / Business impact / Why it
 * happened / How to fix / Estimated time / Severity / Responsible module.
 *
 * This is a deterministic *narrative layer* on top of already-computed audit
 * numbers — it does not invent new math. Every quantified figure below
 * (diff, pctDiff, unit) comes straight from the `AuditResult` that was
 * produced by `runLiveAudit()`.
 */

import type { AuditResult, AuditStatus } from '@/lib/strategicOps/audit/types';
import { getKpiDef } from '@/lib/strategicOps/kpiIntelligence';

export type ExecutiveSeverity = 'critical' | 'high' | 'medium' | 'low';

export type ExecutiveAuditExplain = {
  id: string;
  status: AuditStatus;
  severity: ExecutiveSeverity;
  severityLabelAr: string;
  problemAr: string;
  businessImpactAr: string;
  whyAr: string;
  howToFixAr: string;
  estimatedTimeAr: string;
  responsibleModuleAr: string;
  affectedKpiIds: string[];
  fixGuideStepsAr: string[];
  /** SRS-011 Part 6 — how close today's reported value is to the independently
   *  recalculated one, as a 0–100 match score (100 = identical). */
  currentMatchPercent: number;
  /** SRS-011 Part 6 — realistic target score once the fix is applied: getting
   *  back inside the audit engine's own WARN tolerance band (not a fabricated
   *  100%, since exact-match is not the PASS bar the engine itself uses). */
  expectedResultPercent: number;
  /** SRS-011 Part 6 — does closing this gap need an engineering/data fix, or a
   *  people/process action from Operations? */
  interventionType: 'technical' | 'operational';
  interventionTypeLabelAr: string;
};

/** Section → owning engine file (for "Responsible module"). */
const SECTION_OWNER_AR: Record<string, string> = {
  A: 'محرك مؤشرات الأسطول — talabatOpsMetrics.ts',
  B: 'محرك الهدف والأداء — talabatOpsMetrics.ts',
  C: 'محرك الخط الأساسي التاريخي — riderHistory.ts',
  D: 'محرك أثر الطيارين — riderImpact.ts',
  E: 'محرك تحليل التوظيف — recruitmentAnalysis.ts',
  F: 'محرك توصيات المشرفين — managementActions.ts',
  G: 'محرك التوقعات — forecastEngine.ts',
  H: 'ملخص برج المراقبة التنفيذي — executiveHealth.ts',
};

/** Section → canonical KPI registry ids this section proves/affects. */
const SECTION_KPI_IDS: Record<string, string[]> = {
  A: ['active_riders', 'headcount', 'utilization', 'no_show'],
  B: ['target_achievement'],
  C: ['active_riders', 'data_quality'],
  D: ['target_achievement', 'active_riders'],
  E: ['target_achievement'],
  F: ['no_show', 'active_riders'],
  G: ['forecast_accuracy'],
  H: ['trust_score', 'target_achievement'],
};

/** Section → does fixing it require an engineering/data change, or an
 *  operational/people action? Data & engine sections skew technical;
 *  decision/people sections skew operational. */
const SECTION_INTERVENTION_TYPE: Record<string, 'technical' | 'operational'> = {
  A: 'technical', // Fleet KPI computation
  B: 'operational', // Target & performance — usually a supervisor/target-setting issue
  C: 'technical', // Baseline engine — data coverage
  D: 'operational', // Rider impact — a people follow-up
  E: 'operational', // Recruitment — a hiring decision
  F: 'operational', // Supervisor recommendations — a management action
  G: 'technical', // Forecast engine — model/data window
  H: 'technical', // Control Tower summary — aggregation layer
};

const INTERVENTION_LABEL_AR: Record<'technical' | 'operational', string> = {
  technical: '🔧 يحتاج تدخل تقني (بيانات/كود)',
  operational: '👤 يحتاج تدخل تشغيلي (قرار/إجراء بشري)',
};

/** Section → typical fix time when something breaks in that layer. */
const SECTION_ESTIMATED_TIME_AR: Record<string, string> = {
  A: '10–15 دقيقة (تنظيف بيانات + إعادة تشغيل التدقيق)',
  B: '5 دقائق (مراجعة أهداف المشرفين في الشيت)',
  C: '30 دقيقة (استكمال البيانات التاريخية لـ 30 يوم)',
  D: '15 دقيقة (مراجعة سجل حضور الطيار المتأثر)',
  E: '20 دقيقة (مراجعة روافع التوظيف والحدود القصوى)',
  F: '10 دقائق (مراجعة عتبات تصنيف المشرفين)',
  G: '30 دقيقة (زيادة نافذة البيانات التاريخية للتوقع)',
  H: '5 دقائق (إعادة تشغيل Live Audit بعد إصلاح الطبقات السابقة)',
};

/** Keyword → concrete, actionable fix (derived from the documented root-cause
 *  playbook in docs/STRATEGIC_OPS_ISSUES_REPORT.md — same domain knowledge,
 *  wired here so it appears where the COO actually is instead of a doc file). */
const FIX_KNOWLEDGE_BASE: Array<{
  match: RegExp;
  problemTemplateAr: (r: AuditResult) => string;
  whyAr: string;
  howToFixAr: string;
  fixGuideStepsAr: string[];
}> = [
  {
    match: /ghost|shadow|duplicate|مكرر|شبح/i,
    problemTemplateAr: (r) =>
      `تم رصد صفوف بيانات (${r.kpi}) غير مطابقة لقائمة الطيارين المعتمدة أو مكررة — الفرق ${r.diff}${r.unit} (${r.pctDiff}%)`,
    whyAr: 'أكواد طيارين في ورقة البيانات اليومية غير موجودة في ورقة Roster المعتمدة، أو نفس الطيار مُسجَّل مرتين لليوم نفسه.',
    howToFixAr: 'شغّل تطبيع أكواد الطيارين (Rider Code Normalization) ثم راجع قائمة Ghost Riders وأضف الناقص إلى Roster أو احذف الصفوف الخارجة عن النطاق.',
    fixGuideStepsAr: [
      'افتح تدقيق Ghost Riders (System Integrity → Data Health)',
      'صنّف كل حالة: كود غير مطابق / صف مكرر / خارج النطاق',
      'أضف الأكواد الناقصة إلى ورقة "المناديب" أو صحّح الكود في "البيانات اليومية"',
      'أعد تشغيل Live Operations Audit للتأكد من اختفاء التسرب',
    ],
  },
  {
    match: /baseline|historical|lookback|coverage/i,
    problemTemplateAr: (r) =>
      `تغطية الخط الأساسي التاريخي غير مكتملة لـ ${r.kpi} — فرق ${r.diff}${r.unit}`,
    whyAr: 'عدد أيام البيانات التاريخية المرفوعة (قبل بداية الفترة) أقل من 30 يومًا، فيضطر النظام لاستخدام متوسط الأسطول كبديل تقريبي لبعض الطيارين.',
    howToFixAr: 'استكمل رفع البيانات اليومية للأيام الناقصة قبل بداية الفترة الحالية حتى تصل التغطية التاريخية إلى 30 يومًا على الأقل.',
    fixGuideStepsAr: [
      'افتح Source Data Coverage وحدد الأيام الناقصة',
      'ارفع بيانات تلك الأيام في ورقة "البيانات اليومية"',
      'أعد تشغيل التقرير — ستنخفض نسبة "fleet_average fallback" تلقائيًا',
    ],
  },
  {
    match: /no.?show|غياب/i,
    problemTemplateAr: (r) =>
      `معدل الغياب المحتسب لا يطابق التوقع — فرق ${r.diff}${r.unit} (${r.pctDiff}%)`,
    whyAr: 'اختلاف بين تعريف "المجدوَل" في جدول التشغيل وتعريف "الغائب" في محرك التدقيق المستقل، أو تأخر رفع بيانات يوم معيّن.',
    howToFixAr: 'وحّد تعريف الغياب (مجدوَل بدون ساعات = غياب) في كل الملفات، وتأكد من اكتمال رفع اليوميات لكل أيام الفترة.',
    fixGuideStepsAr: [
      'راجع Upload Status وتأكد من عدم وجود أيام ناقصة',
      'قارن تعريف الغياب في buildReport.ts و talabatOpsMetrics.ts',
      'أعد تشغيل Live Audit بعد التوحيد',
    ],
  },
  {
    match: /active riders|طيار نشط|headcount|utilization/i,
    problemTemplateAr: (r) =>
      `${r.kpi} لا يطابق الحساب المستقل — فرق ${r.diff}${r.unit} (${r.pctDiff}%)`,
    whyAr: 'تعريف "الطيار النشط" (ساعات>0 وطلبات>0) قد لا يكون مطبّقًا بنفس الصيغة في كل نقطة حساب، أو هناك أكواد مكررة تُحسب مرتين.',
    howToFixAr: 'وحّد قاعدة "الطيار النشط" من businessRules.ts في كل نقاط الحساب، وشغّل Ghost Rider Audit لإزالة التكرار.',
    fixGuideStepsAr: [
      'افتح KPI Explorer وابحث عن Active Riders لمراجعة القيم جانبًا بجانب',
      'تأكد أن كل الحسابات تستورد isRiderActiveByRules من businessRules.ts',
      'أعد تشغيل التدقيق بعد التوحيد',
    ],
  },
  {
    match: /achievement|target hours|hours gap|تحقيق|هدف/i,
    problemTemplateAr: (r) =>
      `${r.kpi} ينحرف عن الحساب المستقل — فرق ${r.diff}${r.unit} (${r.pctDiff}%)`,
    whyAr: 'المتوسط اليومي للساعات محسوب بالقسمة على أيام غير صحيحة (أيام التقويم بدل أيام الرفع الفعلية)، أو تغيّر هدف أحد المشرفين في الشيت دون تحديث الحساب.',
    howToFixAr: 'تأكد أن حساب المتوسط اليومي يقسم على عدد الأيام المرفوعة فعليًا لا على أيام التقويم، وراجع أهداف المشرفين في ورقة "المشرفين".',
    fixGuideStepsAr: [
      'افتح KPI Intelligence Panel لمؤشر "نسبة تحقيق الهدف" وراجع خطوات الحساب',
      'قارن meta.periodDays مع meta.validDaysInDataset — إن اختلفا كثيرًا فالمشكلة أيام ناقصة',
      'أعد تشغيل التدقيق بعد استكمال الرفع',
    ],
  },
  {
    match: /forecast/i,
    problemTemplateAr: (r) => `توقع ${r.kpi} يختلف عن آخر قيمة فعلية — فرق ${r.diff}${r.unit}`,
    whyAr: 'نافذة الانحدار (7/14 يوم) قصيرة أو متقطعة بسبب أيام رفع ناقصة، فيضعف ملاءمة الخط للاتجاه الفعلي.',
    howToFixAr: 'وسّع نافذة البيانات التاريخية للتوقع واستبعد الأيام الناقصة من الانحدار بدل تفريغها كأصفار.',
    fixGuideStepsAr: [
      'راجع Forecast Accuracy في Trust Center',
      'أكمل رفع الأيام الناقصة في نافذة الانحدار',
      'أعد تشغيل محرك التوقع',
    ],
  },
  {
    match: /control tower availability/i,
    problemTemplateAr: () => 'برج المراقبة (Control Tower) معطّل — كل مؤشرات القرار المتقدمة (السبب الجذري، الإجراءات، الصحة التنفيذية) غير متاحة.',
    whyAr: 'تغطية البيانات أقل من 80% وهو الحد الأدنى المطلوب لتفعيل برج المراقبة بثقة.',
    howToFixAr: 'أكمل رفع الأيام الناقصة حتى تتجاوز التغطية 80%، سيُفعَّل Control Tower تلقائيًا في التحميل التالي.',
    fixGuideStepsAr: [
      'افتح Source Data Coverage وحدد الأيام الناقصة بدقة',
      'ارفعها في ورقة "البيانات اليومية"',
      'أعد تحميل الصفحة — يُفعَّل Control Tower تلقائيًا عند بلوغ 80%',
    ],
  },
];

const DEFAULT_FIX = {
  whyAr: 'فرق بين القيمة المُعلَنة في التقرير والقيمة المُعاد حسابها مباشرة من البيانات الخام — راجع التفاصيل الفنية (Formula / Raw Source) أدناه.',
  howToFixAr: 'راجع القسم الفني (Expected vs Calculated) لتحديد نقطة الانحراف بدقة، ثم افتح KPI Lineage لتتبّع مصدر البيانات المستخدم.',
  fixGuideStepsAr: [
    'اضغط على الصف لفتح KPI Lineage وتتبّع مصدر البيانات',
    'قارن Formula مع Raw Source للتأكد من صحة الاستيراد',
    'أعد تشغيل Live Operations Audit بعد أي تصحيح',
  ],
};

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function severityFromResult(r: AuditResult): { severity: ExecutiveSeverity; labelAr: string } {
  if (r.status === 'FAIL' && r.pctDiff >= 15) return { severity: 'critical', labelAr: '🔴 حرج' };
  if (r.status === 'FAIL') return { severity: 'high', labelAr: '🟠 مرتفع' };
  if (r.status === 'WARN') return { severity: 'medium', labelAr: '🟡 متوسط' };
  return { severity: 'low', labelAr: '⚪ منخفض' };
}

function findKnowledge(r: AuditResult) {
  const haystack = `${r.kpi} ${r.formula} ${r.note ?? ''}`;
  return FIX_KNOWLEDGE_BASE.find((k) => k.match.test(haystack)) ?? null;
}

function businessImpactAr(r: AuditResult, affectedKpiIds: string[]): string {
  const parts: string[] = [];
  const magnitude =
    r.unit === '%'
      ? `${round2(r.diff)} نقطة نسبة`
      : r.unit
        ? `${round2(r.diff)}${r.unit}`
        : `${round2(r.diff)}`;
  parts.push(`الانحراف الحالي = ${magnitude} (${r.pctDiff}% عن القيمة المتوقعة).`);

  const affectedLabels = affectedKpiIds
    .map((id) => getKpiDef(id)?.labelAr)
    .filter((v): v is string => Boolean(v));
  if (affectedLabels.length > 0) {
    parts.push(`يهدد دقة: ${affectedLabels.join('، ')}.`);
  }
  const primaryDef = getKpiDef(affectedKpiIds[0]);
  if (primaryDef) {
    parts.push(primaryDef.businessMeaningAr);
  }
  return parts.join(' ');
}

/** Business-framed explanation for one audit result — Part 5. */
export function explainAuditResultForExecutive(result: AuditResult): ExecutiveAuditExplain {
  const { severity, labelAr: severityLabelAr } = severityFromResult(result);
  const affectedKpiIds = SECTION_KPI_IDS[result.section] ?? [];
  const knowledge = findKnowledge(result);

  const problemAr = knowledge
    ? knowledge.problemTemplateAr(result)
    : `${result.kpi}: القيمة المُعلَنة ${result.reportValue}${result.unit} لا تطابق القيمة المُعاد حسابها ${result.auditValue}${result.unit} (فرق ${result.diff}${result.unit}, ${result.pctDiff}%).`;

  const currentMatchPercent = Math.max(0, Math.min(100, round2(100 - Math.abs(result.pctDiff))));
  // Realistic post-fix target = back inside the audit engine's own WARN
  // tolerance band — not a fabricated 100%, since exact-match isn't the
  // engine's own PASS bar either.
  const expectedResultPercent = Math.max(
    currentMatchPercent,
    Math.min(100, round2(100 - result.toleranceWarnPct))
  );
  const interventionType = SECTION_INTERVENTION_TYPE[result.section] ?? 'technical';

  return {
    id: result.id,
    status: result.status,
    severity,
    severityLabelAr,
    problemAr,
    businessImpactAr: businessImpactAr(result, affectedKpiIds),
    whyAr: result.note ? `${knowledge?.whyAr ?? DEFAULT_FIX.whyAr} (ملاحظة التدقيق: ${result.note})` : (knowledge?.whyAr ?? DEFAULT_FIX.whyAr),
    howToFixAr: knowledge?.howToFixAr ?? DEFAULT_FIX.howToFixAr,
    estimatedTimeAr: SECTION_ESTIMATED_TIME_AR[result.section] ?? '15–30 دقيقة (تقدير عام)',
    responsibleModuleAr: SECTION_OWNER_AR[result.section] ?? `Section ${result.section}`,
    affectedKpiIds,
    fixGuideStepsAr: knowledge?.fixGuideStepsAr ?? DEFAULT_FIX.fixGuideStepsAr,
    currentMatchPercent,
    expectedResultPercent,
    interventionType,
    interventionTypeLabelAr: INTERVENTION_LABEL_AR[interventionType],
  };
}

export function explainAuditReportForExecutive(results: AuditResult[]): ExecutiveAuditExplain[] {
  return results
    .filter((r) => r.status !== 'PASS')
    .map(explainAuditResultForExecutive)
    .sort((a, b) => {
      const rank: Record<ExecutiveSeverity, number> = { critical: 4, high: 3, medium: 2, low: 1 };
      return rank[b.severity] - rank[a.severity];
    });
}
