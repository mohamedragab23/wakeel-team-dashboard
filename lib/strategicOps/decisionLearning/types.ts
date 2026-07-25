/**
 * SRS-011 Part 11 — Decision Effectiveness & Learning.
 * Every recommendation the Action Engine surfaces gets logged with a
 * baseline snapshot; after a follow-up window, the COO (or a supervisor
 * check-in) marks whether it was executed, and the system re-measures the
 * same entity's metrics to compute whether the decision actually worked.
 * Persisted in Google Sheets (`decision_log`) — same pattern as
 * `rider_daily_comments` elsewhere in this app.
 */

export type DecisionOutcome = 'pending' | 'successful' | 'failed' | 'not_executed';

export type DecisionLogEntry = {
  /** Stable id = `${entityType}-${entityId}-${actionKind}-${issuedDate}` — one entry per entity+problem+day. */
  id: string;
  actionKind: string;
  entityType: 'supervisor' | 'rider' | 'zone' | 'fleet';
  entityId: string;
  entityName: string;
  problemAr: string;
  actionAr: string;
  confidencePercent: number;

  issuedAt: string; // ISO
  periodStart: string; // YYYY-MM-DD — report period the recommendation was computed from
  periodEnd: string;

  /** Baseline metric at time of issue (entity-appropriate: achievement% for
   *  supervisors, lostHoursDaily for riders) — the thing we expect to move. */
  baselineMetricLabel: string;
  baselineMetricValue: number;
  baselineLostHours: number;

  executed: boolean | null; // null = not confirmed yet
  executedAt: string | null;
  executedByCode: string | null;

  /** Follow-up window — default 2 days per SRS-011 Part 11 example. */
  evaluationDueAt: string;
  evaluated: boolean;
  evaluatedAt: string | null;
  afterMetricValue: number | null;
  metricDeltaPct: number | null;
  outcome: DecisionOutcome;
  notes: string;
};

export type RecommendationPerformance = {
  totalRecommendations: number;
  executedCount: number;
  notExecutedCount: number;
  evaluatedCount: number;
  successfulCount: number;
  failedCount: number;
  pendingEvaluationCount: number;
  successRatePercent: number; // successful / evaluated
  executionRatePercent: number; // executed / total
  bestActionKinds: Array<{ actionKind: string; successRatePercent: number; count: number }>;
  worstActionKinds: Array<{ actionKind: string; successRatePercent: number; count: number }>;
  bestRespondingSupervisors: Array<{ entityName: string; successRatePercent: number; count: number }>;
  avgExecutionTimeHours: number | null;
};
