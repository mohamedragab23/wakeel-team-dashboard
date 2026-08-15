/**
 * SRS-014 Phase 4D.4 — Controlled financial apply foundation.
 *
 * Consumes an existing APPLIED allocation apply-record (4D.3) and performs
 * obligation + equipment liability + ledger_native mutations through injectable
 * ports. Durable intent state machine for crash recovery.
 *
 * NOT wired to production cron, flags, or live routes in this phase.
 * Sheets multi-resource writes are NOT atomic — recover via intent status,
 * never fake atomicity.
 */

import { randomUUID } from 'node:crypto';
import {
  isEvidenceIdentitySupersededForApply,
  type EvidenceApplyStore,
  type PersistedApplyRecord,
} from '@/lib/equipmentDeductions/evidenceApply';
import {
  EQUIPMENT_REASON,
  isEconomicallyConsistent,
  projectAfterAllocation,
  type DeductionObligation,
} from '@/lib/equipmentDeductions/obligations';
import { milliemesToEgp } from '@/lib/money';

/** Reserved audit sheet name — lazy; not live-wired in 4D.4. */
export const SHEET_FINANCIAL_APPLY_INTENT = 'نوايا_التطبيق_المالي';

export const FINANCIAL_APPLY_INTENT_HEADERS = [
  'financialApplyId',
  'economicKey',
  'evidenceIdentityKey',
  'reconcileBatchId',
  'deductionId',
  'applyRecordId',
  'allocatedMilli',
  'riderCode',
  'reason',
  'equipmentIssueId',
  'status',
  'obligationMutated',
  'liabilityMutated',
  'ledgerPosted',
  'ledgerTransactionId',
  'ledgerIdempotencyKey',
  'installmentsCompletedDelta',
  'amountDeductedMilliDelta',
  'outstandingMilliDelta',
  'amountDeductedMilliBefore',
  'liabilityAttempted',
  'paidAmountBefore',
  'remainingAmountBefore',
  'paidAmountAfter',
  'remainingAmountAfter',
  'walletMutationIdentity',
  'createdAt',
  'updatedAt',
] as const;

/**
 * Recoverable financial-apply state machine (Sheets are not multi-row atomic).
 * INTENT_CREATED → LIABILITY_PENDING → WALLET_APPLIED → LEDGER_POSTED → COMPLETED
 *
 * LIABILITY_PENDING = obligation mutated; liability/wallet not yet durable.
 * Never terminal-REJECT after obligationMutated=true (4D.4.2 HIGH fix).
 */
export type FinancialApplyIntentStatus =
  | 'INTENT_CREATED'
  | 'LIABILITY_PENDING'
  | 'WALLET_APPLIED'
  | 'LEDGER_POSTED'
  | 'COMPLETED'
  | 'REJECTED';

export type FinancialApplyIntent = {
  financialApplyId: string;
  /** Durable economic identity: evidenceIdentityKey + deductionId */
  economicKey: string;
  evidenceIdentityKey: string;
  /** Audit only — never used as economic identity. */
  reconcileBatchId: string;
  deductionId: string;
  applyRecordId: string;
  allocatedMilli: number;
  riderCode: string;
  reason: string;
  equipmentIssueId: string;
  status: FinancialApplyIntentStatus;
  obligationMutated: boolean;
  liabilityMutated: boolean;
  ledgerPosted: boolean;
  ledgerTransactionId: string;
  ledgerIdempotencyKey: string;
  /** H-1: 0 or +1 attributable to THIS apply only. */
  installmentsCompletedDelta: number;
  amountDeductedMilliDelta: number;
  outstandingMilliDelta: number;
  /** Snapshot before liability mutation — used to detect crash-after-wallet. */
  amountDeductedMilliBefore: number;
  /** True once wallet call is about to run / has run (crash boundary). */
  liabilityAttempted: boolean;
  paidAmountBefore: number;
  remainingAmountBefore: number;
  paidAmountAfter: number;
  remainingAmountAfter: number;
  /** Identity for future Full Reverse of the liability mutation. */
  walletMutationIdentity: string;
  createdAt: string;
  updatedAt: string;
  rejectReason?: string;
};

