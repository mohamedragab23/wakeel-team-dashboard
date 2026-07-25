/**
 * SRS-010 Part 4 + "Interconnected Tabs" — Central KPI Intelligence Registry.
 *
 * This is the cross-linking backbone: every KPI shown anywhere in the
 * Strategic Operations Center (main dashboard, Integrity Center, Validation
 * Center, KPI Explorer, Trust Center, Enterprise Certification) resolves to
 * ONE canonical entry here. Clicking a KPI anywhere lets the UI build deep
 * links into the other four surfaces for the same KPI.
 */

export type KpiRegistryCategory = 'fleet' | 'quality' | 'trust' | 'forecast' | 'certification';

export type KpiRegistryEntry = {
  /** Canonical id — stable, used in `?kpi=` deep links everywhere. */
  id: string;
  labelAr: string;
  labelEn: string;
  category: KpiRegistryCategory;
  /** What the number literally is. */
  definitionAr: string;
  /** Why the business cares about it. */
  businessMeaningAr: string;
  /** SRS-011 Part 5 — the operational goal this KPI serves (distinct from "why we care"). */
  operationalObjectiveAr: string;
  /** The calculation formula in human-readable form. */
  formulaAr: string;
  /** Concrete calculation steps (generic — real numbers injected at render time). */
  calculationStepsAr: string[];
  dataSourcesAr: string[];
  /** SRS-011 Part 5 — exact sheet name(s) this KPI is computed from. */
  sheetUsedAr: string;
  /** SRS-011 Part 5 — exact columns read from that sheet. */
  columnsUsedAr: string[];
  businessRulesAr: string[];
  /** Canonical ids of KPIs this one depends on (root-cause direction). */
  dependsOn: string[];
  /** Canonical ids of KPIs this one affects downstream. */
  affects: string[];
  usedByAr: string[];
  ownerRoleAr: string;
  decisionExamplesAr: string[];
  knownLimitationsAr: string[];
  /** SRS-011 Part 5 — how this KPI most often gets computed wrong. */
  commonErrorsAr: string[];
  /** SRS-011 Part 5 — real operational reasons this KPI typically declines. */
  declineReasonsAr: string[];
  /** SRS-011 Part 5 — concrete actions that move this KPI up. */
  improvementMethodsAr: string[];
  /** Underlying ControlTower KpiKey, when this maps 1:1 to one. */
  controlTowerKey?: string;
  /** Certification level (SRS-009) this KPI is primarily proven under. */
  certificationLevelHint: string;
  /** Free-text terms used for best-effort matching against Validation/KPI Explorer rows. */
  matchTermsAr: string[];
};

export type KpiDeepLinks = {
  dashboard: string;
  integrity: string;
  validation: string;
  explorer: string;
  trust: string;
  certification: string;
};

export type KpiLiveSnapshot = {
  currentValue?: number | string | null;
  unit?: string;
  trendAr?: string;
  confidencePercent?: number | null;
  validationStatus?: 'PASS' | 'WARN' | 'FAIL' | 'unknown';
  lastRecalculationAt?: string | null;
  auditHistoryAr?: string[];
};
