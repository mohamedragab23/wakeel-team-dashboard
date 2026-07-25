/**
 * SRS-010 Part 1 — Today's Executive Brief.
 * Fully generated from live report data. No hardcoded business text —
 * every sentence is templated from real numbers computed at request time.
 */
export type ExecutiveBriefStatus = 'Healthy' | 'Warning' | 'Critical' | 'Unknown';

export type ExecutiveBrief = {
  generatedAt: string;
  hasData: boolean;
  overallStatus: ExecutiveBriefStatus;
  overallStatusAr: string;
  healthScore: number;

  /** SRS-011 Part 1 — "صباح الخير. اليوم يوجد N أولويات تشغيلية تحتاج تدخل." */
  greetingAr: string;
  /** Count of critical+high priority actions open right now (drives greetingAr). */
  priorityCount: number;

  mainReasonAr: string;
  /** Ordered causal chain: [effect, because X, because Y, ...]. */
  causeChainAr: string[];

  /** Primary operational currency (SRS-011): hours + riders, not money. */
  impactHours: number | null;
  impactHoursAr: string;
  /** Riders currently under 4h/day — the operational driver behind impactHours. */
  ridersUnderFourHours: number;
  ridersUnderFourHoursAr: string;

  /** Secondary/contextual only — a COO runs on riders & hours, not this number. */
  financialImpactEgp: number | null;
  financialImpactAr: string;

  projectionIfIgnoredAr: string;
  projectedAchievementPercent: number | null;

  topPriorityAr: string;
  topPriorityDeadlineAr: string;

  expectedGainHours: number | null;
  expectedGainAr: string;

  confidencePercent: number;

  /** Canonical KPI id (see kpiIntelligence registry) driving this brief — used for deep links. */
  kpiId: string;
  /** Owning action id in executiveFocus, if any — for "جump to action" links. */
  actionId: string | null;

  assumptionsAr: string[];
};
