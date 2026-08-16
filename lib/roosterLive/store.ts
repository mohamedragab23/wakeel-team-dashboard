/**
 * Shared snapshot storage for Live 3PL data.
 *
 * Deliberately Redis-only, no Postgres: the product requirement is "current
 * state, ~60s latency," not history/timelines, so there is nothing here that
 * benefits from a relational store. One key is overwritten every sync cycle.
 *
 * IMPORTANT: this path uses Upstash POST JSON commands directly
 * (`lib/upstashRest.ts`) — NOT `redisCacheSet`/`tieredCache` envelopes.
 * The generic cache layer silently failed large snapshot writes (URL/header
 * limits + soft-fail SET), which made `/api/live-riders` return
 * hasSnapshot:false while cron still logged sync_ok.
 */
import { cache } from '@/lib/cache';
import { isRedisCacheConfigured } from '@/lib/redisCache.optional';
import { isUpstashConfigured, redisGet, redisSet } from '@/lib/upstashRest';
import { logStructured } from '@/lib/requestTrace';
import type { LiveRidersSnapshot } from '@/lib/roosterLive/types';

/** Snapshot outlives one sync interval so a single missed run self-heals silently. */
const SNAPSHOT_TTL_MS = 6 * 60 * 1000; // 6 minutes
const SNAPSHOT_TTL_SECONDS = Math.ceil(SNAPSHOT_TTL_MS / 1000);
/** Past this age, the read API flags the data as stale in its response. */
export const STALE_AFTER_MS = 90 * 1000; // 1.5 min — tighter than old 2.5m so UI warns sooner
/** In-process L1 after Redis read/write — keep short so other syncs aren't masked. */
const L1_CACHE_MS = 15_000;

function snapshotKey(cityId: string): string {
  return `rooster_live:snapshot:${cityId}`;
}

export function isRoosterLiveStoreReady(): boolean {
  return isRedisCacheConfigured() || isUpstashConfigured();
}

function parseSnapshot(raw: string): LiveRidersSnapshot | null {
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== 'object') return null;

    // Legacy envelope from redisCacheSet: { data, expiresAt }
    const maybeEnvelope = parsed as { data?: unknown; expiresAt?: unknown };
    if (
      maybeEnvelope.data &&
      typeof maybeEnvelope.data === 'object' &&
      typeof maybeEnvelope.expiresAt === 'number'
    ) {
      if (Date.now() > maybeEnvelope.expiresAt) return null;
      return maybeEnvelope.data as LiveRidersSnapshot;
    }

    // Direct snapshot payload
    const snap = parsed as LiveRidersSnapshot;
    if (typeof snap.cityId === 'string' && Array.isArray(snap.riders)) {
      return snap;
    }
    return null;
  } catch {
    return null;
  }
}

export async function saveLiveRidersSnapshot(snapshot: LiveRidersSnapshot): Promise<void> {
  if (!isRoosterLiveStoreReady()) {
    throw new Error(
      'Redis is not configured (UPSTASH_REDIS_REST_URL/_TOKEN or Vercel KV). ' +
        'The Live 3PL sync requires shared storage across serverless invocations — see docs.'
    );
  }

  const key = snapshotKey(snapshot.cityId);
  const payload = JSON.stringify(snapshot);
  const ok = await redisSet(key, payload, SNAPSHOT_TTL_SECONDS);
  if (!ok) {
    throw new Error(`Failed to persist live riders snapshot to Redis (key=${key}, bytes=${payload.length})`);
  }

  // Verify read-back so sync_ok cannot lie about durability.
  const verify = await redisGet(key);
  if (!verify || !parseSnapshot(verify)) {
    throw new Error(`Live riders snapshot write verify failed (key=${key})`);
  }

  cache.set(key, snapshot, L1_CACHE_MS);
  logStructured('info', 'rooster_live_snapshot_saved', {
    cityId: snapshot.cityId,
    riderCount: snapshot.riderCount,
    bytes: payload.length,
  });
}

export async function getLiveRidersSnapshot(cityId: string): Promise<LiveRidersSnapshot | null> {
  if (!isRoosterLiveStoreReady()) return null;

  const key = snapshotKey(cityId);
  const fromMemory = cache.get<LiveRidersSnapshot>(key);
  if (fromMemory) return fromMemory;

  const raw = await redisGet(key);
  if (!raw) {
    logStructured('warn', 'rooster_live_snapshot_miss', { cityId, key });
    return null;
  }

  const snapshot = parseSnapshot(raw);
  if (!snapshot) {
    logStructured('warn', 'rooster_live_snapshot_parse_failed', {
      cityId,
      key,
      rawLen: raw.length,
      rawHead: raw.slice(0, 80),
    });
    return null;
  }

  cache.set(key, snapshot, L1_CACHE_MS);
  return snapshot;
}
