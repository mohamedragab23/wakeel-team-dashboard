/**
 * Equipment Liability Desk — automatic orphan payment reconciliation.
 *
 * Scans مدفوعات_عهدة_المعدات for unresolved lifecycle states and applies
 * missing عهدة_المعدات aggregate mutations exactly once.
 */
import { appendAuditLog } from '@/lib/auditLog';
import { isUpstashConfigured, redisDel, redisGet, redisSetNx } from '@/lib/upstashRest';
import { getById, applySettlementPayment, type EquipmentLiabilityIssue } from './store';
import {
  acquireEquipmentPaymentLock,
  cachePaymentResult,
} from './paymentLock';
import {
  classifyPaymentAggregateState,
  ensurePaymentAggregateApplied,
  findPaymentById,
  listUnresolvedPayments,
  updatePaymentLifecycle,
  type EquipmentLiabilityPayment,
  type EquipmentPaymentAggregateStatus,
} from './payments';
import { deriveEquipmentPaymentStatus } from './paymentStatus';

export const EQUIPMENT_PAYMENT_RECONCILE_JOB_TTL_SECONDS = 120;
const JOB_LOCK_KEY = 'equipment:liability:payment:reconcile:job';

export type PaymentReconcileResultCode =
  | 'ALREADY_APPLIED'
  | 'RECOVERED'
  | 'CONFLICT'
  | 'REQUIRES_REVIEW'
  | 'LOCK_BUSY'
  | 'ERROR';

export type PaymentReconcileItemResult = {
  paymentId: string;
  equipmentIssueId: string;
  riderCode: string;
  idempotencyKey: string;
  previousAggregateStatus: EquipmentPaymentAggregateStatus | '';
  classification: 'applied' | 'needs_apply' | 'conflict' | 'missing_liability';
  expectedOutstandingMilli: number;
  expectedSettlementPaidMilli: number;
  actualOutstandingMilli: number | null;
  actualSettlementPaidMilli: number | null;
  result: PaymentReconcileResultCode;
  reason: string;
  aggregateStatus: EquipmentPaymentAggregateStatus;
  recovered: boolean;
};

export type PaymentReconcileRunResult = {
  scanned: number;
  alreadyApplied: number;
  recovered: number;
  conflicts: number;
  requiresReview: number;
  lockBusy: number;
  errors: number;
  items: PaymentReconcileItemResult[];
};

export type ReconcileDeps = {
  listUnresolved?: typeof listUnresolvedPayments;
  getById?: typeof getById;
  findPaymentById?: typeof findPaymentById;
  acquireIssueLock?: typeof acquireEquipmentPaymentLock;
  acquireJobLock?: typeof acquirePaymentReconcileJobLock;
  applyPayment?: typeof applySettlementPayment;
  updateLifecycle?: typeof updatePaymentLifecycle;
  cacheResult?: typeof cachePaymentResult;
  skipAudit?: boolean;
};

export type PaymentReconcileJobLock =
  | { ok: true; token: string; release: () => Promise<void> }
  | { ok: false; reason: 'lock_busy' };

function newToken(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID();
  return `prl_${Date.now()}_${Math.random().toString(36).slice(2)}`;
}

export async function acquirePaymentReconcileJobLock(): Promise<PaymentReconcileJobLock> {
  const token = newToken();
  if (!isUpstashConfigured()) {
    return { ok: true, token, release: async () => undefined };
  }
  const got = await redisSetNx(JOB_LOCK_KEY, token, EQUIPMENT_PAYMENT_RECONCILE_JOB_TTL_SECONDS);
  if (!got) return { ok: false, reason: 'lock_busy' };
  return {
    ok: true,
    token,
    release: async () => {
      const cur = await redisGet(JOB_LOCK_KEY);
      if (cur === token) await redisDel(JOB_LOCK_KEY);
    },
  };
}

