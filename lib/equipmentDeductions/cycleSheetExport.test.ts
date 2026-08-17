import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  DEDUCTION_IMPORT_HEADERS,
} from '@/lib/equipmentSheetConstants';
import {
  manualSyntheticCycleId,
  rowBelongsToCycle,
} from '@/lib/equipmentDeductions/cycleSheetExport';
import type { PayoutCycle } from '@/lib/payoutCycles/types';

function cycle(): PayoutCycle {
  return {
    cycleId: 'uuid-c2',
    year: 2026,
    month: 8,
    cycleNumber: 2,
    startDate: '2026-08-10',
    endDate: '2026-08-16',
    payoutDate: '2026-08-16',
    deductionGenerationDate: '2026-08-16',
    isClosing: false,
    equipmentDeductionEnabled: true,
    status: 'active',
    notes: '',
    createdBy: '',
    createdAt: '',
    updatedBy: '',
    updatedAt: '',
  };
}

function row(partial: Record<string, string>): unknown[] {
  const out = new Array(DEDUCTION_IMPORT_HEADERS.length).fill('');
  for (const [k, v] of Object.entries(partial)) {
    const i = (DEDUCTION_IMPORT_HEADERS as readonly string[]).indexOf(k);
    if (i >= 0) out[i] = v;
  }
  return out;
}

describe('cycle sheet export matching', () => {
  it('matches payout UUID and synthetic manual cycle id', () => {
    const c = cycle();
    assert.equal(
      rowBelongsToCycle(row({ كود_المندوب: '1', currentCycleId: 'uuid-c2' }), c),
      true
    );
    assert.equal(
      rowBelongsToCycle(
        row({ كود_المندوب: '1', currentCycleId: manualSyntheticCycleId(c) }),
        c
      ),
      true
    );
  });

  it('matches Arabic cycle/month labels even with alef variants', () => {
    const c = cycle();
    assert.equal(
      rowBelongsToCycle(
        row({
          كود_المندوب: '1',
          دورة_الاستقطاع: 'الثانية',
          شهر: 'اغسطس',
          سنة: '2026',
        }),
        c
      ),
      true
    );
  });
});
