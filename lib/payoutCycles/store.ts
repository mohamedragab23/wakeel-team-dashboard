import { appendToSheet, ensureSheetExists, getSheetDataOrThrow, updateSheetRow } from '@/lib/googleSheets';
import { appendAuditLog } from '@/lib/auditLog';
import { PAYOUT_CYCLE_HEADERS, SHEET_PAYOUT_CYCLES } from './constants';
import type { PayoutCycle, PayoutCycleInput, PayoutCycleStatus } from './types';
import { assertCanMutateCycle, parseBoolCell, validatePayoutCycleInput } from './validation';

let ensuredOnce = false;

export async function ensurePayoutCyclesSheet(): Promise<void> {
  if (ensuredOnce) return;
  await ensureSheetExists(SHEET_PAYOUT_CYCLES, [...PAYOUT_CYCLE_HEADERS]);
  ensuredOnce = true;
}

function newCycleId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID();
  return `cyc_${Date.now()}_${Math.random().toString(36).slice(2)}`;
}

function cell(row: unknown[], i: number): string {
  return String(row[i] ?? '').trim();
}

export function rowToPayoutCycle(row: unknown[], sheetRow: number): PayoutCycle | null {
  const cycleId = cell(row, 0);
  if (!cycleId) return null;
  const status = (cell(row, 10) || 'draft') as PayoutCycleStatus;
  return {
    cycleId,
    year: Number(cell(row, 1)) || 0,
    month: Number(cell(row, 2)) || 0,
    cycleNumber: Number(cell(row, 3)) || 0,
    startDate: cell(row, 4),
    endDate: cell(row, 5),
    payoutDate: cell(row, 6),
    deductionGenerationDate: cell(row, 7),
    isClosing: parseBoolCell(cell(row, 8)),
    equipmentDeductionEnabled: parseBoolCell(cell(row, 9), true),
    status: ['draft', 'active', 'finalized'].includes(status) ? status : 'draft',
    notes: cell(row, 11),
    createdBy: cell(row, 12),
    createdAt: cell(row, 13),
    updatedBy: cell(row, 14),
    updatedAt: cell(row, 15),
    sheetRow,
  };
}

function cycleToRow(c: PayoutCycle): unknown[] {
  return [
    c.cycleId,
    c.year,
    c.month,
    c.cycleNumber,
    c.startDate,
    c.endDate,
    c.payoutDate,
    c.deductionGenerationDate,
    c.isClosing ? 'TRUE' : 'FALSE',
    c.equipmentDeductionEnabled ? 'TRUE' : 'FALSE',
    c.status,
    c.notes,
    c.createdBy,
    c.createdAt,
    c.updatedBy,
    c.updatedAt,
  ];
}

export async function listPayoutCycles(filters?: {
  year?: number;
  month?: number;
  status?: PayoutCycleStatus;
}): Promise<PayoutCycle[]> {
  await ensurePayoutCyclesSheet();
  // Fail closed: empty-on-error made prep look like "cycle not found".
  const data = await getSheetDataOrThrow(
    SHEET_PAYOUT_CYCLES,
    false,
    `${SHEET_PAYOUT_CYCLES}!A:AZ`
  );
  const out: PayoutCycle[] = [];
  for (let i = 1; i < data.length; i++) {
    const c = rowToPayoutCycle(data[i], i + 1);
    if (!c) continue;
    if (filters?.year != null && c.year !== filters.year) continue;
    if (filters?.month != null && c.month !== filters.month) continue;
    if (filters?.status && c.status !== filters.status) continue;
    out.push(c);
  }
  return out.sort((a, b) => {
    if (a.year !== b.year) return a.year - b.year;
    if (a.month !== b.month) return a.month - b.month;
    return a.cycleNumber - b.cycleNumber;
  });
}

function normalizeCycleId(id: string): string {
  return String(id || '')
    .trim()
    .toLowerCase()
    .replace(/[{}]/g, '');
}

export async function getPayoutCycleById(cycleId: string): Promise<PayoutCycle | null> {
  const want = normalizeCycleId(cycleId);
  if (!want) return null;
  const all = await listPayoutCycles();
  return all.find((c) => normalizeCycleId(c.cycleId) === want) || null;
}

/** Prep lookup: UUID first, then year/month/cycleNumber (sheet IDs can drift). */
export async function findPayoutCycleForPrep(params: {
  cycleId?: string;
  year?: number;
  month?: number;
  cycleNumber?: number;
}): Promise<PayoutCycle | null> {
  const all = await listPayoutCycles();
  const wantId = normalizeCycleId(params.cycleId || '');
  if (wantId) {
    const byId = all.find((c) => normalizeCycleId(c.cycleId) === wantId);
    if (byId) return byId;
  }
  const year = Number(params.year);
  const month = Number(params.month);
  const cycleNumber = Number(params.cycleNumber);
  if (!Number.isInteger(year) || !Number.isInteger(month) || !Number.isInteger(cycleNumber)) {
    return null;
  }
  return (
    all.find((c) => c.year === year && c.month === month && c.cycleNumber === cycleNumber) || null
  );
}

