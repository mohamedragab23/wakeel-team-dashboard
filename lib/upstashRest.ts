/**
 * SRS-013 Phase 0 — low-level Upstash Redis REST command helpers.
 *
 * `lib/redisCache.optional.ts` only exposes GET/SET/DEL/KEYS-prefix-delete
 * (enough for the existing tiered cache). The new Smart Cache lock,
 * Request Queue semaphore, and Telemetry helper need a few more primitives
 * (INCR/DECR/EXPIRE/SETNX/LPUSH/LTRIM/LRANGE) — added here as a net-new,
 * additive file rather than modifying the existing one.
 *
 * Fully optional/fail-open: every function returns null/false/[] and never
 * throws if Upstash REST credentials aren't configured, or on any network
 * error — mirrors the existing "optional Redis" philosophy used everywhere
 * else in this codebase (a Redis outage must never break a real feature).
 */
import { getRedisRestUrl, getRedisRestToken, isRedisCacheConfigured } from '@/lib/redisCache.optional';

function restBase(): string | null {
  const url = getRedisRestUrl();
  return url ? url.replace(/\/+$/, '') : null;
}

function authHeaders(): HeadersInit | null {
  const token = getRedisRestToken();
  return token ? { Authorization: `Bearer ${token}` } : null;
}

type CommandOutcome = { transportOk: true; result: any } | { transportOk: false };

/**
 * Upstash POST JSON command form — preferred for SET NX/EX so NX is honoured
 * (path-segment form has been observed to return OK without sticky claims).
 */
async function commandPost(segments: Array<string | number>): Promise<CommandOutcome> {
  if (!isRedisCacheConfigured()) return { transportOk: false };
  const base = restBase();
  const headers = authHeaders();
  if (!base || !headers) return { transportOk: false };

  try {
    // Keep numbers as numbers (EX ttl) — Upstash examples use numeric EX.
    const body = JSON.stringify(segments.map((s) => (typeof s === 'number' ? s : String(s))));
    const res = await fetch(base, {
      method: 'POST',
      headers: { ...headers, 'Content-Type': 'application/json' },
      body,
    });
    if (!res.ok) return { transportOk: false };
    const json = await res.json().catch(() => null);
    if (!json || typeof json !== 'object' || !('result' in json)) return { transportOk: false };
    return { transportOk: true, result: (json as { result: any }).result };
  } catch (e) {
    console.warn('[upstashRest] POST command failed:', e);
    return { transportOk: false };
  }
}

/** Legacy path-segment form — kept as fallback so Rooster locks never go dark. */
async function commandPath(segments: Array<string | number>): Promise<CommandOutcome> {
  if (!isRedisCacheConfigured()) return { transportOk: false };
  const base = restBase();
  const headers = authHeaders();
  if (!base || !headers) return { transportOk: false };

  try {
    const path = segments.map((s) => encodeURIComponent(String(s))).join('/');
    const res = await fetch(`${base}/${path}`, { headers });
    if (!res.ok) return { transportOk: false };
    const json = await res.json().catch(() => null);
    if (!json || typeof json !== 'object' || !('result' in json)) return { transportOk: false };
    return { transportOk: true, result: (json as { result: any }).result };
  } catch (e) {
    console.warn('[upstashRest] path command failed:', e);
    return { transportOk: false };
  }
}

async function command(segments: Array<string | number>): Promise<any> {
  const post = await commandPost(segments);
  if (post.transportOk) return post.result;
  const path = await commandPath(segments);
  if (path.transportOk) return path.result;
  return null;
}

/** GET key as string. Returns null if missing / Redis error / unconfigured. */
export async function redisGet(key: string): Promise<string | null> {
  const r = await command(['GET', key]);
  if (r == null) return null;
  // Some REST responses already JSON-decode object values — re-stringify for callers.
  if (typeof r === 'string') return r;
  if (typeof r === 'object') return JSON.stringify(r);
  return String(r);
}

/** Atomically increments `key` (creates it at 1 if missing). Returns null on Redis error/unconfigured. */
export async function redisIncr(key: string): Promise<number | null> {
  const r = await command(['INCR', key]);
  return typeof r === 'number' ? r : null;
}

/** Atomically decrements `key`. Returns null on Redis error/unconfigured. */
export async function redisDecr(key: string): Promise<number | null> {
  const r = await command(['DECR', key]);
  return typeof r === 'number' ? r : null;
}

/** Sets a TTL (seconds) on `key`. No-op on Redis error/unconfigured. */
export async function redisExpire(key: string, seconds: number): Promise<void> {
  await command(['EXPIRE', key, Math.max(1, Math.ceil(seconds))]);
}

/**
 * `SET key value EX ttlSeconds` — overwrites. Returns true only on Redis OK.
 */
export async function redisSet(key: string, value: string, ttlSeconds: number): Promise<boolean> {
  const r = await command(['SET', key, value, 'EX', Math.max(1, Math.ceil(ttlSeconds))]);
  return r === 'OK';
}

/**
 * `SET key value NX EX ttlSeconds` — true only if this call actually created
 * the key (lock acquired).
 */
export async function redisSetNx(key: string, value: string, ttlSeconds: number): Promise<boolean> {
  const r = await command(['SET', key, value, 'NX', 'EX', Math.max(1, Math.ceil(ttlSeconds))]);
  return r === 'OK';
}

/**
 * Transport-aware SET NX for fail-closed financial locks.
 * Distinguishes lock contention from Redis unavailable / transport failure.
 */
export type RedisSetNxDetailedResult = 'acquired' | 'busy' | 'unavailable';

export async function redisSetNxDetailed(
  key: string,
  value: string,
  ttlSeconds: number
): Promise<RedisSetNxDetailedResult> {
  if (!isRedisCacheConfigured()) return 'unavailable';
  const ttl = Math.max(1, Math.ceil(ttlSeconds));
  const segments: Array<string | number> = ['SET', key, value, 'NX', 'EX', ttl];
  const post = await commandPost(segments);
  if (post.transportOk) {
    return post.result === 'OK' ? 'acquired' : 'busy';
  }
  const path = await commandPath(segments);
  if (!path.transportOk) return 'unavailable';
  return path.result === 'OK' ? 'acquired' : 'busy';
}

/** Deletes `key`. No-op on Redis error/unconfigured. */
export async function redisDel(key: string): Promise<void> {
  await command(['DEL', key]);
}

/** Pushes `value` onto the head of the list at `key`. No-op on Redis error/unconfigured. */
export async function redisLPush(key: string, value: string): Promise<void> {
  await command(['LPUSH', key, value]);
}

/** Trims the list at `key` to the inclusive range [start, stop]. No-op on Redis error/unconfigured. */
export async function redisLTrim(key: string, start: number, stop: number): Promise<void> {
  await command(['LTRIM', key, start, stop]);
}

/** Reads the inclusive range [start, stop] of the list at `key`. Returns [] on Redis error/unconfigured. */
export async function redisLRange(key: string, start: number, stop: number): Promise<string[]> {
  const r = await command(['LRANGE', key, start, stop]);
  return Array.isArray(r) ? r : [];
}

export function isUpstashConfigured(): boolean {
  return isRedisCacheConfigured();
}
