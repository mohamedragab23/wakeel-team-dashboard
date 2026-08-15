/**
 * SRS-014 Phase 4B — REQUEST persistence / emission only.
 *
 * Writes/reads obligation rows on the operational requested ledger (`الاستقطاعات`).
 * No wallet, ledger_native, allocation apply, or installmentsCompleted mutations.
 */

import {
  DEDUCTION_IMPORT_HEADERS,
  SHEET_DEDUCTIONS_IMPORT,
} from '@/lib/equipmentSheetConstants';
import { milliemesToEgp } from '@/lib/money';
import {
  createRequestObligation,
  isEconomicallyConsistent,
  isOpenForAllocation,
  type CreateRequestObligationInput,
  type DeductionObligation,
  type ObligationSource,
  type ObligationStatus,
} from '@/lib/equipmentDeductions/obligations';

export const REQUEST_LEDGER_HEADERS = DEDUCTION_IMPORT_HEADERS;

const H = DEDUCTION_IMPORT_HEADERS;

function idx(name: (typeof H)[number]): number {
  return H.indexOf(name);
}

function truncNonNeg(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.trunc(n));
}

function cell(row: unknown[], name: (typeof H)[number]): string {
  const i = idx(name);
  if (i < 0 || i >= row.length) return '';
  return String(row[i] ?? '').trim();
}

function cellNum(row: unknown[], name: (typeof H)[number]): number {
  const raw = cell(row, name);
  if (!raw) return 0;
  const n = Number(String(raw).replace(/,/g, ''));
  return Number.isFinite(n) ? n : 0;
}

/** Stable معدات installment identity across cycles (SRS rollover / AT-08*). */
export function stableEquipmentInstallmentDeductionId(
  equipmentIssueId: string,
  installmentNumber: number
): string {
  const issue = String(equipmentIssueId || '').trim();
  const n = Math.max(1, Math.trunc(installmentNumber || 1));
  return `eq:${issue}:inst:${n}`;
}

/**
 * Architecture auto REQUEST idempotency key (cycle-scoped).
 * Links to stable `deductionId`; does not itself mint a new remainder identity.
 */
export function autoEquipmentRequestIdempotencyKey(params: {
  riderCode: string;
  equipmentIssueId: string;
  cycleId: string;
  installmentNumber: number;
}): string {
  return [
    'equipment',
    String(params.riderCode || '').trim(),
    String(params.equipmentIssueId || '').trim(),
    String(params.cycleId || '').trim(),
    String(Math.max(1, Math.trunc(params.installmentNumber || 1))),
  ].join(':');
}

export type PersistedObligationRecord = {
  /** 1-based sheet row number (header is row 1). */
  rowNumber: number;
  obligation: DeductionObligation;
  /** Full row aligned to REQUEST_LEDGER_HEADERS (legacy + additive). */
  row: unknown[];
};

export type ObligationLedgerStore = {
  /** Data rows only (no header). Row numbers are 2..n in sheet terms. */
  listDataRows(): Promise<Array<{ rowNumber: number; values: unknown[] }>>;
  appendRow(values: unknown[]): Promise<{ rowNumber: number }>;
  /** Replace entire data row (same length as headers). */
  updateRow(rowNumber: number, values: unknown[]): Promise<void>;
};

/** In-memory ledger for unit tests — no Google Sheets / wallet / ledger I/O. */
export function createMemoryObligationLedgerStore(
  initial: unknown[][] = []
): ObligationLedgerStore & { rows: unknown[][] } {
  const rows: unknown[][] = initial.map((r) => [...r]);
  return {
    rows,
    async listDataRows() {
      return rows.map((values, i) => ({ rowNumber: i + 2, values: [...values] }));
    },
    async appendRow(values: unknown[]) {
      rows.push([...values]);
      return { rowNumber: rows.length + 1 };
    },
    async updateRow(rowNumber: number, values: unknown[]) {
      const i = rowNumber - 2;
      if (i < 0 || i >= rows.length) {
        throw new Error(`requestPersistence: row ${rowNumber} out of range`);
      }
      rows[i] = [...values];
    },
  };
}