async function writeReconcileAudit(params: {
  actor: { code: string; name: string };
  payment: EquipmentLiabilityPayment;
  beforeIssue: EquipmentLiabilityIssue | null;
  afterIssue: EquipmentLiabilityIssue | null;
  item: PaymentReconcileItemResult;
  skipAudit?: boolean;
}): Promise<void> {
  if (params.skipAudit) return;
  void appendAuditLog({
    domain: 'equipment',
    action: 'liability_payment_reconcile',
    entityType: 'equipment_payment',
    entityCode: params.payment.paymentId,
    actorCode: params.actor.code,
    actorName: params.actor.name,
    before: {
      paymentId: params.payment.paymentId,
      equipmentIssueId: params.payment.equipmentIssueId,
      riderCode: params.payment.riderCode,
      idempotencyKey: params.payment.idempotencyKey,
      aggregateStatus: params.payment.aggregateStatus,
      settlementPaidMilli: params.beforeIssue?.settlementPaidMilli ?? null,
      outstandingMilli: params.beforeIssue?.outstandingMilli ?? null,
      expectedSettlementPaidMilli: params.payment.resultingSettlementPaidMilli,
      expectedOutstandingMilli: params.payment.resultingOutstandingMilli,
    },
    after: {
      ...params.item,
      settlementPaidMilli: params.afterIssue?.settlementPaidMilli ?? null,
      outstandingMilli: params.afterIssue?.outstandingMilli ?? null,
      timestamp: new Date().toISOString(),
    },
  }).catch((err) => console.error('[equipmentLiability] reconcile audit failed:', err));
}

/**
 * Deterministic reconcile for one payment history row.
 * Never creates a second history row. Mutates aggregate at most once.
 */
