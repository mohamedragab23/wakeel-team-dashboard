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

export async function tieredCacheSet<T>(key: string, data: T, ttlMs: number): Promise<void> {
  cache.set(key, data, ttlMs);
  void redisCacheSet(key, data, ttlMs);
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
