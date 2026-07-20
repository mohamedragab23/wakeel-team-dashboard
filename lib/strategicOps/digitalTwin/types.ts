/**
 * Digital Twin & Simulation Engine — types (SRS-007 Phase 1)
 */

import type { UnitEconomicsConfig } from './config/unitEconomics';

export type TwinFilters = {
  startDate: string;
  endDate: string;
  zone: string;
  supervisorCode: string;
};

export type TwinFleetMetrics = {
  headcount: number;
  activeRiders: number;
  actualHours: number;
  targetHours: number;
  orders: number;
  ordersPerHour: number;
  avgHours: number;
  utilization: number;
  lostHours: number;
  lostHoursPercent: number;
  achievement: number;
  healthScore: number;
  noShowRiders: number;
  inactiveRiders: number;
  operationalDays: number;
};

export type TwinSupervisorRow = {
  code: string;
  name: string;
  zone: string;
  headcount: number;
  activeRiders: number;
  hours: number;
  target: number;
  achievement: number;
  riskScore: number;
};

export type TwinRidersSummary = {
  inactive: number;
  noShow: number;
  suspended: number;
  newHires: number;
  resignations: number;
};

export type TwinQuality = {
  coveragePercent: number;
  ghostLeakagePercent: number;
  dataQualityScore: number;
  trustScoreHint: number;
};

export type DigitalTwinState = {
  meta: {
    generatedAt: string;
    filters: TwinFilters;
    sourceReportGeneratedAt: string;
    version: string;
    periodDays: number;
  };
  fleet: TwinFleetMetrics;
  supervisors: TwinSupervisorRow[];
  ridersSummary: TwinRidersSummary;
  economics: UnitEconomicsConfig;
  quality: TwinQuality;
  recoveryCeilings?: {
    maxRecoveryByNoShow: number;
    maxRecoveryByBreak: number;
    maxRecoveryByLate: number;
    maxRecoveryByInactive: number;
  };
};

/** Scenario levers — all optional; unset = no change */
export type ScenarioLevers = {
  hireRiders?: number;
  terminateRiders?: number;
  avgHoursDelta?: number; // absolute new avg hours (e.g. 6.5)
  avgHoursPercentChange?: number; // e.g. +20 means +20%
  absenteeismReductionPercent?: number; // reduce no-show by %
  breakReductionPercent?: number;
  lateReductionPercent?: number;
  activeRidersDelta?: number;
  targetPercentChange?: number; // e.g. +10
  newTargetHours?: number;
  demandPercentChange?: number; // affects orders
  cityScaleFactor?: number; // lightweight city expansion stub (1.0 = same)
  replaceWeakSupervisor?: boolean;
  reallocateRiders?: number; // move N riders to best supervisor (aggregate)
  supervisorTargetPercentChange?: number;
  // Recovery lever effectiveness 0–100 (aligns with RecoverySimulatorPanel)
  noShowRecoveryPct?: number;
  breakRecoveryPct?: number;
  lateRecoveryPct?: number;
  inactiveRecoveryPct?: number;
};

export type ScenarioPresetId =
  | 'A_hire_50'
  | 'B_hours_6_5'
  | 'C_absenteeism_20'
  | 'D_breaks_15'
  | 'E_active_plus_30'
  | 'F_reallocate'
  | 'G_replace_supervisor'
  | 'H_target_plus_10'
  | 'I_demand_plus_25'
  | 'J_demand_minus_40'
  | 'custom';

export type ImpactDelta = {
  headcount: number;
  activeRiders: number;
  hours: number;
  orders: number;
  ordersPerHour: number;
  avgHours: number;
  lostHours: number;
  achievement: number;
  utilization: number;
  healthScore: number;
  riskScore: number;
  growthRate: number;
  supervisorLoad: number;
};

export type FinancialImpact = {
  revenue: number;
  operatingCost: number;
  hiringCost: number;
  trainingCost: number;
  equipmentCost: number;
  totalInvestment: number;
  profit: number;
  roiPercent: number;
  paybackDays: number | null;
  breakEvenDays: number | null;
  currency: string;
  assumptionsNoteAr: string;
};

export type RiskImpact = {
  operationalRisk: number;
  financialRisk: number;
  hiringRisk: number;
  attritionRisk: number;
  supervisorRisk: number;
  capacityRisk: number;
  overallRisk: number;
  confidence: number;
  confidenceLevel: 'low' | 'medium' | 'high' | 'very_high';
};

export type SimulationImpact = {
  baseline: TwinFleetMetrics;
  projected: TwinFleetMetrics;
  deltas: ImpactDelta;
  financial: FinancialImpact;
  risk: RiskImpact;
};

export type ExecutiveDecision = {
  shouldDoIt: boolean;
  answerAr: 'نعم' | 'لا' | 'بحذر';
  whyAr: string;
  benefitsAr: string[];
  risksAr: string[];
  alternativeAr: string;
  expectedResultAr: string;
  confidence: number;
  confidenceLevel: RiskImpact['confidenceLevel'];
};

export type TimelineProjection = {
  nextWeek: TwinFleetMetrics;
  nextMonth: TwinFleetMetrics;
  nextQuarter: TwinFleetMetrics;
  nextSixMonths: TwinFleetMetrics;
  yearEnd: TwinFleetMetrics;
};

export type OptimizationHint = {
  category: 'hiring' | 'reallocation' | 'supervisor' | 'recruitment' | 'retention' | 'scheduling';
  actionAr: string;
  expectedGainAr: string;
  priority: 'critical' | 'high' | 'medium' | 'low';
};

export type SimulationResult = {
  baseline: DigitalTwinState;
  projected: DigitalTwinState;
  levers: ScenarioLevers;
  impact: SimulationImpact;
  decision: ExecutiveDecision;
  timeline: TimelineProjection;
  optimizationHints: OptimizationHint[];
  generatedAt: string;
};

export type SavedScenarioRecord = {
  id: string;
  authorCode: string;
  authorName: string | null;
  title: string;
  filters: TwinFilters;
  levers: ScenarioLevers;
  baseline: DigitalTwinState;
  impact: SimulationImpact;
  decision: ExecutiveDecision | null;
  actualResult: unknown | null;
  variance: unknown | null;
  createdAt: string;
  updatedAt: string;
};

export type ScenarioComparisonRow = {
  id: string;
  title: string;
  investment: number;
  hours: number;
  orders: number;
  profit: number;
  risk: number;
  roiPercent: number;
  growthRate: number;
  achievement: number;
  recommendationAr: string;
  isBest: boolean;
};
