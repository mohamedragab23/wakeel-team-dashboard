import { appendToSheet, ensureSheetExists, getSheetData, updateSheetRow } from '@/lib/googleSheets';
import { appendAuditLog } from '@/lib/auditLog';
import {
  BAG_COST_MILLI,
  SECURITY_FEE_MILLI,
  TWO_TSHIRTS_COST_MILLI,
  liabilityInstallmentSchedule,
  type SecurityInquiryPayment,
} from '@/lib/money';
import { normalizeRiderCodeForPerformance } from '@/lib/riderCodeUtils';
import { loadAllCandidates } from '@/lib/recruitment/recruitmentService';
import {
  EQUIPMENT_LIABILITY_HEADERS,
  SHEET_EQUIPMENT_LIABILITY,
  type EquipmentBagType,
  type EquipmentLiabilityStatus,
} from './constants';
import {
  PHASE_C_ERROR,
  PHASE_C_ERROR_AR,
  assertPhaseCCandidateReady,
  type PhaseCErrorCode,
} from './phaseCGates';
import { acquirePhaseCLiabilityLocks } from './phaseCLock';

export type EquipmentLiabilityIssue = {
  equipmentIssueId: string;
  riderCode: string;
  riderNameSnapshot: string;
  zoneSnapshot: string;
  supervisorCodeSnapshot: string;
  supervisorNameSnapshot: string;
  issueDate: string;
  activationDate: string;
  bagType: EquipmentBagType;
  bagCostMilli: number;
  shirtQty: number;
  shirtCostMilli: number;
  securityFeeMilli: number;
  securityPaidUpfront: boolean;
  originalLiabilityMilli: number;
  outstandingMilli: number;
  amountDeductedMilli: number;
  installmentsCompleted: number;
  status: EquipmentLiabilityStatus;
  deliveryRowRef: string;
  jacketHeld: boolean;
  helmetHeld: boolean;
  createdAt: string;
  createdBy: string;
  updatedAt: string;
  updatedBy: string;
  sheetRow?: number;
  /** Derived at read time — not stored in sheet. */
  installmentSchedule?: number[];
};

export type DeliveryLiabilityInput = {
  deliveryRowRef: string;
  riderCode: string;
  riderNameSnapshot: string;
  zoneSnapshot: string;
  supervisorCodeSnapshot: string;
  supervisorNameSnapshot: string;
  issueDate: string;
  /** Ignored when Phase C gates resolve activation from candidate. */
  activationDate?: string;
  bagType: EquipmentBagType;
  /**
   * @deprecated Phase C ignores caller-supplied security; fee comes from candidate only.
   * Kept optional for type compatibility with older call sites.
   */
  securityPaidUpfront?: boolean;
  jacketHeld?: boolean;
  helmetHeld?: boolean;
};

/** Preserve originalLiabilityMilli on every balance mutation (immutability). */
export function withImmutableOriginal(
  issue: EquipmentLiabilityIssue,
  patch: Partial<EquipmentLiabilityIssue>
): EquipmentLiabilityIssue {
  return {
    ...issue,
    ...patch,
    originalLiabilityMilli: issue.originalLiabilityMilli,
    equipmentIssueId: issue.equipmentIssueId,
    deliveryRowRef: issue.deliveryRowRef,
    riderCode: issue.riderCode,
  };
}

/** Optional deps for offline Phase C acceptance tests (production omits this). */
export type CreateLiabilityDeps = {
  getByDeliveryRowRef?: (deliveryRowRef: string) => Promise<EquipmentLiabilityIssue | null>;
  findCandidateByRiderCode?: (
    riderCode: string
  ) => Promise<import('@/lib/recruitment/types').Candidate | null>;
  hasActiveEquipmentIssue?: (riderCode: string) => Promise<boolean>;
  acquirePhaseCLiabilityLocks?: typeof acquirePhaseCLiabilityLocks;
  appendIssue?: (issue: EquipmentLiabilityIssue) => Promise<void>;
  skipAudit?: boolean;
};

export async function findCandidateByRiderCode(riderCodeRaw: string) {
  const normalized = normalizeRiderCodeForPerformance(riderCodeRaw);
  if (!normalized) return null;
  const all = await loadAllCandidates(false);
  return (
    all.find((c) => normalizeRiderCodeForPerformance(c.riderCode) === normalized) || null
  );
}

let ensuredOnce = false;

function newIssueId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID();
  return `eq_${Date.now()}_${Math.random().toString(36).slice(2)}`;
}

