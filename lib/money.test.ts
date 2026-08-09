import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  FULL_LIABILITY_MILLI,
  LIABILITY_AFTER_SECURITY_PAID_MILLI,
  expectedInstallmentMilliemes,
  formatMilliemesAsEgp,
  liabilityInstallmentSchedule,
  originalLiabilityMilliemes,
  splitInstallmentsMilliemes,
} from '@/lib/money';

describe('money milliemes', () => {
  it('900 / 800 liability totals', () => {
    assert.equal(FULL_LIABILITY_MILLI, 90000);
    assert.equal(LIABILITY_AFTER_SECURITY_PAID_MILLI, 80000);
    assert.equal(originalLiabilityMilliemes('NOT_PAID'), 90000);
    assert.equal(originalLiabilityMilliemes('PAID'), 80000);
  });

  it('splits 80000 as 26667+26667+26666', () => {
    assert.deepEqual(splitInstallmentsMilliemes(80000, 3), [26667, 26667, 26666]);
    const sum = splitInstallmentsMilliemes(80000, 3).reduce((a, b) => a + b, 0);
    assert.equal(sum, 80000);
  });

  it('splits 90000 as 30000×3', () => {
    assert.deepEqual(splitInstallmentsMilliemes(90000, 3), [30000, 30000, 30000]);
  });

  it('liabilityInstallmentSchedule matches security fee', () => {
    assert.deepEqual(liabilityInstallmentSchedule('PAID').schedule, [26667, 26667, 26666]);
    assert.deepEqual(liabilityInstallmentSchedule('NOT_PAID').schedule, [30000, 30000, 30000]);
  });

  it('formats milliemes as EGP with 2 decimals', () => {
    assert.equal(formatMilliemesAsEgp(26667), '266.67');
    assert.equal(formatMilliemesAsEgp(26666), '266.66');
    assert.equal(formatMilliemesAsEgp(90000), '900.00');
  });

  it('expected installment caps by remaining', () => {
    assert.equal(
      expectedInstallmentMilliemes({ remainingMilli: 10000, schedule: [30000, 30000, 30000], installmentIndex: 0 }),
      10000
    );
    assert.equal(
      expectedInstallmentMilliemes({ remainingMilli: 90000, schedule: [30000, 30000, 30000], installmentIndex: 0 }),
      30000
    );
  });
});
