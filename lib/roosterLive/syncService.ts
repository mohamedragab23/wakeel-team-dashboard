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
    const { rawRiders, pagesFetched } = await fetchAllRoosterLiveRiders();
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
    });

    return { success: true, cityId, riderCount: riders.length, syncDurationMs, lastSyncAt };
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
