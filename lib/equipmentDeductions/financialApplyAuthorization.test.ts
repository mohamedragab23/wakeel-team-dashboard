/**
 * SRS-014 Phase 4D.5.2 — persisted-evidence authorization regressions.
 * ZERO wallet / ledger / intent mutations in this suite.
 */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  authorizeProductionFinancialApply,
} from '@/lib/equipmentDeductions/financialApplyAuthorization';
import {
  createMemoryEvidenceApplyStore,
  markEvidenceSupersededForReplacement,
  persistEvidenceBatch,
} from '@/lib/equipmentDeductions/evidenceApply';
import { computeEvidenceIdentityKey } from '@/lib/equipmentDeductions/managerCompare';

const scope = {
  cycleId: 'C1',
  cycleLabel: 'الأولى',
  monthLabel: 'أغسطس',
  year: 2026,
};

async function seedEvidence(params: {
  fileValidationStatus: 'FILE_VALID' | 'FILE_PARTIAL' | 'FILE_INVALID';
  confirmed: boolean;
  withApplied?: boolean;
  allocatedMilli?: number;
  identity?: string;
}) {
  const store = createMemoryEvidenceApplyStore();
  const identity =
    params.identity ||
    computeEvidenceIdentityKey(scope, [{ riderCode: 'R1', actualMilli: 30000 }]);

  if (params.fileValidationStatus === 'FILE_VALID') {
    await persistEvidenceBatch(store, {
      cycleScope: scope,
      fileValidationStatus: 'FILE_VALID',
      reconcileBatchId: 'rb1',
      evidenceIdentityKey: identity,
      completeCycleConfirmedBy: params.confirmed ? 'admin' : null,
      completeCycleConfirmedAt: params.confirmed ? 't' : null,
    });
    if (!params.confirmed) {
      // persistEvidenceBatch sets completeCycleConfirmed true for FILE_VALID — force false.
      store.evidence[0]!.completeCycleConfirmed = false;
      store.evidence[0]!.completeCycleConfirmedBy = null;
      store.evidence[0]!.completeCycleConfirmedAt = null;
    }
  } else {
    await persistEvidenceBatch(store, {
      cycleScope: scope,
      fileValidationStatus: params.fileValidationStatus,
      reconcileBatchId: 'rb1',
      evidenceIdentityKey: null,
    });
    // Attach identity key for mismatch/partial scenarios that still need a lookup key.
    store.evidence[0]!.evidenceIdentityKey = identity;
    store.evidence[0]!.completeCycleConfirmed = params.confirmed;
  }

  if (params.withApplied !== false && params.fileValidationStatus === 'FILE_VALID' && params.confirmed) {
    await store.appendApplyRecord({
      applyRecordId: 'ar1',
      evidenceIdentityKey: identity,
      reconcileBatchId: 'rb1',
      deductionId: 'E1',
      allocatedMilli: params.allocatedMilli ?? 30000,
      reason: 'معدات',
      applyStatus: 'APPLIED',
      liabilityRecoverable: false,
      supersedesApplyRecordId: null,
      supersededByApplyRecordId: null,
      createdAt: 't',
      updatedAt: 't',
    });
  } else if (params.withApplied && params.fileValidationStatus === 'FILE_VALID') {
    await store.appendApplyRecord({
      applyRecordId: 'ar1',
      evidenceIdentityKey: identity,
      reconcileBatchId: 'rb1',
      deductionId: 'E1',
      allocatedMilli: params.allocatedMilli ?? 30000,
      reason: 'معدات',
      applyStatus: 'APPLIED',
      liabilityRecoverable: false,
      supersedesApplyRecordId: null,
      supersededByApplyRecordId: null,
      createdAt: 't',
      updatedAt: 't',
    });
  }

  return { store, identity };
}

