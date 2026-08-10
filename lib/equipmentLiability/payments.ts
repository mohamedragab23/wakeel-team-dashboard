/**
 * Equipment Liability Management Desk — cash payment history + orchestration.
 *
 * Authoritative balance remains on عهدة_المعدات.
 * مدفوعات_عهدة_المعدات is append-only audit/evidence only.
 */
import {
  appendToSheet,
  ensureHeaderRow,
  ensureSheetExists,
  getSheetDataOrThrow,
} from '@/lib/googleSheets';
import { appendAuditLog } from '@/lib/auditLog';
import {
  applySettlementPayment,
  getById,
  type EquipmentLiabilityIssue,
} from './store';
import {
  acquireEquipmentPaymentLock,
  cachePaymentResult,
  getCachedPaymentResult,
} from './paymentLock';
import {
  deriveEquipmentPaymentStatus,
  totalCreditedMilli,
  type EquipmentPaymentStatus,
} from './paymentStatus';

export const SHEET_EQUIPMENT_LIABILITY_PAYMENTS = 'مدفوعات_عهدة_المعدات';

export const EQUIPMENT_LIABILITY_PAYMENT_HEADERS = [
  'paymentId',
  'equipmentIssueId',
  'riderCode',
  'amountMilli',
  'paymentDate',
  'paymentMethod',
  'note',
  'idempotencyKey',
  'outstandingBeforeMilli',
  'resultingOutstandingMilli',
  'resultingSettlementPaidMilli',
  'actorCode',
  'actorName',
  'createdAt',
] as const;

export type EquipmentPaymentMethod = 'CASH' | 'BANK_TRANSFER' | 'OTHER';

export const EQUIPMENT_PAYMENT_ERROR = {
  INVALID_AMOUNT: 'EQUIPMENT_PAYMENT_INVALID_AMOUNT',
  EXCEEDS_OUTSTANDING: 'EQUIPMENT_PAYMENT_EXCEEDS_OUTSTANDING',
  NOT_FOUND: 'EQUIPMENT_PAYMENT_LIABILITY_NOT_FOUND',
  NOT_PAYABLE: 'EQUIPMENT_PAYMENT_LIABILITY_NOT_PAYABLE',
  IDEMPOTENCY_REQUIRED: 'EQUIPMENT_PAYMENT_IDEMPOTENCY_REQUIRED',
  LOCK_BUSY: 'EQUIPMENT_PAYMENT_LOCK_BUSY',
  METHOD_INVALID: 'EQUIPMENT_PAYMENT_METHOD_INVALID',
} as const;

export type EquipmentPaymentErrorCode =
  (typeof EQUIPMENT_PAYMENT_ERROR)[keyof typeof EQUIPMENT_PAYMENT_ERROR];

export type EquipmentLiabilityPayment = {
  paymentId: string;
  equipmentIssueId: string;
  riderCode: string;
  amountMilli: number;
  paymentDate: string;
  paymentMethod: EquipmentPaymentMethod;
  note: string;
  idempotencyKey: string;
  outstandingBeforeMilli: number;
  resultingOutstandingMilli: number;
  resultingSettlementPaidMilli: number;
  actorCode: string;
  actorName: string;
  createdAt: string;
  sheetRow?: number;
};

export type RecordCashPaymentInput = {
  equipmentIssueId: string;
  amountMilli: number;
  paymentMethod: EquipmentPaymentMethod | string;
  note?: string;
  idempotencyKey: string;
  paymentDate?: string;
};

let paymentsEnsuredOnce = false;

function newPaymentId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID();
  return `eqpay_${Date.now()}_${Math.random().toString(36).slice(2)}`;
}

function cell(row: unknown[], i: number): string {
  return String(row[i] ?? '').trim();
}

function parseMethod(raw: string): EquipmentPaymentMethod | null {
  const m = String(raw || '')
    .trim()
    .toUpperCase();
  if (m === 'CASH' || m === 'BANK_TRANSFER' || m === 'OTHER') return m;
  return null;
}

