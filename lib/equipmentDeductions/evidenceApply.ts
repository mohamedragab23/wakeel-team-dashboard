/**
 * SRS-014 Phase 4D.2 — Evidence persistence + apply-record foundation.
 *
 * Persists FILE_* / confirmation / evidenceIdentityKey and durable apply records
 * (apply-record-first). No wallet, ledger_native, allocation waterfall, or
 * installmentsCompleted mutation.
 */

import { randomUUID } from 'node:crypto';
import {
  checkManagerCompareDualGate,
  computeEvidenceIdentityKey,
  confirmCompleteCycle,
  evaluateTechnicalManagerFile,
  normalizeCycleScopeKey,
  type DualGateCheck,
  type FileValidationStatus,
  type ManagerCompareCycleScope,
  type ManagerCompareResult,
  type TechnicalFileValidation,
} from '@/lib/equipmentDeductions/managerCompare';

/** Dedicated additive audit sheet (lazy; not wired to production routes in 4D.2). */
export const SHEET_MANAGER_EVIDENCE = 'أدلة_استقطاع_المدير';
export const SHEET_ALLOCATION_APPLY = 'سجلات_تطبيق_التخصيص';

export const MANAGER_EVIDENCE_HEADERS = [
  'evidenceRecordId',
  'evidenceIdentityKey',
  'reconcileBatchId',
  'cycleScopeKey',
  'cycleId',
  'cycleLabel',
  'monthLabel',
  'year',
  'fileValidationStatus',
  'completeCycleConfirmed',
  'completeCycleConfirmedBy',
  'completeCycleConfirmedAt',
  'evidenceLifecycleStatus',
  'supersedesEvidenceIdentityKey',
  'supersededByEvidenceIdentityKey',
  'createdAt',
  'updatedAt',
] as const;

export const ALLOCATION_APPLY_HEADERS = [
  'applyRecordId',
  'evidenceIdentityKey',
  'reconcileBatchId',
  'deductionId',
  'allocatedMilli',
  'reason',
  'applyStatus',
  'liabilityRecoverable',
  'supersedesApplyRecordId',
  'supersededByApplyRecordId',
  'createdAt',
  'updatedAt',
] as const;

/** Evidence batch lifecycle (not wallet collection). */
export type EvidenceLifecycleStatus = 'ACTIVE' | 'SUPERSEDED';

/**
 * Apply-record lifecycle (D-EVIDENCE-3).
 * PENDING = record exists before allocation (recoverable).
 * APPLIED = future allocation phase only (not set by wallet here).
 * SUPERSEDED / REVERSE_* = supersession foundation (no wallet reverse in 4D.2).
 */
export type ApplyStatus =
  | 'PENDING'
  | 'APPLIED'
  | 'SUPERSEDED'
  | 'REVERSE_PENDING'
  | 'REVERSED';

export type PersistedEvidenceBatch = {
  evidenceRecordId: string;
  /** Empty until FILE_VALID. */
  evidenceIdentityKey: string;
  reconcileBatchId: string;
  cycleScopeKey: string;
  cycleScope: ManagerCompareCycleScope;
  fileValidationStatus: FileValidationStatus;
  completeCycleConfirmed: boolean;
  completeCycleConfirmedBy: string | null;
  completeCycleConfirmedAt: string | null;
  evidenceLifecycleStatus: EvidenceLifecycleStatus;
  supersedesEvidenceIdentityKey: string | null;
  supersededByEvidenceIdentityKey: string | null;
  createdAt: string;
  updatedAt: string;
};

export type PersistedApplyRecord = {
  applyRecordId: string;
  evidenceIdentityKey: string;
  /** Audit/upload only — never the apply-once key. */
  reconcileBatchId: string;
  deductionId: string;
  /** Remains 0 until a later allocation phase fills net allocated amounts. */
  allocatedMilli: number;
  reason: string;
  applyStatus: ApplyStatus;
  /** True while PENDING (crash before allocation ⇒ recoverable). */
  liabilityRecoverable: boolean;
  supersedesApplyRecordId: string | null;
  supersededByApplyRecordId: string | null;
  createdAt: string;
  updatedAt: string;
};

