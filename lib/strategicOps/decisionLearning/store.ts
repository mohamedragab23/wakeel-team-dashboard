/**
 * SRS-011 Part 11 — Decision Effectiveness & Learning: Google-Sheets-backed
 * persistence for issued recommendations, execution check-ins, and outcome
 * evaluation. Mirrors the pattern used by `lib/riderComments/service.ts`.
 */
import { appendToSheet, getSheetData, updateSheetRow } from '@/lib/googleSheets';
import type { DecisionLogEntry, DecisionOutcome, RecommendationPerformance } from './types';

const SHEET_NAME = 'decision_log';

const HEADERS = [
  'id',
  'actionKind',
  'entityType',
  'entityId',
  'entityName',
  'problemAr',
  'actionAr',
  'confidencePercent',
  'issuedAt',
  'periodStart',
  'periodEnd',
  'baselineMetricLabel',
  'baselineMetricValue',
  'baselineLostHours',
  'executed',
  'executedAt',
  'executedByCode',
  'evaluationDueAt',
  'evaluated',
  'evaluatedAt',
  'afterMetricValue',
  'metricDeltaPct',
  'outcome',
  'notes',
];

async function ensureSheetExists(): Promise<void> {
  try {
    const sheet = await getSheetData(SHEET_NAME, true);
    if (sheet.length === 0) {
      await appendToSheet(SHEET_NAME, [HEADERS]);
    }
  } catch {
    // Sheet will be created on first write — same tolerant pattern as riderComments.
  }
}

function toBoolCell(v: boolean | null): string {
  if (v === null) return '';
  return v ? 'true' : 'false';
}

function fromBoolCell(v: string): boolean | null {
  if (v === 'true') return true;
  if (v === 'false') return false;
  return null;
}

function rowFromEntry(e: DecisionLogEntry): (string | number)[] {
  return [
    e.id,
    e.actionKind,
    e.entityType,
    e.entityId,
    e.entityName,
    e.problemAr,
    e.actionAr,
    e.confidencePercent,
    e.issuedAt,
    e.periodStart,
    e.periodEnd,
    e.baselineMetricLabel,
    e.baselineMetricValue,
    e.baselineLostHours,
    toBoolCell(e.executed),
    e.executedAt ?? '',
    e.executedByCode ?? '',
    e.evaluationDueAt,
    e.evaluated ? 'true' : 'false',
    e.evaluatedAt ?? '',
    e.afterMetricValue ?? '',
    e.metricDeltaPct ?? '',
    e.outcome,
    e.notes ?? '',
  ];
}

function entryFromRow(row: any[]): DecisionLogEntry | null {
  if (!row || row.length < 23) return null;
  return {
    id: String(row[0] ?? ''),
    actionKind: String(row[1] ?? ''),
    entityType: (row[2] ?? 'supervisor') as DecisionLogEntry['entityType'],
    entityId: String(row[3] ?? ''),
    entityName: String(row[4] ?? ''),
    problemAr: String(row[5] ?? ''),
    actionAr: String(row[6] ?? ''),
    confidencePercent: Number(row[7] ?? 0),
    issuedAt: String(row[8] ?? ''),
    periodStart: String(row[9] ?? ''),
    periodEnd: String(row[10] ?? ''),
    baselineMetricLabel: String(row[11] ?? ''),
    baselineMetricValue: Number(row[12] ?? 0),
    baselineLostHours: Number(row[13] ?? 0),
    executed: fromBoolCell(String(row[14] ?? '')),
    executedAt: row[15] ? String(row[15]) : null,
    executedByCode: row[16] ? String(row[16]) : null,
    evaluationDueAt: String(row[17] ?? ''),
    evaluated: String(row[18]) === 'true',
    evaluatedAt: row[19] ? String(row[19]) : null,
    afterMetricValue: row[20] !== '' && row[20] != null ? Number(row[20]) : null,
    metricDeltaPct: row[21] !== '' && row[21] != null ? Number(row[21]) : null,
    outcome: (row[22] ?? 'pending') as DecisionOutcome,
    notes: String(row[23] ?? ''),
  };
}

