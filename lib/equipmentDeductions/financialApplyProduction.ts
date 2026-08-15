/**
 * SRS-014 Phase 4D.5 / 4D.5.4 — production financial-apply wiring.
 *
 * Entry is gated by FEATURE_SRS014_FINANCIAL_APPLY_ENABLED (OFF by default).
 * Uses fail-closed Redis lock + existing updateBalance / ledger_native ports.
 *
 * 4D.5.4: production entry independently enforces persisted-evidence authorization
 * and non-empty period/cycleId. Caller-supplied FILE_VALID / managerConfirmed
 * are non-authoritative.
 *
 * NOT wired to cron / Auto REQUEST / legacy paid-on-cron.
 * Flag must remain OFF unless a separate enablement Go is approved.
 */

import {
  runFinancialApplyLine,
  type FinancialApplyIntentStore,
  type FinancialApplyPorts,
  type FinancialApplyResult,
  type LiabilitySnapshot,
} from '@/lib/equipmentDeductions/financialApply';
import {
  acquireFinancialApplyLock,
  createProductionFinancialApplyLockRedis,
  type FinancialApplyLockRedisPort,
} from '@/lib/equipmentDeductions/financialApplyLock';
import { authorizeProductionFinancialApply } from '@/lib/equipmentDeductions/financialApplyAuthorization';
import type { EvidenceApplyStore } from '@/lib/equipmentDeductions/evidenceApply';
import type { FileValidationStatus } from '@/lib/equipmentDeductions/managerCompare';
import {
  findPersistedByDeductionId,
  updatePersistedObligationEconomics,
  type ObligationLedgerStore,
} from '@/lib/equipmentDeductions/requestPersistence';
import { isSrs014FinancialApplyEnabled } from '@/lib/srs014Flags';
import { appendLedgerTransaction, getLedgerTransactionByIdempotencyKey } from '@/lib/payrollLedger';
import { getById, updateBalance } from '@/lib/equipmentLiability/store';
import {
  FINANCIAL_APPLY_INTENT_HEADERS,
  SHEET_FINANCIAL_APPLY_INTENT,
  type FinancialApplyIntent,
} from '@/lib/equipmentDeductions/financialApply';
import {
  appendToSheet,
  ensureHeaderRow,
  ensureSheetExists,
  getSheetDataOrThrow,
  updateSheetRow,
} from '@/lib/googleSheets';

export type ProductionFinancialApplyInput = {
  evidenceIdentityKey: string;
  reconcileBatchId: string;
  deductionId: string;
  /**
   * Non-authoritative (4D.5.4). Retained for call-site compatibility only.
   * Persisted evidence FILE_VALID is required via authorizeProductionFinancialApply.
   */
  fileValidationStatus?: FileValidationStatus;
  /**
   * Non-authoritative (4D.5.4). Retained for call-site compatibility only.
   * Persisted completeCycleConfirmed is required via authorizeProductionFinancialApply.
   */
  managerConfirmed?: boolean;
  /** D-PERM-1 already evaluated for the caller (JWT). */
  dualGateSatisfied: boolean;
  actor: { code: string; name: string };
  /** Audit/ledger metadata only — must be non-empty after trim. Not part of economicKey. */
  period: string;
  /** Audit/ledger metadata only — must be non-empty after trim. Not part of economicKey. */
  cycleId: string;
  now?: string;
  /** Required injectable/production ports (tests supply fakes; live factory builds real ones). */
  ports: FinancialApplyPorts;
  /** Override flag check (tests). Default: isSrs014FinancialApplyEnabled(). */
  isEnabled?: () => boolean;
};

function emptyFinancialSideEffects(): FinancialApplyResult['financialSideEffects'] {
  return {
    walletMutated: false,
    ledgerNativeWritten: false,
    amountDeductedMilliDelta: 0,
    outstandingMilliDelta: 0,
    installmentsCompletedDelta: 0,
    paidAmountDelta: 0,
    productionFinancialMutation: false,
  };
}

function rejectProduction(
  reason: string,
  evidenceIdentityKey: string,
  deductionId: string,
  outcome: FinancialApplyResult['outcome'] = 'rejected'
): FinancialApplyResult {
  return {
    outcome,
    reason,
    economicKey: `srs014:fa:${String(evidenceIdentityKey || '').trim()}:${String(deductionId || '').trim()}`,
    intent: null,
    applyRecord: null,
    financialSideEffects: emptyFinancialSideEffects(),
    reverseLinkage: null,
  };
}

/**
 * Strict period / cycleId contract for production financial apply.
 * Metadata only — never part of economic identity.
 */
