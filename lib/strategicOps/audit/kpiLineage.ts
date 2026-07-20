/**
 * Client-safe KPI lineage builders (no Google Sheets / Node imports).
 */

import type { AuditResult, KPILineage } from './types';

export function buildKpiLineageFromAuditResult(
  result: AuditResult,
  ctx?: {
    sourceRows?: number;
    rowsUsed?: number;
    rowsIgnored?: number;
    coverage?: number;
    lastRefresh?: string;
    duplicateRows?: number;
    ghostRows?: number;
    scopeExcluded?: number;
  }
): KPILineage {
  const duplicateRows = ctx?.duplicateRows ?? 0;
  const ghostRows = ctx?.ghostRows ?? 0;
  const scopeExcluded = ctx?.scopeExcluded ?? 0;

  return {
    kpi: result.kpi,
    sourceSheet: result.rawSource,
    sourceRows: ctx?.sourceRows ?? 0,
    rowsUsed: ctx?.rowsUsed ?? 0,
    rowsIgnored: ctx?.rowsIgnored ?? duplicateRows + ghostRows + scopeExcluded,
    ignoredReasons: [
      { reason: 'Duplicates removed', count: duplicateRows },
      { reason: 'Ghost / shadow rows', count: ghostRows },
      { reason: 'Scope excluded riders', count: scopeExcluded },
    ],
    formula: result.formula,
    calculationSteps: [
      result.intermediate,
      `Expected (audit): ${result.expected}${result.unit}`,
      `Calculated (report): ${result.calculated}${result.unit}`,
      `Difference: ${result.diff}${result.unit} (${result.pctDiff}%)`,
      `Status: ${result.status}`,
      ...(result.note ? [`Note: ${result.note}`] : []),
    ],
    validationChecks: [
      {
        check: `Tolerance warn ≤ ${result.toleranceWarnPct}%`,
        status: result.status === 'PASS' ? 'pass' : result.status === 'WARN' ? 'warn' : 'fail',
      },
      {
        check: `Tolerance fail ≤ ${result.toleranceFailPct}%`,
        status: result.status === 'FAIL' ? 'fail' : 'pass',
      },
    ],
    coverage: ctx?.coverage ?? 0,
    confidence: result.status === 'PASS' ? 95 : result.status === 'WARN' ? 70 : 40,
    auditResult: result,
    lastRefresh: ctx?.lastRefresh ?? new Date().toISOString(),
    reportValue: result.calculated,
    expectedValue: result.expected,
  };
}
