/**
 * SRS-013 Phase 1 — Zone → Rooster `city_id` mapping (frozen decision,
 * SRS013_DESIGN_FREEZE.md Phase 1 §1).
 *
 * The system today supports exactly one city end-to-end (`ROOSTER_CITY`,
 * `ROOSTER_CITY_ID`/`ROOSTER_LIVE_CITY_ID`, env-driven). Rather than
 * inventing a multi-city Sheet table with no real data behind it yet,
 * Phase 1 ships with an optional `ROOSTER_CITY_MAP_JSON` env var
 * (e.g. `{"Alexandria":"200","Mansoura":"210"}`), defaulting to a single
 * entry built from the existing `ROOSTER_CITY`/`ROOSTER_CITY_ID` if unset —
 * zero config change required to ship. Adding a second city later is a
 * one-line env var edit, not a code change.
 */

/** Returns the configured zone-label -> Rooster city_id map. May be empty if nothing is configured. */
export function getRoosterCityMap(): Record<string, string> {
  const raw = process.env.ROOSTER_CITY_MAP_JSON?.trim();
  if (raw) {
    try {
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        const map: Record<string, string> = {};
        for (const [k, v] of Object.entries(parsed)) {
          const key = String(k).trim();
          const val = String(v).trim();
          if (key && val) map[key] = val;
        }
        if (Object.keys(map).length > 0) return map;
      }
    } catch {
      // Malformed JSON -- fall through to the single-city default below
      // rather than throwing (this is an optional convenience var).
    }
  }

  const cityLabel = process.env.ROOSTER_CITY?.trim();
  const cityId = (process.env.ROOSTER_LIVE_CITY_ID || process.env.ROOSTER_CITY_ID)?.trim();
  if (cityLabel && cityId) return { [cityLabel]: cityId };

  return {};
}

/** Resolves one zone label to its Rooster city_id, or null if unknown/unconfigured. */
export function resolveRoosterCityId(zone: string): string | null {
  const map = getRoosterCityMap();
  return map[zone] ?? null;
}