export function validateProductionFinancialApplyPeriodCycleId(
  period: string,
  cycleId: string
):
  | { ok: true; period: string; cycleId: string }
  | { ok: false; reason: 'empty_period' | 'empty_cycle_id' } {
  const p = String(period ?? '').trim();
  const c = String(cycleId ?? '').trim();
  if (!p) return { ok: false, reason: 'empty_period' };
  if (!c) return { ok: false, reason: 'empty_cycle_id' };
  return { ok: true, period: p, cycleId: c };
}

/**
 * Production entry: flag OFF ⇒ zero financial mutations.
 * Independently re-validates persisted evidence + period/cycleId before any money.
 */
export async function runProductionFinancialApplyLine(
  input: ProductionFinancialApplyInput
): Promise<FinancialApplyResult> {
  const evidenceIdentityKey = String(input.evidenceIdentityKey || '').trim();
  const deductionId = String(input.deductionId || '').trim();

  const enabled = (input.isEnabled ?? isSrs014FinancialApplyEnabled)();
  if (!enabled) {
    return rejectProduction('financial_apply_flag_off', evidenceIdentityKey, deductionId);
  }

  const meta = validateProductionFinancialApplyPeriodCycleId(input.period, input.cycleId);
  if (!meta.ok) {
    return rejectProduction(meta.reason, evidenceIdentityKey, deductionId);
  }

  // Defense-in-depth: persisted evidence is the sole FILE_VALID / confirmation authority.
  // Caller-supplied managerConfirmed / fileValidationStatus are ignored.
  const auth = await authorizeProductionFinancialApply({
    evidenceStore: input.ports.evidenceStore,
    evidenceIdentityKey,
    deductionId,
    dualGateSatisfied: input.dualGateSatisfied,
    requestManagerConfirmed: input.managerConfirmed,
  });

  if (!auth.ok) {
    const outcome =
      auth.reason === 'evidence_identity_superseded' ? 'blocked_superseded' : 'rejected';
    return rejectProduction(auth.reason, auth.evidenceIdentityKey, auth.deductionId, outcome);
  }

  const ports: FinancialApplyPorts = {
    ...input.ports,
    dualGateSatisfied: input.dualGateSatisfied,
    managerConfirmed: auth.managerConfirmed,
    actor: input.actor,
    period: meta.period,
    cycleId: meta.cycleId,
    now: input.now ?? input.ports.now,
  };

  return runFinancialApplyLine({
    evidenceIdentityKey: auth.evidenceIdentityKey,
    reconcileBatchId: input.reconcileBatchId,
    deductionId: auth.deductionId,
    ports,
  });
}

export type LiveFinancialApplyPortsDeps = {
  evidenceStore: EvidenceApplyStore;
  intentStore?: FinancialApplyIntentStore;
  obligationStore: ObligationLedgerStore;
  redis?: FinancialApplyLockRedisPort;
  /** Test doubles — production omits these. */
  getLiabilityIssue?: typeof getById;
  updateLiabilityBalanceFn?: typeof updateBalance;
  getLedgerByKey?: typeof getLedgerTransactionByIdempotencyKey;
  appendLedger?: typeof appendLedgerTransaction;
};

/**
 * Build production ports wrapping authoritative store/ledger/updateBalance.
 * Always passes explicit incrementInstallment (never relies on updateBalance default).
 */
function cell(row: unknown[], i: number): string {
  return String(row[i] ?? '').trim();
}

function cellNum(row: unknown[], i: number): number {
  const n = Number(String(row[i] ?? '').replace(/,/g, ''));
  return Number.isFinite(n) ? Math.trunc(n) : 0;
}

function intentToRow(intent: FinancialApplyIntent): unknown[] {
  return [
    intent.financialApplyId,
    intent.economicKey,
    intent.evidenceIdentityKey,
    intent.reconcileBatchId,
    intent.deductionId,
    intent.applyRecordId,
    intent.allocatedMilli,
    intent.riderCode,
    intent.reason,
    intent.equipmentIssueId,
    intent.status,
    intent.obligationMutated ? 'true' : 'false',
    intent.liabilityMutated ? 'true' : 'false',
    intent.ledgerPosted ? 'true' : 'false',
    intent.ledgerTransactionId,
    intent.ledgerIdempotencyKey,
    intent.installmentsCompletedDelta,
    intent.amountDeductedMilliDelta,
    intent.outstandingMilliDelta,
    intent.amountDeductedMilliBefore,
    intent.liabilityAttempted ? 'true' : 'false',
    intent.paidAmountBefore,
    intent.remainingAmountBefore,
    intent.paidAmountAfter,
    intent.remainingAmountAfter,
    intent.walletMutationIdentity,
    intent.createdAt,
    intent.updatedAt,
  ];
}