export function validateCashPaymentAmount(
  amountMilli: number,
  outstandingMilli: number
):
  | { ok: true; paid: number }
  | { ok: false; code: EquipmentPaymentErrorCode; error: string } {
  if (!Number.isFinite(amountMilli)) {
    return {
      ok: false,
      code: EQUIPMENT_PAYMENT_ERROR.INVALID_AMOUNT,
      error: EQUIPMENT_PAYMENT_ERROR.INVALID_AMOUNT,
    };
  }
  const paid = Math.trunc(amountMilli);
  if (paid <= 0) {
    return {
      ok: false,
      code: EQUIPMENT_PAYMENT_ERROR.INVALID_AMOUNT,
      error: EQUIPMENT_PAYMENT_ERROR.INVALID_AMOUNT,
    };
  }
  const outstanding = Math.trunc(outstandingMilli);
  if (paid > outstanding) {
    return {
      ok: false,
      code: EQUIPMENT_PAYMENT_ERROR.EXCEEDS_OUTSTANDING,
      error: EQUIPMENT_PAYMENT_ERROR.EXCEEDS_OUTSTANDING,
    };
  }
  return { ok: true, paid };
}

function paymentToRow(p: EquipmentLiabilityPayment): (string | number | boolean)[] {
  return [
    p.paymentId,
    p.equipmentIssueId,
    p.riderCode,
    p.amountMilli,
    p.paymentDate,
    p.paymentMethod,
    p.note,
    p.idempotencyKey,
    p.outstandingBeforeMilli,
    p.resultingOutstandingMilli,
    p.resultingSettlementPaidMilli,
    p.actorCode,
    p.actorName,
    p.createdAt,
  ];
}

function rowToPayment(row: unknown[], sheetRow: number): EquipmentLiabilityPayment | null {
  const paymentId = cell(row, 0);
  if (!paymentId) return null;
  const method = parseMethod(cell(row, 5)) || 'OTHER';
  return {
    paymentId,
    equipmentIssueId: cell(row, 1),
    riderCode: cell(row, 2),
    amountMilli: Number(cell(row, 3)) || 0,
    paymentDate: cell(row, 4),
    paymentMethod: method,
    note: cell(row, 6),
    idempotencyKey: cell(row, 7),
    outstandingBeforeMilli: Number(cell(row, 8)) || 0,
    resultingOutstandingMilli: Number(cell(row, 9)) || 0,
    resultingSettlementPaidMilli: Number(cell(row, 10)) || 0,
    actorCode: cell(row, 11),
    actorName: cell(row, 12),
    createdAt: cell(row, 13),
    sheetRow,
  };
}

export async function ensureEquipmentLiabilityPaymentsSheet(): Promise<void> {
  if (paymentsEnsuredOnce) return;
  await ensureSheetExists(SHEET_EQUIPMENT_LIABILITY_PAYMENTS, [
    ...EQUIPMENT_LIABILITY_PAYMENT_HEADERS,
  ]);
  await ensureHeaderRow(SHEET_EQUIPMENT_LIABILITY_PAYMENTS, [
    ...EQUIPMENT_LIABILITY_PAYMENT_HEADERS,
  ]);
  paymentsEnsuredOnce = true;
}

async function readAllPayments(): Promise<EquipmentLiabilityPayment[]> {
  await ensureEquipmentLiabilityPaymentsSheet();
  const data = await getSheetDataOrThrow(SHEET_EQUIPMENT_LIABILITY_PAYMENTS, false);
  const out: EquipmentLiabilityPayment[] = [];
  for (let i = 1; i < data.length; i++) {
    const p = rowToPayment(data[i], i + 1);
    if (p) out.push(p);
  }
  return out;
}