export async function reconcileEquipmentLiabilityPayment(
  paymentId: string,
  actor: { code: string; name: string },
  deps?: ReconcileDeps
): Promise<PaymentReconcileItemResult> {
  const findById = deps?.findPaymentById ?? findPaymentById;
  const getIssue = deps?.getById ?? getById;
  const acquireIssueLock = deps?.acquireIssueLock ?? acquireEquipmentPaymentLock;
  const applyPayment = deps?.applyPayment ?? applySettlementPayment;
  const updateLifecycle = deps?.updateLifecycle ?? updatePaymentLifecycle;
  const cacheResult = deps?.cacheResult ?? cachePaymentResult;

  const payment = await findById(paymentId);
  if (!payment) {
    return {
      paymentId,
      equipmentIssueId: '',
      riderCode: '',
      idempotencyKey: '',
      previousAggregateStatus: '',
      classification: 'missing_liability',
      expectedOutstandingMilli: 0,
      expectedSettlementPaidMilli: 0,
      actualOutstandingMilli: null,
      actualSettlementPaidMilli: null,
      result: 'REQUIRES_REVIEW',
      reason: 'PAYMENT_NOT_FOUND',
      aggregateStatus: 'REQUIRES_REVIEW',
      recovered: false,
    };
  }

  const previousAggregateStatus = payment.aggregateStatus || '';
  const base = {
    paymentId: payment.paymentId,
    equipmentIssueId: payment.equipmentIssueId,
    riderCode: payment.riderCode,
    idempotencyKey: payment.idempotencyKey,
    previousAggregateStatus,
    expectedOutstandingMilli: payment.resultingOutstandingMilli,
    expectedSettlementPaidMilli: payment.resultingSettlementPaidMilli,
  };

  const lock = await acquireIssueLock(payment.equipmentIssueId);
  if (!lock.ok) {
    return {
      ...base,
      classification: 'needs_apply',
      actualOutstandingMilli: null,
      actualSettlementPaidMilli: null,
      result: 'LOCK_BUSY',
      reason: 'ISSUE_LOCK_BUSY',
      aggregateStatus: payment.aggregateStatus || 'PENDING',
      recovered: false,
    };
  }

  try {
    // Re-read under lock
    const fresh = (await findById(paymentId)) || payment;
    const issueBefore = await getIssue(fresh.equipmentIssueId);
    if (!issueBefore) {
      const item: PaymentReconcileItemResult = {
        ...base,
        classification: 'missing_liability',
        actualOutstandingMilli: null,
        actualSettlementPaidMilli: null,
        result: 'REQUIRES_REVIEW',
        reason: 'LIABILITY_NOT_FOUND',
        aggregateStatus: 'REQUIRES_REVIEW',
        recovered: false,
      };
      await updateLifecycle(fresh.paymentId, {
        aggregateStatus: 'REQUIRES_REVIEW',
        lastReconcileResult: item.result,
        lastReconcileReason: item.reason,
        lastReconcileActor: actor.code,
      });
      await writeReconcileAudit({
        actor,
        payment: fresh,
        beforeIssue: null,
        afterIssue: null,
        item,
        skipAudit: deps?.skipAudit,
      });
      return item;
    }

    const classification = classifyPaymentAggregateState(issueBefore, fresh);
    if (classification === 'applied') {
      const item: PaymentReconcileItemResult = {
        ...base,
        classification: 'applied',
        actualOutstandingMilli: issueBefore.outstandingMilli,
        actualSettlementPaidMilli: issueBefore.settlementPaidMilli || 0,
        result: 'ALREADY_APPLIED',
        reason: 'AGGREGATE_ALREADY_MATCHES',
        aggregateStatus: 'APPLIED',
        recovered: false,
      };
      const updated = await updateLifecycle(fresh.paymentId, {
        aggregateStatus: 'APPLIED',
        lastReconcileResult: item.result,
        lastReconcileReason: item.reason,
        lastReconcileActor: actor.code,
      });
      await cacheResult(
        fresh.idempotencyKey,
        JSON.stringify({
          payment: updated || { ...fresh, aggregateStatus: 'APPLIED' },
          issue: issueBefore,
          paymentStatus: deriveEquipmentPaymentStatus({
            settlementPaidMilli: issueBefore.settlementPaidMilli || 0,
            amountDeductedMilli: issueBefore.amountDeductedMilli || 0,
            outstandingMilli: issueBefore.outstandingMilli,
          }),
        })
      );
      await writeReconcileAudit({
        actor,
        payment: fresh,
        beforeIssue: issueBefore,
        afterIssue: issueBefore,
        item,
        skipAudit: deps?.skipAudit,
      });
      return item;
    }

    if (classification === 'conflict') {
      const item: PaymentReconcileItemResult = {
        ...base,
        classification: 'conflict',
        actualOutstandingMilli: issueBefore.outstandingMilli,
        actualSettlementPaidMilli: issueBefore.settlementPaidMilli || 0,
        result: 'CONFLICT',
        reason: 'AGGREGATE_MISMATCH_NO_MUTATION',
        aggregateStatus: 'CONFLICT',
        recovered: false,
      };
      await updateLifecycle(fresh.paymentId, {
        aggregateStatus: 'CONFLICT',
        lastReconcileResult: item.result,
        lastReconcileReason: item.reason,
        lastReconcileActor: actor.code,
      });
      await writeReconcileAudit({
        actor,
        payment: fresh,
        beforeIssue: issueBefore,
        afterIssue: issueBefore,
        item,
        skipAudit: deps?.skipAudit,
      });
      return item;
    }

    // needs_apply — recover exactly once
    const ensured = await ensurePaymentAggregateApplied(fresh, actor, {
      getById: getIssue,
      applyPayment,
    });

    if (!ensured.ok) {
      const requiresReview = ensured.code === 'EQUIPMENT_PAYMENT_AGGREGATE_CONFLICT';
      const status: EquipmentPaymentAggregateStatus = requiresReview
        ? 'CONFLICT'
        : 'PENDING';
      const item: PaymentReconcileItemResult = {
        ...base,
        classification: requiresReview ? 'conflict' : 'needs_apply',
        actualOutstandingMilli: (await getIssue(fresh.equipmentIssueId))?.outstandingMilli ?? null,
        actualSettlementPaidMilli:
          (await getIssue(fresh.equipmentIssueId))?.settlementPaidMilli ?? null,
        result: requiresReview ? 'CONFLICT' : 'ERROR',
        reason: ensured.error,
        aggregateStatus: status,
        recovered: false,
      };
      await updateLifecycle(fresh.paymentId, {
        aggregateStatus: status,
        lastReconcileResult: item.result,
        lastReconcileReason: item.reason,
        lastReconcileActor: actor.code,
      });
      await writeReconcileAudit({
        actor,
        payment: fresh,
        beforeIssue: issueBefore,
        afterIssue: await getIssue(fresh.equipmentIssueId),
        item,
        skipAudit: deps?.skipAudit,
      });
      return item;
    }

    const item: PaymentReconcileItemResult = {
      ...base,
      classification: 'needs_apply',
      actualOutstandingMilli: ensured.issue.outstandingMilli,
      actualSettlementPaidMilli: ensured.issue.settlementPaidMilli || 0,
      result: ensured.recovered ? 'RECOVERED' : 'ALREADY_APPLIED',
      reason: ensured.recovered ? 'AGGREGATE_APPLIED_ONCE' : 'AGGREGATE_ALREADY_MATCHES',
      aggregateStatus: 'APPLIED',
      recovered: ensured.recovered,
    };
    const updated = await updateLifecycle(fresh.paymentId, {
      aggregateStatus: 'APPLIED',
      lastReconcileResult: item.result,
      lastReconcileReason: item.reason,
      lastReconcileActor: actor.code,
    });
    await cacheResult(
      fresh.idempotencyKey,
      JSON.stringify({
        payment: updated || { ...fresh, aggregateStatus: 'APPLIED' },
        issue: ensured.issue,
        paymentStatus: deriveEquipmentPaymentStatus({
          settlementPaidMilli: ensured.issue.settlementPaidMilli || 0,
          amountDeductedMilli: ensured.issue.amountDeductedMilli || 0,
          outstandingMilli: ensured.issue.outstandingMilli,
        }),
      })
    );
    await writeReconcileAudit({
      actor,
      payment: fresh,
      beforeIssue: issueBefore,
      afterIssue: ensured.issue,
      item,
      skipAudit: deps?.skipAudit,
    });
    return item;
  } finally {
    await lock.release();
  }
}

