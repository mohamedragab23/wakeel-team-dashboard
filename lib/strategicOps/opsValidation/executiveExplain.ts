/**
 * SRS-010 Part 7 — Ops Validation Center, business-framed.
 *
 * Every failed/skipped operational test gets: Scenario / Expected Result /
 * Actual Result / Affected KPIs / Business impact / Suggested fix / Code
 * location / Estimated effort — derived deterministically from the test's
 * own module/group + the numbers already produced by the suite run.
 */

import type { ValidationModule, ValidationTestResult } from './types';
import { getKpiDef } from '@/lib/strategicOps/kpiIntelligence';

export type ExecutiveValidationExplain = {
  id: string;
  status: ValidationTestResult['status'];
  scenarioAr: string;
  expectedResultAr: string;
  actualResultAr: string;
  affectedKpiIds: string[];
  businessImpactAr: string;
  suggestedFixAr: string;
  codeLocation: string;
  estimatedEffortAr: string;
  critical: boolean;
  /** SRS-011 Part 8 — explicit pass/fail flag (kept explicit even though this
   *  list is pre-filtered to failures, so the UI never has to infer it). */
  succeeded: boolean;
  succeededLabelAr: string;
  /** SRS-011 Part 8 — who owns fixing this module. */
  ownerAr: string;
};

const MODULE_CODE_LOCATION: Record<ValidationModule, string> = {
  kpi_engine: 'lib/strategicOps/kpi/calculators.ts + calculators-part2.ts',
  filters: 'lib/strategicOps/opsValidation/filterPipeline.ts',
  ai: 'lib/strategicOps/opsValidation/aiDecisionRules.ts',
  forecast: 'lib/strategicOps/trust/forecastValidation.ts',
  security: 'lib/strategicOps/apiAuth.ts + middleware',
  export: 'lib/strategicOps/clientExport.ts + opsValidation/exportValidation.ts',
  attribution: 'lib/strategicOps/opsValidation/attribution.ts + controlTower/gapAttribution.ts',
  lost_hours: 'lib/strategicOps/opsValidation/lostHoursExclusive.ts',
  data_integrity: 'lib/strategicOps/dataIntegrity.ts + validators/dataValidator.ts',
  performance: 'lib/strategicOps/opsValidation/phase3Suites.ts (performance suite)',
  business_logic: 'lib/strategicOps/talabatOpsMetrics.ts + buildReport.ts',
};

const MODULE_AFFECTED_KPI_IDS: Record<ValidationModule, string[]> = {
  kpi_engine: ['target_achievement', 'active_riders', 'utilization'],
  filters: ['target_achievement', 'active_riders'],
  ai: ['trust_score'],
  forecast: ['forecast_accuracy'],
  security: ['trust_score'],
  export: ['trust_score'],
  attribution: ['target_achievement', 'active_riders'],
  lost_hours: ['target_achievement'],
  data_integrity: ['data_quality', 'ghost_riders'],
  performance: ['trust_score'],
  business_logic: ['active_riders', 'target_achievement'],
};

const MODULE_LABEL_AR: Record<ValidationModule, string> = {
  kpi_engine: 'محرك المؤشرات',
  filters: 'محرك الفلاتر',
  ai: 'قواعد قرار الذكاء الاصطناعي',
  forecast: 'محرك التوقعات',
  security: 'الأمن والصلاحيات',
  export: 'التصدير',
  attribution: 'محرك توزيع الأثر (Attribution)',
  lost_hours: 'الساعات المفقودة',
  data_integrity: 'سلامة البيانات',
  performance: 'الأداء',
  business_logic: 'منطق الأعمال الأساسي',
};

/** SRS-011 Part 8 — who is responsible for fixing each module. */
const MODULE_OWNER_AR: Record<ValidationModule, string> = {
  kpi_engine: 'فريق الهندسة — محرك المؤشرات',
  filters: 'فريق الهندسة — Backend',
  ai: 'فريق الذكاء الاصطناعي / التحليلات',
  forecast: 'فريق التحليلات والتنبؤ',
  security: 'فريق الأمن (Security) — أولوية قصوى',
  export: 'فريق الهندسة — Backend',
  attribution: 'فريق التحليلات',
  lost_hours: 'فريق التحليلات',
  data_integrity: 'فريق جودة البيانات',
  performance: 'فريق الهندسة — Backend/Infra',
  business_logic: 'فريق الهندسة — منطق الأعمال',
};