function rowToIntent(row: unknown[]): FinancialApplyIntent | null {
  const economicKey = cell(row, 1);
  const financialApplyId = cell(row, 0);
  if (!economicKey || !financialApplyId) return null;
  const bool = (i: number) => {
    const s = cell(row, i).toLowerCase();
    return s === 'true' || s === '1' || s === 'yes';
  };
  return {
    financialApplyId,
    economicKey,
    evidenceIdentityKey: cell(row, 2),
    reconcileBatchId: cell(row, 3),
    deductionId: cell(row, 4),
    applyRecordId: cell(row, 5),
    allocatedMilli: cellNum(row, 6),
    riderCode: cell(row, 7),
    reason: cell(row, 8),
    equipmentIssueId: cell(row, 9),
    status: cell(row, 10) as FinancialApplyIntent['status'],
    obligationMutated: bool(11),
    liabilityMutated: bool(12),
    ledgerPosted: bool(13),
    ledgerTransactionId: cell(row, 14),
    ledgerIdempotencyKey: cell(row, 15),
    installmentsCompletedDelta: cellNum(row, 16),
    amountDeductedMilliDelta: cellNum(row, 17),
    outstandingMilliDelta: cellNum(row, 18),
    amountDeductedMilliBefore: cellNum(row, 19),
    liabilityAttempted: bool(20),
    paidAmountBefore: cellNum(row, 21),
    remainingAmountBefore: cellNum(row, 22),
    paidAmountAfter: cellNum(row, 23),
    remainingAmountAfter: cellNum(row, 24),
    walletMutationIdentity: cell(row, 25),
    createdAt: cell(row, 26),
    updatedAt: cell(row, 27),
  };
}

/** Durable Sheets-backed intent store (lazy sheet ensure). */
export async function createSheetsFinancialApplyIntentStore(): Promise<FinancialApplyIntentStore> {
  const headers = [...FINANCIAL_APPLY_INTENT_HEADERS];
  await ensureSheetExists(SHEET_FINANCIAL_APPLY_INTENT, headers);
  await ensureHeaderRow(SHEET_FINANCIAL_APPLY_INTENT, headers);

  async function loadAll(): Promise<Array<{ sheetRow: number; intent: FinancialApplyIntent }>> {
    const data = await getSheetDataOrThrow(SHEET_FINANCIAL_APPLY_INTENT, false);
    const out: Array<{ sheetRow: number; intent: FinancialApplyIntent }> = [];
    for (let i = 1; i < data.length; i++) {
      const intent = rowToIntent(data[i] || []);
      if (intent) out.push({ sheetRow: i + 1, intent });
    }
    return out;
  }

  return {
    async getByEconomicKey(economicKey) {
      const key = String(economicKey || '').trim();
      const all = await loadAll();
      return all.find((r) => r.intent.economicKey === key)?.intent ?? null;
    },
    async createIfAbsent(intent) {
      const existing = await loadAll();
      const hit = existing.find((r) => r.intent.economicKey === intent.economicKey);
      if (hit) return { created: false, intent: { ...hit.intent } };
      const ok = await appendToSheet(SHEET_FINANCIAL_APPLY_INTENT, [intentToRow(intent)], false);
      if (!ok) throw new Error('financialApplyIntent: appendToSheet failed');
      return { created: true, intent: { ...intent } };
    },
    async update(intent) {
      const all = await loadAll();
      const hit = all.find((r) => r.intent.economicKey === intent.economicKey);
      if (!hit) throw new Error(`financialApplyIntent: missing ${intent.economicKey}`);
      const ok = await updateSheetRow(SHEET_FINANCIAL_APPLY_INTENT, hit.sheetRow, intentToRow(intent));
      if (!ok) throw new Error(`financialApplyIntent: update failed ${intent.economicKey}`);
    },
  };
}

