/**
 * SRS-014 Phase 4D.5 — fail-closed financial apply lock tests.
 */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  acquireFinancialApplyLock,
  canReleaseFinancialApplyLock,
  createMemoryFailClosedLockRedis,
  FINANCIAL_APPLY_LOCK_TTL_SECONDS,
  financialApplyLockRedisKey,
} from '@/lib/equipmentDeductions/financialApplyLock';

describe('Phase 4D.5 — financial apply Redis lock (fail-closed)', () => {
  it('lock acquired when Redis configured and NX succeeds', async () => {
    const redis = createMemoryFailClosedLockRedis({ configured: true });
    const lock = await acquireFinancialApplyLock('srs014:fa:e1:d1', redis);
    assert.equal(lock.ok, true);
    if (lock.ok) await lock.release();
    assert.equal(FINANCIAL_APPLY_LOCK_TTL_SECONDS, 120);
    assert.ok(financialApplyLockRedisKey('srs014:fa:e1:d1').includes('srs014:fa:e1:d1'));
  });

  it('lock already held → lock_busy', async () => {
    const redis = createMemoryFailClosedLockRedis({ configured: true });
    const a = await acquireFinancialApplyLock('k1', redis);
    assert.equal(a.ok, true);
    const b = await acquireFinancialApplyLock('k1', redis);
    assert.equal(b.ok, false);
    if (!b.ok) assert.equal(b.reason, 'lock_busy');
    if (a.ok) await a.release();
  });

  it('Redis unavailable (unconfigured) → fail closed', async () => {
    const redis = createMemoryFailClosedLockRedis({ configured: false });
    const lock = await acquireFinancialApplyLock('k1', redis);
    assert.equal(lock.ok, false);
    if (!lock.ok) assert.equal(lock.reason, 'redis_unavailable');
  });

  it('Redis transport/error → fail closed (unavailable)', async () => {
    const redis = createMemoryFailClosedLockRedis({
      configured: true,
      setNxQueue: ['unavailable'],
    });
    const lock = await acquireFinancialApplyLock('k1', redis);
    assert.equal(lock.ok, false);
    if (!lock.ok) assert.equal(lock.reason, 'redis_unavailable');
  });

  it('release ownership: only owner token may release', async () => {
    assert.equal(canReleaseFinancialApplyLock('tok-a', 'tok-a'), true);
    assert.equal(canReleaseFinancialApplyLock('tok-a', 'tok-b'), false);
    assert.equal(canReleaseFinancialApplyLock(null, 'tok-a'), false);
  });

  it('TTL constant is positive bounded', () => {
    assert.ok(FINANCIAL_APPLY_LOCK_TTL_SECONDS > 0);
    assert.ok(FINANCIAL_APPLY_LOCK_TTL_SECONDS <= 15 * 60);
  });
});