export type EvidenceApplyStore = {
  listEvidence(): Promise<PersistedEvidenceBatch[]>;
  appendEvidence(row: PersistedEvidenceBatch): Promise<void>;
  updateEvidence(evidenceRecordId: string, row: PersistedEvidenceBatch): Promise<void>;
  listApplyRecords(): Promise<PersistedApplyRecord[]>;
  appendApplyRecord(row: PersistedApplyRecord): Promise<void>;
  updateApplyRecord(applyRecordId: string, row: PersistedApplyRecord): Promise<void>;
};

function newId(prefix: string): string {
  if (typeof randomUUID === 'function') return `${prefix}_${randomUUID()}`;
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2)}`;
}

function sideEffectsNone() {
  return {
    walletMutated: false as const,
    ledgerNativeWritten: false as const,
    amountDeductedMilliDelta: 0 as const,
    outstandingMilliDelta: 0 as const,
    installmentsCompletedDelta: 0 as const,
    paidAmountIncremented: false as const,
    allocationApplied: false as const,
  };
}

/** In-memory store for unit tests — no Sheets / wallet / ledger I/O. */
export function createMemoryEvidenceApplyStore(): EvidenceApplyStore & {
  evidence: PersistedEvidenceBatch[];
  applyRecords: PersistedApplyRecord[];
} {
  const evidence: PersistedEvidenceBatch[] = [];
  const applyRecords: PersistedApplyRecord[] = [];
  return {
    evidence,
    applyRecords,
    async listEvidence() {
      return evidence.map((e) => ({ ...e }));
    },
    async appendEvidence(row) {
      evidence.push({ ...row });
    },
    async updateEvidence(evidenceRecordId, row) {
      const i = evidence.findIndex((e) => e.evidenceRecordId === evidenceRecordId);
      if (i < 0) throw new Error(`evidenceApply: evidence ${evidenceRecordId} not found`);
      evidence[i] = { ...row };
    },
    async listApplyRecords() {
      return applyRecords.map((r) => ({ ...r }));
    },
    async appendApplyRecord(row) {
      applyRecords.push({ ...row });
    },
    async updateApplyRecord(applyRecordId, row) {
      const i = applyRecords.findIndex((r) => r.applyRecordId === applyRecordId);
      if (i < 0) throw new Error(`evidenceApply: apply ${applyRecordId} not found`);
      applyRecords[i] = { ...row };
    },
  };
}

export async function findEvidenceByIdentityKey(
  store: EvidenceApplyStore,
  evidenceIdentityKey: string
): Promise<PersistedEvidenceBatch | null> {
  const key = String(evidenceIdentityKey || '').trim();
  if (!key) return null;
  const all = await store.listEvidence();
  return (
    all.find(
      (e) =>
        e.evidenceIdentityKey === key &&
        e.evidenceLifecycleStatus === 'ACTIVE' &&
        e.fileValidationStatus === 'FILE_VALID'
    ) ??
    all.find((e) => e.evidenceIdentityKey === key) ??
    null
  );
}

export async function listApplyRecordsForEvidence(
  store: EvidenceApplyStore,
  evidenceIdentityKey: string
): Promise<PersistedApplyRecord[]> {
  const key = String(evidenceIdentityKey || '').trim();
  const all = await store.listApplyRecords();
  return all.filter((r) => r.evidenceIdentityKey === key);
}

/** True if any apply line is already APPLIED for this evidence identity. */
export async function hasAppliedEconomicEffect(
  store: EvidenceApplyStore,
  evidenceIdentityKey: string
): Promise<boolean> {
  const rows = await listApplyRecordsForEvidence(store, evidenceIdentityKey);
  return rows.some((r) => r.applyStatus === 'APPLIED');
}

/**
 * H-1 / 4D.2.2: a superseded evidenceIdentityKey must never mint a new PENDING set.
 * Detected via evidence lifecycle SUPERSEDED and/or apply lines that are only
 * SUPERSEDED / REVERSE_* (no PENDING or APPLIED remaining).
 */
export async function isEvidenceIdentitySupersededForApply(
  store: EvidenceApplyStore,
  evidenceIdentityKey: string
): Promise<{
  superseded: boolean;
  evidence: PersistedEvidenceBatch | null;
  applyRecords: PersistedApplyRecord[];
}> {
  const key = String(evidenceIdentityKey || '').trim();
  const allEvidence = await store.listEvidence();
  const evidence =
    allEvidence.find((e) => e.evidenceIdentityKey === key && e.evidenceLifecycleStatus === 'SUPERSEDED') ??
    allEvidence.find((e) => e.evidenceIdentityKey === key) ??
    null;
  const applyRecords = await listApplyRecordsForEvidence(store, key);

  if (evidence?.evidenceLifecycleStatus === 'SUPERSEDED') {
    return { superseded: true, evidence, applyRecords };
  }

  const hasActiveEconomic = applyRecords.some(
    (r) => r.applyStatus === 'PENDING' || r.applyStatus === 'APPLIED'
  );
  const onlyClosedOrSuperseded =
    applyRecords.length > 0 &&
    !hasActiveEconomic &&
    applyRecords.every(
      (r) =>
        r.applyStatus === 'SUPERSEDED' ||
        r.applyStatus === 'REVERSED' ||
        r.applyStatus === 'REVERSE_PENDING'
    );

  return {
    superseded: onlyClosedOrSuperseded,
    evidence,
    applyRecords,
  };
}

/** PENDING lines ⇒ allocation not completed; liability recoverable for later phase. */
export async function listRecoverablePendingApplyRecords(
  store: EvidenceApplyStore,
  evidenceIdentityKey: string
): Promise<PersistedApplyRecord[]> {
  const rows = await listApplyRecordsForEvidence(store, evidenceIdentityKey);
  return rows.filter((r) => r.applyStatus === 'PENDING' && r.liabilityRecoverable);
}

export type PersistEvidenceInput = {
  cycleScope: ManagerCompareCycleScope;
  fileValidationStatus: FileValidationStatus;
  reconcileBatchId: string;
  evidenceIdentityKey?: string | null;
  completeCycleConfirmedBy?: string | null;
  completeCycleConfirmedAt?: string | null;
  /** Optional link when this batch replaces prior evidence (state only). */
  supersedesEvidenceIdentityKey?: string | null;
  now?: string;
};

/**
 * Persist Manager evidence / confirmation state.
 * FILE_VALID requires evidenceIdentityKey. Does not create apply records by itself
 * (call ensurePendingApplyRecords for apply-record-first before allocation).
 */
export async function persistEvidenceBatch(
  store: EvidenceApplyStore,
  input: PersistEvidenceInput
): Promise<{
  outcome: 'created' | 'idempotent_existing_valid';
  evidence: PersistedEvidenceBatch;
  financialSideEffects: ReturnType<typeof sideEffectsNone>;
}> {
  const now = String(input.now || new Date().toISOString());
  const status = input.fileValidationStatus;
  const identity = String(input.evidenceIdentityKey || '').trim();

  if (status === 'FILE_VALID' && !identity) {
    throw new Error('persistEvidenceBatch: FILE_VALID requires evidenceIdentityKey');
  }

  if (status === 'FILE_VALID' && identity) {
    const existing = await findEvidenceByIdentityKey(store, identity);
    if (existing && existing.fileValidationStatus === 'FILE_VALID') {
      // Same economic evidence — new reconcileBatchId alone must not mint a second ACTIVE VALID batch.
      return {
        outcome: 'idempotent_existing_valid',
        evidence: existing,
        financialSideEffects: sideEffectsNone(),
      };
    }
  }

  const row: PersistedEvidenceBatch = {
    evidenceRecordId: newId('ev'),
    evidenceIdentityKey: status === 'FILE_VALID' ? identity : '',
    reconcileBatchId: String(input.reconcileBatchId || '').trim(),
    cycleScopeKey: normalizeCycleScopeKey(input.cycleScope),
    cycleScope: { ...input.cycleScope },
    fileValidationStatus: status,
    completeCycleConfirmed: status === 'FILE_VALID',
    completeCycleConfirmedBy:
      status === 'FILE_VALID' ? input.completeCycleConfirmedBy ?? null : null,
    completeCycleConfirmedAt:
      status === 'FILE_VALID' ? input.completeCycleConfirmedAt ?? null : null,
    evidenceLifecycleStatus: 'ACTIVE',
    supersedesEvidenceIdentityKey: input.supersedesEvidenceIdentityKey ?? null,
    supersededByEvidenceIdentityKey: null,
    createdAt: now,
    updatedAt: now,
  };

  await store.appendEvidence(row);
  return { outcome: 'created', evidence: row, financialSideEffects: sideEffectsNone() };
}

/**
 * Persist evidence from a 4D.1 compare result (typically after confirm).
 * Enforces dual-gate when promoting to FILE_VALID.
 */
export async function persistConfirmedEvidenceFromCompare(
  store: EvidenceApplyStore,
  params: {
    compare: ManagerCompareResult;
    dualGate: DualGateCheck;
    actorCode: string;
    now?: string;
  }
): Promise<{
  outcome: 'created' | 'idempotent_existing_valid' | 'rejected';
  reason?: string;
  evidence?: PersistedEvidenceBatch;
  financialSideEffects: ReturnType<typeof sideEffectsNone>;
}> {
  const { compare, dualGate } = params;
  if (compare.fileValidationStatus !== 'FILE_VALID') {
    // Persist PARTIAL/INVALID without apply identity when caller wants durable FILE_* state.
    const persisted = await persistEvidenceBatch(store, {
      cycleScope: compare.cycleScope,
      fileValidationStatus: compare.fileValidationStatus,
      reconcileBatchId: compare.reconcileBatchId,
      evidenceIdentityKey: null,
      now: params.now,
    });
    return {
      outcome: persisted.outcome === 'created' ? 'created' : 'idempotent_existing_valid',
      evidence: persisted.evidence,
      financialSideEffects: sideEffectsNone(),
    };
  }

  if (!dualGate.ok) {
    return { outcome: 'rejected', reason: dualGate.reason || 'dual_gate_failed', financialSideEffects: sideEffectsNone() };
  }
  if (!compare.evidenceIdentityKey) {
    return { outcome: 'rejected', reason: 'missing_evidence_identity_key', financialSideEffects: sideEffectsNone() };
  }

  const persisted = await persistEvidenceBatch(store, {
    cycleScope: compare.cycleScope,
    fileValidationStatus: 'FILE_VALID',
    reconcileBatchId: compare.reconcileBatchId,
    evidenceIdentityKey: compare.evidenceIdentityKey,
    completeCycleConfirmedBy: compare.completeCycleConfirmedBy || params.actorCode,
    completeCycleConfirmedAt: compare.completeCycleConfirmedAt,
    now: params.now,
  });

  return {
    outcome: persisted.outcome,
    evidence: persisted.evidence,
    financialSideEffects: sideEffectsNone(),
  };
}

export type EnsurePendingApplyInput = {
  evidenceIdentityKey: string;
  reconcileBatchId: string;
  lines: Array<{ deductionId: string; reason: string; plannedAllocatedMilli?: number }>;
  now?: string;
};

/**
 * Apply-record-first: create PENDING durable lines before any future allocation.
 * Idempotent on evidenceIdentityKey (sole economic apply-once identity).
 * Same evidenceIdentityKey with a new reconcileBatchId does NOT create a second economic set.
 * Superseded evidenceIdentityKey MUST NOT mint a new PENDING set (Phase 4D.2.2 / H-1).
 */
export async function ensurePendingApplyRecords(
  store: EvidenceApplyStore,
  input: EnsurePendingApplyInput
): Promise<{
  outcome:
    | 'created'
    | 'idempotent_existing'
    | 'blocked_already_applied'
    | 'blocked_superseded';
  records: PersistedApplyRecord[];
  financialSideEffects: ReturnType<typeof sideEffectsNone>;
  reason?: string;
}> {
  const key = String(input.evidenceIdentityKey || '').trim();
  if (!key) throw new Error('ensurePendingApplyRecords: evidenceIdentityKey required');

  if (await hasAppliedEconomicEffect(store, key)) {
    const existing = await listApplyRecordsForEvidence(store, key);
    return {
      outcome: 'blocked_already_applied',
      records: existing,
      reason: 'evidence_already_applied',
      financialSideEffects: sideEffectsNone(),
    };
  }

  const supersededGate = await isEvidenceIdentitySupersededForApply(store, key);
  if (supersededGate.superseded) {
    // Deterministic block — reconcileBatchId must not reopen this identity.
    return {
      outcome: 'blocked_superseded',
      records: supersededGate.applyRecords,
      reason: 'evidence_identity_superseded',
      financialSideEffects: sideEffectsNone(),
    };
  }

  const existing = supersededGate.applyRecords;
  const active = existing.filter((r) => r.applyStatus === 'PENDING' || r.applyStatus === 'APPLIED');
  if (active.length > 0) {
    // Idempotent: do not mint a second set for the same evidence identity (batch id irrelevant).
    return {
      outcome: 'idempotent_existing',
      records: active,
      financialSideEffects: sideEffectsNone(),
    };
  }

  const now = String(input.now || new Date().toISOString());
  const created: PersistedApplyRecord[] = [];
  const seen = new Set<string>();

  for (const line of input.lines) {
    const deductionId = String(line.deductionId || '').trim();
    if (!deductionId || seen.has(deductionId)) continue;
    seen.add(deductionId);
    const row: PersistedApplyRecord = {
      applyRecordId: newId('ar'),
      evidenceIdentityKey: key,
      reconcileBatchId: String(input.reconcileBatchId || '').trim(),
      deductionId,
      allocatedMilli: 0, // filled by later allocation phase — not wallet apply
      reason: String(line.reason || '').trim(),
      applyStatus: 'PENDING',
      liabilityRecoverable: true,
      supersedesApplyRecordId: null,
      supersededByApplyRecordId: null,
      createdAt: now,
      updatedAt: now,
    };
    await store.appendApplyRecord(row);
    created.push(row);
  }

  return { outcome: 'created', records: created, financialSideEffects: sideEffectsNone() };
}

/**
 * Supersession foundation only (D-EVIDENCE-2 data/state).
 * Does NOT reverse wallet / mutate liability / allocate replacement.
 */
export async function markEvidenceSupersededForReplacement(
  store: EvidenceApplyStore,
  params: {
    priorEvidenceIdentityKey: string;
    replacementEvidenceIdentityKey: string;
    replacementReconcileBatchId: string;
    now?: string;
  }
): Promise<{
  outcome: 'superseded' | 'not_found' | 'noop_same_key';
  prior?: PersistedEvidenceBatch;
  financialSideEffects: ReturnType<typeof sideEffectsNone>;
}> {
  const priorKey = String(params.priorEvidenceIdentityKey || '').trim();
  const nextKey = String(params.replacementEvidenceIdentityKey || '').trim();
  if (!priorKey || !nextKey) {
    return { outcome: 'not_found', financialSideEffects: sideEffectsNone() };
  }
  if (priorKey === nextKey) {
    return { outcome: 'noop_same_key', financialSideEffects: sideEffectsNone() };
  }

  const prior = await findEvidenceByIdentityKey(store, priorKey);
  if (!prior) {
    return { outcome: 'not_found', financialSideEffects: sideEffectsNone() };
  }

  const now = String(params.now || new Date().toISOString());
  const updated: PersistedEvidenceBatch = {
    ...prior,
    evidenceLifecycleStatus: 'SUPERSEDED',
    supersededByEvidenceIdentityKey: nextKey,
    updatedAt: now,
  };
  await store.updateEvidence(prior.evidenceRecordId, updated);

  const applyRows = await listApplyRecordsForEvidence(store, priorKey);
  for (const r of applyRows) {
    if (r.applyStatus === 'SUPERSEDED' || r.applyStatus === 'REVERSED') continue;
    await store.updateApplyRecord(r.applyRecordId, {
      ...r,
      applyStatus: 'SUPERSEDED',
      liabilityRecoverable: false,
      updatedAt: now,
    });
  }

  return { outcome: 'superseded', prior: updated, financialSideEffects: sideEffectsNone() };
}

/**
 * Crash-recovery view for a later allocation phase.
 * PENDING + liabilityRecoverable ⇒ retry allocation safely once; never double-create records.
 */
export async function inspectApplyCrashRecovery(
  store: EvidenceApplyStore,
  evidenceIdentityKey: string
): Promise<{
  evidenceIdentityKey: string;
  applyRecordExists: boolean;
  allocationCompleted: boolean;
  liabilityRecoverable: boolean;
  pendingCount: number;
  appliedCount: number;
  retrySafe: boolean;
  financialSideEffects: ReturnType<typeof sideEffectsNone>;
}> {
  const rows = await listApplyRecordsForEvidence(store, evidenceIdentityKey);
  const pending = rows.filter((r) => r.applyStatus === 'PENDING');
  const applied = rows.filter((r) => r.applyStatus === 'APPLIED');
  const recoverable = pending.filter((r) => r.liabilityRecoverable);
  return {
    evidenceIdentityKey,
    applyRecordExists: rows.length > 0,
    allocationCompleted: applied.length > 0 && pending.length === 0,
    liabilityRecoverable: recoverable.length > 0,
    pendingCount: pending.length,
    appliedCount: applied.length,
    retrySafe: rows.length > 0 && applied.length === 0,
    financialSideEffects: sideEffectsNone(),
  };
}

/** Helper: confirm + identity from technical inputs (reuses 4D.1 pure rules). */
export function buildFileValidIdentity(params: {
  technical: TechnicalFileValidation;
  explicitConfirm: boolean;
  dualGate: DualGateCheck;
  actorCode: string;
  cycleScope: ManagerCompareCycleScope;
  population: Array<{ riderCode: string; actualMilli: number }>;
  confirmedAt?: string;
}): {
  fileValidationStatus: FileValidationStatus;
  evidenceIdentityKey: string | null;
  completeCycleConfirmedBy: string | null;
  completeCycleConfirmedAt: string | null;
  reason?: string;
} {
  const confirmed = confirmCompleteCycle({
    technical: params.technical,
    explicitConfirm: params.explicitConfirm,
    dualGate: params.dualGate,
    actorCode: params.actorCode,
    confirmedAt: params.confirmedAt,
  });
  if (confirmed.fileValidationStatus !== 'FILE_VALID') {
    return {
      fileValidationStatus: confirmed.fileValidationStatus,
      evidenceIdentityKey: null,
      completeCycleConfirmedBy: null,
      completeCycleConfirmedAt: null,
      reason: confirmed.reason,
    };
  }
  return {
    fileValidationStatus: 'FILE_VALID',
    evidenceIdentityKey: computeEvidenceIdentityKey(params.cycleScope, params.population),
    completeCycleConfirmedBy: confirmed.completeCycleConfirmedBy,
    completeCycleConfirmedAt: confirmed.completeCycleConfirmedAt,
  };
}

export {
  checkManagerCompareDualGate,
  evaluateTechnicalManagerFile,
  computeEvidenceIdentityKey,
};
