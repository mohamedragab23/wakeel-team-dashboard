/**
 * SRS-008 §16 — Production Certification Engine.
 * Honest scoring: does NOT claim Enterprise Certified without meeting thresholds.
 */

import type {
  CategoryScore,
  CertificationLevel,
  ModuleMatrixRow,
  ProductionCertificate,
  ValidationModule,
  ValidationRunReport,
  ValidationTestResult,
} from './types';
import { runAllPhase1Suites } from './suites';
import { runAllPhase2Suites } from './phase2Suites';
import { runAllPhase3Suites } from './phase3Suites';
import { appendValidationHistory } from './historyStore';

const TARGET_CASE_COUNT = 150;

const MODULE_LABELS: Record<ValidationModule, string> = {
  kpi_engine: 'KPI Engine',
  filters: 'Filters',
  ai: 'AI',
  forecast: 'Forecast',
  security: 'Security',
  export: 'Export',
  attribution: 'Attribution',
  lost_hours: 'Lost Hours',
  data_integrity: 'Data Integrity',
  performance: 'Performance',
  business_logic: 'Business Logic',
};

function levelFrom(readiness: number): CertificationLevel {
  if (readiness >= 99) return 'enterprise_certified';
  if (readiness >= 95) return 'production_ready';
  if (readiness >= 85) return 'operational_ready';
  if (readiness >= 70) return 'development_ready';
  return 'not_ready';
}

function buildMatrix(results: ValidationTestResult[]): ModuleMatrixRow[] {
  const modules = new Map<ValidationModule, ModuleMatrixRow>();
  for (const r of results) {
    const row =
      modules.get(r.module) ??
      ({
        module: r.module,
        labelAr: MODULE_LABELS[r.module],
        tests: 0,
        passed: 0,
        failed: 0,
        skipped: 0,
        passRate: 0,
      } satisfies ModuleMatrixRow);
    row.tests++;
    if (r.status === 'pass') row.passed++;
    else if (r.status === 'fail' || r.status === 'error') row.failed++;
    else row.skipped++;
    modules.set(r.module, row);
  }
  return [...modules.values()].map((m) => ({
    ...m,
    passRate:
      m.tests - m.skipped > 0
        ? Math.round((m.passed / (m.tests - m.skipped)) * 10000) / 100
        : 0,
  }));
}

function categoryScores(results: ValidationTestResult[]): CategoryScore[] {
  const rate = (module: ValidationModule, min: number, label: string): CategoryScore => {
    const subset = results.filter((r) => r.module === module && r.status !== 'skip');
    const passed = subset.filter((r) => r.status === 'pass').length;
    const score = subset.length ? Math.round((passed / subset.length) * 10000) / 100 : 0;
    return {
      category: label,
      score,
      minimum: min,
      passed: score >= min,
      detailAr: `${passed}/${subset.length} نجح`,
    };
  };

  const critical = results.filter((r) => r.critical && r.status !== 'skip');
  const critPass = critical.filter((r) => r.status === 'pass').length;
  const critScore = critical.length
    ? Math.round((critPass / critical.length) * 10000) / 100
    : 0;

  return [
    {
      category: 'KPI Accuracy',
      score: rate('kpi_engine', 99.5, 'KPI Accuracy').score,
      minimum: 99.5,
      passed: rate('kpi_engine', 99.5, 'KPI Accuracy').passed,
      detailAr: rate('kpi_engine', 99.5, 'KPI Accuracy').detailAr,
    },
    rate('data_integrity', 99, 'Data Integrity'),
    rate('filters', 100, 'Filter Accuracy'),
    rate('attribution', 100, 'Attribution Accuracy'),
    rate('ai', 90, 'AI Decision Validation'),
    {
      category: 'Forecast Accuracy',
      score: rate('forecast', 100, 'Forecast').score,
      minimum: 100,
      passed: rate('forecast', 100, 'Forecast').passed,
      detailAr: 'بوابات MAPE + مقاييس السلسلة',
    },
    {
      category: 'Performance',
      score: rate('performance', 100, 'Performance').score,
      minimum: 100,
      passed: rate('performance', 100, 'Performance').passed,
      detailAr: rate('performance', 100, 'Performance').detailAr,
    },
    rate('security', 100, 'Security'),
    rate('export', 100, 'Export'),
    {
      category: 'Critical Cases',
      score: critScore,
      minimum: 100,
      passed: critScore >= 100,
      detailAr: `${critPass}/${critical.length} حرج`,
    },
  ];
}

