/**
 * SRS-014 Phase 4D.1 — Manager Compare foundation (pure).
 *
 * Read/compare + FILE_* validation + explicit complete-cycle confirmation contract.
 * No wallet / ledger_native / allocation apply / liability mutation / Sheets I/O.
 */

import { createHash, randomUUID } from 'node:crypto';
import { egpToMilliemes } from '@/lib/money';
import { adminFeatureAllowed } from '@/lib/adminFeatureAccess';
import { adminHasPermission } from '@/lib/adminPermissions';
import type { DeductionObligation } from '@/lib/equipmentDeductions/obligations';
import { isEconomicallyConsistent } from '@/lib/equipmentDeductions/obligations';

/** SRS §7 Manager Excel validation states (not obligation PARTIALLY_ALLOCATED). */
export type FileValidationStatus = 'FILE_INVALID' | 'FILE_PARTIAL' | 'FILE_VALID';

export type ManagerCompareCycleScope = {
  /** Prefer payout cycleId when known. */
  cycleId?: string;
  cycleLabel: string;
  monthLabel: string;
  year: number;
};

export type TechnicalFileValidation =
  | { ok: true; riderCount: number; parseErrorCount: number }
  | { ok: false; reason: string; parseErrorCount: number };

export type ManagerActualByRider = {
  riderCode: string;
  /** خصم_المحفظة_شيت_المدير in milliemes. */
  actualMilli: number;
};

export type RequestExposureByRider = {
  riderCode: string;
  /** Σ originalAmount of REQUEST obligations in scope (milliemes). */
  requestedMilli: number;
  /** Σ remainingAmount (open exposure). */
  remainingMilli: number;
  obligationIds: string[];
};

export type ManagerCompareLine = {
  riderCode: string;
  requestedMilli: number;
  remainingMilli: number;
  /**
   * Actual from Manager wallet column when present.
   * Under FILE_VALID, missing rider ⇒ 0. Under FILE_PARTIAL/INVALID, missing ⇒ null (not Actual=0).
   */
  actualMilli: number | null;
  deltaMilli: number | null;
  inRequestLedger: boolean;
  inManagerFile: boolean;
  /** Never implies ALLOCATED / paid. */
  treatsRequestAsActual: false;
  treatsRequestAsAllocated: false;
};

export type ManagerCompareResult = {
  cycleScope: ManagerCompareCycleScope;
  fileValidationStatus: FileValidationStatus;
  reconcileBatchId: string;
  /** Present only when FILE_VALID (apply population fingerprint). */
  evidenceIdentityKey: string | null;
  completeCycleConfirmed: boolean;
  completeCycleConfirmedBy: string | null;
  completeCycleConfirmedAt: string | null;
  lines: ManagerCompareLine[];
  /** True only when FILE_VALID — does not perform allocation. */
  allocationReady: boolean;
  financialSideEffects: {
    walletMutated: false;
    ledgerNativeWritten: false;
    amountDeductedMilliDelta: 0;
    outstandingMilliDelta: 0;
    installmentsCompletedDelta: 0;
    paidAmountIncremented: false;
    allocationApplied: false;
  };
};

export type DualGateCheck = {
  ok: boolean;
  hasReconcileFeature: boolean;
  hasVerifyPermission: boolean;
  reason?: string;
};

function sideEffectsNone(): ManagerCompareResult['financialSideEffects'] {
  return {
    walletMutated: false,
    ledgerNativeWritten: false,
    amountDeductedMilliDelta: 0,
    outstandingMilliDelta: 0,
    installmentsCompletedDelta: 0,
    paidAmountIncremented: false,
    allocationApplied: false,
  };
}

/** Audit/upload identity only — never an economic apply-once key. */
export function newReconcileBatchId(): string {
  if (typeof randomUUID === 'function') return `rb_${randomUUID()}`;
  return `rb_${Date.now()}_${Math.random().toString(36).slice(2)}`;
}

/** Normalized cycle scope string for evidenceIdentityKey (D-EVIDENCE-1). */
export function normalizeCycleScopeKey(scope: ManagerCompareCycleScope): string {
  const id = String(scope.cycleId || '').trim();
  if (id) return `cycleId:${id}`;
  return [
    'labels',
    String(scope.cycleLabel || '').trim(),
    String(scope.monthLabel || '').trim(),
    String(Math.trunc(scope.year) || ''),
  ].join('|');
}

/**
 * D-EVIDENCE-1: SHA-256 of cycle scope + sorted (riderCode, actualMilli) FILE_VALID population.
 * Call only for FILE_VALID apply populations (missing riders already included as 0).
 */
export function computeEvidenceIdentityKey(
  scope: ManagerCompareCycleScope,
  population: Array<{ riderCode: string; actualMilli: number }>
): string {
  const pairs = population
    .map((p) => ({
      riderCode: String(p.riderCode || '').replace(/\s+/g, '').trim(),
      actualMilli: Math.max(0, Math.trunc(p.actualMilli || 0)),
    }))
    .filter((p) => p.riderCode)
    .sort((a, b) => (a.riderCode < b.riderCode ? -1 : a.riderCode > b.riderCode ? 1 : 0));

  const lines = [
    `scope=${normalizeCycleScopeKey(scope)}`,
    ...pairs.map((p) => `${p.riderCode}=${p.actualMilli}`),
  ];
  return createHash('sha256').update(lines.join('\n'), 'utf8').digest('hex');
}

