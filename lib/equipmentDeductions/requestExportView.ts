/**
 * 4D.5.4.16 — Export / sheet view: REQUESTED vs ACTUAL must never be confused.
 * Builds operator-facing rows from REQUEST ledger + Actual reconcile records + liability.
 */

import type { DeductionObligation } from '@/lib/equipmentDeductions/obligations';
import type { ActualReconcileRecord } from '@/lib/equipmentDeductions/actualPayrollReconcile';
import type { EquipmentLiabilityIssue } from '@/lib/equipmentLiability/store';

/** Explicit bilingual-friendly export columns (English keys for tests/CSV). */
export const EQUIPMENT_REQUEST_EXPORT_COLUMNS = [
  'riderCode',
  'riderName',
  'liabilityId',
  'cycle',
  'outstandingBefore',
  'installmentAmount',
  'requestedAmount',
  'actualDeductedAmount',
  'outstandingAfter',
  'requestStatus',
  'actualStatus',
  'talabatReference',
  'requestDate',
  'actualDeductionDate',
  'notes',
] as const;

export type EquipmentRequestExportColumn =
  (typeof EQUIPMENT_REQUEST_EXPORT_COLUMNS)[number];

export type EquipmentRequestExportRow = Record<
  EquipmentRequestExportColumn,
  string | number
>;

export type ActualStatus =
  | 'PENDING_ACTUAL'
  | 'NOT_DEDUCTED'
  | 'PARTIALLY_DEDUCTED'
  | 'DEDUCTED'
  | 'RECONCILED';

export function deriveActualStatus(params: {
  requestedMilli: number;
  actualMilli: number | null;
  hasActualRecord: boolean;
}): ActualStatus {
  if (!params.hasActualRecord || params.actualMilli == null) return 'PENDING_ACTUAL';
  const actual = Math.max(0, Math.trunc(params.actualMilli));
  const requested = Math.max(0, Math.trunc(params.requestedMilli));
  if (actual === 0) return 'NOT_DEDUCTED';
  if (actual < requested) return 'PARTIALLY_DEDUCTED';
  if (actual === requested) return 'DEDUCTED';
  return 'RECONCILED';
}

export function buildEquipmentRequestExportRow(params: {
  obligation: DeductionObligation;
  issue?: EquipmentLiabilityIssue | null;
  riderName?: string;
  requestDate?: string;
  actual?: ActualReconcileRecord | null;
  /** Outstanding before this Actual (from reconcile record or current issue). */
  outstandingBeforeMilli?: number;
  notes?: string;
}): EquipmentRequestExportRow {
  const o = params.obligation;
  const requested = o.originalAmount;
  const actualMilli = params.actual ? params.actual.actualDeductedMilli : null;
  const hasActual = Boolean(params.actual);
  const outstandingBefore =
    params.outstandingBeforeMilli ??
    params.actual?.previousOutstandingMilli ??
    params.issue?.outstandingMilli ??
    0;
  const outstandingAfter = hasActual
    ? params.actual!.newOutstandingMilli
    : outstandingBefore;

  return {
    riderCode: o.riderCode,
    riderName: params.riderName || params.issue?.riderNameSnapshot || '',
    liabilityId: o.equipmentIssueId || '',
    cycle: o.currentCycleId || o.originalCycleId,
    outstandingBefore,
    installmentAmount: requested,
    requestedAmount: requested,
    actualDeductedAmount: actualMilli == null ? '' : actualMilli,
    outstandingAfter: hasActual ? outstandingAfter : '',
    requestStatus: o.status,
    actualStatus: deriveActualStatus({
      requestedMilli: requested,
      actualMilli,
      hasActualRecord: hasActual,
    }),
    talabatReference: params.actual?.talabatReference || '',
    requestDate: params.requestDate || '',
    actualDeductionDate: params.actual?.actualDeductionDate || '',
    notes: params.notes || params.actual?.notes || '',
  };
}

/** CSV header line — keeps REQUESTED and ACTUAL as separate labeled columns. */
export function equipmentRequestExportCsvHeader(): string {
  return EQUIPMENT_REQUEST_EXPORT_COLUMNS.join(',');
}

export function equipmentRequestExportRowToCsv(
  row: EquipmentRequestExportRow
): string {
  return EQUIPMENT_REQUEST_EXPORT_COLUMNS.map((c) => {
    const v = row[c];
    const s = String(v ?? '');
    if (s.includes(',') || s.includes('"') || s.includes('\n')) {
      return `"${s.replace(/"/g, '""')}"`;
    }
    return s;
  }).join(',');
}
