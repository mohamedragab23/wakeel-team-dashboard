import { fetchAllRoosterLiveRiders } from '@/lib/roosterLive/client';
import { mapRawRoosterLiveRiders } from '@/lib/roosterLive/mapper';
import { saveLiveRidersSnapshot, isRoosterLiveStoreReady } from '@/lib/roosterLive/store';
import { getRoosterLiveCityId } from '@/lib/roosterLive/tokenProvider';
import { logStructured } from '@/lib/requestTrace';
import type { LiveRidersSnapshot } from '@/lib/roosterLive/types';

export interface RunLiveSyncResult {
  success: boolean;
  cityId: string;
  riderCount: number;
  syncDurationMs: number;
  lastSyncAt: string;
  error?: string;
  /** true when the 24h Cloudflare Access session had expired (or been
   *  invalidated early) and was recovered automatically via the silent
   *  session replay — no human needed to paste fresh cookies. Surfaced for
   *  operational visibility. */
  healedAuthDeep?: boolean;
  /** true when even the silent replay failed and the underlying Okta SSO
   *  session itself was dead — recovered via a full automatic Okta login +
   *  Gmail-OTP read (SRS-012, Layer 3). No human involved; still surfaced
   *  because it's a stronger signal than `healedAuthDeep` that something
   *  upstream is invalidating sessions more aggressively than expected. */
  healedAuthFull?: boolean;
}

/** One full sync cycle: fetch all pages from Talabat, map, and store the snapshot. */
export async function runRoosterLiveSync(): Promise<RunLiveSyncResult> {
  const startedAt = Date.now();
  const cityId = getRoosterLiveCityId();

  if (!isRoosterLiveStoreReady()) {
    const error = 'Redis is not configured — cannot store the live snapshot. See docs/ROOSTER_LIVE.md.';
    logStructured('error', 'rooster_live_sync_skipped_no_store', { cityId, error });
    return { success: false, cityId, riderCount: 0, syncDurationMs: 0, lastSyncAt: new Date().toISOString(), error };
  }

  try {
    const { rawRiders, pagesFetched, healedAuthDeep, healedAuthFull } = await fetchAllRoosterLiveRiders();
    const lastSyncAt = new Date().toISOString();
    const riders = mapRawRoosterLiveRiders(rawRiders, lastSyncAt);
    const syncDurationMs = Date.now() - startedAt;

    const snapshot: LiveRidersSnapshot = {
      cityId,
      riders,
      lastSyncAt,
      syncDurationMs,
      riderCount: riders.length,
    };
    await saveLiveRidersSnapshot(snapshot);

    logStructured('info', 'rooster_live_sync_ok', {
      cityId,
      riderCount: riders.length,
      rawCount: rawRiders.length,
      pagesFetched,
      syncDurationMs,
      healedAuthDeep,
      healedAuthFull,
    });

    return { success: true, cityId, riderCount: riders.length, syncDurationMs, lastSyncAt, healedAuthDeep, healedAuthFull };
  } catch (error: any) {
    const syncDurationMs = Date.now() - startedAt;
    logStructured('error', 'rooster_live_sync_failed', {
      cityId,
      syncDurationMs,
      error: error?.message || String(error),
    });
    return {
      success: false,
      cityId,
      riderCount: 0,
      syncDurationMs,
      lastSyncAt: new Date().toISOString(),
      error: error?.message || 'Live sync failed',
    };
  }
}