export type FinancialApplyIntentStore = {
  getByEconomicKey(economicKey: string): Promise<FinancialApplyIntent | null>;
  /**
   * Create only if absent. Must be durable + race-safe under the apply lock.
   * Returns existing row when economicKey already present.
   */
  createIfAbsent(intent: FinancialApplyIntent): Promise<{ created: boolean; intent: FinancialApplyIntent }>;
  update(intent: FinancialApplyIntent): Promise<void>;
};

export type FinancialApplyLock =
  | { ok: true; release: () => Promise<void> }
  | { ok: false; reason: 'lock_busy' | 'redis_unavailable' };

export type LiabilitySnapshot = {
  equipmentIssueId: string;
  riderCode: string;
  riderNameSnapshot: string;
  outstandingMilli: number;
  amountDeductedMilli: number;
  installmentsCompleted: number;
  status: string;
};

export type LedgerTxn = {
  transactionId: string;
  idempotencyKey: string;
  amount?: number;
};

export type FinancialApplyPorts = {
  intentStore: FinancialApplyIntentStore;
  evidenceStore: EvidenceApplyStore;
  /**
   * Required durable lock for evidenceIdentityKey+deductionId.
   * Production wiring must use Redis NX fail-closed (not fail-open).
   */
  acquireLock: (economicKey: string) => Promise<FinancialApplyLock>;
  getObligation: (deductionId: string) => Promise<DeductionObligation | null>;
  saveObligation: (obligation: DeductionObligation) => Promise<void>;
  getLiability?: (equipmentIssueId: string) => Promise<LiabilitySnapshot | null>;
  /**
   * Authoritative equipment liability mutation (wraps updateBalance semantics).
   * MUST pass incrementInstallment explicitly (H-1).
   */
  updateLiabilityBalance?: (
    equipmentIssueId: string,
    deductionMilli: number,
    opts: { incrementInstallment: boolean }
  ) => Promise<{ ok: true; issue: LiabilitySnapshot } | { ok: false; error: string }>;
  getLedgerByIdempotencyKey: (key: string) => Promise<LedgerTxn | null>;
  appendLedgerNative: (params: {
    entityCode: string;
    entityNameSnapshot: string;
    rawAmountEgp: number;
    reason: string;
    period: string;
    idempotencyKey: string;
    cycleId: string;
    equipmentIssueId?: string;
    category: string;
  }) => Promise<LedgerTxn>;
  dualGateSatisfied: boolean;
  managerConfirmed: boolean;
  actor: { code: string; name: string };
  period: string;
  cycleId: string;
  now?: string;
};

export type FinancialApplyLineInput = {
  evidenceIdentityKey: string;
  reconcileBatchId: string;
  deductionId: string;
  ports: FinancialApplyPorts;
};

export type FinancialApplyOutcome =
  | 'financially_applied'
  | 'idempotent_already_applied'
  | 'rejected'
  | 'blocked_superseded'
  | 'lock_busy'
  | 'redis_unavailable'
  /** Obligation already mutated; liability incomplete — retry/resume required. */
  | 'recovery_required';

export type FinancialApplyResult = {
  outcome: FinancialApplyOutcome;
  reason?: string;
  economicKey: string;
  intent: FinancialApplyIntent | null;
  applyRecord: PersistedApplyRecord | null;
  financialSideEffects: {
    walletMutated: boolean;
    ledgerNativeWritten: boolean;
    amountDeductedMilliDelta: number;
    outstandingMilliDelta: number;
    installmentsCompletedDelta: number;
    paidAmountDelta: number;
    productionFinancialMutation: false;
  };
  /** Durable linkage for future Full Reverse (no reverse executed here). */
  reverseLinkage: {
    evidenceIdentityKey: string;
    applyRecordId: string;
    deductionId: string;
    financialApplyId: string;
    economicKey: string;
    ledgerIdempotencyKey: string;
    ledgerTransactionId: string;
    walletMutationIdentity: string;
    allocatedMilli: number;
    equipmentIssueId: string;
    installmentsCompletedDelta: number;
    paidAmountBefore: number;
    remainingAmountBefore: number;
    paidAmountAfter: number;
    remainingAmountAfter: number;
  } | null;
};

function truncNonNeg(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.trunc(n));
}

