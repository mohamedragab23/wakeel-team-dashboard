/**
 * L1 in-memory + L2 Upstash Redis cache for computed API responses.
 * Read-through / write-through only — Google Sheets remains source of truth.
 */
import { cache } from '@/lib/cache';
import {
  isRedisCacheConfigured,
  redisCacheDelete,
  redisCacheDeleteByPrefix,
  redisCacheGet,
  redisCacheSet,
} from '@/lib/redisCache.optional';

export async function tieredCacheGet<T>(key: string, memoryTtlMs?: number): Promise<T | null> {
  const fromMemory = cache.get<T>(key);
  if (fromMemory !== null) return fromMemory;

  const fromRedis = await redisCacheGet<T>(key);
  if (fromRedis !== null) {
    cache.set(key, fromRedis, memoryTtlMs ?? 3 * 60 * 1000);
    return fromRedis;
  }
  return null;
}

/**
 * `l1TtlMs` (optional, additive — every existing caller that omits it keeps
 * today's exact behavior of L1 and L2 sharing one TTL) lets a caller give L1
 * a *shorter* lifetime than L2.
 *
 * Why this matters (SRS-013 Phase 3 production hardening, 2026-07-28): on
 * Vercel's multi-instance serverless model, L1 is private per-warm-instance
 * memory, while L2 (Redis) is the one place a `tieredCacheDelete*` call from
 * any instance can actually reach. When a mutation invalidates a key, the
 * instance that handled the write clears its own L1 and the shared L2 --
 * but every *other* already-warm instance still has its own untouched,
 * unaware-of-the-invalidation L1 copy, which keeps being served until that
 * copy's own TTL naturally expires. With one shared long TTL (e.g. the
 * salary cache's 10 minutes), that's up to 10 minutes of a different
 * instance serving stale data after a legitimate write -- confirmed live
 * during the Phase 3 rollout. Passing a short `l1TtlMs` (seconds, not
 * minutes) while keeping a long `ttlMs` for L2 bounds that worst case to
 * the short window instead, with no loss of L2's cross-instance
 * cache-hit benefit for the common "many reads, rare writes" case.
 */
export async function tieredCacheSet<T>(key: string, data: T, ttlMs: number, l1TtlMs?: number): Promise<void> {
  cache.set(key, data, l1TtlMs ?? ttlMs);
  // Await L2 — Live 3PL (and any cross-instance reader) depends on Redis
  // actually persisting; fire-and-forget hid SET failures behind sync_ok.
  await redisCacheSet(key, data, ttlMs);
}

export async function tieredCacheDelete(key: string): Promise<void> {
  cache.clear(key);
  await redisCacheDelete(key);
}

/** Clear L1 keys with prefix and L2 Redis keys matching prefix*. */
export async function tieredCacheDeleteByPrefix(prefix: string): Promise<void> {
  for (const key of cache.keys()) {
    if (key.startsWith(prefix)) cache.clear(key);
  }
  await redisCacheDeleteByPrefix(prefix);
}

export function isTieredRedisEnabled(): boolean {
  return isRedisCacheConfigured();
}
