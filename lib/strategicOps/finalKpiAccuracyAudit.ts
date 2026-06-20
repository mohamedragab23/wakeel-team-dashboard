import type { Rider } from '@/lib/adminService';
import { normalizeRiderCodeForPerformance } from '@/lib/dataFilter';
import type { StrategicOpsFilters } from '@/lib/strategicOps/buildReport';
import type { GhostRiderAuditReport, GhostRiderCategory } from '@/lib/strategicOps/ghostRiderAudit';
import { GHOST_CATEGORY_LABELS_AR } from '@/lib/strategicOps/ghostRiderAudit';
import type { JoinDateAuditReport } from '@/lib/strategicOps/joinDateAudit';
import type { KpiTrustReport } from '@/lib/strategicOps/kpiTrustLevel';
import type { DataIntegrityReport } from '@/lib/strategicOps/dataIntegrity';

export type FinalAuditGhostTopEntry = {
  code: string;
  name: string;
  hours: number;
  orders: number;
  rootCauseCategory: GhostRiderCategory;
  rootCauseLabelAr: string;
};

export type KpiGateStatus = {
  kpi: string;
  kpiAr: string;
  enabled: boolean;
  reasonAr: string;
};

export type ExecutiveAccuracyGrade =
  | 'executive'
  | 'operational'
  | 'caution'
  | 'not_decision_ready';

export type FinalKpiAccuracyAudit = {
  title: 'FINAL KPI ACCURACY AUDIT';
  generatedAt: string;
  ghostVerification: {
    actualGhostRiders: number;
    codeMismatchCount: number;
    missingFromMasterCount: number;
    zoneFilterExcludedCount: number;
    supervisorFilterExcludedCount: number;
    ghostLeakageHours: number;
    ghostLeakageOrders: number;
    ghostLeakagePercent: number;
    top100: FinalAuditGhostTopEntry[];
  };
  joinDateValidation: {
    joinDateCoveragePercent: number;
    validJoinDates: number;
    missingJoinDates: number;
    averageRiderLifetimeEnabled: boolean;
    averageRiderLifetimeValue: null;
    lifetimeDisplayBlocked: boolean;
    lifetimeBlockReason?: string;
  };
  activeRidersConsistency: {
    uniqueActiveRidersInPeriod: number;
    averageDailyActiveRiders: number;
    dailyActiveMin: number;
    dailyActiveMax: number;
    dailyActiveStdDev: number;
    daysWithData: number;
    discrepancyExplanationAr: string;
  };
  roadmapValidation: {
    dailyGap: number;
    averageDailyHoursPerActiveRider: number;
    formula: string;
    additionalRidersNeeded: number;
    additionalRidersCalculation: string;
    zeroOnlyWhenGapNonPositive: boolean;
    zeroValidationPassed: boolean;
    forecastDisabled: boolean;
    forecastDisabledReason?: string;
  };
  kpiTrustVerification: {
    trustLevel: number;
    trustLabelAr: string;
    dataQualityScore: number;
    ghostLeakagePercent: number;
    gateStatus: 'open' | 'warning' | 'low_confidence' | 'closed';
    gateStatusAr: string;
    kpiGates: KpiGateStatus[];
  };
  executiveAccuracyScore: {
    score: number;
    grade: ExecutiveAccuracyGrade;
    gradeLabelAr: string;
    components: {
      dataQuality: number;
      ghostLeakageInverse: number;
      joinDateCoverage: number;
      duplicateIntegrity: number;
      scopeIntegrity: number;
    };
    weights: {
      dataQuality: number;
      ghostLeakageInverse: number;
      joinDateCoverage: number;
      duplicateIntegrity: number;
      scopeIntegrity: number;
    };
  };
  managementTrust: {
    canTrust: boolean;
    answerAr: 'نعم' | 'لا';
    reasons: string[];
  };
};

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function stdDev(values: number[]): number {
  if (values.length === 0) return 0;
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  const variance = values.reduce((s, v) => s + (v - mean) ** 2, 0) / values.length;
  return round2(Math.sqrt(variance));
}

