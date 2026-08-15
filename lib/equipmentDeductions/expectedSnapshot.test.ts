import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { buildExpectedDeductionSnapshot } from '@/lib/equipmentDeductions/expectedSnapshot';
import type { PayoutCycle } from '@/lib/payoutCycles/types';
import { isSrs014FinancialApplyEnabled } from '@/lib/srs014Flags';

function cycle(partial: Partial<PayoutCycle> & Pick<PayoutCycle, 'cycleId' | 'startDate' | 'endDate'>): PayoutCycle {
  return {
    year: 2026,
    month: 8,
    cycleNumber: 1,
    payoutDate: '',
    deductionGenerationDate: partial.startDate,
    isClosing: false,
    equipmentDeductionEnabled: true,
    status: 'active',
    notes: '',
    createdBy: '',
    createdAt: '',
    updatedBy: '',
    updatedAt: '',
    ...partial,
  };
}

describe('SRS-014 expected deduction snapshot (calculation only)', () => {
  it('closing cycle → expected 0 + carry remaining', () => {
    const closing = cycle({
      cycleId: 'CL',
      startDate: '2026-08-24',
      endDate: '2026-08-31',
      isClosing: true,
      equipmentDeductionEnabled: false,
      cycleNumber: 4,
    });
    const snap = buildExpectedDeductionSnapshot({
      asOfDate: '2026-08-23',
      cycle: closing,
      allCycles: [closing],
      openIssues: [
        {
          equipmentIssueId: 'I1',
          riderCode: 'R1',
          activationDate: '2026-08-01',
          originalLiabilityMilli: 90000,
          outstandingMilli: 60000,
          amountDeductedMilli: 30000,
          installmentsCompleted: 1,
          securityPaidUpfront: false,
          status: 'open',
        },
      ],
    });
    assert.equal(snap.financialMutation, false);
    assert.equal(snap.lines[0]!.expectedDeductionMilli, 0);
    assert.equal(snap.lines[0]!.reasonIfZero, 'closing_cycle');
    assert.equal(snap.lines[0]!.carriedRemainderMilli, 60000);
  });

  it('activation in cycle → not eligible same cycle', () => {
    const c2 = cycle({
      cycleId: 'C2',
      startDate: '2026-08-10',
      endDate: '2026-08-16',
      cycleNumber: 2,
    });
    const c3 = cycle({
      cycleId: 'C3',
      startDate: '2026-08-17',
      endDate: '2026-08-23',
      cycleNumber: 3,
    });
    const snap = buildExpectedDeductionSnapshot({
      asOfDate: '2026-08-16',
      cycle: c2,
      allCycles: [c2, c3],
      openIssues: [
        {
          equipmentIssueId: 'I1',
          riderCode: 'R1',
          activationDate: '2026-08-12',
          originalLiabilityMilli: 90000,
          outstandingMilli: 90000,
          amountDeductedMilli: 0,
          installmentsCompleted: 0,
          securityPaidUpfront: false,
          status: 'open',
        },
      ],
    });
    assert.equal(snap.lines[0]!.eligible, false);
    assert.equal(snap.lines[0]!.expectedDeductionMilli, 0);
    assert.ok(
      snap.lines[0]!.reasonIfZero === 'activation_in_current_cycle' ||
        snap.lines[0]!.reasonIfZero === 'before_first_eligible'
    );
  });

  it('eligible open issue → positive expected; no financial apply flag ON', () => {
    assert.equal(isSrs014FinancialApplyEnabled(), false);
    const c1 = cycle({
      cycleId: 'C1',
      startDate: '2026-08-01',
      endDate: '2026-08-09',
      cycleNumber: 1,
    });
    const c2 = cycle({
      cycleId: 'C2',
      startDate: '2026-08-10',
      endDate: '2026-08-16',
      cycleNumber: 2,
    });
    const snap = buildExpectedDeductionSnapshot({
      asOfDate: '2026-08-09',
      cycle: c2,
      allCycles: [c1, c2],
      openIssues: [
        {
          equipmentIssueId: 'I1',
          riderCode: 'R1',
          activationDate: '2026-08-05',
          originalLiabilityMilli: 90000,
          outstandingMilli: 90000,
          amountDeductedMilli: 0,
          installmentsCompleted: 0,
          securityPaidUpfront: false,
          status: 'open',
        },
      ],
    });
    assert.equal(snap.lines[0]!.eligible, true);
    assert.ok(snap.lines[0]!.expectedDeductionMilli > 0);
    assert.equal(snap.financialMutation, false);
  });
});