/** D-PERM-1: deductions_reconcile feature + deductions_verify permission. */
export function checkManagerCompareDualGate(decoded: {
  role?: string;
  permissions?: string | null;
} | null): DualGateCheck {
  if (!decoded || decoded.role !== 'admin') {
    return {
      ok: false,
      hasReconcileFeature: false,
      hasVerifyPermission: false,
      reason: 'not_admin',
    };
  }
  const gateUser = {
    role: decoded.role,
    permissions: decoded.permissions ?? undefined,
  };
  const hasReconcileFeature = adminFeatureAllowed(gateUser.permissions, 'deductions_reconcile');
  const hasVerifyPermission = adminHasPermission(gateUser, 'deductions_verify');
  if (!hasReconcileFeature || !hasVerifyPermission) {
    return {
      ok: false,
      hasReconcileFeature,
      hasVerifyPermission,
      reason: 'dual_gate_failed',
    };
  }
  return { ok: true, hasReconcileFeature: true, hasVerifyPermission: true };
}

/**
 * Technical validation only — never implies FILE_VALID.
 * Upload/parse success alone ⇒ at most FILE_PARTIAL path input.
 */
export function evaluateTechnicalManagerFile(params: {
  parsedValidRowCount: number;
  parseErrorCount?: number;
  requiredWalletColumnPresent?: boolean;
}): TechnicalFileValidation {
  const parseErrorCount = Math.max(0, Math.trunc(params.parseErrorCount || 0));
  if (params.requiredWalletColumnPresent === false) {
    return { ok: false, reason: 'missing_wallet_deduction_column', parseErrorCount };
  }
  if (params.parsedValidRowCount <= 0) {
    return { ok: false, reason: 'no_valid_manager_rows', parseErrorCount };
  }
  return { ok: true, riderCount: Math.trunc(params.parsedValidRowCount), parseErrorCount };
}

/**
 * Explicit confirmation is a separate action (SRS §7).
 * Does not allocate, does not write Sheets, does not mutate wallet.
 */
export function confirmCompleteCycle(params: {
  technical: TechnicalFileValidation;
  explicitConfirm: boolean;
  dualGate: DualGateCheck;
  actorCode: string;
  confirmedAt?: string;
}): {
  fileValidationStatus: FileValidationStatus;
  completeCycleConfirmed: boolean;
  completeCycleConfirmedBy: string | null;
  completeCycleConfirmedAt: string | null;
  reason?: string;
} {
  if (!params.technical.ok) {
    return {
      fileValidationStatus: 'FILE_INVALID',
      completeCycleConfirmed: false,
      completeCycleConfirmedBy: null,
      completeCycleConfirmedAt: null,
      reason: params.technical.reason,
    };
  }

  if (!params.explicitConfirm) {
    return {
      fileValidationStatus: 'FILE_PARTIAL',
      completeCycleConfirmed: false,
      completeCycleConfirmedBy: null,
      completeCycleConfirmedAt: null,
      reason: 'confirmation_required',
    };
  }

  if (!params.dualGate.ok) {
    return {
      fileValidationStatus: 'FILE_PARTIAL',
      completeCycleConfirmed: false,
      completeCycleConfirmedBy: null,
      completeCycleConfirmedAt: null,
      reason: params.dualGate.reason || 'dual_gate_failed',
    };
  }

  const at = String(params.confirmedAt || new Date().toISOString());
  return {
    fileValidationStatus: 'FILE_VALID',
    completeCycleConfirmed: true,
    completeCycleConfirmedBy: String(params.actorCode || '').trim() || null,
    completeCycleConfirmedAt: at,
  };
}

/** FILE_VALID(C1) does not validate C2. */
export function isFileValidForCycle(
  status: FileValidationStatus,
  confirmedCycleKey: string,
  queryCycleKey: string
): boolean {
  if (status !== 'FILE_VALID') return false;
  return String(confirmedCycleKey) === String(queryCycleKey);
}

export function egpWalletToActualMilli(egp: number): number {
  return egpToMilliemes(egp);
}

/**
 * Aggregate REQUEST obligations for compare (requested ≠ paid).
 * Does not treat REQUEST as ACTUAL or ALLOCATED.
 */