function gradeFromScore(score: number): { grade: ExecutiveAccuracyGrade; labelAr: string } {
  if (score >= 90) return { grade: 'executive', labelAr: 'Executive Grade (٩٠–١٠٠)' };
  if (score >= 80) return { grade: 'operational', labelAr: 'Operational Grade (٨٠–٨٩)' };
  if (score >= 70) return { grade: 'caution', labelAr: 'Use With Caution (٧٠–٧٩)' };
  return { grade: 'not_decision_ready', labelAr: 'Not Decision Ready (<٧٠)' };
}

function classifyScopeExclusionReason(
  master: Rider,
  filters: StrategicOpsFilters,
  ridersScoped: Rider[],
  ridersInScope: Rider[],
  supervisorCodesScoped: Set<string>
): 'zone' | 'supervisor' {
  const norm = normalizeRiderCodeForPerformance(master.code);
  const inScoped = ridersScoped.some((r) => normalizeRiderCodeForPerformance(r.code) === norm);
  if (!inScoped) {
    if (filters.supervisorCode !== 'all') return 'supervisor';
    if (filters.zone !== 'all') return 'zone';
    const sup = String(master.supervisorCode ?? '').trim();
    if (sup && !supervisorCodesScoped.has(sup)) return 'zone';
    return 'zone';
  }
  const inScope = ridersInScope.some((r) => normalizeRiderCodeForPerformance(r.code) === norm);
  if (!inScope) {
    const sup = String(master.supervisorCode ?? '').trim();
    if (filters.supervisorCode !== 'all' && sup !== filters.supervisorCode) return 'supervisor';
    if (sup && !supervisorCodesScoped.has(sup)) return 'supervisor';
    return 'supervisor';
  }
  return 'supervisor';
}

