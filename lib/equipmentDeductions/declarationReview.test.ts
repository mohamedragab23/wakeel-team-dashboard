import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  buildDeclarationNotes,
  evaluatePostDeclarationReview,
  isFinalAuthoritativeDeclaration,
  parseMissingLiabilityOutcome,
  FINAL_AUTHORITATIVE_TAG,
} from '@/lib/equipmentDeductions/declarationReview';

describe('declarationReview — fresh final + admin queues', () => {
  it('marks FINAL_AUTHORITATIVE and parses missing outcomes A–E', () => {
    const notes = buildDeclarationNotes({
      userNote: 'اختبار',
      missingLiabilityOutcome: 'OWES',
    });
    assert.ok(notes.includes(FINAL_AUTHORITATIVE_TAG));
    assert.equal(parseMissingLiabilityOutcome(notes), 'OWES');
    assert.equal(isFinalAuthoritativeDeclaration({ notes }), true);
    assert.equal(isFinalAuthoritativeDeclaration({ notes: 'old sparse' }), false);
  });

  it('missing OWES/PARTIAL → ADMIN_LIABILITY_CREATION_REQUIRED (no invent)', () => {
    const r = evaluatePostDeclarationReview({
      hasLiability: false,
      declaration: {
        declarationId: 'd',
        riderCode: '1',
        riderName: '',
        supervisorCode: '',
        supervisorName: '',
        cycleId: 'c',
        cycleLabel: '',
        monthLabel: '',
        year: 2026,
        paymentStatus: 'NOT_PAID',
        declaredPaidMilli: 0,
        originalLiabilityMilli: 0,
        notes: buildDeclarationNotes({ missingLiabilityOutcome: 'OWES' }),
        createdAt: '',
        supersedesDeclarationId: '',
      },
      originalLiabilityMilli: 0,
      settlementPaidMilli: 0,
      amountDeductedMilli: 0,
      outstandingMilli: null,
      sheetActualMilli: 20000,
      hadSheetVsLedgerDisagree: false,
    });
    assert.equal(r.exceptionCode, 'ADMIN_LIABILITY_CREATION_REQUIRED');
    assert.equal(r.adminLiabilityCreationRequired, true);
    assert.equal(r.operationalHint, 'YELLOW');
  });

  it('missing NO_EQUIPMENT / FULLY_PAID → GREEN no request', () => {
    const r = evaluatePostDeclarationReview({
      hasLiability: false,
      declaration: {
        declarationId: 'd',
        riderCode: '1',
        riderName: '',
        supervisorCode: '',
        supervisorName: '',
        cycleId: 'c',
        cycleLabel: '',
        monthLabel: '',
        year: 2026,
        paymentStatus: 'FULLY_PAID',
        declaredPaidMilli: 0,
        originalLiabilityMilli: 0,
        notes: buildDeclarationNotes({ missingLiabilityOutcome: 'NO_EQUIPMENT' }),
        createdAt: '',
        supersedesDeclarationId: '',
      },
      originalLiabilityMilli: 0,
      settlementPaidMilli: 0,
      amountDeductedMilli: 0,
      outstandingMilli: null,
      sheetActualMilli: 0,
      hadSheetVsLedgerDisagree: false,
    });
    assert.equal(r.exceptionCode, null);
    assert.equal(r.operationalHint, 'GREEN');
  });

  it('declaration vs ledger conflict → ADMIN_LEDGER_CORRECTION_REQUIRED (no auto apply)', () => {
    const r = evaluatePostDeclarationReview({
      hasLiability: true,
      declaration: {
        declarationId: 'd',
        riderCode: '4802518',
        riderName: '',
        supervisorCode: 'WA-005',
        supervisorName: '',
        cycleId: 'c',
        cycleLabel: '',
        monthLabel: '',
        year: 2026,
        paymentStatus: 'FULLY_PAID',
        declaredPaidMilli: 90000,
        originalLiabilityMilli: 90000,
        notes: FINAL_AUTHORITATIVE_TAG,
        createdAt: '',
        supersedesDeclarationId: '',
      },
      originalLiabilityMilli: 90000,
      settlementPaidMilli: 70000,
      amountDeductedMilli: 0,
      outstandingMilli: 20000,
      sheetActualMilli: 70000,
      hadSheetVsLedgerDisagree: true,
    });
    assert.equal(r.exceptionCode, 'ADMIN_LEDGER_CORRECTION_REQUIRED');
    assert.equal(r.adminCorrectionRequired, true);
    assert.ok(r.proposedCorrection);
  });

  it('Save path never implied: review is advisory only', () => {
    // evaluatePostDeclarationReview has no side effects — contract test
    const r = evaluatePostDeclarationReview({
      hasLiability: true,
      declaration: {
        declarationId: 'd',
        riderCode: '1',
        riderName: '',
        supervisorCode: '',
        supervisorName: '',
        cycleId: 'c',
        cycleLabel: '',
        monthLabel: '',
        year: 2026,
        paymentStatus: 'NOT_PAID',
        declaredPaidMilli: 0,
        originalLiabilityMilli: 90000,
        notes: FINAL_AUTHORITATIVE_TAG,
        createdAt: '',
        supersedesDeclarationId: '',
      },
      originalLiabilityMilli: 90000,
      settlementPaidMilli: 0,
      amountDeductedMilli: 0,
      outstandingMilli: 90000,
      sheetActualMilli: 0,
      hadSheetVsLedgerDisagree: false,
    });
    assert.equal(r.agreesWithLedger, true);
    assert.equal(r.operationalHint, 'RED');
  });
});