export async function createPayoutCycle(
  input: PayoutCycleInput,
  actor: { code: string; name: string }
): Promise<{ ok: true; cycle: PayoutCycle } | { ok: false; errors: { field?: string; message: string }[] }> {
  const existing = await listPayoutCycles({ year: input.year, month: input.month });
  const errors = validatePayoutCycleInput(input, existing);
  if (errors.length) return { ok: false, errors };

  const now = new Date().toISOString();
  const cycle: PayoutCycle = {
    cycleId: newCycleId(),
    year: input.year,
    month: input.month,
    cycleNumber: input.cycleNumber,
    startDate: input.startDate,
    endDate: input.endDate,
    payoutDate: input.payoutDate,
    deductionGenerationDate: input.deductionGenerationDate,
    isClosing: Boolean(input.isClosing),
    equipmentDeductionEnabled: input.equipmentDeductionEnabled !== false,
    status: input.status || 'draft',
    notes: input.notes || '',
    createdBy: actor.code,
    createdAt: now,
    updatedBy: actor.code,
    updatedAt: now,
  };

  await ensurePayoutCyclesSheet();
  await appendToSheet(SHEET_PAYOUT_CYCLES, [cycleToRow(cycle)]);

  void appendAuditLog({
    domain: 'payout_cycles',
    action: 'create_cycle',
    entityType: 'payout_cycle',
    entityCode: cycle.cycleId,
    actorCode: actor.code,
    actorName: actor.name,
    after: cycle,
  }).catch((err) => console.error('[payoutCycles] audit create failed:', err));

  return { ok: true, cycle };
}

export async function updatePayoutCycle(
  cycleId: string,
  patch: Partial<PayoutCycleInput>,
  actor: { code: string; name: string },
  opts?: { allowFinalizedCorrection?: boolean; correctionNote?: string }
): Promise<{ ok: true; cycle: PayoutCycle } | { ok: false; errors: { field?: string; message: string }[]; status?: number }> {
  const existing = await getPayoutCycleById(cycleId);
  if (!existing || !existing.sheetRow) {
    return { ok: false, errors: [{ message: 'cycle not found' }], status: 404 };
  }

  const mutateErr = assertCanMutateCycle(existing, {
    allowFinalizedCorrection: opts?.allowFinalizedCorrection,
  });
  if (mutateErr) return { ok: false, errors: [mutateErr], status: 409 };

  const merged: PayoutCycleInput = {
    year: patch.year ?? existing.year,
    month: patch.month ?? existing.month,
    cycleNumber: patch.cycleNumber ?? existing.cycleNumber,
    startDate: patch.startDate ?? existing.startDate,
    endDate: patch.endDate ?? existing.endDate,
    payoutDate: patch.payoutDate ?? existing.payoutDate,
    deductionGenerationDate: patch.deductionGenerationDate ?? existing.deductionGenerationDate,
    isClosing: patch.isClosing ?? existing.isClosing,
    equipmentDeductionEnabled: patch.equipmentDeductionEnabled ?? existing.equipmentDeductionEnabled,
    status: patch.status ?? existing.status,
    notes:
      opts?.allowFinalizedCorrection && opts.correctionNote
        ? `${existing.notes ? existing.notes + '\n' : ''}[correction] ${opts.correctionNote}`
        : patch.notes ?? existing.notes,
  };

  const peers = await listPayoutCycles({ year: merged.year, month: merged.month });
  const errors = validatePayoutCycleInput(merged, peers, { editingCycleId: cycleId });
  if (errors.length) return { ok: false, errors };

  const now = new Date().toISOString();
  const updated: PayoutCycle = {
    ...existing,
    ...merged,
    isClosing: Boolean(merged.isClosing),
    equipmentDeductionEnabled: merged.equipmentDeductionEnabled !== false,
    status: merged.status || existing.status,
    notes: merged.notes || '',
    updatedBy: actor.code,
    updatedAt: now,
  };

  await updateSheetRow(SHEET_PAYOUT_CYCLES, existing.sheetRow, cycleToRow(updated));

  void appendAuditLog({
    domain: 'payout_cycles',
    action: opts?.allowFinalizedCorrection ? 'correct_cycle' : 'update_cycle',
    entityType: 'payout_cycle',
    entityCode: cycleId,
    actorCode: actor.code,
    actorName: actor.name,
    before: existing,
    after: updated,
  }).catch((err) => console.error('[payoutCycles] audit update failed:', err));

  return { ok: true, cycle: updated };
}

export async function finalizePayoutCycle(
  cycleId: string,
  actor: { code: string; name: string }
): Promise<{ ok: true; cycle: PayoutCycle } | { ok: false; errors: { message: string }[]; status?: number }> {
  const existing = await getPayoutCycleById(cycleId);
  if (!existing) return { ok: false, errors: [{ message: 'cycle not found' }], status: 404 };
  if (existing.status === 'finalized') {
    return { ok: false, errors: [{ message: 'already finalized' }], status: 409 };
  }
  return updatePayoutCycle(cycleId, { status: 'finalized' }, actor);
}
