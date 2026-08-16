import { appendToSheet, ensureSheetExists, getSheetData, updateSheetRow } from '@/lib/googleSheets';
import { appendAuditLog } from '@/lib/auditLog';
import { applySettlementPayment, getById, markIssueWaived } from '@/lib/equipmentLiability/store';

export const SHEET_EQUIPMENT_RETURN_SETTLEMENT = 'تسوية_استرجاع_المعدات';

export const EQUIPMENT_RETURN_SETTLEMENT_HEADERS = [
  'settlementId',
  'equipmentIssueId',
  'riderCode',
  'returnedMotorcyclePouch',
  'returnedBicyclePouch',
  'returnedTshirt',
  'returnedJacket',
  'returnedHelmet',
  'settlementPaidMilli',
  'waivedMilli',
  'waiverReason',
  'status',
  'approvedBy',
  'approvedAt',
  'createdAt',
  'createdBy',
  'notes',
] as const;

export type EquipmentReturnSettlementStatus = 'pending' | 'approved' | 'rejected';

export type EquipmentReturnSettlement = {
  settlementId: string;
  equipmentIssueId: string;
  riderCode: string;
  returnedMotorcyclePouch: boolean;
  returnedBicyclePouch: boolean;
  returnedTshirt: boolean;
  returnedJacket: boolean;
  returnedHelmet: boolean;
  settlementPaidMilli: number;
  waivedMilli: number;
  waiverReason: string;
  status: EquipmentReturnSettlementStatus;
  approvedBy: string;
  approvedAt: string;
  createdAt: string;
  createdBy: string;
  notes: string;
  sheetRow?: number;
};

export type CreateSettlementInput = {
  equipmentIssueId: string;
  riderCode: string;
  returnedMotorcyclePouch?: boolean;
  returnedBicyclePouch?: boolean;
  returnedTshirt?: boolean;
  returnedJacket?: boolean;
  returnedHelmet?: boolean;
  settlementPaidMilli?: number;
  waivedMilli?: number;
  waiverReason?: string;
  notes?: string;
};

let ensuredOnce = false;

function newSettlementId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID();
  return `set_${Date.now()}_${Math.random().toString(36).slice(2)}`;
}

function cell(row: unknown[], i: number): string {
  return String(row[i] ?? '').trim();
}

function parseBoolCell(v: string): boolean {
  const s = v.trim().toLowerCase();
  return s === 'true' || s === '1' || s === 'yes';
}

function rowToSettlement(row: unknown[], sheetRow: number): EquipmentReturnSettlement | null {
  const settlementId = cell(row, 0);
  if (!settlementId) return null;
  const statusRaw = cell(row, 11) || 'pending';
  const status = (['pending', 'approved', 'rejected'].includes(statusRaw)
    ? statusRaw
    : 'pending') as EquipmentReturnSettlementStatus;

  return {
    settlementId,
    equipmentIssueId: cell(row, 1),
    riderCode: cell(row, 2),
    returnedMotorcyclePouch: parseBoolCell(cell(row, 3)),
    returnedBicyclePouch: parseBoolCell(cell(row, 4)),
    returnedTshirt: parseBoolCell(cell(row, 5)),
    returnedJacket: parseBoolCell(cell(row, 6)),
    returnedHelmet: parseBoolCell(cell(row, 7)),
    settlementPaidMilli: Number(cell(row, 8)) || 0,
    waivedMilli: Number(cell(row, 9)) || 0,
    waiverReason: cell(row, 10),
    status,
    approvedBy: cell(row, 12),
    approvedAt: cell(row, 13),
    createdAt: cell(row, 14),
    createdBy: cell(row, 15),
    notes: cell(row, 16),
    sheetRow,
  };
}

function settlementToRow(s: EquipmentReturnSettlement): unknown[] {
  return [
    s.settlementId,
    s.equipmentIssueId,
    s.riderCode,
    s.returnedMotorcyclePouch ? 'TRUE' : 'FALSE',
    s.returnedBicyclePouch ? 'TRUE' : 'FALSE',
    s.returnedTshirt ? 'TRUE' : 'FALSE',
    s.returnedJacket ? 'TRUE' : 'FALSE',
    s.returnedHelmet ? 'TRUE' : 'FALSE',
    s.settlementPaidMilli,
    s.waivedMilli,
    s.waiverReason,
    s.status,
    s.approvedBy,
    s.approvedAt,
    s.createdAt,
    s.createdBy,
    s.notes,
  ];
}