function cell(row: unknown[], i: number): string {
  return String(row[i] ?? '').trim();
}

function parseBoolCell(v: string): boolean {
  const s = v.trim().toLowerCase();
  return s === 'true' || s === '1' || s === 'yes';
}

function securityPaymentFromPaidUpfront(paid: boolean): SecurityInquiryPayment {
  return paid ? 'PAID' : 'NOT_PAID';
}

/** Pure liability field computation from delivery + security payment. */
export function computeLiabilityFields(params: {
  securityPaidUpfront: boolean;
  bagType: EquipmentBagType;
  jacketHeld?: boolean;
  helmetHeld?: boolean;
}): {
  bagCostMilli: number;
  shirtQty: number;
  shirtCostMilli: number;
  securityFeeMilli: number;
  originalLiabilityMilli: number;
  outstandingMilli: number;
  amountDeductedMilli: number;
  installmentsCompleted: number;
  installmentSchedule: number[];
  jacketHeld: boolean;
  helmetHeld: boolean;
} {
  const security = securityPaymentFromPaidUpfront(params.securityPaidUpfront);
  const { originalLiabilityMilli, schedule } = liabilityInstallmentSchedule(security);
  return {
    bagCostMilli: BAG_COST_MILLI,
    shirtQty: 2,
    shirtCostMilli: TWO_TSHIRTS_COST_MILLI,
    securityFeeMilli: SECURITY_FEE_MILLI,
    originalLiabilityMilli,
    outstandingMilli: originalLiabilityMilli,
    amountDeductedMilli: 0,
    installmentsCompleted: 0,
    installmentSchedule: schedule,
    jacketHeld: Boolean(params.jacketHeld),
    helmetHeld: Boolean(params.helmetHeld),
  };
}

export function rowToEquipmentLiability(row: unknown[], sheetRow: number): EquipmentLiabilityIssue | null {
  const equipmentIssueId = cell(row, 0);
  if (!equipmentIssueId) return null;

  const securityPaidUpfront = parseBoolCell(cell(row, 13));
  const { schedule } = liabilityInstallmentSchedule(securityPaymentFromPaidUpfront(securityPaidUpfront));
  const statusRaw = cell(row, 18) || 'open';
  const bagTypeRaw = cell(row, 8) || 'motorcycle';
  const status = (['open', 'settled', 'waived', 'closed'].includes(statusRaw)
    ? statusRaw
    : 'open') as EquipmentLiabilityStatus;
  const bagType = (bagTypeRaw === 'bicycle' ? 'bicycle' : 'motorcycle') as EquipmentBagType;

  return {
    equipmentIssueId,
    riderCode: cell(row, 1),
    riderNameSnapshot: cell(row, 2),
    zoneSnapshot: cell(row, 3),
    supervisorCodeSnapshot: cell(row, 4),
    supervisorNameSnapshot: cell(row, 5),
    issueDate: cell(row, 6),
    activationDate: cell(row, 7),
    bagType,
    bagCostMilli: Number(cell(row, 9)) || BAG_COST_MILLI,
    shirtQty: Number(cell(row, 10)) || 2,
    shirtCostMilli: Number(cell(row, 11)) || TWO_TSHIRTS_COST_MILLI,
    securityFeeMilli: Number(cell(row, 12)) || SECURITY_FEE_MILLI,
    securityPaidUpfront,
    originalLiabilityMilli: Number(cell(row, 14)) || 0,
    outstandingMilli: Number(cell(row, 15)) || 0,
    amountDeductedMilli: Number(cell(row, 16)) || 0,
    installmentsCompleted: Number(cell(row, 17)) || 0,
    status,
    deliveryRowRef: cell(row, 19),
    jacketHeld: parseBoolCell(cell(row, 20)),
    helmetHeld: parseBoolCell(cell(row, 21)),
    createdAt: cell(row, 22),
    createdBy: cell(row, 23),
    updatedAt: cell(row, 24),
    updatedBy: cell(row, 25),
    sheetRow,
    installmentSchedule: schedule,
  };
}

