/**
 * Map Talabat audit traces / data validation entries → KPILineage (SRS-006 §4).
 */

import type { KpiAuditTrace } from '@/lib/strategicOps/talabatOpsMetrics';
import type { DataValidationEntry } from '@/lib/strategicOps/buildReport';
import type { KPILineage } from './types';

export function lineageFromAuditTrace(
  trace: KpiAuditTrace,
  ctx?: {
    coverage?: number;
    lastRefresh?: string;
    sourceRows?: number;
  }
): KPILineage {
  return {
    kpi: trace.kpi,
    sourceSheet: trace.rawDataSource.split('|')[0]?.trim() || trace.rawDataSource,
    sourceRows: ctx?.sourceRows ?? trace.recordsRead,
    rowsUsed: trace.recordsRead,
    rowsIgnored: 0,
    formula: trace.formula,
    calculationSteps: [
      `البسط: ${trace.numerator} (${trace.numeratorLabel})`,
      `المقام: ${trace.denominator} (${trace.denominatorLabel})`,
      `النتيجة: ${trace.result}`,
      `الحالة: ${trace.status}`,
    ],
    validationChecks: [
      {
        check: 'Audit trace status',
        status: trace.status === 'valid' ? 'pass' : trace.status === 'warning' ? 'warn' : 'fail',
      },
    ],
    coverage: ctx?.coverage ?? 100,
    confidence: trace.status === 'valid' ? 95 : trace.status === 'warning' ? 70 : 40,
    lastRefresh: ctx?.lastRefresh ?? new Date().toISOString(),
    reportValue: trace.result,
    expectedValue: trace.result,
  };
}

export function lineageFromDataValidation(
  entry: DataValidationEntry,
  ctx?: { coverage?: number; lastRefresh?: string }
): KPILineage {
  return {
    kpi: entry.kpi,
    sourceSheet: entry.sourceSheet,
    sourceRows: entry.recordsRead,
    rowsUsed: entry.recordsRead,
    rowsIgnored: 0,
    formula: entry.formula,
    calculationSteps: [
      entry.numerator !== undefined
        ? `البسط: ${entry.numerator} (${entry.numeratorLabel ?? ''})`
        : 'البسط: —',
      entry.denominator !== undefined
        ? `المقام: ${entry.denominator} (${entry.denominatorLabel ?? ''})`
        : 'المقام: —',
      `النتيجة: ${entry.result}`,
      entry.rawDataSource ? `مصدر خام: ${entry.rawDataSource}` : '',
    ].filter(Boolean),
    validationChecks: [
      {
        check: 'Data validation status',
        status:
          entry.status === 'valid'
            ? 'pass'
            : entry.status === 'warning'
              ? 'warn'
              : 'fail',
      },
    ],
    coverage: ctx?.coverage ?? 100,
    confidence: entry.status === 'valid' ? 90 : entry.status === 'warning' ? 65 : 35,
    lastRefresh: ctx?.lastRefresh ?? new Date().toISOString(),
    reportValue: entry.result,
  };
}
