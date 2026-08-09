import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { assertCanMutateCycle, validatePayoutCycleInput } from '@/lib/payoutCycles/validation';

const base = {
  year: 2026,
  month: 8,
  cycleNumber: 1,
  startDate: '2026-08-01',
  endDate: '2026-08-07',
  payoutDate: '2026-08-08',
  deductionGenerationDate: '2026-08-07',
};

describe('payout cycle validation', () => {
  it('rejects overlapping ranges', () => {
    const errors = validatePayoutCycleInput(
      { ...base, cycleNumber: 2, startDate: '2026-08-05', endDate: '2026-08-12' },
      [{ cycleId: 'a', ...base, isClosing: false, status: 'active' }]
    );
    assert.ok(errors.some((e) => e.message.includes('overlaps')));
  });

  it('rejects duplicate cycleNumber', () => {
    const errors = validatePayoutCycleInput(base, [
      { cycleId: 'a', ...base, isClosing: false, status: 'draft' },
    ]);
    assert.ok(errors.some((e) => e.field === 'cycleNumber'));
  });

  it('requires closing cycle to be last by endDate', () => {
    const errors = validatePayoutCycleInput(
      { ...base, cycleNumber: 1, isClosing: true, endDate: '2026-08-07' },
      [
        {
          cycleId: 'b',
          year: 2026,
          month: 8,
          cycleNumber: 2,
          startDate: '2026-08-08',
          endDate: '2026-08-15',
          isClosing: false,
          status: 'active',
        },
      ]
    );
    assert.ok(errors.some((e) => e.field === 'isClosing'));
  });

  it('blocks silent edit of finalized', () => {
    const err = assertCanMutateCycle({ status: 'finalized' });
    assert.ok(err);
    assert.equal(assertCanMutateCycle({ status: 'finalized' }, { allowFinalizedCorrection: true }), null);
  });
});
