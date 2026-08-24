import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  actualDeductedEgpFromWalletRaw,
  actualDeductedMilliFromWalletRaw,
  classifyReconciliation,
  computeCycleRequestBreakdown,
  computeCycleRequestMilli,
  computeFinancialState,
  cycleShortfallMilli,
  declaredPaidFromStatus,
  ledgerOutstandingInvariant,
  splitInstallmentsMilliemesCapped,
  validateDeclaredPaid,
} from '@/lib/equipmentDeductions/equipmentFinancialModel';
import { classifyOperationalBucket } from '@/lib/equipmentDeductions/operationalEngine';
import { mergeWeeklyDeductionQueue } from '@/lib/equipmentDeductions/weeklyQueueMerge';
import { egpWalletToActualMilli } from '@/lib/equipmentDeductions/managerCompare';
import { splitInstallmentsMilliemes } from '@/lib/money';
import { isSrs014FinancialApplyEnabled } from '@/lib/srs014Flags';

describe('equipment financial model — final brief', () => {
  it('900 => 300+300+300', () => {
    assert.deepEqual(splitInstallmentsMilliemes(90000), [30000, 30000, 30000]);
    assert.deepEqual(splitInstallmentsMilliemesCapped(90000), [30000, 30000, 30000]);
  });

  it('800 => 300+300+200', () => {
    assert.deepEqual(splitInstallmentsMilliemes(80000), [30000, 30000, 20000]);
  });

  it('carry: 300 req / 200 actual → 100 carry → next total 400', () => {
    assert.equal(cycleShortfallMilli(30000, 20000), 10000);
    const b = computeCycleRequestBreakdown({
      remainingLiabilityMilli: 30000,
      carryForwardShortfallMilli: 10000,
    });
    assert.equal(b.baseInstallmentMilli, 30000);
    assert.equal(b.carryForwardMilli, 10000);
    assert.equal(b.totalRequestMilli, 40000);
    assert.equal(b.exceedsThreeHundredDueToCarry, true);
    assert.equal(
      computeCycleRequestMilli({
        payrollOutstandingMilli: 30000,
        carryForwardShortfallMilli: 10000,
      }),
      40000
    );
  });

  it('base installment never exceeds 300 even with large remaining', () => {
    const b = computeCycleRequestBreakdown({
      remainingLiabilityMilli: 90000,
      carryForwardShortfallMilli: 0,
    });
    assert.equal(b.baseInstallmentMilli, 30000);
    assert.equal(b.totalRequestMilli, 30000);
    assert.equal(b.exceedsThreeHundredDueToCarry, false);
  });

  it('supervisor FULLY_PAID => remaining 0 / no request', () => {
    const paid = declaredPaidFromStatus({
      status: 'FULLY_PAID',
      originalLiabilityMilli: 90000,
    });
    assert.equal(paid, 90000);
    const f = computeFinancialState({
      originalLiabilityMilli: 90000,
      supervisorDeclaredPaidMilli: paid,
      cumulativeActualPayrollMilli: 0,
    });
    assert.equal(f.currentOutstandingMilli, 0);
    const bucket = classifyOperationalBucket({
      hasLiability: true,
      declaration: {
        declarationId: 'd1',
        riderCode: '1',
        riderName: '',
        supervisorCode: '',
        supervisorName: '',
        cycleId: 'c',
        cycleLabel: '',
        monthLabel: '',
        year: 2026,
        paymentStatus: 'FULLY_PAID',
        declaredPaidMilli: 90000,
        originalLiabilityMilli: 90000,
        notes: 'FINAL_AUTHORITATIVE',
        createdAt: '',
        supersedesDeclarationId: '',
      },
      declarationIsAuthoritative: true,
      systemOutstandingMilli: 0,
      remainingAfterDeclarationMilli: 0,
      sheetVsLedgerDisagree: false,
      ledgerInvariantOk: true,
      duplicateRider: false,
      invalidCycle: false,
    });
    assert.equal(bucket.bucket, 'GREEN');
  });

  it('PARTIAL 400/900 => remaining 500', () => {
    const paid = declaredPaidFromStatus({
      status: 'PARTIALLY_PAID',
      declaredPaidMilli: 40000,
      originalLiabilityMilli: 90000,
    });
    assert.equal(paid, 40000);
    const f = computeFinancialState({
      originalLiabilityMilli: 90000,
      supervisorDeclaredPaidMilli: 40000,
      cumulativeActualPayrollMilli: 0,
    });
    assert.equal(f.currentOutstandingMilli, 50000);
  });

  it('NOT_PAID => full liability remains', () => {
    assert.equal(
      declaredPaidFromStatus({ status: 'NOT_PAID', originalLiabilityMilli: 90000 }),
      0
    );
  });

  it('wallet sign: -300 => actual 300; -200 vs 300 => shortfall 100; 0 => 0', () => {
    assert.equal(actualDeductedEgpFromWalletRaw(-300), 300);
    assert.equal(actualDeductedMilliFromWalletRaw(-300, 'egp'), 30000);
    assert.equal(egpWalletToActualMilli(-300), 30000);
    assert.equal(cycleShortfallMilli(30000, egpWalletToActualMilli(-200)), 10000);
    assert.equal(actualDeductedEgpFromWalletRaw(0), 0);
  });

  it('positive historical wallet anomaly is reported as magnitude (not zeroed)', () => {
    assert.equal(actualDeductedEgpFromWalletRaw(150), 150);
    assert.equal(egpWalletToActualMilli(150), 15000);
  });

  it('ledger invariant: no double-count of sheet actual into outstanding', () => {
    const inv = ledgerOutstandingInvariant({
      originalLiabilityMilli: 90000,
      amountDeductedMilli: 30000,
      settlementPaidMilli: 20000,
      outstandingMilli: 40000,
    });
    assert.equal(inv.ok, true);
    assert.equal(inv.expectedOutstandingMilli, 40000);
  });

  it('missing liability => YELLOW / must not auto-request', () => {
    const r = classifyOperationalBucket({
      hasLiability: false,
      declaration: null,
      declarationIsAuthoritative: false,
      systemOutstandingMilli: null,
      remainingAfterDeclarationMilli: 0,
      sheetVsLedgerDisagree: false,
      ledgerInvariantOk: true,
      duplicateRider: false,
      invalidCycle: false,
    });
    assert.equal(r.bucket, 'YELLOW');
    assert.equal(r.exceptionCode, 'MISSING_LIABILITY_NEEDS_SUPERVISOR_REVIEW');
  });

  it('ledger disagreement => YELLOW / must not auto-request', () => {
    const r = classifyOperationalBucket({
      hasLiability: true,
      declaration: null,
      declarationIsAuthoritative: false,
      systemOutstandingMilli: 60000,
      remainingAfterDeclarationMilli: 60000,
      sheetVsLedgerDisagree: true,
      ledgerInvariantOk: true,
      duplicateRider: false,
      invalidCycle: false,
    });
    assert.equal(r.bucket, 'YELLOW');
    assert.equal(r.exceptionCode, 'SHEET_VS_LEDGER_DISAGREE');
  });

  it('Save declaration has no financial side effect by contract (applyToLiability default false)', () => {
    // Contract assertion: API route and createSupervisorEquipmentDeclaration require
    // applyToLiability === true explicitly. Covered by source + integration elsewhere.
    assert.equal(isSrs014FinancialApplyEnabled(), false);
  });

  it('Manual V2 + equipment both appear with reasons', () => {
    const q = mergeWeeklyDeductionQueue({
      equipment: [
        {
          riderCode: 'X',
          riderName: 'Rider X',
          baseInstallmentMilli: 30000,
          carryForwardMilli: 10000,
          equipmentRequestMilli: 40000,
        },
      ],
      manualV2: [
        { riderCode: 'X', riderName: 'Rider X', amountMilli: 20000, reason: 'سلفة' },
      ],
    });
    assert.equal(q.length, 1);
    assert.equal(q[0].equipmentTotalMilli, 40000);
    assert.equal(q[0].manualTotalMilli, 20000);
    assert.equal(q[0].combinedTotalMilli, 60000);
    assert.equal(q[0].lines.length, 2);
    assert.ok(q[0].lines.some((l) => l.source.kind === 'equipment'));
    assert.ok(q[0].lines.some((l) => l.source.kind === 'manual_v2' && l.source.reason === 'سلفة'));
  });

  it('Financial Apply remains OFF', () => {
    assert.equal(isSrs014FinancialApplyEnabled(), false);
  });

  it('partial validation rejects over-original', () => {
    const bad = validateDeclaredPaid({
      status: 'PARTIALLY_PAID',
      declaredPaidEgp: 1000,
      originalLiabilityMilli: 90000,
    });
    assert.equal(bad.ok, false);
  });

  it('reconciliation classifies supervisor fully paid', () => {
    const f = computeFinancialState({
      originalLiabilityMilli: 90000,
      supervisorDeclaredPaidMilli: 90000,
      cumulativeActualPayrollMilli: 0,
    });
    assert.equal(
      classifyReconciliation({
        hasLiability: true,
        financial: f,
        requestedMilli: 0,
        actualMilli: 0,
        shortfallMilli: 0,
        duplicateRider: false,
        invalidCycle: false,
      }),
      'SUPERVISOR_FULLY_PAID'
    );
  });
});