export async function ensureEquipmentReturnSettlementSheet(): Promise<void> {
  if (ensuredOnce) return;
  await ensureSheetExists(SHEET_EQUIPMENT_RETURN_SETTLEMENT, [...EQUIPMENT_RETURN_SETTLEMENT_HEADERS]);
  ensuredOnce = true;
}

async function readAllSettlements(): Promise<EquipmentReturnSettlement[]> {
  await ensureEquipmentReturnSettlementSheet();
  const data = await getSheetData(SHEET_EQUIPMENT_RETURN_SETTLEMENT, false);
  const out: EquipmentReturnSettlement[] = [];
  for (let i = 1; i < data.length; i++) {
    const s = rowToSettlement(data[i], i + 1);
    if (s) out.push(s);
  }
  return out;
}

export async function listSettlements(filters?: {
  equipmentIssueId?: string;
  riderCode?: string;
  status?: EquipmentReturnSettlementStatus;
}): Promise<EquipmentReturnSettlement[]> {
  return (await readAllSettlements()).filter((s) => {
    if (filters?.equipmentIssueId && s.equipmentIssueId !== filters.equipmentIssueId.trim()) return false;
    if (filters?.riderCode && s.riderCode !== filters.riderCode.trim()) return false;
    if (filters?.status && s.status !== filters.status) return false;
    return true;
  });
}

export async function createSettlement(
  input: CreateSettlementInput,
  actor: { code: string; name: string }
): Promise<{ ok: true; settlement: EquipmentReturnSettlement } | { ok: false; error: string }> {
  const issue = await getById(input.equipmentIssueId);
  if (!issue) return { ok: false, error: 'equipment issue not found' };

  const now = new Date().toISOString();
  const settlement: EquipmentReturnSettlement = {
    settlementId: newSettlementId(),
    equipmentIssueId: input.equipmentIssueId.trim(),
    riderCode: input.riderCode.trim() || issue.riderCode,
    returnedMotorcyclePouch: Boolean(input.returnedMotorcyclePouch),
    returnedBicyclePouch: Boolean(input.returnedBicyclePouch),
    returnedTshirt: Boolean(input.returnedTshirt),
    returnedJacket: Boolean(input.returnedJacket),
    returnedHelmet: Boolean(input.returnedHelmet),
    settlementPaidMilli: Math.max(0, Math.trunc(input.settlementPaidMilli ?? 0)),
    waivedMilli: Math.max(0, Math.trunc(input.waivedMilli ?? 0)),
    waiverReason: (input.waiverReason || '').trim(),
    status: 'pending',
    approvedBy: '',
    approvedAt: '',
    createdAt: now,
    createdBy: actor.code,
    notes: (input.notes || '').trim(),
  };

  await ensureEquipmentReturnSettlementSheet();
  await appendToSheet(SHEET_EQUIPMENT_RETURN_SETTLEMENT, [settlementToRow(settlement)]);

  void appendAuditLog({
    domain: 'equipment',
    action: 'create_return_settlement',
    entityType: 'equipment_settlement',
    entityCode: settlement.settlementId,
    actorCode: actor.code,
    actorName: actor.name,
    after: settlement,
  }).catch((err) => console.error('[equipmentReturns] audit create settlement failed:', err));

  return { ok: true, settlement };
}