function issueToRow(issue: EquipmentLiabilityIssue): unknown[] {
  return [
    issue.equipmentIssueId,
    issue.riderCode,
    issue.riderNameSnapshot,
    issue.zoneSnapshot,
    issue.supervisorCodeSnapshot,
    issue.supervisorNameSnapshot,
    issue.issueDate,
    issue.activationDate,
    issue.bagType,
    issue.bagCostMilli,
    issue.shirtQty,
    issue.shirtCostMilli,
    issue.securityFeeMilli,
    issue.securityPaidUpfront ? 'TRUE' : 'FALSE',
    issue.originalLiabilityMilli,
    issue.outstandingMilli,
    issue.amountDeductedMilli,
    issue.installmentsCompleted,
    issue.status,
    issue.deliveryRowRef,
    issue.jacketHeld ? 'TRUE' : 'FALSE',
    issue.helmetHeld ? 'TRUE' : 'FALSE',
    issue.createdAt,
    issue.createdBy,
    issue.updatedAt,
    issue.updatedBy,
  ];
}

export async function ensureEquipmentLiabilitySheet(): Promise<void> {
  if (ensuredOnce) return;
  await ensureSheetExists(SHEET_EQUIPMENT_LIABILITY, [...EQUIPMENT_LIABILITY_HEADERS]);
  ensuredOnce = true;
}

async function readAllIssues(): Promise<EquipmentLiabilityIssue[]> {
  await ensureEquipmentLiabilitySheet();
  const data = await getSheetData(SHEET_EQUIPMENT_LIABILITY, false);
  const out: EquipmentLiabilityIssue[] = [];
  for (let i = 1; i < data.length; i++) {
    const issue = rowToEquipmentLiability(data[i], i + 1);
    if (issue) out.push(issue);
  }
  return out;
}

export async function listIssues(filters?: {
  status?: EquipmentLiabilityStatus;
  riderCode?: string;
  supervisorCode?: string;
}): Promise<EquipmentLiabilityIssue[]> {
  return (await readAllIssues()).filter((i) => {
    if (filters?.status && i.status !== filters.status) return false;
    if (filters?.riderCode && i.riderCode !== filters.riderCode.trim()) return false;
    if (filters?.supervisorCode && i.supervisorCodeSnapshot !== filters.supervisorCode.trim()) return false;
    return true;
  });
}

export async function listOpenIssues(): Promise<EquipmentLiabilityIssue[]> {
  return listIssues({ status: 'open' });
}

export async function getById(equipmentIssueId: string): Promise<EquipmentLiabilityIssue | null> {
  const all = await readAllIssues();
  return all.find((i) => i.equipmentIssueId === equipmentIssueId) || null;
}

export async function getByDeliveryRowRef(deliveryRowRef: string): Promise<EquipmentLiabilityIssue | null> {
  const ref = deliveryRowRef.trim();
  if (!ref) return null;
  const all = await readAllIssues();
  return all.find((i) => i.deliveryRowRef === ref) || null;
}

export async function createLiabilityFromDelivery(
  input: DeliveryLiabilityInput,
  actor: { code: string; name: string },
  deps?: CreateLiabilityDeps
): Promise<
  | { ok: true; issue: EquipmentLiabilityIssue; created: boolean }
  | { ok: false; error: string; code: PhaseCErrorCode }