export function buildCertificate(results: ValidationTestResult[]): ProductionCertificate {
  const matrix = buildMatrix(results);
  const runnable = results.filter((r) => r.status !== 'skip');
  const passed = runnable.filter((r) => r.status === 'pass').length;
  const failed = runnable.filter((r) => r.status === 'fail' || r.status === 'error').length;
  const skipped = results.filter((r) => r.status === 'skip').length;

  const scores = categoryScores(results);
  const weights = scores.map((s) => (s.passed ? 1 : s.score / Math.max(1, s.minimum)));
  const readinessPercent =
    Math.round((weights.reduce((a, b) => a + Math.min(1, b), 0) / scores.length) * 10000) / 100;

  const openIssues = [
    ...scores.filter((s) => !s.passed).map((s) => `${s.category}: ${s.score}% < ${s.minimum}%`),
    ...results
      .filter((r) => r.status === 'fail' && r.critical)
      .map((r) => `${r.id}: ${r.titleAr}`),
  ];

  const allCategoriesOk = scores.every((s) => s.passed);
  const noCriticalFail = !results.some((r) => r.critical && r.status === 'fail');
  const fullCoverage = results.length >= TARGET_CASE_COUNT;

  if (!fullCoverage) {
    openIssues.unshift(
      `Validation coverage ${results.length}/${TARGET_CASE_COUNT} — DoD يتطلب 150+ حالة`
    );
  }

  const hasFilterE2E = results.some((r) => r.id.startsWith('P2-FIL-') && r.status === 'pass');
  const hasPhase3 = results.some((r) => r.id.startsWith('P3-') && r.status === 'pass');
  const has500k = results.some((r) => r.id === 'P3-PERF-500K' && r.status === 'pass');
  const hasExport = results.some((r) => r.id.startsWith('P3-EXP-') && r.status === 'pass');
  const hasAttrProd = results.some((r) => r.id === 'P3-ATT-PROD-PATH' && r.status === 'pass');

  if (!hasFilterE2E) openIssues.unshift('Filter E2E pipeline لم يجتز');
  if (!hasPhase3) openIssues.unshift('Phase 3 suites ناقصة');
  if (!has500k) openIssues.unshift('Performance 500k لم يجتز');
  if (!hasExport) openIssues.unshift('Export validation ناقص');
  if (!hasAttrProd) openIssues.unshift('Attribution production path ناقص');

  const verdict: 'PASS' | 'FAIL' =
    fullCoverage &&
    allCategoriesOk &&
    noCriticalFail &&
    hasFilterE2E &&
    hasPhase3 &&
    has500k &&
    hasExport &&
    hasAttrProd &&
    readinessPercent >= 95
      ? 'PASS'
      : 'FAIL';

  let level = levelFrom(readinessPercent);
  if (!fullCoverage && (level === 'production_ready' || level === 'enterprise_certified')) {
    level = 'operational_ready';
  }

  return {
    verdict,
    level,
    readinessPercent,
    categoryScores: scores,
    matrix,
    totalTests: results.length,
    passed,
    failed,
    skipped,
    openIssues: [...new Set(openIssues)].slice(0, 40),
    generatedAt: new Date().toISOString(),
    phase: 'SRS-008 Complete (P1+P2+P3)',
    noteAr:
      verdict === 'PASS'
        ? 'SRS-008 DoD مكتمل: 150+ · Filter E2E · Attribution إنتاج · Export · Security · 500k. التحقق الحي على Sheets يُشغَّل عند توفر credentials (cron/API).'
        : 'FAIL للاعتماد — راجع Open Issues.',
  };
}

function collectSyncSuites(): ValidationTestResult[] {
  return [...runAllPhase1Suites(), ...runAllPhase2Suites(), ...runAllPhase3Suites()];
}

export function runOpsValidation(): ValidationRunReport {
  const results = collectSyncSuites();
  const certificate = buildCertificate(results);
  return {
    results,
    certificate,
    coveragePercent: Math.round((results.length / TARGET_CASE_COUNT) * 10000) / 100,
    targetCaseCount: TARGET_CASE_COUNT,
  };
}

export async function runOpsValidationFull(options?: {
  schedule?: 'manual' | 'daily' | 'weekly' | 'monthly';
  includeLive?: boolean;
  persistHistory?: boolean;
}): Promise<ValidationRunReport> {
  const results = collectSyncSuites();

  if (options?.includeLive !== false) {
    try {
      const { runLiveReportSuite } = await import('./liveSuite');
      const live = await runLiveReportSuite();
      results.push(...live);
    } catch (e) {
      console.error('[ops-validation] live suite error', e);
    }
  }

  const certificate = buildCertificate(results);
  const report: ValidationRunReport = {
    results,
    certificate,
    coveragePercent: Math.round((results.length / TARGET_CASE_COUNT) * 10000) / 100,
    targetCaseCount: TARGET_CASE_COUNT,
  };

  if (options?.persistHistory !== false) {
    try {
      appendValidationHistory({
        ranAt: certificate.generatedAt,
        schedule: options?.schedule ?? 'manual',
        verdict: certificate.verdict,
        level: certificate.level,
        readinessPercent: certificate.readinessPercent,
        totalTests: certificate.totalTests,
        passed: certificate.passed,
        failed: certificate.failed,
        coveragePercent: report.coveragePercent,
      });
    } catch (e) {
      console.error('[ops-validation] history persist failed', e);
    }
  }

  return report;
}
