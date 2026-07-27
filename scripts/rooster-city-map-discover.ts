/**
 * Read-only discovery of the full Rooster city_id -> city_name map, needed
 * to populate ROOSTER_CITY_MAP_JSON for SRS-013 Phase 1 (the "why is the
 * Zone picker only showing Alexandria" issue -- we only had a single city
 * configured via ROOSTER_CITY/ROOSTER_CITY_ID, but Rooster itself manages
 * many cities).
 *
 * Reuses the already-validated `/api/rooster/v3/employees` endpoint
 * (SRS-013 Phase 2) -- no new/unknown endpoint guessed -- and the existing
 * production auth layer only. Walks pages of active-contract employees and
 * collects the distinct (city_id, city_name) pairs seen in each
 * `active_contract`. This is read-only and touches no product code.
 *
 * Usage: npx tsx scripts/rooster-city-map-discover.ts
 */
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

import { getRoosterLiveHeaders, getRoosterAppOrigin } from '@/lib/roosterLive/tokenProvider';
import { smartRefreshRoosterAuth } from '@/lib/roosterLive/authRefresh';

async function resolveHeaders(): Promise<Record<string, string>> {
  const baseHeaders = await getRoosterLiveHeaders();
  const outcome = await smartRefreshRoosterAuth(baseHeaders);
  if (!outcome.headers) {
    throw new Error(`smartRefreshRoosterAuth failed to produce usable headers: ${outcome.failureReason}`);
  }
  return outcome.headers;
}

async function main() {
  const headers = await resolveHeaders();
  const origin = getRoosterAppOrigin();
  const cityMap = new Map<string, string>(); // city_id -> city_name

  const size = 500;
  let page = 0;
  let totalPages = 1;

  do {
    const qs = new URLSearchParams({
      filter_status: 'active_contract',
      with_contracts: 'true',
      page: String(page),
      size: String(size),
    }).toString();
    const url = `${origin}/api/rooster/v3/employees?${qs}`;
    const res = await fetch(url, { method: 'GET', headers: { Accept: 'application/json', ...headers }, cache: 'no-store' });
    if (!res.ok) {
      console.error(`Page ${page} failed: ${res.status} ${await res.text().catch(() => '')}`);
      break;
    }
    const json: any = await res.json();
    const content: any[] = Array.isArray(json?.content) ? json.content : [];
    totalPages = Number(json?.total_pages ?? 1);

    for (const emp of content) {
      const contracts: any[] = Array.isArray(emp?.contracts) ? emp.contracts : [];
      const all = emp?.active_contract ? [...contracts, emp.active_contract] : contracts;
      for (const c of all) {
        const id = c?.city_id != null ? String(c.city_id) : null;
        const name = c?.city_name != null ? String(c.city_name).trim() : null;
        if (id && name) cityMap.set(id, name);
      }
    }

    console.log(`Page ${page + 1}/${totalPages} -- ${content.length} employees -- distinct cities so far: ${cityMap.size}`);
    page += 1;
  } while (page < totalPages);

  console.log('\n=== Discovered city_id -> city_name map ===');
  const sorted = Array.from(cityMap.entries()).sort((a, b) => a[1].localeCompare(b[1]));
  for (const [id, name] of sorted) console.log(`  ${id}\t${name}`);

  const jsonMap: Record<string, string> = {};
  for (const [id, name] of sorted) jsonMap[name] = id;
  console.log('\n=== ROOSTER_CITY_MAP_JSON value (copy this) ===');
  console.log(JSON.stringify(jsonMap));
}

main().catch((e) => {
  console.error('FATAL', e);
  process.exit(1);
});
