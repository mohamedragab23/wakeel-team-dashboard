/**
 * SRS-014 Phase 4D.5.2 — persisted-evidence authorization for production financial apply.
 *
 * Persisted Manager Compare evidence is the sole source of truth for FILE_VALID
 * and Manager confirmation. Request-body managerConfirmed is non-authoritative.
 */

import {
  isEvidenceIdentitySupersededForApply,
  listApplyRecordsForEvidence,
  type EvidenceApplyStore,
  type PersistedApplyRecord,
  type PersistedEvidenceBatch,
} from '@/lib/equipmentDeductions/evidenceApply';
import type { FileValidationStatus } from '@/lib/equipmentDeductions/managerCompare';

export type FinancialApplyAuthorizationInput = {
  evidenceStore: EvidenceApplyStore;
  evidenceIdentityKey: string;
  deductionId: string;
  /** D-PERM-1 already evaluated for the caller. */
  dualGateSatisfied: boolean;
  /**
   * Non-authoritative. Retained for API compatibility only.
   * MUST NOT authorize apply when persisted confirmation is false/missing.
   */
  requestManagerConfirmed?: boolean;
};

export type FinancialApplyAuthorizationOk = {
  ok: true;
  evidence: PersistedEvidenceBatch;
  applyRecord: PersistedApplyRecord;
  fileValidationStatus: 'FILE_VALID';
  /** Always derived from persisted evidence.completeCycleConfirmed. */
  managerConfirmed: true;
  evidenceIdentityKey: string;
  deductionId: string;
  allocatedMilli: number;
};

export type FinancialApplyAuthorizationDenied = {
  ok: false;
  reason: string;
  fileValidationStatus?: FileValidationStatus | null;
  managerConfirmed?: boolean;
  evidenceIdentityKey: string;
  deductionId: string;
};

export type FinancialApplyAuthorizationResult =
  | FinancialApplyAuthorizationOk
  | FinancialApplyAuthorizationDenied;

function denied(
  reason: string,
  base: {
    evidenceIdentityKey: string;
    deductionId: string;
    fileValidationStatus?: FileValidationStatus | null;
    managerConfirmed?: boolean;
  }
): FinancialApplyAuthorizationDenied {
  return {
    ok: false,
    reason,
    evidenceIdentityKey: base.evidenceIdentityKey,
    deductionId: base.deductionId,
    fileValidationStatus: base.fileValidationStatus ?? null,
    managerConfirmed: base.managerConfirmed,
  };
}

/**
 * Authorize a production financial apply from durable evidence + apply records.
 * Fail closed. No wallet/ledger/intent side effects.
 */
export async function authorizeProductionFinancialApply(
  input: FinancialApplyAuthorizationInput
): Promise<FinancialApplyAuthorizationResult> {
  const evidenceIdentityKey = String(input.evidenceIdentityKey || '').trim();
  const deductionId = String(input.deductionId || '').trim();
  const base = { evidenceIdentityKey, deductionId };

  if (!evidenceIdentityKey || !deductionId) {
    return denied('missing_identity', base);
  }

  if (!input.dualGateSatisfied) {
    return denied('dual_gate_not_satisfied', base);
  }

  const superseded = await isEvidenceIdentitySupersededForApply(
    input.evidenceStore,
    evidenceIdentityKey
  );
  if (superseded.superseded) {
    return denied('evidence_identity_superseded', {
      ...base,
      fileValidationStatus: superseded.evidence?.fileValidationStatus ?? null,
      managerConfirmed: superseded.evidence?.completeCycleConfirmed,
    });
  }

  const allEvidence = await input.evidenceStore.listEvidence();
  const evidence =
    allEvidence.find(
      (e) =>
        e.evidenceIdentityKey === evidenceIdentityKey &&
        e.evidenceLifecycleStatus === 'ACTIVE'
    ) ?? null;

  if (!evidence) {
    return denied('evidence_missing', base);
  }

  if (evidence.evidenceIdentityKey !== evidenceIdentityKey) {
    return denied('evidence_identity_mismatch', {
      ...base,
      fileValidationStatus: evidence.fileValidationStatus,
      managerConfirmed: evidence.completeCycleConfirmed,
    });
  }

  if (evidence.fileValidationStatus === 'FILE_PARTIAL') {
    return denied('file_partial', {
      ...base,
      fileValidationStatus: 'FILE_PARTIAL',
      managerConfirmed: evidence.completeCycleConfirmed,
    });
  }
  if (evidence.fileValidationStatus === 'FILE_INVALID') {
    return denied('file_invalid', {
      ...base,
      fileValidationStatus: 'FILE_INVALID',
      managerConfirmed: evidence.completeCycleConfirmed,
    });
  }
  if (evidence.fileValidationStatus !== 'FILE_VALID') {
    return denied('not_file_valid', {
      ...base,
      fileValidationStatus: evidence.fileValidationStatus,
      managerConfirmed: evidence.completeCycleConfirmed,
    });
  }

  // Persisted confirmation only — requestManagerConfirmed is ignored.
  if (evidence.completeCycleConfirmed !== true) {
    return denied('manager_confirmation_missing', {
      ...base,
      fileValidationStatus: 'FILE_VALID',
      managerConfirmed: false,
    });
  }

  const applyRows = await listApplyRecordsForEvidence(input.evidenceStore, evidenceIdentityKey);
  const applyRecord =
    applyRows.find(
      (r) =>
        r.deductionId === deductionId &&
        r.evidenceIdentityKey === evidenceIdentityKey &&
        r.applyStatus === 'APPLIED'
    ) ?? null;

  if (!applyRecord) {
    const anyForDeduction = applyRows.find((r) => r.deductionId === deductionId);
    if (anyForDeduction && anyForDeduction.evidenceIdentityKey !== evidenceIdentityKey) {
      return denied('apply_record_identity_mismatch', {
        ...base,
        fileValidationStatus: 'FILE_VALID',
        managerConfirmed: true,
      });
    }
    if (anyForDeduction && anyForDeduction.applyStatus !== 'APPLIED') {
      return denied('allocation_not_applied', {
        ...base,
        fileValidationStatus: 'FILE_VALID',
        managerConfirmed: true,
      });
    }
    return denied('apply_record_missing', {
      ...base,
      fileValidationStatus: 'FILE_VALID',
      managerConfirmed: true,
    });
  }

  const allocatedMilli = Math.max(0, Math.trunc(applyRecord.allocatedMilli));
  if (allocatedMilli <= 0) {
    return denied('allocated_milli_not_positive', {
      ...base,
      fileValidationStatus: 'FILE_VALID',
      managerConfirmed: true,
    });
  }

  return {
    ok: true,
    evidence,
    applyRecord,
    fileValidationStatus: 'FILE_VALID',
    managerConfirmed: true,
    evidenceIdentityKey,
    deductionId,
    allocatedMilli,
  };
}
