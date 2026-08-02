/**
 * SRS-013 §7.3 — RoosterClient Service Layer.
 *
 * Centralizes typed access to Rooster for the *new* features only (Rider
 * Search in Phase 2, Shift Import in Phase 1). The existing, in-production
 * cron paths (`lib/roosterLive/*`) are intentionally left untouched —
 * "nothing rewritten unless absolutely necessary."
 *
 * **2026-07-27 correction (live evidence, not an assumption):** the hourly
 * `/api/cron/rooster-sync` cron calling `exportRoosterCsv()` directly turned
 * out to already be broken in production (`401 Unauthorized`) — the export
 * endpoint needs a freshly-minted `dhh_token`, same as `/api/rooster/v3/employees`
 * (Phase 2's validated endpoint), which `exportRoosterCsv()`'s original static
 * header resolution never provided. Fixed at the source in `lib/roosterExport.ts`
 * (`resolveFreshRoosterExportHeaders()`, reusing the exact same production-proven
 * `smartRefreshRoosterAuth()` used by Live-3PL) and applied to *both*
 * `exportShiftsCsv()` below and the pre-existing cron — same root cause, same fix,
 * not a scope change.
 *
 * Every method here goes through the Smart Cache (5 min TTL, single-flight)
 * and the Request Queue (max-2-concurrent semaphore) before ever calling
 * Rooster, per the frozen architecture:
 *   RoosterClient -> Smart Cache -> Request Queue -> Dashboard API -> React UI
 */
import { exportRoosterCsv, resolveFreshRoosterExportHeaders, type RoosterExportParams } from '@/lib/roosterExport';
import { withRoosterCache } from '@/lib/rooster/roosterCache';
import { withRoosterQueue } from '@/lib/rooster/roosterQueue';
import { getRoosterLiveHeaders, getRoosterAppOrigin } from '@/lib/roosterLive/tokenProvider';
import { smartRefreshRoosterAuth } from '@/lib/roosterLive/authRefresh';
import { logStructured } from '@/lib/requestTrace';
import type { RiderSearchType, RoosterEmployeeRaw } from '@/lib/rooster/riderMerge';

type CachedExportPayload = { filename: string; bytesBase64: string };

function cacheKeyForExport(params: RoosterExportParams): string {
  return `rooster:export:${params.cityId}:${params.startDate}:${params.endDate}`;
}

export type RoosterSearchOutcome =
  | { success: true; employees: RoosterEmployeeRaw[] }
  | { success: false; reason: 'invalid_search_term' | 'rooster_unavailable' };

const ALL_ACTIVE_EMPLOYEES_CACHE_KEY = 'rooster:all_active_employees';
const PAGE_SIZE = 500;

async function resolveFreshLiveHeaders(): Promise<Record<string, string>> {
  const base = await getRoosterLiveHeaders();
  const outcome = await smartRefreshRoosterAuth(base);
  if (!outcome.headers) {
    throw new Error(`Rooster auth unavailable for rider search (${outcome.failureReason || 'unknown'})`);
  }
  return outcome.headers;
}

/**
 * Direct numeric-ID lookup against `/api/rooster/v3/employees`. Confirmed
 * live (2026-07-27): `with_field=id_number` + a numeric `search_id` reliably
 * matches the top-level `id` field ("Worker ID"). No match -> clean `200`,
 * empty `content` (not an error). Non-numeric `search_id` -> `409` Hibernate
 * `DataException` -- mapped to `invalid_search_term`, never surfaced raw.
 *
 * IMPORTANT: this throws (rather than returning `{success:false,
 * reason:'rooster_unavailable'}`) for transient failures, and only that one
 * case. Reason: the caller wraps this in `withRoosterCache`, which caches
 * whatever value `fn()` *returns* for a full 5 minutes -- if a transient
 * Rooster hiccup (network blip, momentary auth failure) were returned as a
 * normal value here, it would get cached as if it were a real "not found"
 * result, and every identical search for the next 5 minutes would
 * incorrectly report the rider as unsearchable even after Rooster recovers.
 * Throwing makes `withRoosterCache` skip its `tieredCacheSet` entirely (see
 * its catch block), so a future call retries Rooster instead of replaying a
 * stale failure. `invalid_search_term` is still returned normally -- it's a
 * deterministic classification of the *input* (a non-numeric-shaped ID that
 * Rooster itself rejects), not a transient outage, so caching it is correct
 * and harmless.
 */
async function fetchByWorkerId(numericId: string): Promise<RoosterSearchOutcome> {
  const headers = await resolveFreshLiveHeaders();
  const origin = getRoosterAppOrigin();
  const qs = new URLSearchParams({
    search_id: numericId,
    with_field: 'id_number',
    filter_status: 'active_contract',
    with_contracts: 'true',
    page: '0',
    size: '5',
  }).toString();
  const res = await fetch(`${origin}/api/rooster/v3/employees?${qs}`, {
    method: 'GET',
    headers: { Accept: 'application/json', ...headers },
    cache: 'no-store',
  });
  if (res.status === 409) {
    return { success: false, reason: 'invalid_search_term' };
  }
  if (!res.ok) {
    logStructured('error', 'rider_search_worker_id_failed', { status: res.status });
    throw new Error(`Rooster worker-id search failed: ${res.status}`);
  }
  const json: any = await res.json();
  const content: RoosterEmployeeRaw[] = Array.isArray(json?.content) ? json.content : [];
  return { success: true, employees: content };
}

