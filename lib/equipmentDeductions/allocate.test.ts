import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { allocateActualToObligations } from '@/lib/equipmentDeductions/allocate';
import {
  createRequestObligation,
  isEconomicallyConsistent,
  type DeductionObligation,
} from '@/lib/equipmentDeductions/obligations';

function eq(partial: {
  deductionId: string;
  originalAmount: number;
  obligationAgeKey: string;
  equipmentIssueId?: string;
  installmentNumber?: number;
  originalCycleId?: string;
}): DeductionObligation {
  return createRequestObligation({
    deductionId: partial.deductionId,
    source: 'auto_equipment',
    riderCode: 'R1',
    reason: 'معدات',
    originalCycleId: partial.originalCycleId || 'C1',
    originalAmount: partial.originalAmount,
    obligationAgeKey: partial.obligationAgeKey,
    equipmentIssueId: partial.equipmentIssueId || 'ISSUE-A',
    installmentNumber: partial.installmentNumber ?? 1,
  });
}

function loan(partial: {
  deductionId: string;
  originalAmount: number;
  obligationAgeKey: string;
  reason?: 'سلفة' | 'خصم تشغيل' | 'استعلام أمني' | 'مديونية سابقة';
}): DeductionObligation {
  return createRequestObligation({
    deductionId: partial.deductionId,
    source: 'supervisor',
    riderCode: 'R1',
    reason: partial.reason || 'سلفة',
    originalCycleId: 'C1',
    originalAmount: partial.originalAmount,
    obligationAgeKey: partial.obligationAgeKey,
  });
}

