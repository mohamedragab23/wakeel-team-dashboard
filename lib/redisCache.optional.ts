/**
 * Optional Upstash Redis REST cache (L2 behind in-memory cache).
 * Enabled when UPSTASH_REDIS_REST_URL + UPSTASH_REDIS_REST_TOKEN are set.
 * Read-through only — Google Sheets remains source of truth.
 */

type CacheEnvelope<T> = {
  data: T;
  expiresAt: number;
};

function redisRestUrl(): string | undefined {
  return (
    process.env.UPSTASH_REDIS_REST_URL?.trim() ||
    process.env.KV_REST_API_URL?.trim() ||
    undefined
  );
}

function redisRestToken(): string | undefined {
  return (
    process.env.UPSTASH_REDIS_REST_TOKEN?.trim() ||
    process.env.KV_REST_API_TOKEN?.trim() ||
    undefined
  );
}

function redisEnabled(): boolean {
  return Boolean(redisRestUrl() && redisRestToken());
}

function restBase(): string {
  return redisRestUrl()!.replace(/\/$/, '');
}

function authHeaders(): HeadersInit {
  return {
    Authorization: `Bearer ${redisRestToken()!}`,
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
    // Raw values (e.g. redisSetNx "1") are not envelopes — ignore, never delete.
    if (
      !parsed ||
      typeof parsed !== 'object' ||
      Array.isArray(parsed) ||
      !('data' in parsed) ||
      typeof (parsed as CacheEnvelope<T>).expiresAt !== 'number'
    ) {
      return null;
    }
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
  // POST body for the value — path-encoding large snapshots (Live 3PL ~100+
  // riders) overflows Upstash/KV with "400 Request Header Or Cookie Too Large".
  // Upstash docs: POST /set/{key}?EX={ttl} with raw body as the value.
  const res = await redisCommand(`/set/${encodeURIComponent(key)}?EX=${ttlSec}`, {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain' },
    body: payload,
  });
  if (res && !res.ok) {
    const errText = await res.text().catch(() => '');
    console.warn('[redisCache] SET failed:', res.status, errText.slice(0, 200));
  }
}

export async function redisCacheDelete(key: string): Promise<void> {
  await redisCommand(`/del/${encodeURIComponent(key)}`);
}

/** Delete all Redis keys matching `prefix*` (Upstash REST KEYS + DEL). */
export async function redisCacheDeleteByPrefix(prefix: string): Promise<number> {
  if (!redisEnabled() || !prefix) return 0;
  try {
    const res = await redisCommand(`/keys/${encodeURIComponent(`${prefix}*`)}`);
    if (!res?.ok) return 0;
    const body = (await res.json()) as { result?: string[] | null };
    const keys = Array.isArray(body.result) ? body.result : [];
    if (keys.length === 0) return 0;
    const delPath = `/del/${keys.map((k) => encodeURIComponent(k)).join('/')}`;
    await redisCommand(delPath);
    return keys.length;
  } catch (e) {
    console.warn('[redisCache] deleteByPrefix failed:', e);
    return 0;
  }
}

export function isRedisCacheConfigured(): boolean {
  return redisEnabled();
}

/** Resolved REST URL (UPSTASH_* or Vercel KV_* integration vars). */
export function getRedisRestUrl(): string | undefined {
  return redisRestUrl();
}

/** Resolved REST token (UPSTASH_* or Vercel KV_* integration vars). */
export function getRedisRestToken(): string | undefined {
  return redisRestToken();
}
