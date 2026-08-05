/**
 * Resolves Rooster Starting Point IDs → human-readable names.
 *
 * Confirmed live (2026-08-05): `/api/rooster/v3/employees?...&with_starting_points=true`
 * returns `starting_point_ids: number[]` but NOT names. Names appear on the
 * Live-3PL riders endpoint as `starting_point: { id, name }`.
 *
 * Strategy: paginate Live-3PL for the city, build id→name map, cache 1h.
 * Fail-open: if Live is down, callers still get IDs and a suspended flag.
 */
import { getRoosterAppOrigin } from '@/lib/roosterLive/tokenProvider';
import { withRoosterCache } from '@/lib/rooster/roosterCache';
import { logStructured } from '@/lib/requestTrace';

export type StartingPointRef = { id: number; name: string };

const CACHE_TTL_HINT = 'sp_map'; // key prefix only; roosterCache has its own TTL

async function fetchCityStartingPointMapUncached(
  cityId: number,
  headers: Record<string, string>
): Promise<Record<string, string>> {
  const origin = getRoosterAppOrigin();
  const map: Record<string, string> = {};
  let page = 0;
  // Bound pages so a runaway Live API can't hang the search request.
  const MAX_PAGES = 20;

  while (page < MAX_PAGES) {
    const url =
      `${origin}/api/rider-live-operations/v1/external/city/${cityId}/riders` +
      `?page=${page}&size=100`;
    const res = await fetch(url, {
      method: 'GET',
      headers: { Accept: 'application/json', ...headers },
      cache: 'no-store',
    });
    if (!res.ok) {
      throw new Error(`live riders for SP map failed: ${res.status}`);
    }
    const json: any = await res.json();
    const content: any[] = Array.isArray(json?.content) ? json.content : [];
    for (const row of content) {
      const sp = row?.starting_point;
      if (sp?.id != null && sp?.name) {
        map[String(sp.id)] = String(sp.name);
      }
    }
    if (!content.length || json?.last === true) break;
    page += 1;
  }
  return map;
}

export async function resolveStartingPoints(params: {
  cityId: number;
  ids: number[];
  headers: Record<string, string>;
}): Promise<StartingPointRef[]> {
  const ids = (params.ids || []).filter((n) => Number.isFinite(n));
  if (!ids.length) return [];

  let map: Record<string, string> = {};
  try {
    map = await withRoosterCache<Record<string, string>>(
      `rooster:sp_map:city:${params.cityId}:${CACHE_TTL_HINT}`,
      () => fetchCityStartingPointMapUncached(params.cityId, params.headers)
    );
  } catch (err: any) {
    logStructured('warn', 'rooster_sp_map_failed', { message: err?.message || String(err), cityId: params.cityId });
  }

  return ids.map((id) => ({
    id,
    name: map[String(id)] || `Starting Point #${id}`,
  }));
}