/** All logged decisions (most recent first). */
export async function getDecisionLog(): Promise<DecisionLogEntry[]> {
  try {
    const sheet = await getSheetData(SHEET_NAME, true);
    if (sheet.length < 2) return [];
    const rows: DecisionLogEntry[] = [];
    for (let i = 1; i < sheet.length; i++) {
      const entry = entryFromRow(sheet[i]);
      if (entry) rows.push(entry);
    }
    return rows.sort((a, b) => b.issuedAt.localeCompare(a.issuedAt));
  } catch (error) {
    console.error('[decisionLearning.getDecisionLog] Error:', error);
    return [];
  }
}

/** Idempotently log new recommendations — one entry per entity+problem+day.
 *  Called automatically each time the Action Engine surfaces critical/high
 *  actions (see buildReport.ts), so the log fills itself over time without
 *  any manual step. Never throws — a Sheets hiccup must not break the report. */
export async function logNewDecisions(
  candidates: Array<Omit<DecisionLogEntry, 'executed' | 'executedAt' | 'executedByCode' | 'evaluated' | 'evaluatedAt' | 'afterMetricValue' | 'metricDeltaPct' | 'outcome' | 'notes'>>
): Promise<number> {
  try {
    await ensureSheetExists();
    const existing = await getDecisionLog();
    const existingIds = new Set(existing.map((e) => e.id));
    const newRows: DecisionLogEntry[] = [];
    for (const c of candidates) {
      if (existingIds.has(c.id)) continue;
      newRows.push({
        ...c,
        executed: null,
        executedAt: null,
        executedByCode: null,
        evaluated: false,
        evaluatedAt: null,
        afterMetricValue: null,
        metricDeltaPct: null,
        outcome: 'pending',
        notes: '',
      });
    }
    if (newRows.length === 0) return 0;
    await appendToSheet(SHEET_NAME, newRows.map(rowFromEntry));
    return newRows.length;
  } catch (error) {
    console.warn('[decisionLearning.logNewDecisions] Skipped (non-fatal):', error);
    return 0;
  }
}

/** Manual check-in: "Was it executed?" — a supervisor/COO confirms via UI. */
export async function markDecisionExecuted(
  id: string,
  executed: boolean,
  executedByCode: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const sheet = await getSheetData(SHEET_NAME, true);
    for (let i = 1; i < sheet.length; i++) {
      if (String(sheet[i]?.[0] ?? '') === id) {
        const entry = entryFromRow(sheet[i]);
        if (!entry) break;
        entry.executed = executed;
        entry.executedAt = new Date().toISOString();
        entry.executedByCode = executedByCode;
        if (!executed) {
          entry.outcome = 'not_executed';
          entry.evaluated = true;
          entry.evaluatedAt = new Date().toISOString();
        }
        await updateSheetRow(SHEET_NAME, i + 1, rowFromEntry(entry));
        return { success: true };
      }
    }
    return { success: false, error: 'لم يتم العثور على القرار' };
  } catch (error) {
    console.error('[decisionLearning.markDecisionExecuted] Error:', error);
    return { success: false, error: String(error) };
  }
}

/** Re-measure outcome for decisions past their evaluation window, using a
 *  caller-supplied lookup of *today's* metric for the same entity — the
 *  caller passes real current-report numbers, this function never re-fetches
 *  data on its own so it stays a pure comparison step.
 *  Map key MUST be `${entityType}:${entityId}` to avoid supervisor/rider code collisions. */