/** Scan unresolved payments and reconcile each (job-level + issue-level locks). */
export async function reconcileUnresolvedEquipmentLiabilityPayments(
  actor: { code: string; name: string },
  deps?: ReconcileDeps
): Promise<PaymentReconcileRunResult | { ok: false; reason: 'lock_busy' }> {
  const acquireJob = deps?.acquireJobLock ?? acquirePaymentReconcileJobLock;
  const listUnresolved = deps?.listUnresolved ?? listUnresolvedPayments;

  const jobLock = await acquireJob();
  if (!jobLock.ok) return { ok: false, reason: 'lock_busy' };

  try {
    const unresolved = await listUnresolved();
    const items: PaymentReconcileItemResult[] = [];
    for (const payment of unresolved) {
      const item = await reconcileEquipmentLiabilityPayment(payment.paymentId, actor, deps);
      items.push(item);
    }

    return {
      scanned: items.length,
      alreadyApplied: items.filter((i) => i.result === 'ALREADY_APPLIED').length,
      recovered: items.filter((i) => i.result === 'RECOVERED').length,
      conflicts: items.filter((i) => i.result === 'CONFLICT').length,
      requiresReview: items.filter((i) => i.result === 'REQUIRES_REVIEW').length,
      lockBusy: items.filter((i) => i.result === 'LOCK_BUSY').length,
      errors: items.filter((i) => i.result === 'ERROR').length,
      items,
    };
  } finally {
    await jobLock.release();
  }
}