function parseStatus(raw: string): ObligationStatus {
  const s = raw.trim().toLowerCase();
  if (s === 'paid') return 'paid';
  if (s === 'partially_allocated') return 'partially_allocated';
  if (s === 'cancelled') return 'cancelled';
  if (s === 'replaced') return 'replaced';
  return 'open';
}

function parseSource(raw: string): ObligationSource {
  const s = raw.trim();
  if (s === 'auto_equipment' || s === 'supervisor' || s === 'manual_v2' || s === 'other') {
    return s;
  }
  return 'other';
}

/** Map a persisted ledger row → domain obligation (milli economics). */
export function obligationFromLedgerRow(
  row: unknown[],
  rowNumber: number
): PersistedObligationRecord | null {
  const deductionId = cell(row, 'deductionId');
  if (!deductionId) return null;

  const originalAmount = truncNonNeg(cellNum(row, 'originalAmount'));
  const paidAmount = truncNonNeg(cellNum(row, 'paidAmount'));
  const remainingRaw = cell(row, 'remainingAmount');
  const remainingAmount =
    remainingRaw === ''
      ? Math.max(0, originalAmount - paidAmount)
      : truncNonNeg(cellNum(row, 'remainingAmount'));

  const uploadedAt = cell(row, 'تاريخ_الرفع') || String(rowNumber);
  const installmentRaw = cell(row, 'installmentNumber');
  const installmentNumber = installmentRaw
    ? Math.max(1, Math.trunc(cellNum(row, 'installmentNumber')))
    : undefined;

  const obligation: DeductionObligation = {
    deductionId,
    source: parseSource(cell(row, 'source')),
    riderCode: cell(row, 'كود_المندوب'),
    reason: (cell(row, 'السبب') || 'خصم تشغيل') as DeductionObligation['reason'],
    equipmentIssueId: cell(row, 'equipmentIssueId') || undefined,
    installmentNumber,
    originalCycleId: cell(row, 'originalCycleId'),
    currentCycleId: cell(row, 'currentCycleId') || cell(row, 'originalCycleId'),
    originalAmount,
    paidAmount,
    remainingAmount,
    status: parseStatus(cell(row, 'status')),
    obligationAgeKey: uploadedAt,
  };

  return { rowNumber, obligation, row: [...row] };
}

export async function listPersistedObligations(
  store: ObligationLedgerStore
): Promise<PersistedObligationRecord[]> {
  const data = await store.listDataRows();
  const out: PersistedObligationRecord[] = [];
  for (const { rowNumber, values } of data) {
    const parsed = obligationFromLedgerRow(values, rowNumber);
    if (parsed) out.push(parsed);
  }
  return out;
}

export async function findPersistedByDeductionId(
  store: ObligationLedgerStore,
  deductionId: string
): Promise<PersistedObligationRecord | null> {
  const id = String(deductionId || '').trim();
  if (!id) return null;
  const all = await listPersistedObligations(store);
  return all.find((r) => r.obligation.deductionId === id) ?? null;
}

/**
 * Persist paidAmount / remainingAmount / status after ALLOCATED financial apply.
 * originalAmount is immutable — mismatch is rejected (no silent heal).
 */
export async function updatePersistedObligationEconomics(
  store: ObligationLedgerStore,
  obligation: DeductionObligation
): Promise<void> {
  const found = await findPersistedByDeductionId(store, obligation.deductionId);
  if (!found) {
    throw new Error(
      `updatePersistedObligationEconomics: deductionId not found: ${obligation.deductionId}`
    );
  }
  if (found.obligation.originalAmount !== obligation.originalAmount) {
    throw new Error(
      `updatePersistedObligationEconomics: originalAmount immutable for ${obligation.deductionId}`
    );
  }
  if (!isEconomicallyConsistent(obligation)) {
    throw new Error(
      `updatePersistedObligationEconomics: inconsistent economics for ${obligation.deductionId}`
    );
  }
  const nextRow = padRow([...found.row]);
  nextRow[idx('paidAmount')] = obligation.paidAmount;
  nextRow[idx('remainingAmount')] = obligation.remainingAmount;
  nextRow[idx('status')] = obligation.status;
  // Never rewrite originalAmount / deductionId.
  nextRow[idx('originalAmount')] = found.obligation.originalAmount;
  nextRow[idx('deductionId')] = found.obligation.deductionId;
  await store.updateRow(found.rowNumber, nextRow);
}

