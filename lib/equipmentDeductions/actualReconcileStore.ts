/**
 * 4D.5.4.16 — Persistence for equipment payroll Actual reconcile rows.
 * Memory store for tests; Sheets store for admin API.
 */

import {
  EQUIPMENT_PAYROLL_ACTUAL_HEADERS,
  SHEET_EQUIPMENT_PAYROLL_ACTUAL,
} from '@/lib/equipmentSheetConstants';
import type { ActualReconcileRecord } from '@/lib/equipmentDeductions/actualPayrollReconcile';

const H = EQUIPMENT_PAYROLL_ACTUAL_HEADERS;

function idx(name: (typeof H)[number]): number {
  return H.indexOf(name);
}

function padRow(values: unknown[]): unknown[] {
  const row = [...values];
  while (row.length < H.length) row.push('');
  return row.slice(0, H.length);
}

function cell(row: unknown[], name: (typeof H)[number]): string {
  const i = idx(name);
  if (i < 0 || i >= row.length) return '';
  return String(row[i] ?? '').trim();
}

function cellNum(row: unknown[], name: (typeof H)[number]): number {
  const n = Number(String(cell(row, name)).replace(/,/g, ''));
  return Number.isFinite(n) ? Math.trunc(n) : 0;
}

export function recordToRow(r: ActualReconcileRecord): unknown[] {
  const row: unknown[] = new Array(H.length).fill('');
  row[idx('reconcileId')] = r.reconcileId;
  row[idx('idempotencyKey')] = r.idempotencyKey;
  row[idx('deductionId')] = r.deductionId;
  row[idx('equipmentIssueId')] = r.equipmentIssueId;
  row[idx('riderCode')] = r.riderCode;
  row[idx('cycleId')] = r.cycleId;
  row[idx('requestedAmountMilli')] = r.requestedAmountMilli;
  row[idx('actualDeductedMilli')] = r.actualDeductedMilli;
  row[idx('previousOutstandingMilli')] = r.previousOutstandingMilli;
  row[idx('newOutstandingMilli')] = r.newOutstandingMilli;
  row[idx('amountDeductedDelta')] = r.amountDeductedDelta;
  row[idx('talabatReference')] = r.talabatReference;
  row[idx('actualDeductionDate')] = r.actualDeductionDate;
  row[idx('actorCode')] = r.actorCode;
  row[idx('actorName')] = r.actorName;
  row[idx('createdAt')] = r.createdAt;
  row[idx('notes')] = r.notes;
  row[idx('status')] = r.status;
  return padRow(row);
}

export function rowToRecord(row: unknown[]): ActualReconcileRecord | null {
  const idempotencyKey = cell(row, 'idempotencyKey');
  const deductionId = cell(row, 'deductionId');
  if (!idempotencyKey || !deductionId) return null;
  return {
    reconcileId: cell(row, 'reconcileId'),
    idempotencyKey,
    deductionId,
    equipmentIssueId: cell(row, 'equipmentIssueId'),
    riderCode: cell(row, 'riderCode'),
    cycleId: cell(row, 'cycleId'),
    requestedAmountMilli: cellNum(row, 'requestedAmountMilli'),
    actualDeductedMilli: cellNum(row, 'actualDeductedMilli'),
    previousOutstandingMilli: cellNum(row, 'previousOutstandingMilli'),
    newOutstandingMilli: cellNum(row, 'newOutstandingMilli'),
    amountDeductedDelta: cellNum(row, 'amountDeductedDelta'),
    talabatReference: cell(row, 'talabatReference'),
    actualDeductionDate: cell(row, 'actualDeductionDate'),
    actorCode: cell(row, 'actorCode'),
    actorName: cell(row, 'actorName'),
    createdAt: cell(row, 'createdAt'),
    notes: cell(row, 'notes'),
    status: 'APPLIED',
  };
}

export type ActualReconcileStore = {
  findByIdempotencyKey(
    key: string
  ): Promise<{ idempotencyKey: string; actualDeductedMilli: number } | null>;
  findLatestByDeductionId(deductionId: string): Promise<ActualReconcileRecord | null>;
  append(record: ActualReconcileRecord): Promise<void>;
  listAll(): Promise<ActualReconcileRecord[]>;
};

export function createMemoryActualReconcileStore(
  initial: ActualReconcileRecord[] = []
): ActualReconcileStore & { records: ActualReconcileRecord[] } {
  const records = [...initial];
  return {
    records,
    async findByIdempotencyKey(key: string) {
      const hit = records.find((r) => r.idempotencyKey === key);
      return hit
        ? { idempotencyKey: hit.idempotencyKey, actualDeductedMilli: hit.actualDeductedMilli }
        : null;
    },
    async findLatestByDeductionId(deductionId: string) {
      const id = String(deductionId || '').trim();
      const matches = records.filter((r) => r.deductionId === id);
      return matches.length ? matches[matches.length - 1] : null;
    },
    async append(record: ActualReconcileRecord) {
      records.push(record);
    },
    async listAll() {
      return [...records];
    },
  };
}

export async function createSheetsActualReconcileStore(deps: {
  ensureSheetExists: (sheetName: string, headers?: string[]) => Promise<boolean>;
  ensureHeaderRow: (sheetName: string, headers: string[]) => Promise<void>;
  getSheetDataOrThrow: (sheetName: string, useCache?: boolean) => Promise<unknown[][]>;
  appendToSheet: (sheetName: string, values: unknown[][], useCache?: boolean) => Promise<boolean>;
}): Promise<ActualReconcileStore> {
  const headers = [...EQUIPMENT_PAYROLL_ACTUAL_HEADERS];
  await deps.ensureSheetExists(SHEET_EQUIPMENT_PAYROLL_ACTUAL, headers);
  await deps.ensureHeaderRow(SHEET_EQUIPMENT_PAYROLL_ACTUAL, headers);

  async function listRecords(): Promise<ActualReconcileRecord[]> {
    const data = await deps.getSheetDataOrThrow(SHEET_EQUIPMENT_PAYROLL_ACTUAL, false);
    const out: ActualReconcileRecord[] = [];
    for (let i = 1; i < data.length; i++) {
      const rec = rowToRecord(data[i] || []);
      if (rec) out.push(rec);
    }
    return out;
  }

  return {
    async findByIdempotencyKey(key: string) {
      const all = await listRecords();
      const hit = all.find((r) => r.idempotencyKey === key);
      return hit
        ? { idempotencyKey: hit.idempotencyKey, actualDeductedMilli: hit.actualDeductedMilli }
        : null;
    },
    async findLatestByDeductionId(deductionId: string) {
      const id = String(deductionId || '').trim();
      const all = await listRecords();
      const matches = all.filter((r) => r.deductionId === id);
      return matches.length ? matches[matches.length - 1] : null;
    },
    async append(record: ActualReconcileRecord) {
      const ok = await deps.appendToSheet(
        SHEET_EQUIPMENT_PAYROLL_ACTUAL,
        [recordToRow(record)],
        false
      );
      if (!ok) throw new Error('actualReconcileStore: appendToSheet failed');
    },
    async listAll() {
      return listRecords();
    },
  };
}