export async function listPaymentsForIssue(
  equipmentIssueId: string
): Promise<EquipmentLiabilityPayment[]> {
  const id = equipmentIssueId.trim();
  if (!id) return [];
  return (await readAllPayments())
    .filter((p) => p.equipmentIssueId === id)
    .sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
}

export async function findPaymentByIdempotencyKey(
  idempotencyKey: string
): Promise<EquipmentLiabilityPayment | null> {
  const key = idempotencyKey.trim();
  if (!key) return null;
  return (await readAllPayments()).find((p) => p.idempotencyKey === key) || null;
}

export type DeskIssueView = EquipmentLiabilityIssue & {
  cashPaidMilli: number;
  autoDeductedMilli: number;
  totalCreditedMilli: number;
  paymentStatus: EquipmentPaymentStatus;
  lastPaymentAt?: string;
};

export function toDeskIssueView(
  issue: EquipmentLiabilityIssue,
  lastPaymentAt?: string
): DeskIssueView {
  const cashPaidMilli = Math.max(0, Math.trunc(issue.settlementPaidMilli || 0));
  const autoDeductedMilli = Math.max(0, Math.trunc(issue.amountDeductedMilli || 0));
  return {
    ...issue,
    cashPaidMilli,
    autoDeductedMilli,
    totalCreditedMilli: totalCreditedMilli({
      settlementPaidMilli: cashPaidMilli,
      amountDeductedMilli: autoDeductedMilli,
    }),
    paymentStatus: deriveEquipmentPaymentStatus({
      settlementPaidMilli: cashPaidMilli,
      amountDeductedMilli: autoDeductedMilli,
      outstandingMilli: issue.outstandingMilli,
    }),
    lastPaymentAt,
  };
}

export type RecordCashPaymentDeps = {
  getById?: typeof getById;
  findPaymentByIdempotencyKey?: typeof findPaymentByIdempotencyKey;
  acquireLock?: typeof acquireEquipmentPaymentLock;
  getCachedResult?: typeof getCachedPaymentResult;
  cacheResult?: typeof cachePaymentResult;
  applyPayment?: typeof applySettlementPayment;
  appendPayment?: (payment: EquipmentLiabilityPayment) => Promise<void>;
  skipAudit?: boolean;
};

export type RecordCashPaymentResult =
  | {
      ok: true;
      payment: EquipmentLiabilityPayment;
      issue: EquipmentLiabilityIssue;
      paymentStatus: EquipmentPaymentStatus;
      replayed: boolean;
    }
  | { ok: false; code: EquipmentPaymentErrorCode; error: string; httpStatus: number };

/**
 * Safe transactional cash payment:
 * history-first (idempotency SoT) then liability mutation — retry never double-pays.
 */
