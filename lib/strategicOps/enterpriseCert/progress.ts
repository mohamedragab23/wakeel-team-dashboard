/**
 * SRS-010 Part 8 — Certification Progress framing.
 * Converts the raw PASS/FAIL enterprise certificate into a "% complete +
 * remaining + required actions" view a COO can act on directly, instead of
 * a binary verdict with no next step.
 */
import type { EnterpriseCertificationReport } from './types';
import { getKpiDef, resolveKpiFromText } from '@/lib/strategicOps/kpiIntelligence';

export type CertificationRequiredAction = {
  id: string;
  labelAr: string;
  detailAr: string;
  href?: string;
  kind: 'link' | 'refresh' | 'external';
  /** SRS-011 Part 9 — who owns executing this action. */
  ownerAr: string;
  /** SRS-011 Part 9 — realistic time to complete this action. */
  estimatedDurationAr: string;
};

export type CertificationProgress = {
  progressPercent: number;
  statusAr: string;
  remainingAr: string[];
  requiredActions: CertificationRequiredAction[];
};

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

export function buildCertificationProgress(
  report: EnterpriseCertificationReport
): CertificationProgress {
  const c = report.certificate;
  const failingLevels = c.levels.filter((l) => !l.passed);

  const remainingAr = failingLevels.map(
    (l) => `${l.titleAr} — ${l.score}% من الحد المطلوب ${l.requiredScore}% (${l.passedTests}/${l.tests - l.skippedTests} اختبار ناجح)`
  );

  const actions: CertificationRequiredAction[] = [];

  const opsLevel = c.levels.find((l) => l.id === 'L3_operational');
  if (opsLevel && !opsLevel.passed) {
    actions.push({
      id: 'run_live_validation',
      labelAr: 'Run Live Validation',
      detailAr: `شغّل مجموعة التحقق التشغيلي — ${c.opsCasesPassed}/${c.opsCasesTotal} حالة ناجحة حاليًا.`,
      href: '/admin/strategic-ops/validation-center',
      kind: 'link',
      ownerAr: 'Operations',
      estimatedDurationAr: '15 دقيقة',
    });
  }

  const mathLevel = c.levels.find((l) => l.id === 'L2_mathematical');
  if (mathLevel && (!mathLevel.passed || c.kpiChecksPassed < c.kpiChecksTotal)) {
    actions.push({
      id: 'verify_kpis',
      labelAr: `Verify ${c.kpiChecksTotal || 65} KPIs`,
      detailAr: `${c.kpiChecksPassed}/${c.kpiChecksTotal} مؤشر تم التحقق منه رياضيًا حتى الآن.`,
      href: '/admin/strategic-ops/kpi-explorer',
      kind: 'link',
      ownerAr: 'فريق الهندسة — محرك المؤشرات',
      estimatedDurationAr: '30–45 دقيقة',
    });
  }

  const businessLevel = c.levels.find((l) => l.id === 'L9_business');
  if (businessLevel && !businessLevel.passed) {
    actions.push({
      id: 'compare_90_days',
      labelAr: 'Compare last 90 days',
      detailAr: 'قارن Dashboard مقابل Google Sheets لعينة حية من آخر 90 يومًا لإغلاق بوابة L9 (Business Certification).',
      kind: 'external',
      ownerAr: 'Operations + فريق جودة البيانات',
      estimatedDurationAr: '1–2 ساعة (مراجعة يدوية لعينة 90 يوم)',
    });
  }

  actions.push({
    id: 'run_enterprise_audit',
    labelAr: 'Run Enterprise Audit',
    detailAr: 'أعد تشغيل تقييم المستويات العشرة الآن بعد أي إصلاح.',
    kind: 'refresh',
    ownerAr: 'Operations',
    estimatedDurationAr: '2–5 دقائق (تشغيل تلقائي)',
  });

  if (c.productionReady) {
    actions.push({
      id: 'generate_certificate',
      labelAr: 'Generate final certificate',
      detailAr: 'كل البوابات مفتوحة — يمكنك الآن توليد شهادة الاعتماد النهائية (HTML/PDF).',
      href: '/api/strategic-ops/enterprise-certification?format=html',
      kind: 'external',
      ownerAr: 'COO',
      estimatedDurationAr: '1 دقيقة',
    });
  }

  const statusAr = c.productionReady
    ? 'جاهز للاعتماد الكامل ✅'
    : failingLevels.length === 1
      ? `متبقٍ مستوى واحد فقط: ${failingLevels[0].titleAr}`
      : `متبقٍ ${failingLevels.length} مستويات من أصل ${c.levels.length}`;

  return {
    progressPercent: round2(c.enterpriseScore),
    statusAr,
    remainingAr,
    requiredActions: actions,
  };
}

export type KpiCertificationImpact = {
  kpiId: string;
  labelAr: string;
  /** The level (e.g. L2 Mathematical) this KPI is primarily proven under. */
  primaryLevelId: string | null;
  primaryLevelTitleAr: string | null;
  primaryLevelPassed: boolean | null;
  /** Open issues (raw certificate strings) that mention this KPI by name. */
  matchingOpenIssues: string[];
  blocksCertification: boolean;
  answerAr: string;
};

/** SRS-010 — Interconnected Tabs: "هل هذا المؤشر يمنع الاعتماد؟" — answered
 *  deterministically from the KPI's own `certificationLevelHint` (registry)
 *  cross-referenced against the actual level pass/fail + open issues text. */
export function kpiCertificationImpact(
  kpiId: string,
  report: EnterpriseCertificationReport
): KpiCertificationImpact | null {
  const def = getKpiDef(kpiId);
  if (!def) return null;
  const c = report.certificate;

  const levelNum = def.certificationLevelHint.match(/^L(\d+)/)?.[1] ?? null;
  const primaryLevel = levelNum ? c.levels.find((l) => l.id.startsWith(`L${levelNum}_`)) ?? null : null;

  const matchingOpenIssues = c.openIssues.filter((issue) => resolveKpiFromText(issue)?.id === kpiId);

  const blocksCertification = !c.productionReady && (primaryLevel ? !primaryLevel.passed : matchingOpenIssues.length > 0);

  const answerAr = c.productionReady
    ? 'لا — الاعتماد الكامل مكتمل بالفعل، هذا المؤشر ضمن البوابات المُحقَّقة.'
    : blocksCertification
      ? `نعم — ${primaryLevel ? `بوابة ${primaryLevel.titleAr} لم تُفتَح بعد (${primaryLevel.score}%/${primaryLevel.requiredScore}%)` : 'ضمن المشاكل المفتوحة الحالية'}.`
      : 'لا يظهر حاليًا كسبب مباشر لحجب الاعتماد — لكن الاعتماد الكامل لم يتحقق بعد لأسباب أخرى.';

  return {
    kpiId,
    labelAr: def.labelAr,
    primaryLevelId: primaryLevel?.id ?? null,
    primaryLevelTitleAr: primaryLevel?.titleAr ?? null,
    primaryLevelPassed: primaryLevel?.passed ?? null,
    matchingOpenIssues,
    blocksCertification,
    answerAr,
  };
}