export async function patchSettlementAmounts(
  settlementId: string,
  patch: { settlementPaidMilli?: number; waivedMilli?: number; waiverReason?: string }
): Promise<{ ok: true; settlement: EquipmentReturnSettlement } | { ok: false; error: string }> {
  const all = await readAllSettlements();
  const settlement = all.find((s) => s.settlementId === settlementId);
  if (!settlement || !settlement.sheetRow) return { ok: false, error: 'settlement not found' };
  if (settlement.status !== 'pending') return { ok: false, error: 'settlement not pending' };

  const updated: EquipmentReturnSettlement = {
    ...settlement,
    settlementPaidMilli:
      patch.settlementPaidMilli != null
        ? Math.max(0, Math.trunc(patch.settlementPaidMilli))
        : settlement.settlementPaidMilli,
    waivedMilli:
      patch.waivedMilli != null ? Math.max(0, Math.trunc(patch.waivedMilli)) : settlement.waivedMilli,
    waiverReason: patch.waiverReason != null ? String(patch.waiverReason) : settlement.waiverReason,
  };
  await updateSheetRow(SHEET_EQUIPMENT_RETURN_SETTLEMENT, settlement.sheetRow, settlementToRow(updated));
  return { ok: true, settlement: updated };
}

/**
 * Admin approves a settlement:
 * 1) Apply `settlementPaidMilli` as cash reduction (does not advance installment index).
 * 2) If `waivedMilli > 0` (or waiverReason set with zero cash), waive remaining balance.
 * Pure cash with remaining > 0 leaves issue `open`.
 */
export async function approveSettlement(
  settlementId: string,
  actor: { code: string; name: string }
): Promise<
  | { ok: true; settlement: EquipmentReturnSettlement; issueUpdated: boolean; mode: 'payment' | 'waiver' | 'payment_and_waiver' }
  | { ok: false; error: string }
> {
  const all = await readAllSettlements();
  const settlement = all.find((s) => s.settlementId === settlementId);
  if (!settlement || !settlement.sheetRow) return { ok: false, error: 'settlement not found' };
  if (settlement.status !== 'pending') return { ok: false, error: 'settlement not pending' };

  const issueBefore = await getById(settlement.equipmentIssueId);
  if (!issueBefore) return { ok: false, error: 'equipment issue not found' };

  const paid = Math.max(0, Math.trunc(settlement.settlementPaidMilli));
  const waiveRequested =
    Math.max(0, Math.trunc(settlement.waivedMilli)) > 0 || Boolean(settlement.waiverReason.trim());

  if (paid > 0) {
    const payResult = await applySettlementPayment(settlement.equipmentIssueId, paid, actor);
    if (!payResult.ok) return { ok: false, error: payResult.error };
  }

  let mode: 'payment' | 'waiver' | 'payment_and_waiver' = paid > 0 ? 'payment' : 'waiver';
  if (waiveRequested) {
    const waiveResult = await markIssueWaived(settlement.equipmentIssueId, actor);
    if (!waiveResult.ok) return { ok: false, error: waiveResult.error };
    mode = paid > 0 ? 'payment_and_waiver' : 'waiver';
  }

  const now = new Date().toISOString();
  const updated: EquipmentReturnSettlement = {
    ...settlement,
    status: 'approved',
    approvedBy: actor.code,
    approvedAt: now,
  };

  await updateSheetRow(SHEET_EQUIPMENT_RETURN_SETTLEMENT, settlement.sheetRow, settlementToRow(updated));

  void appendAuditLog({
    domain: 'equipment',
    action: waiveRequested ? 'approve_waiver' : 'approve_settlement_payment',
    entityType: 'equipment_settlement',
    entityCode: settlementId,
    actorCode: actor.code,
    actorName: actor.name,
    before: { settlement, issue: issueBefore },
    after: updated,
  }).catch((err) => console.error('[equipmentReturns] audit approve settlement failed:', err));

  return { ok: true, settlement: updated, issueUpdated: true, mode };
}

/** @deprecated Prefer approveSettlement — kept as explicit waiver alias. */
export async function approveWaiver(
  settlementId: string,
  actor: { code: string; name: string }
): Promise<
  | { ok: true; settlement: EquipmentReturnSettlement; issueUpdated: boolean }
  | { ok: false; error: string }
> {
  const result = await approveSettlement(settlementId, actor);
  if (!result.ok) return result;
  return { ok: true, settlement: result.settlement, issueUpdated: result.issueUpdated };
}

/**
 * Supervisor equipment return → clear open liability as if paid in full.
 * Stops future auto equipment REQUEST/deductions for this rider issue.
 * Also zeroes remaining on open معدات obligations (best-effort).
 */