const MODULE_ESTIMATED_EFFORT_AR: Record<ValidationModule, string> = {
  kpi_engine: '30 دقيقة (مراجعة صيغة الحساب في calculators)',
  filters: '20 دقيقة (مراجعة سلسلة تطبيق الفلاتر)',
  ai: '20 دقيقة (مراجعة عتبة القرار في aiDecisionRules.ts)',
  forecast: '30–45 دقيقة (مراجعة نافذة الانحدار والتغطية التاريخية)',
  security: '45+ دقيقة (مراجعة أمنية — أولوية قصوى)',
  export: '20 دقيقة (مراجعة توليد الملف والتنسيق)',
  attribution: '30 دقيقة (مراجعة توزيع الأثر اليومي بين المشرفين/المناطق)',
  lost_hours: '20 دقيقة (مراجعة تصنيف الفئة الحصري)',
  data_integrity: '15–30 دقيقة (تنظيف/تطبيع بيانات)',
  performance: '45+ دقيقة (تحسين استعلامات/تخزين مؤقت)',
  business_logic: '20–30 دقيقة (مراجعة القاعدة الأساسية المعطلة)',
};

function businessImpactFor(module: ValidationModule, r: ValidationTestResult): string {
  const kpiLabels = (MODULE_AFFECTED_KPI_IDS[module] ?? [])
    .map((id) => getKpiDef(id)?.labelAr)
    .filter((v): v is string => Boolean(v));
  const kpiPart = kpiLabels.length > 0 ? `يهدد دقة: ${kpiLabels.join('، ')}.` : '';
  const criticalPart = r.critical
    ? 'هذا اختبار حرج (critical) — فشله يمنع اعتماد الشهادة التشغيلية بالكامل حتى يُصلَح.'
    : 'اختبار غير حرج — لا يمنع الاعتماد لكنه يقلل درجة الثقة التشغيلية.';
  return `${kpiPart} ${criticalPart}`.trim();
}

function suggestedFixFor(module: ValidationModule): string {
  const fixes: Record<ValidationModule, string> = {
    kpi_engine: 'راجع صيغة الحساب في calculators.ts وقارنها بالتوقع المكتوب في هذا الاختبار — الفارق غالبًا في القسمة أو الفلترة.',
    filters: 'تأكد أن كل فلتر (منطقة/مشرف/تاريخ) يُطبَّق قبل التجميع لا بعده.',
    ai: 'راجع عتبة القرار (threshold) في aiDecisionRules.ts وتأكد أنها تطابق السيناريو المتوقع.',
    forecast: 'وسّع نافذة البيانات التاريخية أو استبعد الأيام الناقصة من الانحدار بدل تفريغها كأصفار.',
    security: 'راجع صلاحيات الدور (RBAC) والتحقق من التوكن — لا تنشر أي تغيير حتى ينجح هذا الاختبار.',
    export: 'راجع تنسيق الملف المُصدَّر وتأكد من مطابقته للقيم المعروضة في الشاشة.',
    attribution: 'راجع توزيع الأثر اليومي عند تغيّر المشرف/المنطقة منتصف الأسبوع — يجب أن يكون بالتناسب اليومي لا بالكامل لأحد الطرفين.',
    lost_hours: 'تأكد أن كل يوم يُصنَّف لفئة واحدة فقط (Exclusive) حتى عند وجود أكثر من سبب.',
    data_integrity: 'شغّل تطبيع أكواد الطيارين وراجع Ghost Rider Audit.',
    performance: 'أضف تخزينًا مؤقتًا أو قلّص حجم الاستعلام المتكرر — راجع زمن الاستجابة الفعلي في System Integrity.',
    business_logic: 'راجع القاعدة الأساسية (Active Rider / Daily Average / Talabat Week) في businessRules.ts وطابقها مع كل نقاط الاستخدام.',
  };
  return fixes[module];
}

export function explainValidationResultForExecutive(r: ValidationTestResult): ExecutiveValidationExplain {
  const succeeded = r.status === 'pass';
  return {
    id: r.id,
    status: r.status,
    scenarioAr: r.detailAr ? `${r.titleAr} — ${r.detailAr}` : r.titleAr,
    expectedResultAr: r.expected,
    actualResultAr: r.actual,
    affectedKpiIds: MODULE_AFFECTED_KPI_IDS[r.module] ?? [],
    businessImpactAr: businessImpactFor(r.module, r),
    suggestedFixAr: suggestedFixFor(r.module),
    codeLocation: MODULE_CODE_LOCATION[r.module] ?? 'غير محدد',
    estimatedEffortAr: MODULE_ESTIMATED_EFFORT_AR[r.module] ?? '15–30 دقيقة (تقدير عام)',
    critical: r.critical,
    succeeded,
    succeededLabelAr: succeeded ? '✅ نجح' : r.status === 'error' ? '❌ خطأ تنفيذ' : '❌ لم ينجح',
    ownerAr: MODULE_OWNER_AR[r.module] ?? 'غير محدد',
  };
}

export function explainValidationReportForExecutive(
  results: ValidationTestResult[]
): ExecutiveValidationExplain[] {
  return results
    .filter((r) => r.status === 'fail' || r.status === 'error')
    .map(explainValidationResultForExecutive)
    .sort((a, b) => Number(b.critical) - Number(a.critical));
}

export { MODULE_LABEL_AR };
