/**
 * SRS-009 — Enterprise Certification types (10 levels).
 */

export type EnterpriseLevelId =
  | 'L1_functional'
  | 'L2_mathematical'
  | 'L3_operational'
  | 'L4_lineage'
  | 'L5_ai'
  | 'L6_performance'
  | 'L7_security'
  | 'L8_reliability'
  | 'L9_business'
  | 'L10_executive';

export type EnterpriseLevelResult = {
  id: EnterpriseLevelId;
  rank: number;
  titleEn: string;
  titleAr: string;
  requiredScore: number;
  score: number;
  passed: boolean;
  tests: number;
  passedTests: number;
  failedTests: number;
  skippedTests: number;
  detailAr: string;
  blockers: string[];
};

export type EnterpriseGate = {
  id: string;
  labelAr: string;
  passed: boolean;
  detailAr: string;
};

export type EnterpriseTier =
  | 'not_certified'
  | 'bronze'
  | 'silver'
  | 'gold'
  | 'platinum'
  | 'enterprise_platinum';

export type EnterpriseCertificate = {
  verdict: 'PASS' | 'FAIL';
  tier: EnterpriseTier;
  enterpriseScore: number;
  productionReady: boolean;
  levels: EnterpriseLevelResult[];
  gates: EnterpriseGate[];
  buildVersion: string;
  gitCommit: string;
  sheetsConnected: boolean | null;
  lastVerifiedAt: string;
  opsCasesPassed: number;
  opsCasesTotal: number;
  kpiChecksPassed: number;
  kpiChecksTotal: number;
  trustScoreHint: number | null;
  dataQualityHint: number | null;
  openIssues: string[];
  noteAr: string;
  certificateText: string;
};

export type EnterpriseCertificationReport = {
  certificate: EnterpriseCertificate;
  opsValidationSummary: {
    verdict: string;
    totalTests: number;
    passed: number;
    failed: number;
  };
  generatedAt: string;
};