export async function evaluateDueDecisions(
  currentMetricByEntity: Map<string, number>
): Promise<number> {
  try {
    const sheet = await getSheetData(SHEET_NAME, true);
    if (sheet.length < 2) return 0;
    const now = new Date();
    let evaluatedCount = 0;
    for (let i = 1; i < sheet.length; i++) {
      const entry = entryFromRow(sheet[i]);
      if (!entry || entry.evaluated) continue;
      if (entry.executed === false) continue; // already finalized as not_executed on check-in
      const due = new Date(entry.evaluationDueAt);
      if (Number.isNaN(due.getTime()) || due.getTime() > now.getTime()) continue;
      const current = currentMetricByEntity.get(`${entry.entityType}:${entry.entityId}`);
      if (current == null) continue; // entity not present in today's data — skip, try again later

      const deltaPct =
        entry.baselineMetricValue !== 0
          ? Math.round(((current - entry.baselineMetricValue) / Math.abs(entry.baselineMetricValue)) * 10000) / 100
          : current > entry.baselineMetricValue
            ? 100
            : 0;

      entry.afterMetricValue = current;
      entry.metricDeltaPct = deltaPct;
      entry.evaluated = true;
      entry.evaluatedAt = now.toISOString();
      // A decision "succeeded" if the metric it targeted moved up meaningfully (>= +3%).
      entry.outcome = entry.executed === true || entry.executed === null ? (deltaPct >= 3 ? 'successful' : 'failed') : 'not_executed';

      await updateSheetRow(SHEET_NAME, i + 1, rowFromEntry(entry));
      evaluatedCount += 1;
    }
    return evaluatedCount;
  } catch (error) {
    console.warn('[decisionLearning.evaluateDueDecisions] Skipped (non-fatal):', error);
    return 0;
  }
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/** Builds the "AI Recommendation Performance" dashboard from the raw log. */
export function buildRecommendationPerformance(log: DecisionLogEntry[]): RecommendationPerformance {
  const total = log.length;
  const executed = log.filter((e) => e.executed === true);
  const notExecuted = log.filter((e) => e.executed === false);
  const evaluated = log.filter((e) => e.evaluated);
  const successful = evaluated.filter((e) => e.outcome === 'successful');
  const failed = evaluated.filter((e) => e.outcome === 'failed');
  const pending = log.filter((e) => !e.evaluated);

  function successRateFor(entries: DecisionLogEntry[]): number {
    const evald = entries.filter((e) => e.evaluated);
    if (evald.length === 0) return 0;
    return round2((evald.filter((e) => e.outcome === 'successful').length / evald.length) * 100);
  }

  const byKind = new Map<string, DecisionLogEntry[]>();
  for (const e of log) {
    const list = byKind.get(e.actionKind) ?? [];
    list.push(e);
    byKind.set(e.actionKind, list);
  }
  const kindStats = [...byKind.entries()]
    .map(([actionKind, entries]) => ({
      actionKind,
      successRatePercent: successRateFor(entries),
      count: entries.filter((e) => e.evaluated).length,
    }))
    .filter((k) => k.count >= 1);
  const bestActionKinds = [...kindStats].sort((a, b) => b.successRatePercent - a.successRatePercent).slice(0, 3);
  const worstActionKinds = [...kindStats].sort((a, b) => a.successRatePercent - b.successRatePercent).slice(0, 3);

  const bySupervisor = new Map<string, DecisionLogEntry[]>();
  for (const e of log) {
    if (e.entityType !== 'supervisor') continue;
    const list = bySupervisor.get(e.entityName) ?? [];
    list.push(e);
    bySupervisor.set(e.entityName, list);
  }
  const bestRespondingSupervisors = [...bySupervisor.entries()]
    .map(([entityName, entries]) => ({
      entityName,
      successRatePercent: successRateFor(entries),
      count: entries.filter((e) => e.evaluated).length,
    }))
    .filter((s) => s.count >= 1)
    .sort((a, b) => b.successRatePercent - a.successRatePercent)
    .slice(0, 5);

  const executionTimes = executed
    .filter((e) => e.executedAt)
    .map((e) => (new Date(e.executedAt as string).getTime() - new Date(e.issuedAt).getTime()) / (1000 * 60 * 60))
    .filter((h) => h >= 0);
  const avgExecutionTimeHours =
    executionTimes.length > 0 ? round2(executionTimes.reduce((s, h) => s + h, 0) / executionTimes.length) : null;

  return {
    totalRecommendations: total,
    executedCount: executed.length,
    notExecutedCount: notExecuted.length,
    evaluatedCount: evaluated.length,
    successfulCount: successful.length,
    failedCount: failed.length,
    pendingEvaluationCount: pending.length,
    successRatePercent: evaluated.length > 0 ? round2((successful.length / evaluated.length) * 100) : 0,
    executionRatePercent: total > 0 ? round2((executed.length / total) * 100) : 0,
    bestActionKinds,
    worstActionKinds,
    bestRespondingSupervisors,
    avgExecutionTimeHours,
  };
}
