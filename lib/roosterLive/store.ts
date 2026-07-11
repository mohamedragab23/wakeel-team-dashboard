/**
 * Shared snapshot storage for Live 3PL data.
 *
 * Deliberately Redis-only, no Postgres: the product requirement is "current
 * state, ~60s latency," not history/timelines, so there is nothing here that
 * benefits from a relational store. One key is overwritten every sync cycle.
 *
 * Reuses the existing tiered cache (`lib/tieredCache.ts` → in-memory L1 +
 * Upstash Redis L2, `lib/redisCache.optional.ts`) rather than adding a new
 * Redis client — same env vars (`UPSTASH_REDIS_REST_URL`/`_TOKEN`, or
 * Vercel's `KV_REST_API_URL`/`_TOKEN`) already used elsewhere in the app.
 *
 * IMPORTANT: unlike the Sheets cache, this is NOT an optional speed layer.
 * If Redis isn't configured, there is no fallback (we deliberately never
 * call Talabat from the read path) — `isRoosterLiveStoreReady()` lets the
 * API/UI fail loudly and clearly instead of silently returning nothing.
 */
import { tieredCacheGet, tieredCacheSet } from '@/lib/tieredCache';
import { isRedisCacheConfigured } from '@/lib/redisCache.optional';
import type { LiveRidersSnapshot } from '@/lib/roosterLive/types';

/** Snapshot outlives one sync interval so a single missed run self-heals silently. */
const SNAPSHOT_TTL_MS = 6 * 60 * 1000; // 6 minutes
/** Past this age, the read API flags the data as stale in its response. */
export const STALE_AFTER_MS = 150 * 1000; // 2.5 minutes — 2x+ the 60s cadence

function snapshotKey(cityId: string): string {
  return `rooster_live:snapshot:${cityId}`;
}

export function isRoosterLiveStoreReady(): boolean {
  return isRedisCacheConfigured();
}

export async function saveLiveRidersSnapshot(snapshot: LiveRidersSnapshot): Promise<void> {
  if (!isRoosterLiveStoreReady()) {
    throw new Error(
      'Redis is not configured (UPSTASH_REDIS_REST_URL/_TOKEN or Vercel KV). ' +
        'The Live 3PL sync requires shared storage across serverless invocations — see docs.'
    );
  }
  await tieredCacheSet(snapshotKey(snapshot.cityId), snapshot, SNAPSHOT_TTL_MS);
}

export async function getLiveRidersSnapshot(cityId: string): Promise<LiveRidersSnapshot | null> {
  if (!isRoosterLiveStoreReady()) return null;
  return tieredCacheGet<LiveRidersSnapshot>(snapshotKey(cityId), 30 * 1000);
}
