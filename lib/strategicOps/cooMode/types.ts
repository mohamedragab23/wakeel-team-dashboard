/**
 * SRS-010 Part 9 — COO Mode.
 * The dashboard auto-answers a fixed set of executive questions from live data.
 */
export type CooModeAnswer = {
  id: string;
  questionAr: string;
  answerAr: string;
  confidencePercent: number;
  /** Canonical KPI id (kpiIntelligence registry) most relevant to this answer, for deep links. */
  kpiId: string;
  actionId?: string | null;
  detailAr?: string[];
  /** SRS-011 Part 10 — which engine/data actually produced this answer, so the
   *  COO can see it's not free-text generation but a real computed source. */
  sourceAr: string;
  /** SRS-011 Part 10 — keywords used to match this answer to a free-text question
   *  in the chat interface (Arabic + English, best-effort intent matching). */
  matchKeywords: string[];
};

export type CooModeReport = {
  generatedAt: string;
  answers: CooModeAnswer[];
};
