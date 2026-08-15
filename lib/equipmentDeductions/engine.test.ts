import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  buildIdempotencyKey,
  computeAutoDeductionDecision,
} from '@/lib/equipmentDeductions/engine';
import type { PayoutCycle } from '@/lib/payoutCycles/types';
import { liabilityInstallmentSchedule } from '@/lib/money';

function c(partial: Partial<PayoutCycle> & Pick<PayoutCycle, 'cycleId' | 'startDate' | 'endDate'>): PayoutCycle {
  return {
    year: 2026,
    month: 8,
    cycleNumber: 1,
    payoutDate: partial.endDate,
    deductionGenerationDate: partial.endDate,
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

const RIDER = '1001';

describe('equipment auto deduction engine', () => {
  it('buildIdempotencyKey format', () => {
    assert.equal(
      buildIdempotencyKey('1001', 'issue-1', 'cyc-1', 2),
      'equipment:1001:issue-1:cyc-1:2'
    );
  });

  it('skips closing cycle', () => {
    const cycles = [
      c({ cycleId: '1', cycleNumber: 1, startDate: '2026-08-01', endDate: '2026-08-07' }),
      c({
        cycleId: '2',
        cycleNumber: 2,
        startDate: '2026-08-08',
        endDate: '2026-08-14',
        isClosing: true,
        equipmentDeductionEnabled: false,
      }),
    ];
    const schedule = liabilityInstallmentSchedule('NOT_PAID').schedule;
    const decision = computeAutoDeductionDecision({
      remainingMilli: 90000,
      schedule,
      installmentsCompleted: 0,
      cycle: cycles[1],
      allCycles: cycles,
      activationDate: '2026-08-01',
      riderCode: RIDER,
      equipmentIssueId: 'E1',
      existingIdempotencyKeys: new Set(),
    });
    assert.equal(decision.action, 'skip');
    assert.equal(decision.reason, 'closing_cycle');
  });

  it('skips activation cycle — first deduct next eligible', () => {
    const cycles = [
      c({ cycleId: '1', cycleNumber: 1, startDate: '2026-08-01', endDate: '2026-08-07' }),
      c({ cycleId: '2', cycleNumber: 2, startDate: '2026-08-08', endDate: '2026-08-14' }),
    ];
    const schedule = liabilityInstallmentSchedule('PAID').schedule;

    const inActivation = computeAutoDeductionDecision({
      remainingMilli: 80000,
      schedule,
      installmentsCompleted: 0,
      cycle: cycles[0],
      allCycles: cycles,
      activationDate: '2026-08-03',
      riderCode: RIDER,
      equipmentIssueId: 'E1',
      existingIdempotencyKeys: new Set(),
    });
    assert.equal(inActivation.action, 'skip');
    assert.equal(inActivation.reason, 'activation_in_current_cycle');

    const next = computeAutoDeductionDecision({
      remainingMilli: 80000,
      schedule,
      installmentsCompleted: 0,
      cycle: cycles[1],
      allCycles: cycles,
      activationDate: '2026-08-03',
      riderCode: RIDER,
      equipmentIssueId: 'E1',
      availablePayoutMilli: 26667,
      existingIdempotencyKeys: new Set(),
    });
    assert.equal(next.action, 'deduct');
    assert.equal(next.amountMilli, 26667);
    assert.equal(next.installmentNumber, 1);
  });

  it('missing available payout fail-closes (never unlimited)', () => {
    const cycles = [c({ cycleId: '2', cycleNumber: 2, startDate: '2026-08-08', endDate: '2026-08-14' })];
    const schedule = liabilityInstallmentSchedule('NOT_PAID').schedule;
    const decision = computeAutoDeductionDecision({
      remainingMilli: 90000,
      schedule,
      installmentsCompleted: 0,
      cycle: cycles[0],
      allCycles: cycles,
      activationDate: '2026-08-01',
      riderCode: RIDER,
      equipmentIssueId: 'E1',
      existingIdempotencyKeys: new Set(),
    });
    assert.equal(decision.action, 'skip');
    assert.equal(decision.reason, 'available_payout_unresolved');
  });

  it('available 500 caps at installment 300 only', () => {
    const cycles = [c({ cycleId: '2', cycleNumber: 2, startDate: '2026-08-08', endDate: '2026-08-14' })];
    const schedule = liabilityInstallmentSchedule('NOT_PAID').schedule;
    const decision = computeAutoDeductionDecision({
      remainingMilli: 90000,
      schedule,
      installmentsCompleted: 0,
      cycle: cycles[0],
      allCycles: cycles,
      activationDate: '2026-08-01',
      riderCode: RIDER,
      equipmentIssueId: 'E1',
      availablePayoutMilli: 50000,
      existingIdempotencyKeys: new Set(),
    });
    assert.equal(decision.action, 'deduct');
    assert.equal(decision.amountMilli, 30000);
  });

  it('partial payout caps deduction', () => {
    const cycles = [c({ cycleId: '2', cycleNumber: 2, startDate: '2026-08-08', endDate: '2026-08-14' })];
    const schedule = liabilityInstallmentSchedule('NOT_PAID').schedule;
    const decision = computeAutoDeductionDecision({
      remainingMilli: 90000,
      schedule,
      installmentsCompleted: 0,
      cycle: cycles[0],
      allCycles: cycles,
      activationDate: '2026-08-01',
      riderCode: RIDER,
      equipmentIssueId: 'E1',
      availablePayoutMilli: 15000,
      existingIdempotencyKeys: new Set(),
    });
    assert.equal(decision.action, 'deduct');
    assert.equal(decision.amountMilli, 15000);
  });

  it('skips second deduct in same cycle even if installment advanced', () => {
    const cycles = [c({ cycleId: '2', cycleNumber: 2, startDate: '2026-08-08', endDate: '2026-08-14' })];
    const schedule = liabilityInstallmentSchedule('NOT_PAID').schedule;
    const decision = computeAutoDeductionDecision({
      remainingMilli: 60000,
      schedule,
      installmentsCompleted: 1,
      amountDeductedMilli: 30000,
      cycle: cycles[0],
      allCycles: cycles,
      activationDate: '2026-08-01',
      riderCode: RIDER,
      equipmentIssueId: 'E1',
      existingIdempotencyKeys: new Set(),
      existingIssueCycleKeys: new Set(['E1:2']),
    });
    assert.equal(decision.action, 'skip');
    assert.equal(decision.reason, 'already_posted_for_cycle');
  });

  it('skips duplicate idempotency key', () => {
    const cycles = [c({ cycleId: '2', cycleNumber: 2, startDate: '2026-08-08', endDate: '2026-08-14' })];
    const schedule = liabilityInstallmentSchedule('NOT_PAID').schedule;
    const key = buildIdempotencyKey(RIDER, 'E1', '2', 1);
    const decision = computeAutoDeductionDecision({
      remainingMilli: 90000,
      schedule,
      installmentsCompleted: 0,
      cycle: cycles[0],
      allCycles: cycles,
      activationDate: '2026-08-01',
      riderCode: RIDER,
      equipmentIssueId: 'E1',
      existingIdempotencyKeys: new Set([key]),
    });
    assert.equal(decision.action, 'skip');
    assert.equal(decision.reason, 'duplicate_idempotency');
  });

  it('schedule amounts for 900 liability', () => {
    const schedule = liabilityInstallmentSchedule('NOT_PAID').schedule;
    const cycles = [c({ cycleId: '2', cycleNumber: 2, startDate: '2026-08-08', endDate: '2026-08-14' })];
    const d0 = computeAutoDeductionDecision({
      remainingMilli: 90000,
      schedule,
      installmentsCompleted: 0,
      cycle: cycles[0],
      allCycles: cycles,
      activationDate: '2026-08-01',
      riderCode: RIDER,
      equipmentIssueId: 'E1',
      availablePayoutMilli: 30000,
      existingIdempotencyKeys: new Set(),
    });
    assert.equal(d0.action, 'deduct');
    assert.equal(d0.amountMilli, 30000);

    const d1 = computeAutoDeductionDecision({
      remainingMilli: 60000,
      schedule,
      installmentsCompleted: 1,
      cycle: cycles[0],
      allCycles: cycles,
      activationDate: '2026-08-01',
      riderCode: RIDER,
      equipmentIssueId: 'E1',
      availablePayoutMilli: 30000,
      existingIdempotencyKeys: new Set(),
    });
    assert.equal(d1.action, 'deduct');
    assert.equal(d1.amountMilli, 30000);
    assert.equal(d1.installmentNumber, 2);
  });

  it('rejects finalized cycle', () => {
    const cycles = [
      c({
        cycleId: '2',
        cycleNumber: 2,
        startDate: '2026-08-08',
        endDate: '2026-08-14',
        status: 'finalized',
      }),
    ];
    const schedule = liabilityInstallmentSchedule('NOT_PAID').schedule;
    const decision = computeAutoDeductionDecision({
      remainingMilli: 90000,
      schedule,
      installmentsCompleted: 0,
      cycle: cycles[0],
      allCycles: cycles,
      activationDate: '2026-08-01',
      riderCode: RIDER,
      equipmentIssueId: 'E1',
      existingIdempotencyKeys: new Set(),
    });
    assert.equal(decision.action, 'skip');
    assert.equal(decision.reason, 'cycle_finalized');
  });
});
