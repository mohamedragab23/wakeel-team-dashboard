/**
 * SRS-006 §7 — Root Cause Explainability expansion.
 */

import type { KpiRootCause } from '@/lib/strategicOps/controlTower/types';

export type RootCauseExplanation = {
  kpiKey: string;
  whatHappenedAr: string;
  whyAr: string;
  evidenceAr: string[];
  impactAr: string;
  financialCostEstimate: number | null;
  hoursLost: number | null;
  ordersLost: number | null;
  responsibleSupervisors: Array<{ code: string; name: string; contribution: number }>;
  responsibleRidersHintAr: string;
  suggestedFixAr: string;
  expectedRecoveryAr: string;
  confidenceLevel: string;
};

export function expandRootCauseExplainability(
  causes: KpiRootCause[],
  opts?: { revenuePerOrder?: number; ordersPerHour?: number }
): RootCauseExplanation[] {
  const rev = opts?.revenuePerOrder ?? 18;
  const oph = opts?.ordersPerHour ?? 2;

  return causes.map((c) => {
    const hoursLost = c.topSupervisors
      .filter((s) => s.unit.includes('س') || s.unit.includes('h'))
      .reduce((sum, s) => sum + s.contribution, 0);
    const hours = hoursLost > 0 ? Math.round(hoursLost * 100) / 100 : null;
    const ordersLost = hours != null ? Math.round(hours * oph) : null;
    const financial = ordersLost != null ? Math.round(ordersLost * rev) : null;

    const topFix =
      c.factors[0]?.impactAr ||
      (c.topSupervisors[0]
        ? `ركز على ${c.topSupervisors[0].name} أولاً`
        : 'راجع التوزيع والحضور');

    return {
      kpiKey: c.kpiKey,
      whatHappenedAr: c.summaryAr,
      whyAr: c.factors.map((f) => `${f.labelAr}: ${f.impactAr}`).join(' · ') || c.summaryAr,
      evidenceAr: [
        ...c.factors.map((f) => `${f.labelAr} = ${f.value}`),
        `اتجاه: 7d ${c.trend.deltaPercent7 ?? '—'}% / 14d ${c.trend.deltaPercent14 ?? '—'}%`,
      ],
      impactAr: `ثقة التحليل: ${c.confidenceLevel}`,
      financialCostEstimate: financial,
      hoursLost: hours,
      ordersLost,
      responsibleSupervisors: c.topSupervisors.slice(0, 5).map((s) => ({
        code: s.code,
        name: s.name,
        contribution: s.contribution,
      })),
      responsibleRidersHintAr:
        'راجع قائمة Top Negative Impact Riders وDaily Contact List لنفس الفترة',
      suggestedFixAr: topFix,
      expectedRecoveryAr:
        hours != null
          ? `استرداد محتمل حتى ~${Math.round(hours * 0.4)} ساعة/يوم خلال أسبوعين إن نُفذت الخطة`
          : 'حدد حجم الفجوة ثم طبّق خطة الاسترداد',
      confidenceLevel: c.confidenceLevel,
    };
  });
}
