/**
 * SRS-013 §7.1 — "Smart Cache" (5-minute TTL) + single-flight de-dup for the
 * new Rooster-backed features.
 *
 * Directly reuses `lib/tieredCache.ts` (L1 in-memory + L2 Upstash Redis) —
 * the exact same Redis account already used for Sheets caching and the
 * Rooster Live snapshot. On top of that, a short-lived Redis lock adds
 * single-flight behavior: on a cache miss, at most one caller across all
 * serverless instances actually calls Rooster within the lock window —
 * every other concurrent caller either gets the freshly-cached result or
 * (if the lock holder is slow/crashes) fails open and calls Rooster itself
 * rather than blocking forever.
 *
 * `T` must be JSON-serializable (required by the L2 Redis layer already
 * used by `tieredCacheSet` today) — binary payloads (e.g. CSV bytes) must
 * be base64-encoded by the caller before being passed through this wrapper
 * (see `RoosterClient.exportShiftsCsv`).
 */
import { tieredCacheGet, tieredCacheSet } from '@/lib/tieredCache';
import { redisDel, redisSetNx, isUpstashConfigured } from '@/lib/upstashRest';
import { recordMetric } from '@/lib/telemetry';

const DEFAULT_TTL_MS = 5 * 60 * 1000; // 5-minute Smart Cache, per SRS-013 §7.1
const LOCK_PREFIX = 'roosterlock:';
const LOCK_TTL_SECONDS = 30;
const LOCK_WAIT_TIMEOUT_MS = 2000;
const LOCK_POLL_MS = 150;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function withRoosterCache<T>(
  key: string,
  fn: () => Promise<T>,
  ttlMs: number = DEFAULT_TTL_MS
): Promise<T> {
  const cached = await tieredCacheGet<T>(key);
  if (cached !== null) {
    void recordMetric({ feature: 'rooster_client', metric: 'cache_hit', tags: { key } });
    return cached;
  }
  void recordMetric({ feature: 'rooster_client', metric: 'cache_miss', tags: { key } });

  const lockKey = LOCK_PREFIX + key;
  const gotLock = isUpstashConfigured() ? await redisSetNx(lockKey, '1', LOCK_TTL_SECONDS) : true;

  if (!gotLock) {
    // Another instance is already computing this key -- poll briefly for
    // its result instead of firing a second real Rooster call.
    const waitStartedAt = Date.now();
    while (Date.now() - waitStartedAt < LOCK_WAIT_TIMEOUT_MS) {
      await sleep(LOCK_POLL_MS);
      const maybeReady = await tieredCacheGet<T>(key);
      if (maybeReady !== null) {
        void recordMetric({ feature: 'rooster_client', metric: 'cache_hit', tags: { key, waited: 'true' } });
        return maybeReady;
      }
    }
    // Fail-open after the short wait -- proceed to call Rooster ourselves
    // rather than block indefinitely if the lock holder never finishes.
  }

  const startedAt = Date.now();
  try {
    const result = await fn();
    await tieredCacheSet(key, result, ttlMs);
    void recordMetric({ feature: 'rooster_client', metric: 'exec_ms', value: Date.now() - startedAt, tags: { key } });
    return result;
  } catch (err) {
    void recordMetric({ feature: 'rooster_client', metric: 'api_failure', tags: { key } });
    throw err;
  } finally {
    if (gotLock && isUpstashConfigured()) {
      await redisDel(lockKey);
    }
  }
}