export async function recordEquipmentLiabilityCashPayment(
  input: RecordCashPaymentInput,
  actor: { code: string; name: string },
  deps?: RecordCashPaymentDeps
): Promise<RecordCashPaymentResult> {
  const idempotencyKey = String(input.idempotencyKey || '').trim();
  if (!idempotencyKey) {
    return {
      ok: false,
      code: EQUIPMENT_PAYMENT_ERROR.IDEMPOTENCY_REQUIRED,
      error: EQUIPMENT_PAYMENT_ERROR.IDEMPOTENCY_REQUIRED,
      httpStatus: 400,
    };
  }

  const method = parseMethod(String(input.paymentMethod || ''));
  if (!method) {
    return {
      ok: false,
      code: EQUIPMENT_PAYMENT_ERROR.METHOD_INVALID,
      error: EQUIPMENT_PAYMENT_ERROR.METHOD_INVALID,
      httpStatus: 400,
    };
  }

  const equipmentIssueId = String(input.equipmentIssueId || '').trim();
  if (!equipmentIssueId) {
    return {
      ok: false,
      code: EQUIPMENT_PAYMENT_ERROR.NOT_FOUND,
      error: EQUIPMENT_PAYMENT_ERROR.NOT_FOUND,
      httpStatus: 404,
    };
  }

  const getIssue = deps?.getById ?? getById;
  const findIdem = deps?.findPaymentByIdempotencyKey ?? findPaymentByIdempotencyKey;
  const acquireLock = deps?.acquireLock ?? acquireEquipmentPaymentLock;
  const getCached = deps?.getCachedResult ?? getCachedPaymentResult;
  const cacheResult = deps?.cacheResult ?? cachePaymentResult;
  const applyPayment = deps?.applyPayment ?? applySettlementPayment;
  const appendPayment =
    deps?.appendPayment ??
    (async (payment: EquipmentLiabilityPayment) => {
      await ensureEquipmentLiabilityPaymentsSheet();
      await appendToSheet(SHEET_EQUIPMENT_LIABILITY_PAYMENTS, [paymentToRow(payment)]);
    });

  // Fast path: Redis cache of prior success
  const cached = await getCached(idempotencyKey);
  if (cached) {
    try {
      const parsed = JSON.parse(cached) as {
        payment: EquipmentLiabilityPayment;
        issue: EquipmentLiabilityIssue;
        paymentStatus: EquipmentPaymentStatus;
      };
      if (parsed?.payment?.idempotencyKey === idempotencyKey) {
        return {
          ok: true,
          payment: parsed.payment,
          issue: parsed.issue,
          paymentStatus: parsed.paymentStatus,
          replayed: true,
        };
      }
    } catch {
      /* ignore corrupt cache */
    }
  }

  const existing = await findIdem(idempotencyKey);
  if (existing) {
    const issue = (await getIssue(equipmentIssueId)) || {
      equipmentIssueId,
      riderCode: existing.riderCode,
      outstandingMilli: existing.resultingOutstandingMilli,
      settlementPaidMilli: existing.resultingSettlementPaidMilli,
      amountDeductedMilli: 0,
      originalLiabilityMilli: 0,
      status: existing.resultingOutstandingMilli === 0 ? ('settled' as const) : ('open' as const),
    } as EquipmentLiabilityIssue;
    const paymentStatus = deriveEquipmentPaymentStatus({
      settlementPaidMilli: issue.settlementPaidMilli || existing.resultingSettlementPaidMilli,
      amountDeductedMilli: issue.amountDeductedMilli || 0,
      outstandingMilli: issue.outstandingMilli ?? existing.resultingOutstandingMilli,
    });
    return { ok: true, payment: existing, issue, paymentStatus, replayed: true };
  }

  // Pre-lock validation (fast reject; re-validated under lock)
  const issueBeforeLock = await getIssue(equipmentIssueId);
  if (!issueBeforeLock) {
    return {
      ok: false,
      code: EQUIPMENT_PAYMENT_ERROR.NOT_FOUND,
      error: EQUIPMENT_PAYMENT_ERROR.NOT_FOUND,
      httpStatus: 404,
    };
  }
  if (issueBeforeLock.status !== 'open' || issueBeforeLock.outstandingMilli <= 0) {
    return {
      ok: false,
      code: EQUIPMENT_PAYMENT_ERROR.NOT_PAYABLE,
      error: EQUIPMENT_PAYMENT_ERROR.NOT_PAYABLE,
      httpStatus: 400,
    };
  }
  const preAmt = validateCashPaymentAmount(input.amountMilli, issueBeforeLock.outstandingMilli);
  if (!preAmt.ok) {
    return { ok: false, code: preAmt.code, error: preAmt.error, httpStatus: 400 };
  }

  const lock = await acquireLock(equipmentIssueId);
  if (!lock.ok) {
    return {
      ok: false,
      code: EQUIPMENT_PAYMENT_ERROR.LOCK_BUSY,
      error: EQUIPMENT_PAYMENT_ERROR.LOCK_BUSY,
      httpStatus: 409,
    };
  }

  try {
    // Re-check idempotency under lock
    const existingUnderLock = await findIdem(idempotencyKey);
    if (existingUnderLock) {
      const issue = (await getIssue(equipmentIssueId))!;
      const paymentStatus = deriveEquipmentPaymentStatus({
        settlementPaidMilli: issue.settlementPaidMilli || 0,
        amountDeductedMilli: issue.amountDeductedMilli || 0,
        outstandingMilli: issue.outstandingMilli,
      });
      return {
        ok: true,
        payment: existingUnderLock,
        issue,
        paymentStatus,
        replayed: true,
      };
    }

    const issue = await getIssue(equipmentIssueId);
    if (!issue || !issue.sheetRow) {
      return {
        ok: false,
        code: EQUIPMENT_PAYMENT_ERROR.NOT_FOUND,
        error: EQUIPMENT_PAYMENT_ERROR.NOT_FOUND,
        httpStatus: 404,
      };
    }
    if (issue.status !== 'open' || issue.outstandingMilli <= 0) {
      return {
        ok: false,
        code: EQUIPMENT_PAYMENT_ERROR.NOT_PAYABLE,
        error: EQUIPMENT_PAYMENT_ERROR.NOT_PAYABLE,
        httpStatus: 400,
      };
    }

    const amt = validateCashPaymentAmount(input.amountMilli, issue.outstandingMilli);
    if (!amt.ok) {
      return { ok: false, code: amt.code, error: amt.error, httpStatus: 400 };
    }

    const paid = amt.paid;
    const outstandingBefore = issue.outstandingMilli;
    const resultingOutstanding = outstandingBefore - paid;
    const resultingSettlementPaid = Math.max(0, (issue.settlementPaidMilli || 0) + paid);
    const now = new Date().toISOString();
    const paymentDate = String(input.paymentDate || now).trim() || now;

    const payment: EquipmentLiabilityPayment = {
      paymentId: newPaymentId(),
      equipmentIssueId: issue.equipmentIssueId,
      riderCode: issue.riderCode,
      amountMilli: paid,
      paymentDate,
      paymentMethod: method,
      note: String(input.note || '').trim(),
      idempotencyKey,
      outstandingBeforeMilli: outstandingBefore,
      resultingOutstandingMilli: resultingOutstanding,
      resultingSettlementPaidMilli: resultingSettlementPaid,
      actorCode: actor.code,
      actorName: actor.name,
      createdAt: now,
    };

    // History first → retry with same key never mutates money twice.
    await appendPayment(payment);

    const applyResult = await applyPayment(equipmentIssueId, paid, actor);
    if (!applyResult.ok) {
      // History already written; surface failure (do not claim success).
      return {
        ok: false,
        code: EQUIPMENT_PAYMENT_ERROR.NOT_PAYABLE,
        error: applyResult.error || EQUIPMENT_PAYMENT_ERROR.NOT_PAYABLE,
        httpStatus: 400,
      };
    }

    const paymentStatus = deriveEquipmentPaymentStatus({
      settlementPaidMilli: applyResult.issue.settlementPaidMilli || 0,
      amountDeductedMilli: applyResult.issue.amountDeductedMilli || 0,
      outstandingMilli: applyResult.issue.outstandingMilli,
    });

    const payload = JSON.stringify({
      payment,
      issue: applyResult.issue,
      paymentStatus,
    });
    await cacheResult(idempotencyKey, payload);

    if (!deps?.skipAudit) {
      void appendAuditLog({
        domain: 'equipment',
        action: 'liability_cash_payment',
        entityType: 'equipment_issue',
        entityCode: equipmentIssueId,
        actorCode: actor.code,
        actorName: actor.name,
        before: issue,
        after: {
          ...applyResult.issue,
          paymentId: payment.paymentId,
          idempotencyKey,
        },
      }).catch((err) => console.error('[equipmentLiability] desk payment audit failed:', err));
    }

    return {
      ok: true,
      payment,
      issue: applyResult.issue,
      paymentStatus,
      replayed: false,
    };
  } finally {
    await lock.release();
  }
}