export function aggregateRequestExposureByRider(
  obligations: DeductionObligation[]
): Map<string, RequestExposureByRider> {
  const map = new Map<string, RequestExposureByRider>();
  for (const o of obligations) {
    if (!isEconomicallyConsistent(o)) continue;
    if (o.status === 'cancelled' || o.status === 'replaced') continue;
    const riderCode = String(o.riderCode || '').replace(/\s+/g, '').trim();
    if (!riderCode) continue;
    let cur = map.get(riderCode);
    if (!cur) {
      cur = { riderCode, requestedMilli: 0, remainingMilli: 0, obligationIds: [] };
      map.set(riderCode, cur);
    }
    cur.requestedMilli += Math.max(0, Math.trunc(o.originalAmount));
    cur.remainingMilli += Math.max(0, Math.trunc(o.remainingAmount));
    cur.obligationIds.push(o.deductionId);
  }
  return map;
}

/**
 * Deterministic Manager Compare foundation result.
 * allocationReady is a gate only — never applies allocation.
 */
export function buildManagerCompareResult(params: {
  cycleScope: ManagerCompareCycleScope;
  fileValidationStatus: FileValidationStatus;
  obligations: DeductionObligation[];
  managerActuals: ManagerActualByRider[];
  reconcileBatchId?: string;
  completeCycleConfirmedBy?: string | null;
  completeCycleConfirmedAt?: string | null;
}): ManagerCompareResult {
  const status = params.fileValidationStatus;
  const requestMap = aggregateRequestExposureByRider(params.obligations);
  const actualMap = new Map<string, number>();
  for (const a of params.managerActuals) {
    const code = String(a.riderCode || '').replace(/\s+/g, '').trim();
    if (!code) continue;
    actualMap.set(code, Math.max(0, Math.trunc(a.actualMilli)));
  }

  const riders = new Set<string>([...requestMap.keys(), ...actualMap.keys()]);
  const sortedRiders = [...riders].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));

  const lines: ManagerCompareLine[] = [];
  for (const riderCode of sortedRiders) {
    const req = requestMap.get(riderCode);
    const inRequestLedger = !!req && (req.requestedMilli > 0 || req.remainingMilli > 0 || req.obligationIds.length > 0);
    const inManagerFile = actualMap.has(riderCode);
    const requestedMilli = req?.requestedMilli ?? 0;
    const remainingMilli = req?.remainingMilli ?? 0;

    let actualMilli: number | null;
    if (inManagerFile) {
      actualMilli = actualMap.get(riderCode)!;
    } else if (status === 'FILE_VALID') {
      // AT-12: missing rider under FILE_VALID ⇒ Actual 0
      actualMilli = 0;
    } else {
      // AT-11: FILE_PARTIAL/INVALID — missing ≠ Actual 0
      actualMilli = null;
    }

    const deltaMilli = actualMilli == null ? null : actualMilli - requestedMilli;

    lines.push({
      riderCode,
      requestedMilli,
      remainingMilli,
      actualMilli,
      deltaMilli,
      inRequestLedger,
      inManagerFile,
      treatsRequestAsActual: false,
      treatsRequestAsAllocated: false,
    });
  }

  let evidenceIdentityKey: string | null = null;
  if (status === 'FILE_VALID') {
    const population = lines.map((l) => ({
      riderCode: l.riderCode,
      actualMilli: l.actualMilli ?? 0,
    }));
    evidenceIdentityKey = computeEvidenceIdentityKey(params.cycleScope, population);
  }

  return {
    cycleScope: params.cycleScope,
    fileValidationStatus: status,
    reconcileBatchId: params.reconcileBatchId || newReconcileBatchId(),
    evidenceIdentityKey,
    completeCycleConfirmed: status === 'FILE_VALID',
    completeCycleConfirmedBy: status === 'FILE_VALID' ? params.completeCycleConfirmedBy ?? null : null,
    completeCycleConfirmedAt: status === 'FILE_VALID' ? params.completeCycleConfirmedAt ?? null : null,
    lines,
    allocationReady: status === 'FILE_VALID',
    financialSideEffects: sideEffectsNone(),
  };
}

/** Contract stub for later allocation phase — must not be invoked to mutate money in 4D.1. */
export type AllocationPrepContract = {
  evidenceIdentityKey: string;
  reconcileBatchId: string;
  cycleScope: ManagerCompareCycleScope;
  /** Rider actuals including FILE_VALID zeros for missing riders. */
  actualByRiderMilli: Record<string, number>;
  allocationReady: true;
  /** Explicit: prep ≠ apply. */
  applied: false;
};

export function prepareAllocationContract(
  compare: ManagerCompareResult
): AllocationPrepContract | { ok: false; reason: string } {
  if (!compare.allocationReady || compare.fileValidationStatus !== 'FILE_VALID') {
    return { ok: false, reason: 'not_file_valid' };
  }
  if (!compare.evidenceIdentityKey) {
    return { ok: false, reason: 'missing_evidence_identity_key' };
  }
  const actualByRiderMilli: Record<string, number> = {};
  for (const line of compare.lines) {
    actualByRiderMilli[line.riderCode] = line.actualMilli ?? 0;
  }
  return {
    evidenceIdentityKey: compare.evidenceIdentityKey,
    reconcileBatchId: compare.reconcileBatchId,
    cycleScope: compare.cycleScope,
    actualByRiderMilli,
    allocationReady: true,
    applied: false,
  };
}
