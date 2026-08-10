/**
 * SRS-014 Phase C — short-lived Redis NX locks for delivery liability creation.
 * Fail-closed when Redis IS configured and lock is held.
 * Fail-open when Redis is not configured (local/dev) — sheet re-checks remain.
 */
import { isUpstashConfigured, redisDel, redisSetNx } from '@/lib/upstashRest';

const TTL_SECONDS = 45;

export function deliveryLiabilityLockKey(deliveryRowRef: string): string {
  return `equipment:liability:delivery:${String(deliveryRowRef || '').trim()}`;
}

export function riderLiabilityLockKey(riderCode: string): string {
  return `equipment:liability:rider:${String(riderCode || '').trim()}`;
}

/**
 * Acquire delivery + rider locks. Returns release().
 * If Redis configured and either lock fails → busy.
 * If Redis not configured → proceed (fail-open) with no-op release.
 */
export async function acquirePhaseCLiabilityLocks(params: {
  deliveryRowRef: string;
  riderCode: string;
}): Promise<{ ok: true; release: () => Promise<void> } | { ok: false; busy: true }> {
  const deliveryKey = deliveryLiabilityLockKey(params.deliveryRowRef);
  const riderKey = riderLiabilityLockKey(params.riderCode);

  if (!isUpstashConfigured()) {
    return { ok: true, release: async () => undefined };
  }

  const gotDelivery = await redisSetNx(deliveryKey, '1', TTL_SECONDS);
  if (!gotDelivery) return { ok: false, busy: true };

  const gotRider = await redisSetNx(riderKey, '1', TTL_SECONDS);
  if (!gotRider) {
    await redisDel(deliveryKey);
    return { ok: false, busy: true };
  }

  return {
    ok: true,
    release: async () => {
      await redisDel(riderKey);
      await redisDel(deliveryKey);
    },
  };
}
