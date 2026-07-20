/**
 * Neon persistence for saved Digital Twin scenarios.
 * Reuses TICKETING_DATABASE_URL (same Postgres as ticketing).
 */

import { readFileSync } from 'fs';
import { join } from 'path';
import {
  getTicketingSql,
  isTicketingDbConfigured,
} from '@/lib/ticketing/db/client';
import type {
  DigitalTwinState,
  ExecutiveDecision,
  SavedScenarioRecord,
  ScenarioLevers,
  SimulationImpact,
  TwinFilters,
} from '../types';

export function isSimulationDbConfigured(): boolean {
  return isTicketingDbConfigured();
}

export async function ensureSimulationSchema(): Promise<void> {
  if (!isTicketingDbConfigured()) {
    throw new Error('TICKETING_DATABASE_URL is not configured');
  }
  const db = getTicketingSql();
  const schemaPath = join(process.cwd(), 'lib', 'strategicOps', 'digitalTwin', 'db', 'schema.sql');
  const schema = readFileSync(schemaPath, 'utf8');
  await db.unsafe(schema);
}

function mapRow(row: Record<string, unknown>): SavedScenarioRecord {
  return {
    id: String(row.id),
    authorCode: String(row.author_code),
    authorName: row.author_name != null ? String(row.author_name) : null,
    title: String(row.title),
    filters: row.filters_json as TwinFilters,
    levers: row.levers_json as ScenarioLevers,
    baseline: row.baseline_json as DigitalTwinState,
    impact: row.impact_json as SimulationImpact,
    decision: (row.decision_json as ExecutiveDecision) ?? null,
    actualResult: row.actual_result_json ?? null,
    variance: row.variance_json ?? null,
    createdAt: new Date(String(row.created_at)).toISOString(),
    updatedAt: new Date(String(row.updated_at)).toISOString(),
  };
}

export async function listScenarios(limit = 50): Promise<SavedScenarioRecord[]> {
  const db = getTicketingSql();
  await ensureSimulationSchema();
  const rows = await db`
    SELECT * FROM simulation_scenarios
    ORDER BY created_at DESC
    LIMIT ${limit}
  `;
  return rows.map((r) => mapRow(r as Record<string, unknown>));
}

export async function getScenario(id: string): Promise<SavedScenarioRecord | null> {
  const db = getTicketingSql();
  await ensureSimulationSchema();
  const rows = await db`
    SELECT * FROM simulation_scenarios WHERE id = ${id}::uuid LIMIT 1
  `;
  if (!rows.length) return null;
  return mapRow(rows[0] as Record<string, unknown>);
}

export async function createScenario(input: {
  authorCode: string;
  authorName?: string | null;
  title: string;
  filters: TwinFilters;
  levers: ScenarioLevers;
  baseline: DigitalTwinState;
  impact: SimulationImpact;
  decision?: ExecutiveDecision | null;
}): Promise<SavedScenarioRecord> {
  const db = getTicketingSql();
  await ensureSimulationSchema();
  const rows = await db`
    INSERT INTO simulation_scenarios (
      author_code, author_name, title,
      filters_json, levers_json, baseline_json, impact_json, decision_json
    ) VALUES (
      ${input.authorCode},
      ${input.authorName ?? null},
      ${input.title},
      ${JSON.stringify(input.filters)}::jsonb,
      ${JSON.stringify(input.levers)}::jsonb,
      ${JSON.stringify(input.baseline)}::jsonb,
      ${JSON.stringify(input.impact)}::jsonb,
      ${input.decision ? JSON.stringify(input.decision) : null}::jsonb
    )
    RETURNING *
  `;
  return mapRow(rows[0] as Record<string, unknown>);
}

export async function updateScenario(
  id: string,
  patch: {
    title?: string;
    levers?: ScenarioLevers;
    impact?: SimulationImpact;
    decision?: ExecutiveDecision | null;
    actualResult?: unknown;
    variance?: unknown;
  }
): Promise<SavedScenarioRecord | null> {
  const existing = await getScenario(id);
  if (!existing) return null;
  const db = getTicketingSql();

  const title = patch.title ?? existing.title;
  const levers = patch.levers ?? existing.levers;
  const impact = patch.impact ?? existing.impact;
  const decision = patch.decision !== undefined ? patch.decision : existing.decision;
  const actual = patch.actualResult !== undefined ? patch.actualResult : existing.actualResult;
  const variance = patch.variance !== undefined ? patch.variance : existing.variance;

  const rows = await db`
    UPDATE simulation_scenarios SET
      title = ${title},
      levers_json = ${JSON.stringify(levers)}::jsonb,
      impact_json = ${JSON.stringify(impact)}::jsonb,
      decision_json = ${decision ? JSON.stringify(decision) : null}::jsonb,
      actual_result_json = ${actual != null ? JSON.stringify(actual) : null}::jsonb,
      variance_json = ${variance != null ? JSON.stringify(variance) : null}::jsonb,
      updated_at = NOW()
    WHERE id = ${id}::uuid
    RETURNING *
  `;
  if (!rows.length) return null;
  return mapRow(rows[0] as Record<string, unknown>);
}

export async function deleteScenario(id: string): Promise<boolean> {
  const db = getTicketingSql();
  await ensureSimulationSchema();
  const rows = await db`
    DELETE FROM simulation_scenarios WHERE id = ${id}::uuid RETURNING id
  `;
  return rows.length > 0;
}
