/**
 * SRS-008 §17 — Validation run history (file-backed, server-side).
 */

import { mkdirSync, readFileSync, writeFileSync, existsSync } from 'fs';
import { join } from 'path';
import type { ProductionCertificate } from './types';

export type ValidationHistoryEntry = {
  id: string;
  ranAt: string;
  schedule: 'manual' | 'daily' | 'weekly' | 'monthly';
  verdict: ProductionCertificate['verdict'];
  level: ProductionCertificate['level'];
  readinessPercent: number;
  totalTests: number;
  passed: number;
  failed: number;
  coveragePercent: number;
};

const DIR = join(process.cwd(), '.data');
const FILE = join(DIR, 'ops-validation-history.json');
const MAX = 90;

function ensure(): ValidationHistoryEntry[] {
  try {
    if (!existsSync(DIR)) mkdirSync(DIR, { recursive: true });
    if (!existsSync(FILE)) {
      writeFileSync(FILE, '[]', 'utf8');
      return [];
    }
    const raw = readFileSync(FILE, 'utf8');
    const parsed = JSON.parse(raw) as ValidationHistoryEntry[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function listValidationHistory(limit = 30): ValidationHistoryEntry[] {
  return ensure()
    .sort((a, b) => (a.ranAt < b.ranAt ? 1 : -1))
    .slice(0, limit);
}

export function appendValidationHistory(
  entry: Omit<ValidationHistoryEntry, 'id'>
): ValidationHistoryEntry {
  const rows = ensure();
  const full: ValidationHistoryEntry = {
    ...entry,
    id: `vh-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
  };
  rows.push(full);
  const trimmed = rows
    .sort((a, b) => (a.ranAt < b.ranAt ? 1 : -1))
    .slice(0, MAX);
  try {
    if (!existsSync(DIR)) mkdirSync(DIR, { recursive: true });
    writeFileSync(FILE, JSON.stringify(trimmed, null, 2), 'utf8');
  } catch (e) {
    console.error('[ops-validation-history] write failed', e);
  }
  return full;
}
