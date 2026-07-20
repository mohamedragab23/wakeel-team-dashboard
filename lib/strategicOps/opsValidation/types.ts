/**
 * SRS-008 — Operational Validation & Production Certification types.
 */

export type ValidationLayer =
  | 'data'
  | 'business_logic'
  | 'kpi'
  | 'attribution'
  | 'forecast'
  | 'ai'
  | 'system'
  | 'executive_trust';

export type ValidationModule =
  | 'kpi_engine'
  | 'filters'
  | 'ai'
  | 'forecast'
  | 'security'
  | 'export'
  | 'attribution'
  | 'lost_hours'
  | 'data_integrity'
  | 'performance'
  | 'business_logic';

export type TestStatus = 'pass' | 'fail' | 'skip' | 'error';

export type ValidationTestCase = {
  id: string;
  group: string;
  module: ValidationModule;
  layer: ValidationLayer;
  titleAr: string;
  titleEn: string;
  /** Required for suite pass when true */
  critical: boolean;
};

export type ValidationTestResult = ValidationTestCase & {
  status: TestStatus;
  expected: string;
  actual: string;
  detailAr?: string;
  durationMs: number;
};

export type ModuleMatrixRow = {
  module: ValidationModule;
  labelAr: string;
  tests: number;
  passed: number;
  failed: number;
  skipped: number;
  passRate: number;
};

export type CertificationLevel =
  | 'not_ready'
  | 'development_ready'
  | 'operational_ready'
  | 'production_ready'
  | 'enterprise_certified';

export type CategoryScore = {
  category: string;
  score: number;
  minimum: number;
  passed: boolean;
  detailAr: string;
};

export type ProductionCertificate = {
  verdict: 'PASS' | 'FAIL';
  level: CertificationLevel;
  readinessPercent: number;
  categoryScores: CategoryScore[];
  matrix: ModuleMatrixRow[];
  totalTests: number;
  passed: number;
  failed: number;
  skipped: number;
  openIssues: string[];
  generatedAt: string;
  phase: string;
  noteAr: string;
};

export type ValidationRunReport = {
  results: ValidationTestResult[];
  certificate: ProductionCertificate;
  coveragePercent: number;
  targetCaseCount: number;
};
