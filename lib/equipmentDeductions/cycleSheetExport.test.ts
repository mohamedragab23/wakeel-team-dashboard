import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { rowBelongsToCycle } from '@/lib/equipmentDeductions/cycleSheetExport';
import type { PayoutCycle } from '@/lib/payoutCycles/types';
import { DEDUCTION_IMPORT_HEADERS } from '@/lib/equipmentSheetConstants';

const cycle: PayoutCycle = {
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

function row(values: Record<string, string>): unknown[] {
  const out = DEDUCTION_IMPORT_HEADERS.map(() => '');
  for (const [k, v] of Object.entries(values)) {
    const i = (DEDUCTION_IMPORT_HEADERS as readonly string[]).indexOf(k);
    if (i >= 0) out[i] = v;
  }
  return out;
}

describe('cycle sheet export matching', () => {
  it('matches payout UUID, synthetic manual id, and Arabic labels', () => {
    assert.equal(
      rowBelongsToCycle(row({ currentCycleId: 'uuid-c2' }), cycle),
      true
    );
    assert.equal(
      rowBelongsToCycle(row({ currentCycleId: 'manual:2026-08:c2' }), cycle),
      true
    );
    assert.equal(
      rowBelongsToCycle(
        row({ دورة_الاستقطاع: 'الثانية', شهر: 'أغسطس', سنة: '2026' }),
        cycle
      ),
      true
    );
    assert.equal(
      rowBelongsToCycle(
        row({ دورة_الاستقطاع: '2', شهر: '8', سنة: '2026' }),
        cycle
      ),
      true
    );
    assert.equal(
      rowBelongsToCycle(
        row({ دورة_الاستقطاع: 'الأولى', شهر: 'أغسطس', سنة: '2026' }),
        cycle
      ),
      false
    );
  });
});
