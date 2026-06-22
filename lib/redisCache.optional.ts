/**
 * Optional Upstash Redis REST cache (L2 behind in-memory cache).
 * Enabled when UPSTASH_REDIS_REST_URL + UPSTASH_REDIS_REST_TOKEN are set.
 * Read-through only — Google Sheets remains source of truth.
 */

type CacheEnvelope<T> = {
  data: T;
  expiresAt: number;
};

function redisEnabled(): boolean {
  return Boolean(
    process.env.UPSTASH_REDIS_REST_URL?.trim() && process.env.UPSTASH_REDIS_REST_TOKEN?.trim()
  );
}

function restBase(): string {
  return process.env.UPSTASH_REDIS_REST_URL!.trim().replace(/\/$/, '');
}

function authHeaders(): HeadersInit {
  return {
    Authorization: `Bearer ${process.env.UPSTASH_REDIS_REST_TOKEN!.trim()}`,
  };
}

async function redisCommand(path: string, init?: RequestInit): Promise<Response | null> {
  if (!redisEnabled()) return null;
  try {
    const res = await fetch(`${restBase()}${path}`, {
      ...init,
      headers: { ...authHeaders(), ...(init?.headers || {}) },
    });
    return res;
  } catch (e) {
    console.warn('[redisCache] command failed:', e);
    return null;
  }
}

export async function redisCacheGet<T>(key: string): Promise<T | null> {
  const res = await redisCommand(`/get/${encodeURIComponent(key)}`);
  if (!res?.ok) return null;
  const body = (await res.json()) as { result?: string | null };
  if (!body.result) return null;
  try {
    const parsed = JSON.parse(body.result) as CacheEnvelope<T>;
    if (Date.now() > parsed.expiresAt) {
      void redisCacheDelete(key);
      return null;
    }
    return parsed.data;
  } catch {
    return null;
  }
}

export async function redisCacheSet<T>(key: string, data: T, ttlMs: number): Promise<void> {
  const envelope: CacheEnvelope<T> = { data, expiresAt: Date.now() + ttlMs };
  const payload = JSON.stringify(envelope);
  const ttlSec = Math.max(1, Math.ceil(ttlMs / 1000));
  await redisCommand(`/set/${encodeURIComponent(key)}/${encodeURIComponent(payload)}?EX=${ttlSec}`);
}

export async function redisCacheDelete(key: string): Promise<void> {
  await redisCommand(`/del/${encodeURIComponent(key)}`);
}

export function isRedisCacheConfigured(): boolean {
  return redisEnabled();
}
