/**
 * Live Operations Audit — types (SRS-006 Section 3)
 */

export type AuditStatus = 'PASS' | 'WARN' | 'FAIL';

export type AuditResult = {
  id: string;
  section: string;
  sectionTitle: string;
  kpi: string;
  formula: string;
  rawSource: string;
  intermediate: string;
  reportValue: number | string;
  auditValue: number | string;
  expected: number | string;
  calculated: number | string;
  diff: number;
  pctDiff: number;
  unit: string;
  status: AuditStatus;
  note?: string;
  toleranceWarnPct: number;
  toleranceFailPct: number;
};

export type LiveAuditReport = {
  title: 'LIVE OPERATIONS AUDIT';
  generatedAt: string;
  filters: {
    startDate: string;
    endDate: string;
    zone: string;
    supervisorCode: string;
  };
  overallStatus: AuditStatus;
  totalChecks: number;
  passCount: number;
  warnCount: number;
  failCount: number;
  accuracyScore: number;
  durationMs: number;
  sections: Record<string, AuditResult[]>;
  results: AuditResult[];
};

export type KPILineage = {
  kpi: string;
  sourceSheet: string;
  sourceRows: number;
  rowsUsed: number;
  rowsIgnored: number;
  ignoredReasons?: { reason: string; count: number }[];
  formula: string;
  calculationSteps: string[];
  validationChecks: { check: string; status: 'pass' | 'fail' | 'warn' }[];
  coverage: number;
  confidence: number;
  auditResult?: AuditResult;
  lastRefresh: string;
  reportValue?: number | string;
  expectedValue?: number | string;
};

export const DISCREPANCY_WARN = 0.01;
export const DISCREPANCY_FAIL = 0.05;

export const SECTION_TITLES: Record<string, string> = {
  A: 'أسطول العمليات (Fleet KPIs)',
  B: 'الهدف والأداء (Target & Performance)',
  C: 'محرك الخط الأساسي (Baseline Engine)',
  D: 'أثر الطيارين (Rider Impact)',
  E: 'تحليل التوظيف (Recruitment)',
  F: 'توصيات المشرفين (Supervisor Recommendations)',
  G: 'محرك التوقعات (Forecast)',
  H: 'ملخص برج المراقبة (Control Tower)',
};