> {
  const deliveryRowRef = String(input.deliveryRowRef || '').trim();
  if (!deliveryRowRef) {
    return {
      ok: false,
      code: PHASE_C_ERROR.LIABILITY_CREATE_FAILED,
      error: 'معرّف صف التسليم مطلوب',
    };
  }

  const getByRef = deps?.getByDeliveryRowRef ?? getByDeliveryRowRef;
  const findCandidate = deps?.findCandidateByRiderCode ?? findCandidateByRiderCode;
  const hasOpen = deps?.hasActiveEquipmentIssue ?? hasActiveEquipmentIssue;
  const acquireLocks = deps?.acquirePhaseCLiabilityLocks ?? acquirePhaseCLiabilityLocks;

  const existingByDelivery = await getByRef(deliveryRowRef);
  if (existingByDelivery) {
    return { ok: true, issue: existingByDelivery, created: false };
  }

  const candidate = await findCandidate(input.riderCode);
  const gate = assertPhaseCCandidateReady(candidate, input.riderCode);
  if (!gate.ok) {
    return {
      ok: false,
      code: gate.code,
      error:
        gate.code === PHASE_C_ERROR.EQUIPMENT_LIABILITY_ALREADY_EXISTS
          ? PHASE_C_ERROR.EQUIPMENT_LIABILITY_ALREADY_EXISTS
          : PHASE_C_ERROR_AR[gate.code],
    };
  }

  if (await hasOpen(gate.riderCode)) {
    return {
      ok: false,
      code: PHASE_C_ERROR.EQUIPMENT_LIABILITY_ALREADY_EXISTS,
      error: PHASE_C_ERROR.EQUIPMENT_LIABILITY_ALREADY_EXISTS,
    };
  }

  const locks = await acquireLocks({
    deliveryRowRef,
    riderCode: gate.riderCode,
  });
  if (!locks.ok) {
    return {
      ok: false,
      code: PHASE_C_ERROR.LOCK_BUSY,
      error: PHASE_C_ERROR_AR.LOCK_BUSY,
    };
  }

  try {
    // Re-check under lock (concurrency / Sheets lag).
    const againDelivery = await getByRef(deliveryRowRef);
    if (againDelivery) return { ok: true, issue: againDelivery, created: false };

    if (await hasOpen(gate.riderCode)) {
      return {
        ok: false,
        code: PHASE_C_ERROR.EQUIPMENT_LIABILITY_ALREADY_EXISTS,
        error: PHASE_C_ERROR.EQUIPMENT_LIABILITY_ALREADY_EXISTS,
      };
    }

    const computed = computeLiabilityFields({
      securityPaidUpfront: gate.securityPaidUpfront,
      bagType: input.bagType,
      jacketHeld: input.jacketHeld,
      helmetHeld: input.helmetHeld,
    });

    const now = new Date().toISOString();
    const issue: EquipmentLiabilityIssue = {
      equipmentIssueId: newIssueId(),
      riderCode: gate.riderCode,
      riderNameSnapshot: input.riderNameSnapshot.trim(),
      zoneSnapshot: input.zoneSnapshot.trim(),
      supervisorCodeSnapshot:
        input.supervisorCodeSnapshot.trim() || gate.finalAssignedSupervisorCode,
      supervisorNameSnapshot: input.supervisorNameSnapshot.trim(),
      issueDate: input.issueDate.trim(),
      activationDate: gate.activationDate,
      bagType: input.bagType,
      bagCostMilli: computed.bagCostMilli,
      shirtQty: computed.shirtQty,
      shirtCostMilli: computed.shirtCostMilli,
      securityFeeMilli: computed.securityFeeMilli,
      securityPaidUpfront: gate.securityPaidUpfront,
      originalLiabilityMilli: computed.originalLiabilityMilli,
      outstandingMilli: computed.outstandingMilli,
      amountDeductedMilli: computed.amountDeductedMilli,
      installmentsCompleted: computed.installmentsCompleted,
      status: 'open',
      deliveryRowRef,
      jacketHeld: computed.jacketHeld,
      helmetHeld: computed.helmetHeld,
      createdAt: now,
      createdBy: actor.code,
      updatedAt: now,
      updatedBy: actor.code,
      installmentSchedule: computed.installmentSchedule,
    };

    if (deps?.appendIssue) {
      await deps.appendIssue(issue);
    } else {
      await ensureEquipmentLiabilitySheet();
      await appendToSheet(SHEET_EQUIPMENT_LIABILITY, [issueToRow(issue)]);
    }

    // Post-append uniqueness: if a twin row appeared, return the first by delivery ref.
    const after = await getByRef(deliveryRowRef);
    const finalIssue = after || issue;

    if (!deps?.skipAudit) {
      void appendAuditLog({
        domain: 'equipment',
        action: 'create_liability',
        entityType: 'equipment_issue',
        entityCode: finalIssue.equipmentIssueId,
        actorCode: actor.code,
        actorName: actor.name,
        after: finalIssue,
      }).catch((err) => console.error('[equipmentLiability] audit create failed:', err));
    }

    return {
      ok: true,
      issue: finalIssue,
      created: !after || after.equipmentIssueId === issue.equipmentIssueId,
    };
  } finally {
    await locks.release();
  }
}