describe('Phase 4A pure obligations + allocation', () => {
  it('AT-01: REQUEST starts paid=0 remaining=original', () => {
    const o = createRequestObligation({
      deductionId: 'D1',
      source: 'auto_equipment',
      riderCode: 'R1',
      reason: 'معدات',
      originalCycleId: 'C1',
      originalAmount: 50000,
      obligationAgeKey: '1',
      equipmentIssueId: 'E1',
      installmentNumber: 1,
    });
    assert.equal(o.paidAmount, 0);
    assert.equal(o.remainingAmount, 50000);
    assert.equal(o.originalAmount, 50000);
    assert.equal(o.status, 'open');
    assert.ok(isEconomicallyConsistent(o));
  });

  it('AT-02: Equipment allocated before non-equipment', () => {
    const obligations = [
      loan({ deductionId: 'L1', originalAmount: 20000, obligationAgeKey: '0' }),
      eq({ deductionId: 'E1', originalAmount: 50000, obligationAgeKey: '10', equipmentIssueId: 'ISSUE-1' }),
    ];
    const r = allocateActualToObligations({ actualTotalMilli: 50000, obligations });
    assert.equal(r.lines.length, 1);
    assert.equal(r.lines[0].deductionId, 'E1');
    assert.equal(r.lines[0].allocatedAmount, 50000);
    const loanAfter = r.obligationsAfter.find((o) => o.deductionId === 'L1')!;
    assert.equal(loanAfter.paidAmount, 0);
    assert.equal(loanAfter.remainingAmount, 20000);
  });

  it('AT-03: Partial equipment allocation leaves rem>0 and installmentCompleted=false', () => {
    const obligations = [
      eq({ deductionId: 'E1', originalAmount: 50000, obligationAgeKey: '1' }),
      loan({ deductionId: 'L1', originalAmount: 20000, obligationAgeKey: '2' }),
    ];
    const r = allocateActualToObligations({ actualTotalMilli: 30000, obligations });
    assert.equal(r.lines.length, 1);
    assert.equal(r.lines[0].allocatedAmount, 30000);
    assert.equal(r.lines[0].paidAfter, 30000);
    assert.equal(r.lines[0].remainingAfter, 20000);
    assert.equal(r.lines[0].fullyPaid, false);
    assert.equal(r.lines[0].installmentCompleted, false);
    assert.equal(r.surplusMilli, 0);
  });

  it('AT-04/05/06: Multiple equipment — age then equipmentIssueId ascending', () => {
    const obligations = [
      eq({
        deductionId: 'E-new',
        originalAmount: 10000,
        obligationAgeKey: '200',
        equipmentIssueId: 'ISSUE-Z',
        installmentNumber: 2,
      }),
      eq({
        deductionId: 'E-old-b',
        originalAmount: 10000,
        obligationAgeKey: '100',
        equipmentIssueId: 'ISSUE-B',
        installmentNumber: 1,
      }),
      eq({
        deductionId: 'E-old-a',
        originalAmount: 10000,
        obligationAgeKey: '100',
        equipmentIssueId: 'ISSUE-A',
        installmentNumber: 1,
      }),
    ];
    const r = allocateActualToObligations({ actualTotalMilli: 25000, obligations });
    assert.deepEqual(
      r.lines.map((l) => l.deductionId),
      ['E-old-a', 'E-old-b', 'E-new']
    );
    assert.equal(r.lines[0].allocatedAmount, 10000);
    assert.equal(r.lines[1].allocatedAmount, 10000);
    assert.equal(r.lines[2].allocatedAmount, 5000);
    assert.equal(r.lines[2].installmentCompleted, false);
  });

  it('AT-09: New vs carried identity preserved (same deductionId, immutable original)', () => {
    const carried = createRequestObligation({
      deductionId: 'D-CARRY',
      source: 'supervisor',
      riderCode: 'R1',
      reason: 'سلفة',
      originalCycleId: 'C1',
      currentCycleId: 'C2',
      originalAmount: 20000,
      obligationAgeKey: '1',
    });
    // Simulate prior partial: project via allocate with 0 first to keep identity, then manual state
    const openCarried: DeductionObligation = {
      ...carried,
      paidAmount: 0,
      remainingAmount: 20000,
      status: 'open',
      currentCycleId: 'C2',
    };
    const fresh = loan({ deductionId: 'D-NEW', originalAmount: 10000, obligationAgeKey: '2' });
    const r = allocateActualToObligations({
      actualTotalMilli: 0,
      obligations: [openCarried, fresh],
    });
    const afterCarry = r.obligationsAfter.find((o) => o.deductionId === 'D-CARRY')!;
    const afterNew = r.obligationsAfter.find((o) => o.deductionId === 'D-NEW')!;
    assert.equal(afterCarry.deductionId, 'D-CARRY');
    assert.equal(afterCarry.originalAmount, 20000);
    assert.equal(afterCarry.originalCycleId, 'C1');
    assert.equal(afterCarry.currentCycleId, 'C2');
    assert.equal(afterNew.originalAmount, 10000);
    assert.equal(afterNew.deductionId, 'D-NEW');
  });

  it('AT-13: Surplus is audit-only and creates no obligation', () => {
    const obligations = [eq({ deductionId: 'E1', originalAmount: 10000, obligationAgeKey: '1' })];
    const r = allocateActualToObligations({ actualTotalMilli: 15000, obligations });
    assert.equal(r.allocatedTotalMilli, 10000);
    assert.equal(r.surplusMilli, 5000);
    assert.equal(r.obligationsAfter.length, 1);
    assert.equal(r.lines.length, 1);
  });

  it('AT-16b: Pure allocation has no desk-cash semantics', () => {
    const r = allocateActualToObligations({
      actualTotalMilli: 1000,
      obligations: [eq({ deductionId: 'E1', originalAmount: 1000, obligationAgeKey: '1' })],
    });
    const json = JSON.stringify(r);
    assert.equal(json.includes('settlementPaidMilli'), false);
    assert.equal(json.includes('desk'), false);
  });

  it('AT-21: Non-equipment FIFO by age then deductionId', () => {
    const obligations = [
      loan({ deductionId: 'L-B', originalAmount: 10000, obligationAgeKey: '50', reason: 'سلفة' }),
      loan({ deductionId: 'L-A', originalAmount: 10000, obligationAgeKey: '50', reason: 'سلفة' }),
      loan({
        deductionId: 'SEC',
        originalAmount: 5000,
        obligationAgeKey: '10',
        reason: 'استعلام أمني',
      }),
    ];
    const r = allocateActualToObligations({ actualTotalMilli: 20000, obligations });
    assert.deepEqual(
      r.lines.map((l) => l.deductionId),
      ['SEC', 'L-A', 'L-B']
    );
    assert.equal(r.lines[0].allocatedAmount, 5000);
    assert.equal(r.lines[1].allocatedAmount, 10000);
    assert.equal(r.lines[2].allocatedAmount, 5000);
  });

  it('H-1: Full allocation remaining=0 marks installmentCompleted=true', () => {
    const obligations = [eq({ deductionId: 'E1', originalAmount: 26667, obligationAgeKey: '1' })];
    const r = allocateActualToObligations({ actualTotalMilli: 26667, obligations });
    assert.equal(r.lines[0].remainingAfter, 0);
    assert.equal(r.lines[0].fullyPaid, true);
    assert.equal(r.lines[0].installmentCompleted, true);
    assert.equal(r.lines[0].wouldAffectEquipmentWallet, true);
  });

  it('invariants: caps, consistency, determinism, sum/surplus', () => {
    const obligations = [
      eq({ deductionId: 'E1', originalAmount: 40000, obligationAgeKey: '1', equipmentIssueId: 'A' }),
      loan({ deductionId: 'L1', originalAmount: 30000, obligationAgeKey: '2' }),
    ];
    const a = allocateActualToObligations({ actualTotalMilli: 50000, obligations });
    const b = allocateActualToObligations({ actualTotalMilli: 50000, obligations });
    assert.deepEqual(a.lines, b.lines);
    assert.equal(a.allocatedTotalMilli, 50000);
    assert.equal(a.surplusMilli, 0);
    assert.ok(a.allocatedTotalMilli <= 50000);
    assert.equal(a.surplusMilli, 50000 - a.allocatedTotalMilli);

    for (const o of a.obligationsAfter) {
      assert.ok(o.remainingAmount >= 0);
      assert.ok(o.paidAmount >= 0);
      assert.ok(isEconomicallyConsistent(o));
      assert.equal(o.paidAmount + o.remainingAmount, o.originalAmount);
    }

    for (const line of a.lines) {
      assert.ok(line.allocatedAmount >= 0);
      assert.ok(line.remainingAfter >= 0);
    }

    // Never allocate above actual
    const over = allocateActualToObligations({
      actualTotalMilli: 1000,
      obligations: [eq({ deductionId: 'E1', originalAmount: 999999, obligationAgeKey: '1' })],
    });
    assert.equal(over.allocatedTotalMilli, 1000);
    assert.ok(over.allocatedTotalMilli <= 1000);
  });

  it('reason priority: معدات then استعلام أمني before سلفة', () => {
    const obligations = [
      loan({ deductionId: 'L1', originalAmount: 10000, obligationAgeKey: '1', reason: 'سلفة' }),
      loan({
        deductionId: 'S1',
        originalAmount: 10000,
        obligationAgeKey: '1',
        reason: 'استعلام أمني',
      }),
      eq({ deductionId: 'E1', originalAmount: 10000, obligationAgeKey: '9', equipmentIssueId: 'X' }),
    ];
    const r = allocateActualToObligations({ actualTotalMilli: 25000, obligations });
    assert.deepEqual(
      r.lines.map((l) => l.deductionId),
      ['E1', 'S1', 'L1']
    );
  });
});
