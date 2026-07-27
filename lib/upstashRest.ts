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

async function command(
  segments: Array<string | number>,
  query?: Record<string, string | number | boolean>
): Promise<any> {
  if (!isRedisCacheConfigured()) return null;
  const base = restBase();
  const headers = authHeaders();
  if (!base || !headers) return null;

  try {
    const path = segments.map((s) => encodeURIComponent(String(s))).join('/');
    const qs = query
      ? `?${Object.entries(query)
          .map(([k, v]) => `${k}=${encodeURIComponent(String(v))}`)
          .join('&')}`
      : '';
    const res = await fetch(`${base}/${path}${qs}`, { headers });
    if (!res.ok) return null;
    const body = await res.json().catch(() => null);
    return body && typeof body === 'object' && 'result' in body ? body.result : null;
  } catch (e) {
    console.warn('[upstashRest] command failed:', e);
    return null;
  }
}

/** Atomically increments `key` (creates it at 1 if missing). Returns null on Redis error/unconfigured. */
export async function redisIncr(key: string): Promise<number | null> {
  const r = await command(['incr', key]);
  return typeof r === 'number' ? r : null;
}

/** Atomically decrements `key`. Returns null on Redis error/unconfigured. */
export async function redisDecr(key: string): Promise<number | null> {
  const r = await command(['decr', key]);
  return typeof r === 'number' ? r : null;
}

/** Sets a TTL (seconds) on `key`. No-op on Redis error/unconfigured. */
export async function redisExpire(key: string, seconds: number): Promise<void> {
  await command(['expire', key, Math.max(1, Math.ceil(seconds))]);
}

/**
 * `SET key value NX EX ttlSeconds` — true only if this call actually created
 * the key (lock acquired). NOTE: command flags (`NX`, `EX`) must be passed
 * as extra path segments, not query params — confirmed empirically against
 * this project's Upstash-backed REST endpoint: `?NX=true&EX=30` returns
 * `400 {"error":"ERR syntax error"}`, while `/NX/EX/30` returns `200 OK`.
 */
export async function redisSetNx(key: string, value: string, ttlSeconds: number): Promise<boolean> {
  const r = await command(['set', key, value, 'NX', 'EX', Math.max(1, Math.ceil(ttlSeconds))]);
  return r === 'OK';
}

/** Deletes `key`. No-op on Redis error/unconfigured. */
export async function redisDel(key: string): Promise<void> {
  await command(['del', key]);
}

/** Pushes `value` onto the head of the list at `key`. No-op on Redis error/unconfigured. */
export async function redisLPush(key: string, value: string): Promise<void> {
  await command(['lpush', key, value]);
}

/** Trims the list at `key` to the inclusive range [start, stop]. No-op on Redis error/unconfigured. */
export async function redisLTrim(key: string, start: number, stop: number): Promise<void> {
  await command(['ltrim', key, start, stop]);
}

/** Reads the inclusive range [start, stop] of the list at `key`. Returns [] on Redis error/unconfigured. */
export async function redisLRange(key: string, start: number, stop: number): Promise<string[]> {
  const r = await command(['lrange', key, start, stop]);
  return Array.isArray(r) ? r : [];
}

export function isUpstashConfigured(): boolean {
  return isRedisCacheConfigured();
}