export type EmitRequestDisplayFields = {
  riderName?: string;
  supervisorCode?: string;
  supervisorName?: string;
  zone?: string;
  /** Legacy Arabic cycle label column (دورة_الاستقطاع). */
  cycleLabel?: string;
  monthLabel?: string;
  year?: number | string;
  /** Defaults to ISO now; also used as obligationAgeKey / تاريخ_الرفع. */
  uploadedAt?: string;
};

export type EmitRequestInput = CreateRequestObligationInput & EmitRequestDisplayFields;

export type EmitRequestOutcome = 'created' | 'queued_existing' | 'already_exists_closed';

export type EmitRequestResult = {
  outcome: EmitRequestOutcome;
  obligation: DeductionObligation;
  rowNumber: number;
  /** H-1: REQUEST path never advances installmentsCompleted. */
  installmentsCompletedDelta: 0;
  /** Explicit: no wallet / ledger side effects from this module. */
  financialSideEffects: {
    walletMutated: false;
    ledgerNativeWritten: false;
    amountDeductedMilliDelta: 0;
    paidAmountIncremented: false;
  };
};

function padRow(values: unknown[]): unknown[] {
  const out = [...values];
  while (out.length < H.length) out.push('');
  return out.slice(0, H.length);
}

function buildRequestRow(input: EmitRequestInput, obligation: DeductionObligation): unknown[] {
  const uploadedAt = String(input.uploadedAt || obligation.obligationAgeKey || new Date().toISOString());
  const row: unknown[] = new Array(H.length).fill('');
  row[idx('تاريخ_الرفع')] = uploadedAt;
  row[idx('كود_المشرف')] = String(input.supervisorCode || '').trim();
  row[idx('اسم_المشرف')] = String(input.supervisorName || '').trim();
  row[idx('كود_المندوب')] = obligation.riderCode;
  row[idx('اسم_المندوب')] = String(input.riderName || '').trim();
  row[idx('قيمة_الاستقطاع')] = milliemesToEgp(obligation.originalAmount);
  row[idx('السبب')] = obligation.reason;
  row[idx('الزون')] = String(input.zone || '').trim();
  row[idx('دورة_الاستقطاع')] = String(input.cycleLabel || '').trim();
  row[idx('شهر')] = String(input.monthLabel || '').trim();
  row[idx('سنة')] = input.year == null ? '' : String(input.year);
  row[idx('deductionId')] = obligation.deductionId;
  row[idx('source')] = obligation.source;
  row[idx('equipmentIssueId')] = obligation.equipmentIssueId || '';
  row[idx('installmentNumber')] =
    obligation.installmentNumber == null ? '' : obligation.installmentNumber;
  row[idx('originalCycleId')] = obligation.originalCycleId;
  row[idx('currentCycleId')] = obligation.currentCycleId;
  row[idx('originalAmount')] = obligation.originalAmount;
  row[idx('paidAmount')] = obligation.paidAmount;
  row[idx('remainingAmount')] = obligation.remainingAmount;
  row[idx('status')] = obligation.status;
  return padRow(row);
}

function sideEffectsNone(): EmitRequestResult['financialSideEffects'] {
  return {
    walletMutated: false,
    ledgerNativeWritten: false,
    amountDeductedMilliDelta: 0,
    paidAmountIncremented: false,
  };
}

/**
 * Emit or queue a REQUEST on the operational ledger.
 *
 * - New deductionId → append row with paidAmount=0, remainingAmount=originalAmount.
 * - Existing open remainder (same deductionId) → update currentCycleId only (no new REQUEST).
 * - Existing closed/cancelled/replaced → no second row (idempotent).
 *
 * Does not touch عهدة installmentsCompleted, wallet, or ledger_native.
 */