/**
 * `with_field` values other than `id_number` were tested live (2026-07-27)
 * and all 409 regardless of the field name -- Rooster's search only
 * actually filters when `search_id` is numeric (matching the `id` column),
 * `with_field` itself appears to have no real effect. Confirmed by testing
 * `with_field=name`/`phone_number`/`email`/`field_value`/`paper_number` with
 * both numeric and non-numeric `search_id` values -- only numeric
 * `search_id` ever returns `200`. So Paper Number / phone / name / email
 * search are implemented here as an in-memory filter over the *entire*
 * active-contract roster (paginated, ~800 rows for this org, Smart-Cached
 * for 5 minutes) -- exactly the fallback SRS013_DESIGN_FREEZE.md's Phase 2
 * section already anticipated for this scenario.
 */
async function fetchAllActiveEmployeesUncached(): Promise<RoosterEmployeeRaw[]> {
  const headers = await resolveFreshLiveHeaders();
  const origin = getRoosterAppOrigin();
  const all: RoosterEmployeeRaw[] = [];
  let page = 0;
  let totalPages = 1;
  do {
    const qs = new URLSearchParams({
      filter_status: 'active_contract',
      with_contracts: 'true',
      // Confirmed live (2026-07-27): `field_value` (== Paper Number) is
      // returned as an EMPTY string on a plain list call -- it's only
      // populated when `with_field=id_number` is present, *even without*
      // a `search_id`. Without this, Paper Number search over the cached
      // roster would silently never match anything.
      with_field: 'id_number',
      page: String(page),
      size: String(PAGE_SIZE),
    }).toString();
    const res = await fetch(`${origin}/api/rooster/v3/employees?${qs}`, {
      method: 'GET',
      headers: { Accept: 'application/json', ...headers },
      cache: 'no-store',
    });
    if (!res.ok) {
      throw new Error(`Rooster employees list failed: ${res.status}`);
    }
    const json: any = await res.json();
    const content: RoosterEmployeeRaw[] = Array.isArray(json?.content) ? json.content : [];
    all.push(...content);
    totalPages = Number(json?.total_pages ?? 1);
    page += 1;
  } while (page < totalPages);
  return all;
}

function employeeMatchesQuery(emp: RoosterEmployeeRaw, type: RiderSearchType, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return false;
  switch (type) {
    case 'paperNumber':
      return String(emp.field_value ?? '').trim() === query.trim();
    case 'phone': {
      const digits = query.replace(/\D/g, '');
      if (!digits) return false;
      return String(emp.phone_number ?? '').replace(/\D/g, '').includes(digits);
    }
    case 'email':
      return String(emp.email ?? '').toLowerCase().includes(q);
    case 'name':
      return String(emp.name ?? '').toLowerCase().includes(q);
    default:
      return false;
  }
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
        const { headers, failureReason } = await resolveFreshRoosterExportHeaders();
        if (!headers) {
          throw new Error(`Rooster auth unavailable for export (${failureReason || 'unknown'})`);
        }
        const real = await exportRoosterCsv(params, headers);
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

  /**
   * SRS-013 Phase 2 — Rider Search. `type: 'workerId'` uses a direct,
   * server-side numeric lookup (fast path, tiny cache entry). Every other
   * type filters in-memory over the cached full active-contract roster (see
   * `fetchAllActiveEmployeesUncached` doc comment for why -- confirmed live
   * that Rooster's `with_field` param doesn't actually work for anything
   * except a numeric `id` match).
   */
  static async searchRiders(params: { type: RiderSearchType; query: string }): Promise<RoosterSearchOutcome> {
    const query = params.query.trim();
    if (!query) return { success: false, reason: 'invalid_search_term' };

    if (params.type === 'workerId') {
      const numeric = query.replace(/\D/g, '');
      if (!numeric) return { success: false, reason: 'invalid_search_term' };
      const key = `rider_search:workerId:${numeric}`;
      try {
        return await withRoosterCache<RoosterSearchOutcome>(key, () => withRoosterQueue(() => fetchByWorkerId(numeric)));
      } catch (err: any) {
        // Transient failure (see fetchByWorkerId doc comment) -- never cached, always safe to retry next time.
        logStructured('error', 'rider_search_worker_id_threw', { message: err?.message || String(err) });
        return { success: false, reason: 'rooster_unavailable' };
      }
    }

    let all: RoosterEmployeeRaw[];
    try {
      all = await withRoosterCache<RoosterEmployeeRaw[]>(ALL_ACTIVE_EMPLOYEES_CACHE_KEY, () =>
        withRoosterQueue(() => fetchAllActiveEmployeesUncached())
      );
    } catch (err: any) {
      logStructured('error', 'rider_search_roster_fetch_failed', { message: err?.message || String(err) });
      return { success: false, reason: 'rooster_unavailable' };
    }

    const matches = all.filter((emp) => employeeMatchesQuery(emp, params.type, query));
    return { success: true, employees: matches };
  }
}