export async function settleLiabilityFullyOnEquipmentReturn(params: {
  riderCode: string;
  returnRowRef?: string;
  returned: {
    motorcyclePouch?: boolean;
    bicyclePouch?: boolean;
    tshirt?: boolean;
    jacket?: boolean;
    helmet?: boolean;
  };
  actor: { code: string; name: string };
}): Promise<
  | {
      ok: true;
      settled: boolean;
      settlementId?: string;
      equipmentIssueId?: string;
      outstandingClearedMilli?: number;
    }
  | { ok: false; error: string }
> {
  const riderCode = String(params.riderCode || '').trim();
  if (!riderCode) return { ok: false, error: 'كود المندوب مطلوب' };

  const { listOpenIssues } = await import('@/lib/equipmentLiability/store');
  const open = (await listOpenIssues()).find((i) => i.riderCode === riderCode);
  if (!open) {
    return { ok: true, settled: false };
  }

  const outstanding = Math.max(0, Math.trunc(open.outstandingMilli));

  // Already zero balance but still "open" — close so it leaves auto-deduction population.
  if (outstanding <= 0) {
    const { markIssueWaived } = await import('@/lib/equipmentLiability/store');
    const closed = await markIssueWaived(open.equipmentIssueId, params.actor);
    if (!closed.ok) return { ok: false, error: closed.error };
    return {
      ok: true,
      settled: true,
      equipmentIssueId: open.equipmentIssueId,
      outstandingClearedMilli: 0,
    };
  }

  const created = await createSettlement(
    {
      equipmentIssueId: open.equipmentIssueId,
      riderCode,
      returnedMotorcyclePouch: Boolean(params.returned.motorcyclePouch),
      returnedBicyclePouch: Boolean(params.returned.bicyclePouch),
      returnedTshirt: Boolean(params.returned.tshirt),
      returnedJacket: Boolean(params.returned.jacket),
      returnedHelmet: Boolean(params.returned.helmet),
      // Treat return as full cash settlement of remaining balance (no further deduct).
      settlementPaidMilli: outstanding,
      waivedMilli: 0,
      waiverReason: '',
      notes: [
        'auto_full_settle_on_return',
        params.returnRowRef ? `return_row:${params.returnRowRef}` : '',
        `outstandingMilli:${outstanding}`,
      ]
        .filter(Boolean)
        .join(';'),
    },
    params.actor
  );
  if (!created.ok) return { ok: false, error: created.error };

  const approved = await approveSettlement(created.settlement.settlementId, params.actor);
  if (!approved.ok) return { ok: false, error: approved.error };

  // Best-effort: clear open REQUEST remainders so wallet/cycle prep won't re-queue them.
  try {
    const {
      createSheetsObligationLedgerStore,
      listPersistedObligations,
      updatePersistedObligationEconomics,
    } = await import('@/lib/equipmentDeductions/requestPersistence');
    const {
      appendToSheet,
      ensureHeaderRow,
      ensureSheetExists,
      getSheetDataOrThrow,
      updateSheetRow,
    } = await import('@/lib/googleSheets');
    const store = await createSheetsObligationLedgerStore({
      ensureSheetExists,
      ensureHeaderRow,
      getSheetDataOrThrow,
      appendToSheet,
      updateSheetRow,
    });
    const rows = await listPersistedObligations(store);
    for (const p of rows) {
      if (p.obligation.equipmentIssueId !== open.equipmentIssueId) continue;
      if (p.obligation.reason !== 'معدات') continue;
      if (Math.trunc(Number(p.obligation.remainingAmount) || 0) <= 0) continue;
      await updatePersistedObligationEconomics(store, {
        ...p.obligation,
        paidAmount: p.obligation.originalAmount,
        remainingAmount: 0,
        status: 'paid',
      });
    }
  } catch (err) {
    console.error('[equipmentReturns] clear obligations on return failed (non-blocking):', err);
  }

  return {
    ok: true,
    settled: true,
    settlementId: approved.settlement.settlementId,
    equipmentIssueId: open.equipmentIssueId,
    outstandingClearedMilli: outstanding,
  };
}
