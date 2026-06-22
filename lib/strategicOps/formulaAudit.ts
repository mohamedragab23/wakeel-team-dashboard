import type { StrategicOpsReport } from '@/lib/strategicOps/buildReport';
import type { RoadmapRidersAudit } from '@/lib/strategicOps/roadmapCalculation';

export type FormulaAuditStatus = 'valid' | 'warning' | 'insufficient_data';

export type FormulaAuditRow = {
  kpi: string;
  formula: string;
  rawData: string;
  result: string;
  status: FormulaAuditStatus;
  statusReason?: string;
  numerator?: number;
  numeratorLabel?: string;
  denominator?: number;
  denominatorLabel?: string;
  rawDataSource?: string;
};

export type ResignationAuditRecord = {
  sheetRow: number;
  riderCode: string;
  riderName: string;
  supervisorCode: string;
  statusRaw: string;
  requestDate: string | null;
  approvalDate: string;
  included: boolean;
  dedupeNote?: string;
};

export type RiderLifetimeSample = {
  riderCode: string;
  riderName: string;
  joinDate: string | null;
  joinSource: string;
  approvalDate: string;
  approvalSource: string;
  lifetimeDays: number;
};

export type OperationalFormulaAudit = {
  validationTable: FormulaAuditRow[];
  attrition: {
    formula: string;
    numerator: number;
    numeratorLabel: string;
    denominator: number;
    denominatorLabel: string;
    calculation: string;
    resultPercent: number;
    explanation: string;
    activeDaysWithData: number;
    dailyActiveCountsSample: string;
  };
  riderLifetime: {
    formula: string;
    joinDateColumn: string;
    approvalDateColumns: string;
    samples: RiderLifetimeSample[];
    ridersWithJoinDate: number;
    ridersWithoutJoinDate: number;
    calculation: string;
    resultDays: number | null;
  };
  daily2200Roadmap: {
    formula: string;
    variables: Record<string, number | string>;
    calculation: string;
    additionalRidersFormula: string;
    additionalRidersCalculation: string;
    additionalRidersResult: number;
    ridersAudit: RoadmapRidersAudit;
    mathValidationPassed: boolean;
    warning?: string;
  };
  hoursDistribution: {
    basis: 'average_daily_hours';
    basisLabelAr: string;
    formula: string;
    classificationLogic: string;
    periodDays: number;
    example: string;
  };
  approvedResignations: {
    formula: string;
    rawRowsMatched: number;
    afterDedupe: number;
    duplicatesRemoved: number;
    records: ResignationAuditRecord[];
  };
  lostHours: {
    categories: Array<{
      key: string;
      label: string;
      formula: string;
      rawData: string;
      resultHours: number;
      resultHoursDaily: number;
    }>;
  };
};

function auditStatus(warning: boolean, reason?: string): { status: FormulaAuditStatus; statusReason?: string } {
  return warning ? { status: 'warning', statusReason: reason } : { status: 'valid' };
}