function newId(prefix: string): string {
  if (typeof randomUUID === 'function') return `${prefix}_${randomUUID()}`;
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2)}`;
}

/** Sole economic apply-once key for wallet/ledger/liability (NOT reconcileBatchId). */
export function financialApplyEconomicKey(
  evidenceIdentityKey: string,
  deductionId: string
): string {
  return `srs014:fa:${String(evidenceIdentityKey || '').trim()}:${String(deductionId || '').trim()}`;
}

export function ledgerIdempotencyKeyForFinancialApply(
  evidenceIdentityKey: string,
  deductionId: string
): string {
  return financialApplyEconomicKey(evidenceIdentityKey, deductionId);
}

function emptyFx(partial?: Partial<FinancialApplyResult['financialSideEffects']>): FinancialApplyResult['financialSideEffects'] {
  return {
    walletMutated: false,
    ledgerNativeWritten: false,
    amountDeductedMilliDelta: 0,
    outstandingMilliDelta: 0,
    installmentsCompletedDelta: 0,
    paidAmountDelta: 0,
    productionFinancialMutation: false,
    ...partial,
  };
}

function reverseLinkageFrom(intent: FinancialApplyIntent): NonNullable<FinancialApplyResult['reverseLinkage']> {
  return {
    evidenceIdentityKey: intent.evidenceIdentityKey,
    applyRecordId: intent.applyRecordId,
    deductionId: intent.deductionId,
    financialApplyId: intent.financialApplyId,
    economicKey: intent.economicKey,
    ledgerIdempotencyKey: intent.ledgerIdempotencyKey,
    ledgerTransactionId: intent.ledgerTransactionId,
    walletMutationIdentity: intent.walletMutationIdentity,
    allocatedMilli: intent.allocatedMilli,
    equipmentIssueId: intent.equipmentIssueId,
    installmentsCompletedDelta: intent.installmentsCompletedDelta,
    paidAmountBefore: intent.paidAmountBefore,
    remainingAmountBefore: intent.remainingAmountBefore,
    paidAmountAfter: intent.paidAmountAfter,
    remainingAmountAfter: intent.remainingAmountAfter,
  };
}

function fxFromIntent(intent: FinancialApplyIntent): FinancialApplyResult['financialSideEffects'] {
  return emptyFx({
    walletMutated: intent.liabilityMutated && intent.amountDeductedMilliDelta > 0,
    ledgerNativeWritten: intent.ledgerPosted,
    amountDeductedMilliDelta: intent.amountDeductedMilliDelta,
    outstandingMilliDelta: intent.outstandingMilliDelta,
    installmentsCompletedDelta: intent.installmentsCompletedDelta,
    paidAmountDelta: intent.obligationMutated
      ? intent.paidAmountAfter - intent.paidAmountBefore
      : 0,
  });
}

/** In-memory intent store for unit tests — createIfAbsent is race-aware within one process. */
export function createMemoryFinancialApplyIntentStore(): FinancialApplyIntentStore & {
  intents: FinancialApplyIntent[];
} {
  const intents: FinancialApplyIntent[] = [];
  const byKey = new Map<string, FinancialApplyIntent>();
  return {
    intents,
    async getByEconomicKey(economicKey) {
      const row = byKey.get(economicKey);
      return row ? { ...row } : null;
    },
    async createIfAbsent(intent) {
      const existing = byKey.get(intent.economicKey);
      if (existing) return { created: false, intent: { ...existing } };
      const row = { ...intent };
      byKey.set(intent.economicKey, row);
      intents.push(row);
      return { created: true, intent: { ...row } };
    },
    async update(intent) {
      const cur = byKey.get(intent.economicKey);
      if (!cur) throw new Error(`financialApply: intent ${intent.economicKey} not found`);
      Object.assign(cur, intent);
    },
  };
}

/**
 * Process-local exclusive lock for tests / single-process adapters.
 * Production must inject Redis NX fail-closed.
 */
export function createMemoryFinancialApplyLock(): {
  acquireLock: (economicKey: string) => Promise<FinancialApplyLock>;
  held: Set<string>;
} {
  const held = new Set<string>();
  return {
    held,
    async acquireLock(economicKey) {
      const key = String(economicKey || '').trim();
      if (!key) return { ok: false, reason: 'lock_busy' };
      if (held.has(key)) return { ok: false, reason: 'lock_busy' };
      held.add(key);
      return {
        ok: true,
        release: async () => {
          held.delete(key);
        },
      };
    },
  };
}

async function findApplyRecord(
  store: EvidenceApplyStore,
  evidenceIdentityKey: string,
  deductionId: string
): Promise<PersistedApplyRecord | null> {
  const all = await store.listApplyRecords();
  return (
    all.find(
      (r) =>
        r.evidenceIdentityKey === evidenceIdentityKey &&
        r.deductionId === deductionId &&
        (r.applyStatus === 'APPLIED' || r.applyStatus === 'PENDING')
    ) ??
    all.find(
      (r) => r.evidenceIdentityKey === evidenceIdentityKey && r.deductionId === deductionId
    ) ??
    null
  );
}

/**
 * Apply one allocation line financially (apply-record-first; no re-waterfall).
 */
export async function runFinancialApplyLine(
  input: FinancialApplyLineInput
): Promise<FinancialApplyResult> {
  const evidenceIdentityKey = String(input.evidenceIdentityKey || '').trim();
  const deductionId = String(input.deductionId || '').trim();
  const reconcileBatchId = String(input.reconcileBatchId || '').trim();
  const ports = input.ports;
  const now = String(ports.now || new Date().toISOString());
  const economicKey = financialApplyEconomicKey(evidenceIdentityKey, deductionId);

  const reject = (
    reason: string,
    extra?: { outcome?: FinancialApplyOutcome; applyRecord?: PersistedApplyRecord | null }
  ): FinancialApplyResult => ({
    outcome: extra?.outcome ?? 'rejected',
    reason,
    economicKey,
    intent: null,
    applyRecord: extra?.applyRecord ?? null,
    financialSideEffects: emptyFx(),
    reverseLinkage: null,
  });

  if (!evidenceIdentityKey || !deductionId) {
    return reject('missing_identity');
  }
  if (!ports.dualGateSatisfied) {
    return reject('dual_gate_not_satisfied');
  }
  if (!ports.managerConfirmed) {
    return reject('manager_not_confirmed');
  }

  const superseded = await isEvidenceIdentitySupersededForApply(
    ports.evidenceStore,
    evidenceIdentityKey
  );
  if (superseded.superseded) {
    return reject('evidence_identity_superseded', { outcome: 'blocked_superseded' });
  }

  const evidenceRows = await ports.evidenceStore.listEvidence();
  const evidence =
    evidenceRows.find(
      (e) =>
        e.evidenceIdentityKey === evidenceIdentityKey &&
        e.fileValidationStatus === 'FILE_VALID' &&
        e.evidenceLifecycleStatus === 'ACTIVE'
    ) ?? null;
  if (!evidence) {
    return reject('file_valid_evidence_missing');
  }

  const applyRecord = await findApplyRecord(ports.evidenceStore, evidenceIdentityKey, deductionId);
  if (!applyRecord) {
    return reject('apply_record_missing');
  }
  if (applyRecord.applyStatus === 'SUPERSEDED' || applyRecord.applyStatus === 'REVERSED') {
    return reject('apply_record_not_eligible', { applyRecord });
  }
  if (applyRecord.applyStatus !== 'APPLIED') {
    return reject('allocation_not_applied', { applyRecord });
  }

  const allocatedMilli = truncNonNeg(applyRecord.allocatedMilli);
  if (allocatedMilli <= 0) {
    return reject('allocated_milli_not_positive', { applyRecord });
  }

  const lock = await ports.acquireLock(economicKey);
  if (!lock.ok) {
    const lockOutcome =
      lock.reason === 'redis_unavailable' ? 'redis_unavailable' : 'lock_busy';
    return reject(lockOutcome, { outcome: lockOutcome, applyRecord });
  }

  try {
    const existingIntent = await ports.intentStore.getByEconomicKey(economicKey);
    if (existingIntent?.status === 'COMPLETED') {
      return {
        outcome: 'idempotent_already_applied',
        economicKey,
        intent: existingIntent,
        applyRecord,
        financialSideEffects: emptyFx(),
        reverseLinkage: reverseLinkageFrom(existingIntent),
      };
    }

    const obligation = await ports.getObligation(deductionId);
    if (!obligation) {
      return reject('obligation_missing', { applyRecord });
    }
    if (!isEconomicallyConsistent(obligation)) {
      return reject('inconsistent_obligation', { applyRecord });
    }
    if (allocatedMilli > truncNonNeg(obligation.remainingAmount) && !existingIntent?.obligationMutated) {
      const absorbedByPriorAttempt =
        Boolean(existingIntent) &&
        truncNonNeg(obligation.paidAmount) >=
          truncNonNeg(existingIntent!.paidAmountBefore) + allocatedMilli;
      if (!absorbedByPriorAttempt) {
        return reject('allocated_exceeds_remaining', { applyRecord });
      }
    }

    const ledgerKey = ledgerIdempotencyKeyForFinancialApply(evidenceIdentityKey, deductionId);
    let intent: FinancialApplyIntent;

    if (existingIntent) {
      intent = { ...existingIntent };
      // 4D.4.2: heal legacy stranded REJECTED after obligation mutation (pre-fix).
      if (
        intent.status === 'REJECTED' &&
        intent.obligationMutated &&
        !intent.liabilityMutated
      ) {
        intent.status = 'LIABILITY_PENDING';
        intent.updatedAt = now;
        await ports.intentStore.update(intent);
      }
    } else {
      const created = await ports.intentStore.createIfAbsent({
        financialApplyId: newId('fa'),
        economicKey,
        evidenceIdentityKey,
        reconcileBatchId,
        deductionId,
        applyRecordId: applyRecord.applyRecordId,
        allocatedMilli,
        riderCode: obligation.riderCode,
        reason: obligation.reason,
        equipmentIssueId: String(obligation.equipmentIssueId || ''),
        status: 'INTENT_CREATED',
        obligationMutated: false,
        liabilityMutated: false,
        ledgerPosted: false,
        ledgerTransactionId: '',
        ledgerIdempotencyKey: ledgerKey,
        installmentsCompletedDelta: 0,
        amountDeductedMilliDelta: 0,
        outstandingMilliDelta: 0,
        amountDeductedMilliBefore: 0,
        liabilityAttempted: false,
        paidAmountBefore: obligation.paidAmount,
        remainingAmountBefore: obligation.remainingAmount,
        paidAmountAfter: obligation.paidAmount,
        remainingAmountAfter: obligation.remainingAmount,
        walletMutationIdentity: '',
        createdAt: now,
        updatedAt: now,
      });
      intent = { ...created.intent };
      // Lost create race: another worker finished first.
      if (!created.created && intent.status === 'COMPLETED') {
        return {
          outcome: 'idempotent_already_applied',
          economicKey,
          intent,
          applyRecord,
          financialSideEffects: emptyFx(),
          reverseLinkage: reverseLinkageFrom(intent),
        };
      }
    }

    const recoveryRequired = async (
      reason: string
    ): Promise<FinancialApplyResult> => {
      intent.status = 'LIABILITY_PENDING';
      intent.rejectReason = reason;
      intent.updatedAt = now;
      await ports.intentStore.update(intent);
      return {
        outcome: 'recovery_required',
        reason,
        economicKey,
        intent: { ...intent },
        applyRecord,
        financialSideEffects: emptyFx(),
        reverseLinkage: reverseLinkageFrom(intent),
      };
    };

    // --- STEP 2a: obligation (INTENT_CREATED only; never re-apply) ---
    if (intent.status === 'INTENT_CREATED' && !intent.obligationMutated) {
      const fresh = await ports.getObligation(deductionId);
      if (!fresh || !isEconomicallyConsistent(fresh)) {
        intent.status = 'REJECTED';
        intent.rejectReason = 'inconsistent_obligation';
        intent.updatedAt = now;
        await ports.intentStore.update(intent);
        return reject('inconsistent_obligation', { applyRecord });
      }

      // Crash recovery: obligation write landed but flag not persisted.
      const alreadyPaidByThisApply =
        truncNonNeg(fresh.paidAmount) >=
        truncNonNeg(intent.paidAmountBefore) + allocatedMilli;

      if (alreadyPaidByThisApply) {
        intent.obligationMutated = true;
        intent.paidAmountAfter = fresh.paidAmount;
        intent.remainingAmountAfter = fresh.remainingAmount;
        intent.installmentsCompletedDelta =
          fresh.reason === EQUIPMENT_REASON && truncNonNeg(fresh.remainingAmount) === 0 ? 1 : 0;
        intent.status = 'LIABILITY_PENDING';
        intent.updatedAt = now;
        await ports.intentStore.update(intent);
      } else {
        if (allocatedMilli > truncNonNeg(fresh.remainingAmount)) {
          // Pre-mutation failure — terminal REJECTED allowed.
          intent.status = 'REJECTED';
          intent.rejectReason = 'allocated_exceeds_remaining';
          intent.updatedAt = now;
          await ports.intentStore.update(intent);
          return reject('allocated_exceeds_remaining', { applyRecord });
        }
        const after = projectAfterAllocation(fresh, allocatedMilli);
        intent.paidAmountBefore = fresh.paidAmount;
        intent.remainingAmountBefore = fresh.remainingAmount;
        intent.updatedAt = now;
        await ports.intentStore.update(intent);

        await ports.saveObligation(after.obligation);
        intent.obligationMutated = true;
        intent.paidAmountAfter = after.obligation.paidAmount;
        intent.remainingAmountAfter = after.obligation.remainingAmount;
        intent.installmentsCompletedDelta =
          after.installmentCompleted && fresh.reason === EQUIPMENT_REASON ? 1 : 0;
        // Post-obligation: always resumable until liability succeeds.
        intent.status = 'LIABILITY_PENDING';
        intent.updatedAt = now;
        await ports.intentStore.update(intent);
      }
    }

    // --- STEP 2b: liability/wallet (resumable from LIABILITY_PENDING) ---
    if (
      (intent.status === 'INTENT_CREATED' || intent.status === 'LIABILITY_PENDING') &&
      intent.obligationMutated &&
      !intent.liabilityMutated
    ) {
      if (intent.status !== 'LIABILITY_PENDING') {
        intent.status = 'LIABILITY_PENDING';
        intent.updatedAt = now;
        await ports.intentStore.update(intent);
      }

      const isEquipment = intent.reason === EQUIPMENT_REASON && Boolean(intent.equipmentIssueId);
      if (isEquipment) {
        if (!ports.updateLiabilityBalance || !ports.getLiability) {
          return recoveryRequired('liability_ports_missing');
        }
        const before = await ports.getLiability(intent.equipmentIssueId);
        if (!before || before.status !== 'open') {
          // If we already attempted wallet and liability shows the cut, recover.
          if (intent.liabilityAttempted && before) {
            const applied =
              truncNonNeg(before.amountDeductedMilli) >=
              truncNonNeg(intent.amountDeductedMilliBefore) + allocatedMilli;
            if (applied) {
              intent.amountDeductedMilliDelta = allocatedMilli;
              intent.outstandingMilliDelta = -allocatedMilli;
              intent.walletMutationIdentity =
                intent.walletMutationIdentity || `wallet:${intent.economicKey}:${allocatedMilli}`;
              intent.liabilityMutated = true;
              intent.status = 'WALLET_APPLIED';
              intent.rejectReason = undefined;
              intent.updatedAt = now;
              await ports.intentStore.update(intent);
            } else {
              return recoveryRequired('liability_not_recoverable');
            }
          } else {
            return recoveryRequired('liability_not_recoverable');
          }
        } else if (
          intent.liabilityAttempted &&
          truncNonNeg(before.amountDeductedMilli) >=
            truncNonNeg(intent.amountDeductedMilliBefore) + allocatedMilli
        ) {
          // Crash after wallet mutation, before liabilityMutated flag.
          intent.amountDeductedMilliDelta = allocatedMilli;
          intent.outstandingMilliDelta = -allocatedMilli;
          intent.walletMutationIdentity =
            intent.walletMutationIdentity || `wallet:${intent.economicKey}:${allocatedMilli}`;
          intent.liabilityMutated = true;
          intent.status = 'WALLET_APPLIED';
          intent.rejectReason = undefined;
          intent.updatedAt = now;
          await ports.intentStore.update(intent);
        } else {
          if (allocatedMilli > truncNonNeg(before.outstandingMilli)) {
            return recoveryRequired('allocated_exceeds_outstanding');
          }

          // Persist attempt marker BEFORE money move (crash boundary B).
          intent.amountDeductedMilliBefore = before.amountDeductedMilli;
          intent.liabilityAttempted = true;
          intent.walletMutationIdentity = `wallet:${intent.economicKey}:${allocatedMilli}`;
          intent.updatedAt = now;
          await ports.intentStore.update(intent);

          // H-1: increment ONLY when THIS apply drives remainingAmount to 0.
          const incrementInstallment = intent.installmentsCompletedDelta === 1;
          const bal = await ports.updateLiabilityBalance(intent.equipmentIssueId, allocatedMilli, {
            incrementInstallment,
          });
          if (!bal.ok) {
            return recoveryRequired(`liability_update_failed:${bal.error}`);
          }
          intent.amountDeductedMilliDelta = allocatedMilli;
          intent.outstandingMilliDelta = -allocatedMilli;
          intent.liabilityMutated = true;
          intent.status = 'WALLET_APPLIED';
          intent.rejectReason = undefined;
          intent.updatedAt = now;
          await ports.intentStore.update(intent);
        }
      } else {
        // Non-equipment: no عهدة updateBalance; obligation mutation is the liability step.
        intent.liabilityMutated = true;
        intent.liabilityAttempted = true;
        intent.amountDeductedMilliDelta = 0;
        intent.outstandingMilliDelta = 0;
        intent.walletMutationIdentity = `obligation-only:${intent.economicKey}`;
        intent.installmentsCompletedDelta = 0;
        intent.status = 'WALLET_APPLIED';
        intent.rejectReason = undefined;
        intent.updatedAt = now;
        await ports.intentStore.update(intent);
      }
    } else if (
      (intent.status === 'INTENT_CREATED' || intent.status === 'LIABILITY_PENDING') &&
      intent.liabilityMutated
    ) {
      intent.status = 'WALLET_APPLIED';
      intent.rejectReason = undefined;
      intent.updatedAt = now;
      await ports.intentStore.update(intent);
    }

    // --- STEP 3: ledger_native (durable idempotency key = economicKey) ---
    if (intent.status === 'WALLET_APPLIED') {
      const existingLedger = await ports.getLedgerByIdempotencyKey(intent.ledgerIdempotencyKey);
      if (existingLedger) {
        intent.ledgerTransactionId = existingLedger.transactionId;
        intent.ledgerPosted = true;
      } else if (!intent.ledgerPosted) {
        const txn = await ports.appendLedgerNative({
          entityCode: intent.riderCode,
          entityNameSnapshot: intent.riderCode,
          rawAmountEgp: milliemesToEgp(allocatedMilli),
          reason:
            intent.reason === EQUIPMENT_REASON
              ? `تطبيق تخصيص معدات (${intent.deductionId})`
              : `تطبيق تخصيص (${intent.reason})`,
          period: ports.period,
          idempotencyKey: intent.ledgerIdempotencyKey,
          cycleId: ports.cycleId,
          equipmentIssueId: intent.equipmentIssueId || undefined,
          category:
            intent.reason === EQUIPMENT_REASON
              ? 'equipment_allocation_apply'
              : 'deduction_allocation_apply',
        });
        intent.ledgerTransactionId = txn.transactionId;
        intent.ledgerPosted = true;
      }
      intent.status = 'LEDGER_POSTED';
      intent.updatedAt = now;
      await ports.intentStore.update(intent);
    }

    // --- STEP 4: final financially-applied state (intent COMPLETED) ---
    if (intent.status === 'LEDGER_POSTED') {
      // Apply-record remains APPLIED (allocation truth); financial completion = intent COMPLETED.
      // Touch apply record for audit trail without schema change.
      await ports.evidenceStore.updateApplyRecord(applyRecord.applyRecordId, {
        ...applyRecord,
        liabilityRecoverable: false,
        updatedAt: now,
      });
      intent.status = 'COMPLETED';
      intent.updatedAt = now;
      await ports.intentStore.update(intent);
    }

    if (intent.status === 'LIABILITY_PENDING') {
      return {
        outcome: 'recovery_required',
        reason: intent.rejectReason || 'liability_pending',
        economicKey,
        intent: { ...intent },
        applyRecord,
        financialSideEffects: emptyFx(),
        reverseLinkage: reverseLinkageFrom(intent),
      };
    }

    if (intent.status !== 'COMPLETED') {
      return reject(`incomplete_state:${intent.status}`, { applyRecord });
    }

    return {
      outcome: 'financially_applied',
      economicKey,
      intent,
      applyRecord: { ...applyRecord, liabilityRecoverable: false, updatedAt: now },
      financialSideEffects: fxFromIntent(intent),
      reverseLinkage: reverseLinkageFrom(intent),
    };
  } finally {
    await lock.release();
  }
}

/**
 * Resume / retry a single economic key. Safe after any crash boundary.
 * Delegates to runFinancialApplyLine (idempotent).
 */
export async function resumeFinancialApplyLine(
  input: FinancialApplyLineInput
): Promise<FinancialApplyResult> {
  return runFinancialApplyLine(input);
}
