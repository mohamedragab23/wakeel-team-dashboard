/**
 * Browser localStorage drafts for What-If Lab (client-only).
 */

import type { ScenarioLevers, TwinFilters } from '../types';

export type SimulationDraft = {
  id: string;
  title: string;
  filters: TwinFilters;
  levers: ScenarioLevers;
  updatedAt: string;
};

const MAX_DRAFTS = 20;

function key(userCode: string): string {
  return `strategic-ops:sim-drafts:${userCode || 'anon'}`;
}

export function listDrafts(userCode: string): SimulationDraft[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(key(userCode));
    if (!raw) return [];
    const parsed = JSON.parse(raw) as SimulationDraft[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function saveDraft(userCode: string, draft: Omit<SimulationDraft, 'updatedAt' | 'id'> & { id?: string }): SimulationDraft {
  const drafts = listDrafts(userCode);
  const id = draft.id || `draft-${Date.now()}`;
  const next: SimulationDraft = {
    id,
    title: draft.title,
    filters: draft.filters,
    levers: draft.levers,
    updatedAt: new Date().toISOString(),
  };
  const filtered = drafts.filter((d) => d.id !== id);
  filtered.unshift(next);
  const trimmed = filtered.slice(0, MAX_DRAFTS);
  localStorage.setItem(key(userCode), JSON.stringify(trimmed));
  return next;
}

export function deleteDraft(userCode: string, id: string): void {
  const drafts = listDrafts(userCode).filter((d) => d.id !== id);
  localStorage.setItem(key(userCode), JSON.stringify(drafts));
}
