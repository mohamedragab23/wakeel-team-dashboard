import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  findFirstEligibleEquipmentCycle,
  isCycleEligibleForEquipmentDeduction,
  shouldSkipEquipmentAutoDeductions,
} from '@/lib/payoutCycles/eligibility';
import type { PayoutCycle } from '@/lib/payoutCycles/types';

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

describe('payout cycle eligibility', () => {
  it('skips closing and equipment-disabled cycles', () => {
    assert.equal(shouldSkipEquipmentAutoDeductions({ isClosing: true, equipmentDeductionEnabled: true }), true);
    assert.equal(shouldSkipEquipmentAutoDeductions({ isClosing: false, equipmentDeductionEnabled: false }), true);
    assert.equal(shouldSkipEquipmentAutoDeductions({ isClosing: false, equipmentDeductionEnabled: true }), false);
  });

  it('activation mid-cycle → first deduct next eligible', () => {
    const cycles = [
      c({ cycleId: '1', cycleNumber: 1, startDate: '2026-08-01', endDate: '2026-08-07' }),
      c({ cycleId: '2', cycleNumber: 2, startDate: '2026-08-08', endDate: '2026-08-14' }),
      c({
        cycleId: '3',
        cycleNumber: 3,
        startDate: '2026-08-15',
        endDate: '2026-08-21',
        isClosing: true,
        equipmentDeductionEnabled: false,
      }),
    ];
    const first = findFirstEligibleEquipmentCycle(cycles, '2026-08-03');
    assert.equal(first?.cycleId, '2');

    const inActivation = isCycleEligibleForEquipmentDeduction(cycles[0], cycles, '2026-08-03');
    assert.equal(inActivation.eligible, false);
    assert.equal(inActivation.reason, 'activation_in_current_cycle');

    const next = isCycleEligibleForEquipmentDeduction(cycles[1], cycles, '2026-08-03');
    assert.equal(next.eligible, true);

    const closing = isCycleEligibleForEquipmentDeduction(cycles[2], cycles, '2026-08-03');
    assert.equal(closing.eligible, false);
    assert.equal(closing.reason, 'closing_cycle');
  });

  it('rejects finalized and draft cycles', () => {
    const active = c({ cycleId: '2', cycleNumber: 2, startDate: '2026-08-08', endDate: '2026-08-14' });
    const finalized = c({
      cycleId: 'f',
      cycleNumber: 2,
      startDate: '2026-08-08',
      endDate: '2026-08-14',
      status: 'finalized',
    });
    const draft = c({
      cycleId: 'd',
      cycleNumber: 2,
      startDate: '2026-08-08',
      endDate: '2026-08-14',
      status: 'draft',
    });
    const all = [active, finalized, draft];
    assert.equal(isCycleEligibleForEquipmentDeduction(finalized, all, '2026-08-01').reason, 'cycle_finalized');
    assert.equal(isCycleEligibleForEquipmentDeduction(draft, all, '2026-08-01').reason, 'cycle_draft');
  });
});
