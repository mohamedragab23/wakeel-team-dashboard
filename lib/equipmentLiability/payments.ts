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
  updateSheetRow,
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
  type EquipmentPaymentAggregateStatus,
  type EquipmentPaymentStatus,
} from './paymentStatus';

export type { EquipmentPaymentAggregateStatus } from './paymentStatus';
export { EQUIPMENT_PAYMENT_AGGREGATE_STATUS_AR } from './paymentStatus';

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
  /** Additive lifecycle — not a second money ledger. */
  'aggregateStatus',
  'reconciledAt',
  'lastReconcileResult',
  'lastReconcileReason',
  'lastReconcileActor',
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
  /** History exists but aggregate not yet applied — client must retry same key. */
  AGGREGATE_PENDING: 'EQUIPMENT_PAYMENT_AGGREGATE_PENDING',
  /** History/aggregate diverge in a non-recoverable way. */
  AGGREGATE_CONFLICT: 'EQUIPMENT_PAYMENT_AGGREGATE_CONFLICT',
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
  aggregateStatus: EquipmentPaymentAggregateStatus;
  reconciledAt: string;
  lastReconcileResult: string;
  lastReconcileReason: string;
  lastReconcileActor: string;
  sheetRow?: number;
};

function parseAggregateStatus(raw: string): EquipmentPaymentAggregateStatus {
  const s = String(raw || '')
    .trim()
    .toUpperCase();
  if (s === 'APPLIED' || s === 'CONFLICT' || s === 'REQUIRES_REVIEW' || s === 'PENDING') {
    return s;
  }
  // Legacy rows without status are treated as unresolved until reconciled.
  return 'PENDING';
}

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

/**
 * Classify whether عهدة_المعدات already reflects a history payment row.
 * History alone is never treated as success — aggregate must match.
 */
