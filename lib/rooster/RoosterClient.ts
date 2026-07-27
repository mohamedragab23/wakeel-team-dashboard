/**
 * SRS-013 §7.3 — RoosterClient Service Layer.
 *
 * Centralizes typed access to Rooster for the *new* features only (Rider
 * Search in Phase 2, Shift Import in Phase 1). The existing, in-production
 * cron paths (`lib/roosterLive/*`, the hourly `rooster-sync` cron calling
 * `exportRoosterCsv()` directly) are intentionally left untouched —
 * "nothing rewritten unless absolutely necessary." A follow-up migration of
 * those crons onto this shared client is explicitly out of scope for now
 * (low-priority tech debt, per the architecture doc §7.3).
 *
 * Every method here goes through the Smart Cache (5 min TTL, single-flight)
 * and the Request Queue (max-2-concurrent semaphore) before ever calling
 * Rooster, per the frozen architecture:
 *   RoosterClient -> Smart Cache -> Request Queue -> Dashboard API -> React UI
 */
import { exportRoosterCsv, type RoosterExportParams } from '@/lib/roosterExport';
import { withRoosterCache } from '@/lib/rooster/roosterCache';
import { withRoosterQueue } from '@/lib/rooster/roosterQueue';

type CachedExportPayload = { filename: string; bytesBase64: string };

function cacheKeyForExport(params: RoosterExportParams): string {
  return `rooster:export:${params.cityId}:${params.startDate}:${params.endDate}`;
}

export class RoosterClient {
  /**
   * Wraps the existing, untouched `exportRoosterCsv()` with caching +
   * queueing. Byte-identical output to calling `exportRoosterCsv()`
   * directly (Phase 0 acceptance test #3) — this method adds zero new
   * business logic, only cross-cutting infra (cache + concurrency cap).
   */
  static async exportShiftsCsv(params: RoosterExportParams): Promise<{ filename: string; bytes: ArrayBuffer }> {
    const key = cacheKeyForExport(params);

    const cached = await withRoosterCache<CachedExportPayload>(key, () =>
      withRoosterQueue(async () => {
        const real = await exportRoosterCsv(params);
        return {
          filename: real.filename,
          bytesBase64: Buffer.from(real.bytes).toString('base64'),
        };
      })
    );

    const buf = Buffer.from(cached.bytesBase64, 'base64');
    // `.buffer` alone can include extra pooled bytes for small Buffers --
    // slice to the exact view so `bytes` is byte-identical to the original.
    const bytes = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);

    return { filename: cached.filename, bytes };
  }

  // searchRiders() lands in Phase 2 — public contract already frozen in
  // SRS013_DESIGN_FREEZE.md (Phase 2 §3), not implemented yet (Phase 0
  // ships only the foundation: cache, queue, audit log, telemetry).
}