describe('Phase 4D.5.2 — persisted evidence authorization', () => {
  it('1: request managerConfirmed=true + persisted confirmation=false → BLOCKED', async () => {
    const { store, identity } = await seedEvidence({
      fileValidationStatus: 'FILE_VALID',
      confirmed: false,
      withApplied: true,
    });
    const r = await authorizeProductionFinancialApply({
      evidenceStore: store,
      evidenceIdentityKey: identity,
      deductionId: 'E1',
      dualGateSatisfied: true,
      requestManagerConfirmed: true,
    });
    assert.equal(r.ok, false);
    if (!r.ok) assert.equal(r.reason, 'manager_confirmation_missing');
  });

  it('2: request managerConfirmed=true + persisted confirmation missing → BLOCKED', async () => {
    const { store, identity } = await seedEvidence({
      fileValidationStatus: 'FILE_VALID',
      confirmed: false,
      withApplied: true,
    });
    store.evidence[0]!.completeCycleConfirmed = false;
    const r = await authorizeProductionFinancialApply({
      evidenceStore: store,
      evidenceIdentityKey: identity,
      deductionId: 'E1',
      dualGateSatisfied: true,
      requestManagerConfirmed: true,
    });
    assert.equal(r.ok, false);
  });

  it('3: request managerConfirmed=false + persisted confirmation=true → follows persisted (AUTHORIZED)', async () => {
    const { store, identity } = await seedEvidence({
      fileValidationStatus: 'FILE_VALID',
      confirmed: true,
      withApplied: true,
    });
    const r = await authorizeProductionFinancialApply({
      evidenceStore: store,
      evidenceIdentityKey: identity,
      deductionId: 'E1',
      dualGateSatisfied: true,
      requestManagerConfirmed: false,
    });
    assert.equal(r.ok, true);
    if (r.ok) {
      assert.equal(r.managerConfirmed, true);
      assert.equal(r.fileValidationStatus, 'FILE_VALID');
    }
  });

  it('4: persisted FILE_PARTIAL + request managerConfirmed=true → BLOCKED', async () => {
    const { store, identity } = await seedEvidence({
      fileValidationStatus: 'FILE_PARTIAL',
      confirmed: true,
    });
    const r = await authorizeProductionFinancialApply({
      evidenceStore: store,
      evidenceIdentityKey: identity,
      deductionId: 'E1',
      dualGateSatisfied: true,
      requestManagerConfirmed: true,
    });
    assert.equal(r.ok, false);
    if (!r.ok) assert.equal(r.reason, 'file_partial');
  });

  it('5: persisted FILE_INVALID + request managerConfirmed=true → BLOCKED', async () => {
    const { store, identity } = await seedEvidence({
      fileValidationStatus: 'FILE_INVALID',
      confirmed: true,
    });
    const r = await authorizeProductionFinancialApply({
      evidenceStore: store,
      evidenceIdentityKey: identity,
      deductionId: 'E1',
      dualGateSatisfied: true,
      requestManagerConfirmed: true,
    });
    assert.equal(r.ok, false);
    if (!r.ok) assert.equal(r.reason, 'file_invalid');
  });

  it('6: persisted FILE_VALID + confirmation=true → authorization proceeds', async () => {
    const { store, identity } = await seedEvidence({
      fileValidationStatus: 'FILE_VALID',
      confirmed: true,
      withApplied: true,
      allocatedMilli: 30000,
    });
    const r = await authorizeProductionFinancialApply({
      evidenceStore: store,
      evidenceIdentityKey: identity,
      deductionId: 'E1',
      dualGateSatisfied: true,
      requestManagerConfirmed: undefined,
    });
    assert.equal(r.ok, true);
    if (r.ok) {
      assert.equal(r.allocatedMilli, 30000);
      assert.equal(r.applyRecord.applyStatus, 'APPLIED');
    }
  });

  it('7: evidenceIdentityKey mismatch → BLOCKED', async () => {
    const { store } = await seedEvidence({
      fileValidationStatus: 'FILE_VALID',
      confirmed: true,
      withApplied: true,
    });
    const r = await authorizeProductionFinancialApply({
      evidenceStore: store,
      evidenceIdentityKey: 'not-the-persisted-key',
      deductionId: 'E1',
      dualGateSatisfied: true,
      requestManagerConfirmed: true,
    });
    assert.equal(r.ok, false);
    if (!r.ok) assert.equal(r.reason, 'evidence_missing');
  });

  it('8: superseded evidence → BLOCKED', async () => {
    const { store, identity } = await seedEvidence({
      fileValidationStatus: 'FILE_VALID',
      confirmed: true,
      withApplied: true,
    });
    const replacement = computeEvidenceIdentityKey(scope, [
      { riderCode: 'R1', actualMilli: 29999 },
    ]);
    await markEvidenceSupersededForReplacement(store, {
      priorEvidenceIdentityKey: identity,
      replacementEvidenceIdentityKey: replacement,
      replacementReconcileBatchId: 'rb2',
      replacementCycleScope: scope,
      actorCode: 'admin',
    });
    const r = await authorizeProductionFinancialApply({
      evidenceStore: store,
      evidenceIdentityKey: identity,
      deductionId: 'E1',
      dualGateSatisfied: true,
      requestManagerConfirmed: true,
    });
    assert.equal(r.ok, false);
    if (!r.ok) assert.equal(r.reason, 'evidence_identity_superseded');
  });

  it('9: D-PERM-1 failure → BLOCKED', async () => {
    const { store, identity } = await seedEvidence({
      fileValidationStatus: 'FILE_VALID',
      confirmed: true,
      withApplied: true,
    });
    const r = await authorizeProductionFinancialApply({
      evidenceStore: store,
      evidenceIdentityKey: identity,
      deductionId: 'E1',
      dualGateSatisfied: false,
      requestManagerConfirmed: true,
    });
    assert.equal(r.ok, false);
    if (!r.ok) assert.equal(r.reason, 'dual_gate_not_satisfied');
  });

  it('10: authorization failures perform ZERO financial mutations (pure gate)', async () => {
    const { store, identity } = await seedEvidence({
      fileValidationStatus: 'FILE_VALID',
      confirmed: false,
      withApplied: true,
    });
    const beforeEvidence = JSON.stringify(store.evidence);
    const beforeApply = JSON.stringify(store.applyRecords);
    await authorizeProductionFinancialApply({
      evidenceStore: store,
      evidenceIdentityKey: identity,
      deductionId: 'E1',
      dualGateSatisfied: true,
      requestManagerConfirmed: true,
    });
    assert.equal(JSON.stringify(store.evidence), beforeEvidence);
    assert.equal(JSON.stringify(store.applyRecords), beforeApply);
  });
});