export function buildOperationalFormulaAudit(input: {
  report: Omit<StrategicOpsReport, 'operationalFormulaAudit' | 'aiInsights'>;
  approvedResignationRecords: ResignationAuditRecord[];
  lifetimeSamples: RiderLifetimeSample[];
  ridersWithJoinDate: number;
  ridersWithoutJoinDate: number;
  dailyActiveCounts: number[];
  rawResignationRowsMatched: number;
  duplicatesRemoved: number;
  zeroHourRiderCount: number;
  weakRiderCount: number;
  avgDailyHoursPerActiveRider: number;
  periodDays: number;
}): OperationalFormulaAudit {
  const { report: r } = input;
  const es = r.executiveSummary;
  const attr = r.attrition;
  const ha = r.hoursAnalysis;
  const hr = r.hoursRoadmap;
  const lh = r.lostHours;
  const ge = r.growthExpansion;

  const attritionExplanation =
    `تم حساب ${attr.attritionRate}% لأن البسط = ${attr.approvedResignations} إقالة معتمدة ` +
    `والمقام = ${attr.averageActiveRidersDuringPeriod} (متوسط الطيارين النشطين يومياً عبر ${input.dailyActiveCounts.length} يوماً ببيانات). ` +
    `الحساب: ${attr.approvedResignations} ÷ ${attr.averageActiveRidersDuringPeriod} × 100 = ${attr.attritionRate}%.`;

  const attritionWarning =
    attr.attritionRate > 25 ||
    attr.averageActiveRidersDuringPeriod < es.activeRiders * 0.4 ||
    input.dailyActiveCounts.length < input.periodDays * 0.5;

  const attritionAudit = {
    formula: 'نسبة التسرب = الإقالات المعتمدة ÷ متوسط الطيارين النشطين يومياً × 100',
    numerator: attr.approvedResignations,
    numeratorLabel: 'إقالات معتمدة (بعد إزالة التكرار لكل طيار)',
    denominator: attr.averageActiveRidersDuringPeriod,
    denominatorLabel: 'متوسط عدد الطيارين ذوي ساعات > 0 لكل يوم في الفترة',
    calculation: `${attr.approvedResignations} ÷ ${attr.averageActiveRidersDuringPeriod} × 100 = ${attr.attritionRate}%`,
    resultPercent: attr.attritionRate,
    explanation: attritionExplanation,
    activeDaysWithData: input.dailyActiveCounts.length,
    dailyActiveCountsSample:
      input.dailyActiveCounts.length > 0
        ? `عينة: [${input.dailyActiveCounts.slice(0, 5).join(', ')}${input.dailyActiveCounts.length > 5 ? ', …' : ''}]`
        : 'لا توجد أيام ببيانات نشاط',
  };

  const lifetimeResult = attr.averageRiderLifetimeDays;
  const lifetimeCalculation =
    !attr.riderLifetimeKpiEnabled
      ? attr.riderLifetimeDisabledReason ?? 'معطّل — تغطية تاريخ الانضمام دون 80%'
      : input.lifetimeSamples.length > 0
        ? `متوسط(${input.lifetimeSamples.map((s) => s.lifetimeDays).join(' + ')}) ÷ ${input.lifetimeSamples.length} = ${lifetimeResult} يوم`
        : 'لا توجد إقالات مع تاريخ انضمام صالح';

  const avgDailyPerActive = input.avgDailyHoursPerActiveRider;

  const ridersAudit = hr.ridersAudit ?? hr.calculationTrace.ridersAudit;

  const daily2200Audit = {
    formula: 'فجوة يومية = 2200 − متوسط الساعات اليومية؛ طيارون إضافيون = ⌈فجوة يومية ÷ متوسط ساعات الطيار النشط يومياً⌉',
    variables: {
      هدف_يومي: hr.targetDailyHours,
      متوسط_يومي_حالي: hr.currentDailyHours,
      فجوة_يومية: hr.dailyGap,
      إجمالي_الفترة_مرجع: hr.currentPeriodHours,
      أيام_الفترة: hr.periodDays,
      طيارون_نشطون: es.activeRiders,
      متوسط_ساعات_النشط_يومياً: avgDailyPerActive,
    },
    calculation: `${hr.targetDailyHours} − ${hr.currentDailyHours} = ${hr.dailyGap} ساعة/يوم`,
    additionalRidersFormula: hr.calculationTrace.additionalRidersFormula,
    additionalRidersCalculation: hr.calculationTrace.additionalRidersCalculation,
    additionalRidersResult: hr.additionalActiveRidersNeeded,
    ridersAudit,
    mathValidationPassed: hr.mathValidationPassed,
    warning: 'تم تصحيح الخارطة: المقارنة يومية فقط (لا تُقارن ساعات الفترة الكلية بهدف 2200 يومي).',
  };

  const hoursDistAudit = {
    basis: 'average_daily_hours' as const,
    basisLabelAr: 'متوسط الساعات اليومية (وليس إجمالي الشهر)',
    formula: 'متوسط يومي للطيار = إجمالي ساعاته في الفترة ÷ عدد أيام الفترة',
    classificationLogic:
      'يُصنَّف كل طيار حسب متوسط ساعاته اليومية: 0 | <2 | 2-4 | 4-6 | 6-8 | 8-10 | >10',
    periodDays: input.periodDays,
    example: `مثال: طيار بـ 120 ساعة خلال ${input.periodDays} يوم → 120 ÷ ${input.periodDays} = ${round2(120 / Math.max(input.periodDays, 1))} ساعة/يوم`,
  };

  const weakRiders = lh.breakdown.find((b) => b.categoryKey === 'weak_operation');
  const noOp = lh.breakdown.find((b) => b.categoryKey === 'no_operation');
  const resignLoss = lh.breakdown.find((b) => b.categoryKey === 'resignations');

  const lostHoursAudit = {
    categories: [
      {
        key: 'no_operation',
        label: noOp?.category ?? 'عدم التشغيل',
        formula: 'عدد الطيارين بصفر ساعات × 10 ساعات/يوم × أيام الفترة',
        rawData: `${input.zeroHourRiderCount} طيار × 10 × ${input.periodDays} يوم`,
        resultHours: noOp?.hours ?? 0,
        resultHoursDaily: noOp?.hoursDual.daily ?? 0,
      },
      {
        key: 'weak_operation',
        label: weakRiders?.category ?? 'ضعف التشغيل',
        formula: 'Σ لكل طيار (6 − متوسطه اليومي) × أيام الفترة — حيث 0 < متوسط < 6',
        rawData: `${input.weakRiderCount} طيار تحت 6 ساعات/يوم متوسط`,
        resultHours: weakRiders?.hours ?? 0,
        resultHoursDaily: weakRiders?.hoursDual.daily ?? 0,
      },
      {
        key: 'resignations',
        label: resignLoss?.category ?? 'الإقالات',
        formula: 'Σ لكل إقالة معتمدة: أيام من تاريخ الموافقة حتى نهاية الفترة × 10 ساعات/يوم',
        rawData: `${attr.approvedResignations} إقالة (فريدة لكل طيار)`,
        resultHours: resignLoss?.hours ?? 0,
        resultHoursDaily: resignLoss?.hoursDual.daily ?? 0,
      },
    ],
  };

  const resignationAudit = {
    formula:
      'شيت طلبات_الإقالة: حالة معتمدة + تاريخ الموافقة ضمن الفترة؛ طيار واحد = إقالة واحدة (أحدث موافقة)',
    rawRowsMatched: input.rawResignationRowsMatched,
    afterDedupe: input.approvedResignationRecords.filter((x) => x.included).length,
    duplicatesRemoved: input.duplicatesRemoved,
    records: input.approvedResignationRecords,
  };

  const validationTable: FormulaAuditRow[] = [
    ...r.talabatOperations.auditTraces.map((trace) => ({
      kpi: trace.kpi,
      formula: trace.formula,
      rawData: `بسط=${trace.numerator} (${trace.numeratorLabel}) | مقام=${trace.denominator} (${trace.denominatorLabel})`,
      result: String(trace.result),
      status: trace.status,
      numerator: trace.numerator,
      numeratorLabel: trace.numeratorLabel,
      denominator: trace.denominator,
      denominatorLabel: trace.denominatorLabel,
      rawDataSource: trace.rawDataSource,
    })),
    {
      kpi: 'نسبة التسرب',
      formula: attritionAudit.formula,
      rawData: `بسط=${attritionAudit.numerator} | مقام=${attritionAudit.denominator}`,
      result: `${attr.attritionRate}%`,
      ...auditStatus(
        attritionWarning,
        attritionWarning
          ? 'المقام منخفض أو أيام النشاط قليلة — النسبة قد تبدو مرتفعة (مثل 54.57%)'
          : undefined
      ),
    },
    {
      kpi: 'متوسط عمر الطيار',
      formula: 'تاريخ الموافقة (طلبات_الإقالة) − تاريخ الانضمام (المناديب عمود G)',
      rawData: `تغطية انضمام=${r.joinDateAudit.joinDateCoveragePercent}% | ${input.ridersWithJoinDate} بتاريخ | ${input.ridersWithoutJoinDate} بدون`,
      result: attr.riderLifetimeKpiEnabled ? `${lifetimeResult} يوم` : 'معطّل',
      ...auditStatus(
        !attr.riderLifetimeKpiEnabled ||
          (input.ridersWithoutJoinDate > 0 && input.lifetimeSamples.length < attr.approvedResignations),
        attr.riderLifetimeDisabledReason ??
          'بعض الإقالات بدون تاريخ انضمام صالح في شيت المناديب'
      ),
    },
    {
      kpi: 'طيارون إضافيون لـ 2200 ساعة/يوم',
      formula: daily2200Audit.additionalRidersFormula,
      rawData: `فجوة=${hr.dailyGap} | متوسط نشط يومياً=${avgDailyPerActive}`,
      result: String(hr.additionalActiveRidersNeeded),
      status: 'valid',
    },
    {
      kpi: 'خارطة 2200 ساعة',
      formula: '2200 − متوسط الساعات اليومية (لا تُستخدم ساعات الفترة الكلية)',
      rawData: `يومي حالي=${hr.currentDailyHours} | فترة=${hr.currentPeriodHours} (${hr.periodDays} يوم)`,
      result: `فجوة يومية ${hr.dailyGap} ساعة`,
      status: 'valid',
    },
    {
      kpi: 'توزيع الساعات',
      formula: hoursDistAudit.formula,
      rawData: `أساس: متوسط يومي | أيام=${input.periodDays}`,
      result: hoursDistAudit.basisLabelAr,
      status: 'valid',
    },
    {
      kpi: 'نموذج القيم المزدوجة (يومي/فترة)',
      formula: 'القيمة اليومية = إجمالي الفترة ÷ أيام التقويم — العرض الافتراضي يومي',
      rawData: `أيام التطبيع=${r.meta.normalizationCalendarDays} | هدف يومي=${r.meta.dailyHoursTarget} | خط أساس=${r.meta.dailyHoursBaseline}`,
      result: `متوسط أسطول يومي=${ha.averageDailyHours} | فترة=${ha.totalHours}`,
      status: 'valid',
    },
    {
      kpi: 'ترتيب الطيارين والمشرفين',
      formula: 'الترتيب والتصنيف والفرص والساعات المهدرة تُحسب بالمتوسط اليومي',
      rawData: `top20 avgDaily | supervisor productivity من avgHoursPerRiderDaily`,
      result: 'يومي افتراضي',
      status: 'valid',
    },
    {
      kpi: 'الإقالات المعتمدة',
      formula: resignationAudit.formula,
      rawData: `صفوف خام=${input.rawResignationRowsMatched} | بعد إزالة التكرار=${resignationAudit.afterDedupe}`,
      result: String(es.approvedResignations),
      ...auditStatus(input.duplicatesRemoved > 0, `تم حذف ${input.duplicatesRemoved} تكرار`),
    },
    {
      kpi: 'ساعات مهدرة — عدم التشغيل',
      formula: lostHoursAudit.categories[0].formula,
      rawData: lostHoursAudit.categories[0].rawData,
      result: `${lostHoursAudit.categories[0].resultHoursDaily} س/يوم (فترة: ${lostHoursAudit.categories[0].resultHours})`,
      status: 'valid',
    },
    {
      kpi: 'ساعات مهدرة — ضعف التشغيل',
      formula: lostHoursAudit.categories[1].formula,
      rawData: lostHoursAudit.categories[1].rawData,
      result: `${lostHoursAudit.categories[1].resultHoursDaily} س/يوم (فترة: ${lostHoursAudit.categories[1].resultHours})`,
      status: 'valid',
    },
    {
      kpi: 'ساعات مهدرة — الإقالات',
      formula: lostHoursAudit.categories[2].formula,
      rawData: lostHoursAudit.categories[2].rawData,
      result: `${lostHoursAudit.categories[2].resultHoursDaily} س/يوم (فترة: ${lostHoursAudit.categories[2].resultHours})`,
      status: 'valid',
    },
    {
      kpi: 'معدل الاستغلال (Talabat)',
      formula: 'متوسط الطيارين النشطين يومياً ÷ Headcount × 100',
      rawData: `${es.activeRiders} ÷ ${es.totalRegisteredRiders}`,
      result: `${es.utilizationRate}%`,
      status: 'valid',
      numerator: es.activeRiders,
      numeratorLabel: 'متوسط النشطين يومياً',
      denominator: es.totalRegisteredRiders,
      denominatorLabel: 'Headcount',
      rawDataSource: 'البيانات اليومية + المناديب',
    },
    {
      kpi: 'الطيارون النشطون (Talabat)',
      formula: 'AVG(COUNT(DISTINCT rider WHERE hours > 0 ON DAY))',
      rawData: `فريدون بالفترة (تشخيص): ${es.uniqueActiveRidersInPeriod}`,
      result: String(es.activeRiders),
      status: 'valid',
      numerator: es.activeRiders,
      numeratorLabel: 'متوسط النشطين يومياً',
      denominator: r.meta.normalizationCalendarDays,
      denominatorLabel: 'أيام التقويم',
      rawDataSource: 'البيانات اليومية',
    },
    {
      kpi: 'No Show (Talabat)',
      formula:
        'AVG على أيام التشغيل: طيار مجدول (صف يومي + معيّن) AND hours=0 AND orders=0 — يُستبعد المعيّن بلا صف',
      rawData: `${r.talabatOperations.operationalDays} يوم تشغيل`,
      result: String(es.noShowRiders),
      status: 'valid',
      numerator: es.noShowRiders,
      numeratorLabel: 'متوسط No Show يومياً',
      denominator: r.talabatOperations.operationalDays || 1,
      denominatorLabel: 'أيام بها طيارون مجدولون',
      rawDataSource: 'البيانات اليومية + المناديب',
    },
    {
      kpi: 'الطيارون غير النشطين',
      formula: 'SUM(ساعات)=0 AND SUM(طلبات)=0',
      rawData: `يساوي بدون نشاط`,
      result: String(es.inactiveRiders),
      status: es.inactiveRiders === es.ridersWithNoActivity ? 'valid' : 'warning',
      statusReason:
        es.inactiveRiders !== es.ridersWithNoActivity ? 'عدم تطابق غير نشط / بدون نشاط' : undefined,
    },
  ];

  return {
    validationTable,
    attrition: attritionAudit,
    riderLifetime: {
      formula: 'عمر الطيار = تاريخ الموافقة على الإقالة − تاريخ الانضمام (بالأيام)',
      joinDateColumn: 'المناديب — العمود G (تاريخ الانضمام)',
      approvalDateColumns: 'طلبات_الإقالة — العمود H (تاريخ الموافقة) أو G (تاريخ الطلب)',
      samples: input.lifetimeSamples,
      ridersWithJoinDate: input.ridersWithJoinDate,
      ridersWithoutJoinDate: input.ridersWithoutJoinDate,
      calculation: lifetimeCalculation,
      resultDays: lifetimeResult,
    },
    daily2200Roadmap: daily2200Audit,
    hoursDistribution: hoursDistAudit,
    approvedResignations: resignationAudit,
    lostHours: lostHoursAudit,
  };
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
