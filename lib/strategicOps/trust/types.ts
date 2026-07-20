/**
 * Executive Trust Center — types (SRS-006 Section 1)
 */

export type TrustScoreComponents = {
  dataCompleteness: number;
  missingUploads: number;
  ghostRiders: number;
  duplicateRecords: number;
  calculationSuccess: number;
  validationPass: number;
  apiHealth: number;
  lastAuditRecency: number;
  formulaValidation: number;
  coverage: number;
};

export type TrustComponentDetail = {
  key: keyof TrustScoreComponents;
  labelAr: string;
  score: number;
  color: 'green' | 'amber' | 'red';
  explanation: string;
  rootCause: string;
  suggestedAction: string;
  trend: 'improving' | 'stable' | 'declining';
};

export type TrustGrade = 'executive' | 'operational' | 'caution' | 'not_ready';
export type TrustStatus = 'healthy' | 'warning' | 'critical';
export type TrustTrend = 'improving' | 'stable' | 'declining';

export type TrustScore = {
  overall: number;
  grade: TrustGrade;
  gradeLabelAr: string;
  status: TrustStatus;
  statusLabelAr: string;
  components: TrustScoreComponents;
  componentDetails: TrustComponentDetail[];
  explanation: string;
  rootCauses: string[];
  suggestedActions: string[];
  trend: TrustTrend;
  trendLabelAr: string;
  lastCalculated: string;
  canTrust: boolean;
  answerAr: 'نعم' | 'لا' | 'بحذر';
};

export const TRUST_WEIGHTS: Record<keyof TrustScoreComponents, number> = {
  dataCompleteness: 0.2,
  ghostRiders: 0.2,
  validationPass: 0.15,
  calculationSuccess: 0.15,
  apiHealth: 0.1,
  coverage: 0.1,
  lastAuditRecency: 0.05,
  duplicateRecords: 0.03,
  formulaValidation: 0.02,
  missingUploads: 0, // folded into dataCompleteness; kept for display
};