export async function createLiveFinancialApplyPorts(
  deps: LiveFinancialApplyPortsDeps
): Promise<FinancialApplyPorts> {
  const intentStore =
    deps.intentStore ?? (await createSheetsFinancialApplyIntentStore());
  const redis = deps.redis ?? createProductionFinancialApplyLockRedis();
  const getIssue = deps.getLiabilityIssue ?? getById;
  const updateBal = deps.updateLiabilityBalanceFn ?? updateBalance;
  const getLedger = deps.getLedgerByKey ?? getLedgerTransactionByIdempotencyKey;
  const appendLedger = deps.appendLedger ?? appendLedgerTransaction;

  return {
    intentStore,
    evidenceStore: deps.evidenceStore,
    dualGateSatisfied: false, // set per call by runProductionFinancialApplyLine
    managerConfirmed: false,
    actor: { code: '', name: '' },
    period: '',
    cycleId: '',
    acquireLock: (economicKey) => acquireFinancialApplyLock(economicKey, redis),
    async getObligation(deductionId) {
      const found = await findPersistedByDeductionId(deps.obligationStore, deductionId);
      return found ? { ...found.obligation } : null;
    },
    async saveObligation(obligation) {
      await updatePersistedObligationEconomics(deps.obligationStore, obligation);
    },
    async getLiability(equipmentIssueId) {
      const issue = await getIssue(equipmentIssueId);
      if (!issue) return null;
      const snap: LiabilitySnapshot = {
        equipmentIssueId: issue.equipmentIssueId,
        riderCode: issue.riderCode,
        riderNameSnapshot: issue.riderNameSnapshot,
        outstandingMilli: issue.outstandingMilli,
        amountDeductedMilli: issue.amountDeductedMilli,
        installmentsCompleted: issue.installmentsCompleted,
        status: issue.status,
      };
      return snap;
    },
    async updateLiabilityBalance(equipmentIssueId, deductionMilli, opts) {
      // H-1: NEVER omit incrementInstallment — do not use updateBalance default.
      const result = await updateBal(
        equipmentIssueId,
        deductionMilli,
        { code: 'srs014_financial_apply', name: 'SRS014 Financial Apply' },
        { incrementInstallment: opts.incrementInstallment }
      );
      if (!result.ok) return { ok: false, error: result.error };
      return {
        ok: true,
        issue: {
          equipmentIssueId: result.issue.equipmentIssueId,
          riderCode: result.issue.riderCode,
          riderNameSnapshot: result.issue.riderNameSnapshot,
          outstandingMilli: result.issue.outstandingMilli,
          amountDeductedMilli: result.issue.amountDeductedMilli,
          installmentsCompleted: result.issue.installmentsCompleted,
          status: result.issue.status,
        },
      };
    },
    async getLedgerByIdempotencyKey(key) {
      const txn = await getLedger(key);
      if (!txn) return null;
      return {
        transactionId: txn.transactionId,
        idempotencyKey: txn.idempotencyKey || key,
        amount: txn.amount,
      };
    },
    async appendLedgerNative(params) {
      const existing = await getLedger(params.idempotencyKey);
      if (existing) {
        return {
          transactionId: existing.transactionId,
          idempotencyKey: existing.idempotencyKey || params.idempotencyKey,
          amount: existing.amount,
        };
      }
      const txn = await appendLedger({
        entityType: 'rider',
        entityCode: params.entityCode,
        entityNameSnapshot: params.entityNameSnapshot,
        type: 'deduction',
        rawAmount: params.rawAmountEgp,
        reason: params.reason,
        period: params.period,
        createdBy: 'srs014_financial_apply',
        createdByName: 'SRS014 Financial Apply',
        source: 'ledger_native',
        category: params.category,
        idempotencyKey: params.idempotencyKey,
        cycleId: params.cycleId,
        equipmentIssueId: params.equipmentIssueId,
      });
      return {
        transactionId: txn.transactionId,
        idempotencyKey: txn.idempotencyKey || params.idempotencyKey,
        amount: txn.amount,
      };
    },
  };
}

/** Structured recovery fields for observability (no extra PII). */
export function financialApplyObservability(result: FinancialApplyResult): Record<string, unknown> {
  const intent = result.intent;
  return {
    outcome: result.outcome,
    reason: result.reason ?? null,
    financialApplyId: intent?.financialApplyId ?? null,
    economicKey: result.economicKey,
    evidenceIdentityKey: intent?.evidenceIdentityKey ?? null,
    deductionId: intent?.deductionId ?? null,
    applyRecordId: intent?.applyRecordId ?? result.applyRecord?.applyRecordId ?? null,
    allocatedMilli: intent?.allocatedMilli ?? result.applyRecord?.allocatedMilli ?? null,
    walletMutationIdentity: intent?.walletMutationIdentity ?? null,
    ledgerIdempotencyKey: intent?.ledgerIdempotencyKey ?? null,
    ledgerTransactionId: intent?.ledgerTransactionId ?? null,
    intentStatus: intent?.status ?? null,
    paidAmountBefore: intent?.paidAmountBefore ?? null,
    paidAmountAfter: intent?.paidAmountAfter ?? null,
    remainingAmountBefore: intent?.remainingAmountBefore ?? null,
    remainingAmountAfter: intent?.remainingAmountAfter ?? null,
    installmentsCompletedDelta: intent?.installmentsCompletedDelta ?? 0,
  };
}