/** Apply an installment deduction to the issue balance (mutates sheet row). */
export async function updateBalance(
  equipmentIssueId: string,
  deductionMilli: number,
  actor: { code: string; name: string },
  opts?: { incrementInstallment?: boolean }
): Promise<{ ok: true; issue: EquipmentLiabilityIssue } | { ok: false; error: string }> {
  const issue = await getById(equipmentIssueId);
  if (!issue || !issue.sheetRow) return { ok: false, error: 'issue not found' };

  const deduct = Math.max(0, Math.trunc(deductionMilli));
  const newDeducted = issue.amountDeductedMilli + deduct;
  const newOutstanding = Math.max(0, issue.outstandingMilli - deduct);
  // Partial payout must NOT advance installment index — remainder of the same
  // installment carries to the next eligible cycle.
  const shouldIncrement = opts?.incrementInstallment ?? deduct > 0;
  const newInstallments = issue.installmentsCompleted + (shouldIncrement ? 1 : 0);
  const newStatus: EquipmentLiabilityStatus =
    newOutstanding <= 0 && issue.status === 'open' ? 'settled' : issue.status;

  const now = new Date().toISOString();
  const updated = withImmutableOriginal(issue, {
    amountDeductedMilli: newDeducted,
    outstandingMilli: newOutstanding,
    installmentsCompleted: newInstallments,
    status: newStatus,
    updatedAt: now,
    updatedBy: actor.code,
  });

  await updateSheetRow(SHEET_EQUIPMENT_LIABILITY, issue.sheetRow, issueToRow(updated));

  void appendAuditLog({
    domain: 'equipment',
    action: 'update_liability_balance',
    entityType: 'equipment_issue',
    entityCode: equipmentIssueId,
    actorCode: actor.code,
    actorName: actor.name,
    before: issue,
    after: updated,
  }).catch((err) => console.error('[equipmentLiability] audit balance update failed:', err));

  return { ok: true, issue: updated };
}

/**
 * Apply a cash settlement payment without advancing installment index
 * (return settlement ≠ cycle installment).
 */
export async function applySettlementPayment(
  equipmentIssueId: string,
  paidMilli: number,
  actor: { code: string; name: string }
): Promise<{ ok: true; issue: EquipmentLiabilityIssue } | { ok: false; error: string }> {
  const issue = await getById(equipmentIssueId);
  if (!issue || !issue.sheetRow) return { ok: false, error: 'issue not found' };
  if (issue.status !== 'open') return { ok: false, error: 'issue not open' };

  const paid = Math.max(0, Math.trunc(paidMilli));
  const newDeducted = issue.amountDeductedMilli + paid;
  const newOutstanding = Math.max(0, issue.outstandingMilli - paid);
  const newStatus: EquipmentLiabilityStatus =
    newOutstanding <= 0 ? 'settled' : issue.status;

  const now = new Date().toISOString();
  const updated = withImmutableOriginal(issue, {
    amountDeductedMilli: newDeducted,
    outstandingMilli: newOutstanding,
    status: newStatus,
    updatedAt: now,
    updatedBy: actor.code,
  });

  await updateSheetRow(SHEET_EQUIPMENT_LIABILITY, issue.sheetRow, issueToRow(updated));

  void appendAuditLog({
    domain: 'equipment',
    action: 'settlement_payment',
    entityType: 'equipment_issue',
    entityCode: equipmentIssueId,
    actorCode: actor.code,
    actorName: actor.name,
    before: issue,
    after: updated,
  }).catch((err) => console.error('[equipmentLiability] audit settlement payment failed:', err));

  return { ok: true, issue: updated };
}

/** Zero outstanding and mark issue waived (used by settlement approval). */
export async function markIssueWaived(
  equipmentIssueId: string,
  actor: { code: string; name: string }
): Promise<{ ok: true; issue: EquipmentLiabilityIssue } | { ok: false; error: string }> {
  const issue = await getById(equipmentIssueId);
  if (!issue || !issue.sheetRow) return { ok: false, error: 'issue not found' };

  const now = new Date().toISOString();
  const updated = withImmutableOriginal(issue, {
    outstandingMilli: 0,
    status: 'waived',
    updatedAt: now,
    updatedBy: actor.code,
  });

  await updateSheetRow(SHEET_EQUIPMENT_LIABILITY, issue.sheetRow, issueToRow(updated));

  void appendAuditLog({
    domain: 'equipment',
    action: 'waive_liability',
    entityType: 'equipment_issue',
    entityCode: equipmentIssueId,
    actorCode: actor.code,
    actorName: actor.name,
    before: issue,
    after: updated,
  }).catch((err) => console.error('[equipmentLiability] audit waive failed:', err));

  return { ok: true, issue: updated };
}

export async function listOpenLiabilityRiderCodesForSupervisor(supervisorCode: string): Promise<string[]> {
  const code = supervisorCode.trim();
  const open = await listOpenIssues();
  return [...new Set(open.filter((i) => i.supervisorCodeSnapshot === code).map((i) => i.riderCode))];
}

export async function hasActiveEquipmentIssue(riderCode: string): Promise<boolean> {
  const code = riderCode.trim();
  const open = await listOpenIssues();
  return open.some((i) => i.riderCode === code);
}