export function buildFinalKpiAccuracyAudit(input: {
  filters: StrategicOpsFilters;
  dataIntegrity: DataIntegrityReport;
  ghostRiderAudit: GhostRiderAuditReport;
  joinDateAudit: JoinDateAuditReport;
  kpiTrust: KpiTrustReport;
  allMasterRiders: Rider[];
  ridersScoped: Rider[];
  ridersInScope: Rider[];
  supervisorCodesScoped: Set<string>;
  uniqueActiveRidersInPeriod: number;
  averageDailyActiveRiders: number;
  dailyActiveCounts: number[];
  hoursRoadmap: {
    dailyGap: number;
    additionalActiveRidersNeeded: number;
    calculationTrace: {
      formula: string;
      avgDailyHoursPerActiveRider: number;
      additionalRidersFormula: string;
      additionalRidersCalculation: string;
      forecastDisabled: boolean;
      forecastDisabledReason?: string;
    };
  };
  ghostLeakageOrders: number;
  generatedAt: string;
}): FinalKpiAccuracyAudit {
  const {
    filters,
    dataIntegrity,
    ghostRiderAudit,
    joinDateAudit,
    kpiTrust,
    allMasterRiders,
    ridersScoped,
    ridersInScope,
    supervisorCodesScoped,
    uniqueActiveRidersInPeriod,
    averageDailyActiveRiders,
    dailyActiveCounts,
    hoursRoadmap,
    ghostLeakageOrders,
    generatedAt,
  } = input;

  const masterByNorm = new Map<string, Rider>();
  for (const r of allMasterRiders) {
    const n = normalizeRiderCodeForPerformance(r.code);
    if (n) masterByNorm.set(n, r);
  }

  let zoneFilterExcludedCount = 0;
  let supervisorFilterExcludedCount = 0;
  const zoneRiders = new Set<string>();
  const supRiders = new Set<string>();

  for (const entry of dataIntegrity.scopeExcludedRiders) {
    const master = masterByNorm.get(entry.riderCode);
    if (!master) continue;
    const reason = classifyScopeExclusionReason(
      master,
      filters,
      ridersScoped,
      ridersInScope,
      supervisorCodesScoped
    );
    if (reason === 'zone') {
      zoneFilterExcludedCount += 1;
      zoneRiders.add(entry.riderCode);
    } else {
      supervisorFilterExcludedCount += 1;
      supRiders.add(entry.riderCode);
    }
  }

  const codeMismatchCount = ghostRiderAudit.rootCauseSummary.counts.code_mismatch;
  const missingFromMasterCount =
    ghostRiderAudit.rootCauseSummary.counts.missing_master +
    ghostRiderAudit.rootCauseSummary.counts.normalization_failed;

  const actualGhostRiders = ghostRiderAudit.riders.filter(
    (r) => r.category !== 'zone_filtering'
  ).length;

  const top100: FinalAuditGhostTopEntry[] = ghostRiderAudit.riders.slice(0, 100).map((g) => ({
    code: g.rawRiderCode,
    name: g.riderName,
    hours: g.totalHours,
    orders: g.totalOrders,
    rootCauseCategory: g.category,
    rootCauseLabelAr: GHOST_CATEGORY_LABELS_AR[g.category],
  }));

  const dailyMin = dailyActiveCounts.length > 0 ? Math.min(...dailyActiveCounts) : 0;
  const dailyMax = dailyActiveCounts.length > 0 ? Math.max(...dailyActiveCounts) : 0;
  const dailyStd = stdDev(dailyActiveCounts);

  const discrepancyExplanationAr =
    `«الطيارون النشطون» (${uniqueActiveRidersInPeriod}) = عدد الطيارين الفريدين بمجموع ساعات > 0 خلال الفترة بأكملها. ` +
    `«متوسط النشطين يومياً» (${averageDailyActiveRiders}) = متوسط عدد الطيارين الذين سجّلوا ساعات > 0 في كل يوم ببيانات (${dailyActiveCounts.length} يوم). ` +
    `الفرق طبيعي لأن الطيار لا يعمل كل يوم — مع الانحراف المعياري ${dailyStd} (أدنى يوم ${dailyMin}، أعلى يوم ${dailyMax}).`;

  const zeroValidationPassed =
    hoursRoadmap.dailyGap <= 0
      ? hoursRoadmap.additionalActiveRidersNeeded === 0
      : hoursRoadmap.additionalActiveRidersNeeded > 0 ||
        hoursRoadmap.calculationTrace.avgDailyHoursPerActiveRider <= 0;

  let gateStatus: FinalKpiAccuracyAudit['kpiTrustVerification']['gateStatus'];
  let gateStatusAr: string;
  if (kpiTrust.disableStiOrpsGrowthRoadmap) {
    gateStatus = 'closed';
    gateStatusAr = 'مغلقة — تسرب Ghost حرج';
  } else if (kpiTrust.lowConfidenceStrategic) {
    gateStatus = 'low_confidence';
    gateStatusAr = 'ثقة منخفضة';
  } else if (kpiTrust.warningOnly) {
    gateStatus = 'warning';
    gateStatusAr = 'تحذير — KPIs مفعّلة';
  } else {
    gateStatus = 'open';
    gateStatusAr = 'مفتوحة — ثقة كاملة';
  }

  const kpiGates: KpiGateStatus[] = [
    {
      kpi: 'STI / ORPS / RDE',
      kpiAr: 'ذكاء الحقيقة التشغيلية',
      enabled: !kpiTrust.disableStiOrpsGrowthRoadmap,
      reasonAr: kpiTrust.disableStiOrpsGrowthRoadmap
        ? `معطّل — ${kpiTrust.descriptionAr}`
        : kpiTrust.lowConfidenceStrategic
          ? 'مفعّل بثقة منخفضة (مستوى ٣)'
          : 'مفعّل',
    },
    {
      kpi: 'Growth Forecasts',
      kpiAr: 'توقعات النمو وفرص التوسع',
      enabled: !kpiTrust.disableStiOrpsGrowthRoadmap,
      reasonAr: kpiTrust.disableStiOrpsGrowthRoadmap
        ? `معطّل — تسرب Ghost ${kpiTrust.ghostLeakagePercent}%`
        : kpiTrust.warningOnly
          ? `مفعّل مع تحذير — ${kpiTrust.descriptionAr}`
          : 'مفعّل',
    },
    {
      kpi: '2200 Roadmap',
      kpiAr: 'خارطة ٢٢٠٠ ساعة يومياً',
      enabled: !hoursRoadmap.calculationTrace.forecastDisabled,
      reasonAr: hoursRoadmap.calculationTrace.forecastDisabled
        ? hoursRoadmap.calculationTrace.forecastDisabledReason ?? 'معطّل'
        : hoursRoadmap.dailyGap <= 0
          ? 'مفعّل — الهدف متحقق'
          : 'مفعّل — الحساب متاح',
    },
    {
      kpi: 'Rider Lifetime',
      kpiAr: 'متوسط عمر الطيار',
      enabled: joinDateAudit.riderLifetimeKpiEnabled,
      reasonAr: joinDateAudit.riderLifetimeDisabledReason ?? 'مفعّل',
    },
    {
      kpi: 'Executive KPIs',
      kpiAr: 'مؤشرات الملخص التنفيذي',
      enabled: true,
      reasonAr:
        kpiTrust.level <= 2
          ? 'مفعّل — من بيانات رسمية (official dataset)'
          : 'مفعّل مع تحفظ — راجع تسرب Ghost',
    },
    {
      kpi: 'Attrition Rate',
      kpiAr: 'نسبة التسرب',
      enabled: true,
      reasonAr: `مفعّل — مقام يومي (${averageDailyActiveRiders} متوسط نشط/يوم)`,
    },
  ];

  const duplicatePercent =
    dataIntegrity.totalRows > 0
      ? round2((dataIntegrity.duplicateRows / dataIntegrity.totalRows) * 100)
      : 0;
  const scopeAnomalyRatio =
    ridersInScope.length > 0
      ? (ghostRiderAudit.totalAnomalies + dataIntegrity.scopeExcludedRiderCount) / ridersInScope.length
      : 0;

  const weights = {
    dataQuality: 0.25,
    ghostLeakageInverse: 0.25,
    joinDateCoverage: 0.2,
    duplicateIntegrity: 0.15,
    scopeIntegrity: 0.15,
  };

  const components = {
    dataQuality: dataIntegrity.dataQualityScore,
    ghostLeakageInverse: round2(Math.max(0, 100 - kpiTrust.ghostLeakagePercent * 4)),
    joinDateCoverage: joinDateAudit.joinDateCoveragePercent,
    duplicateIntegrity: round2(Math.max(0, 100 - duplicatePercent * 3)),
    scopeIntegrity: round2(Math.max(0, 100 - Math.min(100, scopeAnomalyRatio * 100))),
  };

  const executiveScore = round2(
    components.dataQuality * weights.dataQuality +
      components.ghostLeakageInverse * weights.ghostLeakageInverse +
      components.joinDateCoverage * weights.joinDateCoverage +
      components.duplicateIntegrity * weights.duplicateIntegrity +
      components.scopeIntegrity * weights.scopeIntegrity
  );

  const { grade, labelAr: gradeLabelAr } = gradeFromScore(executiveScore);

  const blockers: string[] = [];
  if (executiveScore < 80) {
    blockers.push(`درجة الدقة التنفيذية ${executiveScore}/100 دون حد القبول الإداري (٨٠).`);
  }
  if (kpiTrust.level > 2) {
    blockers.push(
      `مستوى الثقة ${kpiTrust.level} — تسرب Ghost ${kpiTrust.ghostLeakagePercent}% (حد التحذير ٥٪، حد الحرج ٢٠٪).`
    );
  }
  if (!joinDateAudit.riderLifetimeKpiEnabled) {
    blockers.push(
      `تغطية تاريخ الانضمام ${joinDateAudit.joinDateCoveragePercent}% < ٨٠٪ — بيانات العمر غير موثوقة.`
    );
  }
  if (!zeroValidationPassed) {
    blockers.push(
      `تناقض خارطة ٢٢٠٠: فجوة ${hoursRoadmap.dailyGap} س/يوم لكن الطيارون الإضافيون = ${hoursRoadmap.additionalActiveRidersNeeded}.`
    );
  }
  if (kpiTrust.ghostLeakagePercent >= 10) {
    blockers.push(`تسرب Ghost ${kpiTrust.ghostLeakagePercent}% ≥ ١٠٪.`);
  }
  if (ghostRiderAudit.totalAnomalies > ridersInScope.length * 0.5) {
    blockers.push(
      `شذوذ بيانات مرتفع: ${ghostRiderAudit.totalAnomalies} حالة مقابل ${ridersInScope.length} مسجّل.`
    );
  }

  const canTrust = blockers.length === 0;
  const reasons = canTrust
    ? [
        `درجة الدقة ${executiveScore}/100 (${gradeLabelAr}).`,
        `مستوى الثقة ${kpiTrust.level} — تسرب Ghost ${kpiTrust.ghostLeakagePercent}%.`,
        `تغطية انضمام ${joinDateAudit.joinDateCoveragePercent}%.`,
        `خارطة ٢٢٠٠: فجوة ${hoursRoadmap.dailyGap} س/يوم → ${hoursRoadmap.additionalActiveRidersNeeded} طيار إضافي (تحقق: ${zeroValidationPassed ? 'PASS' : 'FAIL'}).`,
        `جودة البيانات ${dataIntegrity.dataQualityScore}/100.`,
        dataIntegrity.duplicateRows > 0
          ? `تنبيه: ${dataIntegrity.duplicateRows} تكرار محذوف (${duplicatePercent}%) — لا يمنع الثقة الحالية.`
          : `لا تكرارات حرجة في الفترة.`,
      ]
    : blockers;

  return {
    title: 'FINAL KPI ACCURACY AUDIT',
    generatedAt,
    ghostVerification: {
      actualGhostRiders,
      codeMismatchCount,
      missingFromMasterCount,
      zoneFilterExcludedCount: zoneRiders.size || zoneFilterExcludedCount,
      supervisorFilterExcludedCount: supRiders.size || supervisorFilterExcludedCount,
      ghostLeakageHours: dataIntegrity.ghostRiderLeakageHours,
      ghostLeakageOrders,
      ghostLeakagePercent: dataIntegrity.ghostLeakagePercent,
      top100,
    },
    joinDateValidation: {
      joinDateCoveragePercent: joinDateAudit.joinDateCoveragePercent,
      validJoinDates: joinDateAudit.ridersWithValidJoinDate,
      missingJoinDates: joinDateAudit.ridersWithoutJoinDate,
      averageRiderLifetimeEnabled: joinDateAudit.riderLifetimeKpiEnabled,
      averageRiderLifetimeValue: null,
      lifetimeDisplayBlocked: !joinDateAudit.riderLifetimeKpiEnabled,
      lifetimeBlockReason: joinDateAudit.riderLifetimeDisabledReason,
    },
    activeRidersConsistency: {
      uniqueActiveRidersInPeriod,
      averageDailyActiveRiders,
      dailyActiveMin: dailyMin,
      dailyActiveMax: dailyMax,
      dailyActiveStdDev: dailyStd,
      daysWithData: dailyActiveCounts.length,
      discrepancyExplanationAr,
    },
    roadmapValidation: {
      dailyGap: hoursRoadmap.dailyGap,
      averageDailyHoursPerActiveRider: hoursRoadmap.calculationTrace.avgDailyHoursPerActiveRider,
      formula: hoursRoadmap.calculationTrace.additionalRidersFormula,
      additionalRidersNeeded: hoursRoadmap.additionalActiveRidersNeeded,
      additionalRidersCalculation: hoursRoadmap.calculationTrace.additionalRidersCalculation,
      zeroOnlyWhenGapNonPositive: true,
      zeroValidationPassed,
      forecastDisabled: hoursRoadmap.calculationTrace.forecastDisabled,
      forecastDisabledReason: hoursRoadmap.calculationTrace.forecastDisabledReason,
    },
    kpiTrustVerification: {
      trustLevel: kpiTrust.level,
      trustLabelAr: kpiTrust.labelAr,
      dataQualityScore: kpiTrust.dataQualityScore,
      ghostLeakagePercent: kpiTrust.ghostLeakagePercent,
      gateStatus,
      gateStatusAr,
      kpiGates,
    },
    executiveAccuracyScore: {
      score: executiveScore,
      grade,
      gradeLabelAr,
      components,
      weights,
    },
    managementTrust: {
      canTrust,
      answerAr: canTrust ? 'نعم' : 'لا',
      reasons,
    },
  };
}
