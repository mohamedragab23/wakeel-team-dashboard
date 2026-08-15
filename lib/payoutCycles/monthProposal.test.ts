import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { proposePayoutCyclesForMonth } from '@/lib/payoutCycles/monthProposal';

describe('SRS-014 payout cycle month proposal', () => {
  it('July 2026 matches business example (1–5 … 27–31 closing)', () => {
    const c = proposePayoutCyclesForMonth(2026, 7);
    assert.equal(c[0]!.startDate, '2026-07-01');
    assert.equal(c[0]!.endDate, '2026-07-05');
    assert.equal(c[1]!.startDate, '2026-07-06');
    assert.equal(c[1]!.endDate, '2026-07-12');
    const closing = c[c.length - 1]!;
    assert.equal(closing.isClosing, true);
    assert.equal(closing.equipmentDeductionEnabled, false);
    assert.equal(closing.startDate, '2026-07-27');
    assert.equal(closing.endDate, '2026-07-31');
  });

  it('August 2026: C1 1–9 … Closing 24–31 (business narrative)', () => {
    const c = proposePayoutCyclesForMonth(2026, 8);
    assert.equal(c[0]!.startDate, '2026-08-01');
    assert.equal(c[0]!.endDate, '2026-08-09');
    assert.equal(c[1]!.startDate, '2026-08-10');
    assert.equal(c[1]!.endDate, '2026-08-16');
    assert.equal(c[2]!.startDate, '2026-08-17');
    assert.equal(c[2]!.endDate, '2026-08-23');
    const closing = c[c.length - 1]!;
    assert.equal(closing.isClosing, true);
    assert.equal(closing.equipmentDeductionEnabled, false);
    assert.equal(closing.startDate, '2026-08-24');
    assert.equal(closing.endDate, '2026-08-31');
  });

  it('payday fields are blank for Admin configuration', () => {
    const c = proposePayoutCyclesForMonth(2026, 7);
    for (const row of c) {
      assert.equal(row.payoutDate, '');
      assert.equal(row.deductionGenerationDate, '');
    }
  });
});
