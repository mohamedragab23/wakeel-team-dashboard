/**
 * SRS-014 Phase D — short-lived execution locks for auto equipment deductions.
 *
 * Requirements:
 * - Successful deduction remains idempotent via sheet/ledger keys (not a 90d NX).
 * - Failed / crashed runs must not permanently poison retries.
 * - Concurrent runs cannot double-deduct while the lock is held.
 * - Ownership is token-verified before release.
 */
import { isUpstashConfigured, redisDel, redisGet, redisSetNx } from '@/lib/upstashRest';

/** Bounded TTL for an in-flight cron deduction attempt (cron maxDuration=300s). */
export const AUTO_DEDUCTION_LOCK_TTL_SECONDS = 15 * 60;

const LOCK_PREFIX = 'equipment:auto_deduction:exec:';

export function autoDeductionLockKey(idempotencyKey: string): string {
  return `${LOCK_PREFIX}${String(idempotencyKey || '').trim()}`;
}

function newLockToken(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID();
  return `adl_${Date.now()}_${Math.random().toString(36).slice(2)}`;
}

export type AutoDeductionLock =
  | { ok: true; token: string; release: () => Promise<void> }
  | { ok: false; reason: 'lock_busy' };

/**
 * Acquire an execution lock for one logical deduction.
 * Redis unconfigured → fail-open (local/dev); sheet + ledger guards remain.
 * Redis configured + NX miss → busy (fail-closed for this attempt).
 */
export async function acquireAutoDeductionLock(idempotencyKey: string): Promise<AutoDeductionLock> {
  const key = autoDeductionLockKey(idempotencyKey);
  const token = newLockToken();

  if (!isUpstashConfigured()) {
    return { ok: true, token, release: async () => undefined };
  }

  const got = await redisSetNx(key, token, AUTO_DEDUCTION_LOCK_TTL_SECONDS);
  if (!got) return { ok: false, reason: 'lock_busy' };

  return {
    ok: true,
    token,
    release: async () => {
      const cur = await redisGet(key);
      if (cur === token) await redisDel(key);
    },
  };
}

/** Pure helper for tests: only the matching owner may release. */
export function canReleaseLock(currentValue: string | null, token: string): boolean {
  return Boolean(token) && currentValue === token;
}
