/**
 * SRS-014 Phase 4D.1 — Manager Compare foundation tests.
 * No wallet / ledger / allocation apply / Sheets I/O.
 */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  aggregateRequestExposureByRider,
  buildManagerCompareResult,
  checkManagerCompareDualGate,
  computeEvidenceIdentityKey,
  confirmCompleteCycle,
  egpWalletToActualMilli,
  evaluateTechnicalManagerFile,
  isFileValidForCycle,
  newReconcileBatchId,
  prepareAllocationContract,
} from '@/lib/equipmentDeductions/managerCompare';
import { createRequestObligation } from '@/lib/equipmentDeductions/obligations';

const scope = {
  cycleId: 'C1',
  cycleLabel: 'الأولى',
  monthLabel: 'أغسطس',
  year: 2026,
};

describe('Phase 4D.1 — Manager Compare foundation', () => {
  it('technical OK alone is never FILE_VALID (confirmation required)', () => {
    const technical = evaluateTechnicalManagerFile({ parsedValidRowCount: 3, parseErrorCount: 0 });
    assert.equal(technical.ok, true);
    const unconfirmed = confirmCompleteCycle({
      technical,
      explicitConfirm: false,
      dualGate: { ok: true, hasReconcileFeature: true, hasVerifyPermission: true },
      actorCode: 'admin1',
    });
    assert.equal(unconfirmed.fileValidationStatus, 'FILE_PARTIAL');
    assert.equal(unconfirmed.completeCycleConfirmed, false);
  });

  it('FILE_INVALID when technical validation fails even if confirm attempted', () => {
    const technical = evaluateTechnicalManagerFile({ parsedValidRowCount: 0 });
    assert.equal(technical.ok, false);
    const r = confirmCompleteCycle({
      technical,
      explicitConfirm: true,
      dualGate: { ok: true, hasReconcileFeature: true, hasVerifyPermission: true },
      actorCode: 'admin1',
    });
    assert.equal(r.fileValidationStatus, 'FILE_INVALID');
  });

  it('explicit confirm + dual-gate ⇒ FILE_VALID', () => {
    const technical = evaluateTechnicalManagerFile({ parsedValidRowCount: 2 });
    const r = confirmCompleteCycle({
      technical,
      explicitConfirm: true,
      dualGate: { ok: true, hasReconcileFeature: true, hasVerifyPermission: true },
      actorCode: 'admin1',
      confirmedAt: '2026-08-11T12:00:00.000Z',
    });
    assert.equal(r.fileValidationStatus, 'FILE_VALID');
    assert.equal(r.completeCycleConfirmed, true);
    assert.equal(r.completeCycleConfirmedBy, 'admin1');
  });

  it('D-PERM-1 dual-gate: feature + verify required', () => {
    assert.equal(checkManagerCompareDualGate(null).ok, false);
    assert.equal(checkManagerCompareDualGate({ role: 'supervisor', permissions: 'all' }).ok, false);
    // empty permissions: feature OK for full admin, verify denied
    const noVerify = checkManagerCompareDualGate({ role: 'admin', permissions: '' });
    assert.equal(noVerify.hasReconcileFeature, true);
    assert.equal(noVerify.hasVerifyPermission, false);
    assert.equal(noVerify.ok, false);
    const ok = checkManagerCompareDualGate({
      role: 'admin',
      permissions: 'deductions_verify,deductions_reconcile',
    });
    assert.equal(ok.ok, true);
    // confirm without dual gate stays PARTIAL
    const blocked = confirmCompleteCycle({
      technical: evaluateTechnicalManagerFile({ parsedValidRowCount: 1 }),
      explicitConfirm: true,
      dualGate: noVerify,
      actorCode: 'x',
    });
    assert.equal(blocked.fileValidationStatus, 'FILE_PARTIAL');
  });

  it('AT-10: FILE_VALID(C1) does not validate C2', () => {
    assert.equal(isFileValidForCycle('FILE_VALID', 'C1', 'C1'), true);
    assert.equal(isFileValidForCycle('FILE_VALID', 'C1', 'C2'), false);
    assert.equal(isFileValidForCycle('FILE_PARTIAL', 'C1', 'C1'), false);
  });

  it('deterministic compare: same inputs ⇒ same ordered lines + same evidence key', () => {
    const obligations = [
      createRequestObligation({
        deductionId: 'D2',
        source: 'supervisor',
        riderCode: '2002',
        reason: 'سلفة',
        originalCycleId: 'C1',
        originalAmount: 20000,
        obligationAgeKey: '2',
      }),
      createRequestObligation({
        deductionId: 'D1',
        source: 'auto_equipment',
        riderCode: '1001',
        reason: 'معدات',
        originalCycleId: 'C1',
        originalAmount: 30000,
        obligationAgeKey: '1',
        equipmentIssueId: 'E1',
        installmentNumber: 1,
      }),
    ];
    const actuals = [
      { riderCode: '2002', actualMilli: egpWalletToActualMilli(150) },
      { riderCode: '1001', actualMilli: egpWalletToActualMilli(300) },
    ];
    const a = buildManagerCompareResult({
      cycleScope: scope,
      fileValidationStatus: 'FILE_VALID',
      obligations,
      managerActuals: actuals,
      reconcileBatchId: 'rb_fixed',
      completeCycleConfirmedBy: 'a',
      completeCycleConfirmedAt: 't',
    });
    const b = buildManagerCompareResult({
      cycleScope: scope,
      fileValidationStatus: 'FILE_VALID',
      obligations: [...obligations].reverse(),
      managerActuals: [...actuals].reverse(),
      reconcileBatchId: 'rb_fixed',
      completeCycleConfirmedBy: 'a',
      completeCycleConfirmedAt: 't',
    });
    assert.deepEqual(
      a.lines.map((l) => l.riderCode),
      ['1001', '2002']
    );
    assert.equal(a.evidenceIdentityKey, b.evidenceIdentityKey);
    assert.ok(a.evidenceIdentityKey);
    assert.equal(a.allocationReady, true);
  });

  it('AT-11: FILE_PARTIAL missing rider ⇒ actualMilli null (not 0); no allocationReady', () => {
    const obligations = [
      createRequestObligation({
        deductionId: 'D1',
        source: 'auto_equipment',
        riderCode: '1001',
        reason: 'معدات',
        originalCycleId: 'C1',
        originalAmount: 30000,
        obligationAgeKey: '1',
        equipmentIssueId: 'E1',
        installmentNumber: 1,
      }),
    ];
    const r = buildManagerCompareResult({
      cycleScope: scope,
      fileValidationStatus: 'FILE_PARTIAL',
      obligations,
      managerActuals: [],
      reconcileBatchId: 'rb1',
    });
    assert.equal(r.lines[0].actualMilli, null);
    assert.equal(r.allocationReady, false);
    assert.equal(r.evidenceIdentityKey, null);
    assert.equal(r.lines[0].treatsRequestAsActual, false);
    assert.equal(r.lines[0].treatsRequestAsAllocated, false);
  });

  it('AT-11b: FILE_INVALID ⇒ not allocationReady', () => {
    const r = buildManagerCompareResult({
      cycleScope: scope,
      fileValidationStatus: 'FILE_INVALID',
      obligations: [],
      managerActuals: [{ riderCode: '1', actualMilli: 100 }],
      reconcileBatchId: 'rb1',
    });
    assert.equal(r.allocationReady, false);
    assert.equal(prepareAllocationContract(r).ok, false);
  });

  it('AT-12: FILE_VALID missing rider ⇒ Actual 0; REQUEST still not ACTUAL/ALLOCATED', () => {
    const obligations = [
      createRequestObligation({
        deductionId: 'D1',
        source: 'auto_equipment',
        riderCode: '1001',
        reason: 'معدات',
        originalCycleId: 'C1',
        originalAmount: 30000,
        obligationAgeKey: '1',
        equipmentIssueId: 'E1',
        installmentNumber: 1,
      }),
    ];
    const r = buildManagerCompareResult({
      cycleScope: scope,
      fileValidationStatus: 'FILE_VALID',
      obligations,
      managerActuals: [],
      reconcileBatchId: 'rb1',
      completeCycleConfirmedBy: 'admin',
      completeCycleConfirmedAt: 't',
    });
    assert.equal(r.lines[0].actualMilli, 0);
    assert.equal(r.lines[0].remainingMilli, 30000);
    assert.equal(r.lines[0].treatsRequestAsActual, false);
    assert.equal(r.lines[0].treatsRequestAsAllocated, false);
    assert.deepEqual(r.financialSideEffects, {
      walletMutated: false,
      ledgerNativeWritten: false,
      amountDeductedMilliDelta: 0,
      outstandingMilliDelta: 0,
      installmentsCompletedDelta: 0,
      paidAmountIncremented: false,
      allocationApplied: false,
    });
  });

  it('REQUEST exposure never treats paidAmount as collection from compare', () => {
    const o = createRequestObligation({
      deductionId: 'D9',
      source: 'supervisor',
      riderCode: '9',
      reason: 'سلفة',
      originalCycleId: 'C1',
      originalAmount: 10000,
      obligationAgeKey: '1',
    });
    assert.equal(o.paidAmount, 0);
    const map = aggregateRequestExposureByRider([o]);
    assert.equal(map.get('9')!.requestedMilli, 10000);
    assert.equal(map.get('9')!.remainingMilli, 10000);
  });

  it('evidenceIdentityKey ignores reconcileBatchId (audit-only)', () => {
    const pop = [
      { riderCode: 'A', actualMilli: 100 },
      { riderCode: 'B', actualMilli: 0 },
    ];
    const k1 = computeEvidenceIdentityKey(scope, pop);
    const k2 = computeEvidenceIdentityKey(scope, [...pop].reverse());
    assert.equal(k1, k2);
    const otherCycle = computeEvidenceIdentityKey({ ...scope, cycleId: 'C2' }, pop);
    assert.notEqual(k1, otherCycle);
    const b1 = newReconcileBatchId();
    const b2 = newReconcileBatchId();
    assert.notEqual(b1, b2);
    // batch id is not part of evidence key inputs
    assert.equal(computeEvidenceIdentityKey(scope, pop), k1);
  });

  it('prepareAllocationContract is prep-only (applied=false); H-1 deltas stay 0', () => {
    const r = buildManagerCompareResult({
      cycleScope: scope,
      fileValidationStatus: 'FILE_VALID',
      obligations: [
        createRequestObligation({
          deductionId: 'D1',
          source: 'auto_equipment',
          riderCode: '1001',
          reason: 'معدات',
          originalCycleId: 'C1',
          originalAmount: 30000,
          obligationAgeKey: '1',
          equipmentIssueId: 'E1',
          installmentNumber: 1,
        }),
      ],
      managerActuals: [{ riderCode: '1001', actualMilli: 25000 }],
      reconcileBatchId: 'rb_prep',
      completeCycleConfirmedBy: 'a',
      completeCycleConfirmedAt: 't',
    });
    const prep = prepareAllocationContract(r);
    assert.equal('ok' in prep && prep.ok === false, false);
    if ('applied' in prep) {
      assert.equal(prep.applied, false);
      assert.equal(prep.allocationReady, true);
      assert.equal(prep.evidenceIdentityKey, r.evidenceIdentityKey);
    }
    assert.equal(r.financialSideEffects.installmentsCompletedDelta, 0);
    assert.equal(r.financialSideEffects.allocationApplied, false);
  });
});