export async function emitRequestObligation(
  store: ObligationLedgerStore,
  input: EmitRequestInput
): Promise<EmitRequestResult> {
  const draft = createRequestObligation({
    ...input,
    obligationAgeKey: String(input.uploadedAt || input.obligationAgeKey || new Date().toISOString()),
  });

  if (!draft.deductionId) {
    throw new Error('emitRequestObligation: deductionId is required');
  }
  if (!isEconomicallyConsistent(draft) || draft.paidAmount !== 0) {
    throw new Error('emitRequestObligation: REQUEST must start paidAmount=0 and be economically consistent');
  }

  const existing = await findPersistedByDeductionId(store, draft.deductionId);
  if (existing) {
    const o = existing.obligation;
    if (isOpenForAllocation(o) || truncNonNeg(o.remainingAmount) > 0) {
      const nextCycle = String(input.currentCycleId || draft.currentCycleId || o.currentCycleId).trim();
      const updated: DeductionObligation = {
        ...o,
        originalAmount: o.originalAmount,
        paidAmount: o.paidAmount,
        remainingAmount: o.remainingAmount,
        originalCycleId: o.originalCycleId,
        currentCycleId: nextCycle || o.currentCycleId,
        deductionId: o.deductionId,
        equipmentIssueId: o.equipmentIssueId,
        installmentNumber: o.installmentNumber,
      };
      const nextRow = padRow([...existing.row]);
      nextRow[idx('currentCycleId')] = updated.currentCycleId;
      await store.updateRow(existing.rowNumber, nextRow);
      return {
        outcome: 'queued_existing',
        obligation: updated,
        rowNumber: existing.rowNumber,
        installmentsCompletedDelta: 0,
        financialSideEffects: sideEffectsNone(),
      };
    }

    return {
      outcome: 'already_exists_closed',
      obligation: o,
      rowNumber: existing.rowNumber,
      installmentsCompletedDelta: 0,
      financialSideEffects: sideEffectsNone(),
    };
  }

  const row = buildRequestRow(input, draft);
  const { rowNumber } = await store.appendRow(row);
  return {
    outcome: 'created',
    obligation: draft,
    rowNumber,
    installmentsCompletedDelta: 0,
    financialSideEffects: sideEffectsNone(),
  };
}

/**
 * Sheets-backed store for `الاستقطاعات`.
 * Not wired to Auto cron / flags in Phase 4B — call sites are deferred.
 */
export async function createSheetsObligationLedgerStore(deps: {
  ensureSheetExists: (sheetName: string, headers?: string[]) => Promise<boolean>;
  ensureHeaderRow: (sheetName: string, headers: string[]) => Promise<void>;
  getSheetDataOrThrow: (sheetName: string, useCache?: boolean) => Promise<unknown[][]>;
  appendToSheet: (sheetName: string, values: unknown[][], useCache?: boolean) => Promise<boolean>;
  updateSheetRow: (sheetName: string, rowNumber: number, values: unknown[]) => Promise<boolean>;
}): Promise<ObligationLedgerStore> {
  const headers = [...REQUEST_LEDGER_HEADERS];
  await deps.ensureSheetExists(SHEET_DEDUCTIONS_IMPORT, headers);
  await deps.ensureHeaderRow(SHEET_DEDUCTIONS_IMPORT, headers);

  return {
    async listDataRows() {
      const data = await deps.getSheetDataOrThrow(SHEET_DEDUCTIONS_IMPORT, false);
      const out: Array<{ rowNumber: number; values: unknown[] }> = [];
      for (let i = 1; i < data.length; i++) {
        out.push({ rowNumber: i + 1, values: padRow(data[i] || []) });
      }
      return out;
    },
    async appendRow(values: unknown[]) {
      const row = padRow(values);
      const data = await deps.getSheetDataOrThrow(SHEET_DEDUCTIONS_IMPORT, false);
      const rowNumber = data.length + 1; // next 1-based row after current incl. header
      const ok = await deps.appendToSheet(SHEET_DEDUCTIONS_IMPORT, [row], false);
      if (!ok) throw new Error('requestPersistence: appendToSheet failed');
      return { rowNumber };
    },
    async updateRow(rowNumber: number, values: unknown[]) {
      const ok = await deps.updateSheetRow(SHEET_DEDUCTIONS_IMPORT, rowNumber, padRow(values));
      if (!ok) throw new Error(`requestPersistence: updateSheetRow failed for row ${rowNumber}`);
    },
  };
}
