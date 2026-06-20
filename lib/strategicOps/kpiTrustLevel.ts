import {
  KPI_QUALITY_THRESHOLD,
  GHOST_LEAKAGE_THRESHOLD_PERCENT,
} from '@/lib/strategicOps/dataIntegrity';

export type KpiTrustLevel = 1 | 2 | 3 | 4;

export type KpiTrustReport = {
  level: KpiTrustLevel;
  labelAr: string;
  descriptionAr: string;
  dataQualityScore: number;
  ghostLeakagePercent: number;
  /** Level 1: full strategic KPIs enabled */
  fullStrategicKpis: boolean;
  /** Level 2: warning banner only */
  warningOnly: boolean;
  /** Level 3: STI/ORPS/growth shown with low-confidence flag */
  lowConfidenceStrategic: boolean;
  /** Level 4: disable STI, ORPS, growth forecasts, roadmap */
  disableStiOrpsGrowthRoadmap: boolean;
  /** Legacy binary gate — true only at level 1 */
  kpiQualityGatePassed: boolean;
};

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/**
 * 4-level KPI trust model (data quality + ghost leakage).
 *
 * Level 1: DQ >85 AND ghost <5%  → full strategic KPIs
 * Level 2: ghost 5–10%          → warning only
 * Level 3: ghost 10–20%         → strategic KPIs low confidence
 * Level 4: ghost >20%           → disable STI/ORPS/growth/roadmap
 *
 * Data quality below threshold downgrades level 1 → 2 when ghost is also low.
 */
export function computeKpiTrustLevel(
  dataQualityScore: number,
  ghostLeakagePercent: number
): KpiTrustReport {
  const dq = round2(dataQualityScore);
  const ghost = round2(ghostLeakagePercent);

  let level: KpiTrustLevel;
  let labelAr: string;
  let descriptionAr: string;

  if (ghost > 20) {
    level = 4;
    labelAr = 'مستوى ٤ — ثقة حرجة';
    descriptionAr =
      'تسرب Ghost فوق ٢٠٪ — تم تعطيل STI وORPS وتوقعات النمو وخارطة ٢٢٠٠. أصلح البيانات قبل أي قرار استراتيجي.';
  } else if (ghost > 10) {
    level = 3;
    labelAr = 'مستوى ٣ — ثقة منخفضة';
    descriptionAr =
      'تسرب Ghost بين ١٠٪ و٢٠٪ — المؤشرات الاستراتيجية معروضة بعلامة ثقة منخفضة فقط.';
  } else if (ghost > GHOST_LEAKAGE_THRESHOLD_PERCENT) {
    level = 2;
    labelAr = 'مستوى ٢ — تحذير';
    descriptionAr = `تسرب Ghost بين ${GHOST_LEAKAGE_THRESHOLD_PERCENT}% و١٠٪ — تحذير تشغيلي؛ راجع تدقيق Ghost Riders.`;
  } else if (dq > KPI_QUALITY_THRESHOLD) {
    level = 1;
    labelAr = 'مستوى ١ — ثقة كاملة';
    descriptionAr = `جودة البيانات فوق ${KPI_QUALITY_THRESHOLD} وتسرب Ghost أقل من ${GHOST_LEAKAGE_THRESHOLD_PERCENT}% — المؤشرات الاستراتيجية مفعّلة بالكامل.`;
  } else {
    level = 2;
    labelAr = 'مستوى ٢ — تحذير (جودة البيانات)';
    descriptionAr = `درجة جودة البيانات ${dq}/100 دون الحد ${KPI_QUALITY_THRESHOLD} — المؤشرات قد تكون غير دقيقة.`;
  }

  const fullStrategicKpis = level === 1;
  const warningOnly = level === 2;
  const lowConfidenceStrategic = level === 3;
  const disableStiOrpsGrowthRoadmap = level === 4;

  return {
    level,
    labelAr,
    descriptionAr,
    dataQualityScore: dq,
    ghostLeakagePercent: ghost,
    fullStrategicKpis,
    warningOnly,
    lowConfidenceStrategic,
    disableStiOrpsGrowthRoadmap,
    kpiQualityGatePassed: fullStrategicKpis,
  };
}