export function classifyPaymentAggregateState(
  issue: Pick<
    EquipmentLiabilityIssue,
    'settlementPaidMilli' | 'outstandingMilli' | 'status'
  >,
  payment: Pick<
    EquipmentLiabilityPayment,
    | 'amountMilli'
    | 'outstandingBeforeMilli'
    | 'resultingOutstandingMilli'
    | 'resultingSettlementPaidMilli'
  >
): 'applied' | 'needs_apply' | 'conflict' {
  const settlement = Math.trunc(issue.settlementPaidMilli || 0);
  const outstanding = Math.trunc(issue.outstandingMilli);
  const expectedSettlementBefore =
    Math.trunc(payment.resultingSettlementPaidMilli) - Math.trunc(payment.amountMilli);

  const exactAfter =
    settlement === Math.trunc(payment.resultingSettlementPaidMilli) &&
    outstanding === Math.trunc(payment.resultingOutstandingMilli);

  // Later payments may have moved balances further after this one posted.
  const atOrBeyondAfter =
    settlement >= Math.trunc(payment.resultingSettlementPaidMilli) &&
    outstanding <= Math.trunc(payment.resultingOutstandingMilli);

  if (exactAfter || atOrBeyondAfter) return 'applied';

  const atBefore =
    settlement === expectedSettlementBefore &&
    outstanding === Math.trunc(payment.outstandingBeforeMilli);

  if (atBefore && (issue.status === 'open' || outstanding > 0)) return 'needs_apply';

  return 'conflict';
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
    p.aggregateStatus || 'PENDING',
    p.reconciledAt || '',
    p.lastReconcileResult || '',
    p.lastReconcileReason || '',
    p.lastReconcileActor || '',
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
    aggregateStatus: parseAggregateStatus(cell(row, 14)),
    reconciledAt: cell(row, 15),
    lastReconcileResult: cell(row, 16),
    lastReconcileReason: cell(row, 17),
    lastReconcileActor: cell(row, 18),
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

export async function listAllPayments(): Promise<EquipmentLiabilityPayment[]> {
  return readAllPayments();
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

/** Unresolved lifecycle rows for automatic reconciliation scan. */
export async function listUnresolvedPayments(): Promise<EquipmentLiabilityPayment[]> {
  return (await readAllPayments()).filter((p) => p.aggregateStatus !== 'APPLIED');
}

export async function findPaymentByIdempotencyKey(
  idempotencyKey: string
): Promise<EquipmentLiabilityPayment | null> {
  const key = idempotencyKey.trim();
  if (!key) return null;
  return (await readAllPayments()).find((p) => p.idempotencyKey === key) || null;
}

export async function findPaymentById(
  paymentId: string
): Promise<EquipmentLiabilityPayment | null> {
  const id = paymentId.trim();
  if (!id) return null;
  return (await readAllPayments()).find((p) => p.paymentId === id) || null;
}

/**
 * Update lifecycle/status columns only (money fields immutable).
 * Returns updated payment or null if row missing.
 */
export async function updatePaymentLifecycle(
  paymentId: string,
  patch: {
    aggregateStatus: EquipmentPaymentAggregateStatus;
    lastReconcileResult?: string;
    lastReconcileReason?: string;
    lastReconcileActor?: string;
  }
): Promise<EquipmentLiabilityPayment | null> {
  const payment = await findPaymentById(paymentId);
  if (!payment || !payment.sheetRow) return null;
  const now = new Date().toISOString();
  const updated: EquipmentLiabilityPayment = {
    ...payment,
    aggregateStatus: patch.aggregateStatus,
    reconciledAt: now,
    lastReconcileResult: patch.lastReconcileResult ?? payment.lastReconcileResult,
    lastReconcileReason: patch.lastReconcileReason ?? payment.lastReconcileReason,
    lastReconcileActor: patch.lastReconcileActor ?? payment.lastReconcileActor,
  };
  await updateSheetRow(
    SHEET_EQUIPMENT_LIABILITY_PAYMENTS,
    payment.sheetRow,
    paymentToRow(updated)
  );
  return updated;
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
  updateLifecycle?: typeof updatePaymentLifecycle;
  skipAudit?: boolean;
};

export type RecordCashPaymentResult =
  | {
      ok: true;
      payment: EquipmentLiabilityPayment;
      issue: EquipmentLiabilityIssue;
      paymentStatus: EquipmentPaymentStatus;
      replayed: boolean;
      recovered?: boolean;
    }
  | { ok: false; code: EquipmentPaymentErrorCode; error: string; httpStatus: number };

type ResolvedDeps = {
  getIssue: typeof getById;
  findIdem: typeof findPaymentByIdempotencyKey;
  acquireLock: typeof acquireEquipmentPaymentLock;
  getCached: typeof getCachedPaymentResult;
  cacheResult: typeof cachePaymentResult;
  applyPayment: typeof applySettlementPayment;
  appendPayment: (payment: EquipmentLiabilityPayment) => Promise<void>;
  updateLifecycle: typeof updatePaymentLifecycle;
  skipAudit: boolean;
};

/**
 * Ensure history payment is reflected on عهدة_المعدات exactly once.
 * Never returns success while aggregate still lags history.
 */
export async function ensurePaymentAggregateApplied(
  payment: EquipmentLiabilityPayment,
  actor: { code: string; name: string },
  deps: {
    getById: typeof getById;
    applyPayment: typeof applySettlementPayment;
  }
): Promise<
  | { ok: true; issue: EquipmentLiabilityIssue; recovered: boolean }
  | { ok: false; code: EquipmentPaymentErrorCode; error: string; httpStatus: number }
> {
  const issue = await deps.getById(payment.equipmentIssueId);
  if (!issue) {
    return {
      ok: false,
      code: EQUIPMENT_PAYMENT_ERROR.NOT_FOUND,
      error: EQUIPMENT_PAYMENT_ERROR.NOT_FOUND,
      httpStatus: 404,
    };
  }

  const state = classifyPaymentAggregateState(issue, payment);
  if (state === 'applied') {
    return { ok: true, issue, recovered: false };
  }
  if (state === 'conflict') {
    return {
      ok: false,
      code: EQUIPMENT_PAYMENT_ERROR.AGGREGATE_CONFLICT,
      error: EQUIPMENT_PAYMENT_ERROR.AGGREGATE_CONFLICT,
      httpStatus: 409,
    };
  }

  // needs_apply — crash window: history written, aggregate not yet mutated.
  const applyResult = await deps.applyPayment(payment.equipmentIssueId, payment.amountMilli, actor);
  if (!applyResult.ok) {
    return {
      ok: false,
      code: EQUIPMENT_PAYMENT_ERROR.AGGREGATE_PENDING,
      error: applyResult.error || EQUIPMENT_PAYMENT_ERROR.AGGREGATE_PENDING,
      httpStatus: 503,
    };
  }

  const after = classifyPaymentAggregateState(applyResult.issue, payment);
  if (after !== 'applied') {
    return {
      ok: false,
      code: EQUIPMENT_PAYMENT_ERROR.AGGREGATE_CONFLICT,
      error: EQUIPMENT_PAYMENT_ERROR.AGGREGATE_CONFLICT,
      httpStatus: 409,
    };
  }

  return { ok: true, issue: applyResult.issue, recovered: true };
}

function successFromPayment(
  payment: EquipmentLiabilityPayment,
  issue: EquipmentLiabilityIssue,
  replayed: boolean,
  recovered?: boolean
): Extract<RecordCashPaymentResult, { ok: true }> {
  return {
    ok: true,
    payment,
    issue,
    paymentStatus: deriveEquipmentPaymentStatus({
      settlementPaidMilli: issue.settlementPaidMilli || 0,
      amountDeductedMilli: issue.amountDeductedMilli || 0,
      outstandingMilli: issue.outstandingMilli,
    }),
    replayed,
    recovered: Boolean(recovered),
  };
}

async function resolveExistingPaymentUnderLock(
  payment: EquipmentLiabilityPayment,
  actor: { code: string; name: string },
  deps: ResolvedDeps
): Promise<RecordCashPaymentResult> {
  const ensured = await ensurePaymentAggregateApplied(payment, actor, {
    getById: deps.getIssue,
    applyPayment: deps.applyPayment,
  });
  if (!ensured.ok) {
    const status: EquipmentPaymentAggregateStatus =
      ensured.code === EQUIPMENT_PAYMENT_ERROR.AGGREGATE_CONFLICT
        ? 'CONFLICT'
        : ensured.code === EQUIPMENT_PAYMENT_ERROR.NOT_FOUND
          ? 'REQUIRES_REVIEW'
          : 'PENDING';
    if (payment.paymentId) {
      await deps
        .updateLifecycle(payment.paymentId, {
          aggregateStatus: status,
          lastReconcileResult: ensured.code,
          lastReconcileReason: ensured.error,
          lastReconcileActor: actor.code,
        })
        .catch(() => null);
    }
    return ensured;
  }

  const appliedPayment =
    (await deps
      .updateLifecycle(payment.paymentId, {
        aggregateStatus: 'APPLIED',
        lastReconcileResult: ensured.recovered ? 'RECOVERED' : 'ALREADY_APPLIED',
        lastReconcileReason: ensured.recovered
          ? 'AGGREGATE_APPLIED_ONCE'
          : 'AGGREGATE_ALREADY_MATCHES',
        lastReconcileActor: actor.code,
      })
      .catch(() => null)) || { ...payment, aggregateStatus: 'APPLIED' as const };

  const payload = JSON.stringify({
    payment: appliedPayment,
    issue: ensured.issue,
    paymentStatus: deriveEquipmentPaymentStatus({
      settlementPaidMilli: ensured.issue.settlementPaidMilli || 0,
      amountDeductedMilli: ensured.issue.amountDeductedMilli || 0,
      outstandingMilli: ensured.issue.outstandingMilli,
    }),
  });
  await deps.cacheResult(payment.idempotencyKey, payload);

  return successFromPayment(appliedPayment, ensured.issue, true, ensured.recovered);
}

/**
 * Transaction order:
 * 1) validate  2) issue lock  3) re-read  4) idempotency check
 * 5) append history intent  6) apply aggregate  7) cache only after aggregate confirmed
 *
 * History alone never means success. Retry with same key recovers missing aggregate
 * exactly once via classifyPaymentAggregateState + ensurePaymentAggregateApplied.
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

  const resolved: ResolvedDeps = {
    getIssue: deps?.getById ?? getById,
    findIdem: deps?.findPaymentByIdempotencyKey ?? findPaymentByIdempotencyKey,
    acquireLock: deps?.acquireLock ?? acquireEquipmentPaymentLock,
    getCached: deps?.getCachedResult ?? getCachedPaymentResult,
    cacheResult: deps?.cacheResult ?? cachePaymentResult,
    applyPayment: deps?.applyPayment ?? applySettlementPayment,
    appendPayment:
      deps?.appendPayment ??
      (async (payment: EquipmentLiabilityPayment) => {
        await ensureEquipmentLiabilityPaymentsSheet();
        await appendToSheet(SHEET_EQUIPMENT_LIABILITY_PAYMENTS, [paymentToRow(payment)]);
      }),
    updateLifecycle: deps?.updateLifecycle ?? updatePaymentLifecycle,
    skipAudit: Boolean(deps?.skipAudit),
  };

  // Pre-lock validation (fast reject; re-validated under lock)
  const issueBeforeLock = await resolved.getIssue(equipmentIssueId);
  // Existing idempotency may still recover even if currently settled — handle under lock.
  const existingProbe = await resolved.findIdem(idempotencyKey);
  if (!existingProbe) {
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
  }

  const lock = await resolved.acquireLock(equipmentIssueId);
  if (!lock.ok) {
    return {
      ok: false,
      code: EQUIPMENT_PAYMENT_ERROR.LOCK_BUSY,
      error: EQUIPMENT_PAYMENT_ERROR.LOCK_BUSY,
      httpStatus: 409,
    };
  }

  try {
    // Idempotent path: history exists → reconcile aggregate (recover if needed).
    const existingUnderLock = await resolved.findIdem(idempotencyKey);
    if (existingUnderLock) {
      return resolveExistingPaymentUnderLock(existingUnderLock, actor, resolved);
    }

    // Cache hint only after we know there is no history row; still never trust alone.
    const cached = await resolved.getCached(idempotencyKey);
    if (cached) {
      try {
        const parsed = JSON.parse(cached) as { payment?: EquipmentLiabilityPayment };
        if (parsed?.payment?.idempotencyKey === idempotencyKey) {
          // History missing but cache present — treat as recovery candidate via payment snapshot.
          return resolveExistingPaymentUnderLock(parsed.payment, actor, resolved);
        }
      } catch {
        /* ignore corrupt cache */
      }
    }

    const issue = await resolved.getIssue(equipmentIssueId);
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
      aggregateStatus: 'PENDING',
      reconciledAt: '',
      lastReconcileResult: '',
      lastReconcileReason: '',
      lastReconcileActor: '',
    };

    // Intent evidence first (append-only). Status=PENDING until aggregate confirms.
    try {
      await resolved.appendPayment(payment);
    } catch (err) {
      console.error('[equipmentLiability] payment history append failed:', err);
      return {
        ok: false,
        code: EQUIPMENT_PAYMENT_ERROR.AGGREGATE_PENDING,
        error: 'EQUIPMENT_PAYMENT_HISTORY_APPEND_FAILED',
        httpStatus: 503,
      };
    }

    const applyResult = await resolved.applyPayment(equipmentIssueId, paid, actor);
    if (!applyResult.ok) {
      // Leave PENDING for cron / same-key / manual reconcile recovery.
      return {
        ok: false,
        code: EQUIPMENT_PAYMENT_ERROR.AGGREGATE_PENDING,
        error: applyResult.error || EQUIPMENT_PAYMENT_ERROR.AGGREGATE_PENDING,
        httpStatus: 503,
      };
    }

    const confirmed = classifyPaymentAggregateState(applyResult.issue, payment);
    if (confirmed !== 'applied') {
      return {
        ok: false,
        code: EQUIPMENT_PAYMENT_ERROR.AGGREGATE_PENDING,
        error: EQUIPMENT_PAYMENT_ERROR.AGGREGATE_PENDING,
        httpStatus: 503,
      };
    }

    const appliedPayment =
      (await resolved
        .updateLifecycle(payment.paymentId, {
          aggregateStatus: 'APPLIED',
          lastReconcileResult: 'APPLIED',
          lastReconcileReason: 'AGGREGATE_CONFIRMED_ON_CREATE',
          lastReconcileActor: actor.code,
        })
        .catch(() => null)) || { ...payment, aggregateStatus: 'APPLIED' as const };

    const paymentStatus = deriveEquipmentPaymentStatus({
      settlementPaidMilli: applyResult.issue.settlementPaidMilli || 0,
      amountDeductedMilli: applyResult.issue.amountDeductedMilli || 0,
      outstandingMilli: applyResult.issue.outstandingMilli,
    });

    await resolved.cacheResult(
      idempotencyKey,
      JSON.stringify({ payment: appliedPayment, issue: applyResult.issue, paymentStatus })
    );

    if (!resolved.skipAudit) {
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
          aggregateStatus: 'APPLIED',
        },
      }).catch((err) => console.error('[equipmentLiability] desk payment audit failed:', err));
    }

    return {
      ok: true,
      payment: appliedPayment,
      issue: applyResult.issue,
      paymentStatus,
      replayed: false,
      recovered: false,
    };
  } finally {
    await lock.release();
  }
}
