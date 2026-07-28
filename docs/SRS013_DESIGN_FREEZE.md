# SRS-013 — Design Freeze

**Status:** 🟢 FULLY FROZEN — all previously-open items resolved (Rider Search endpoint confirmed live, PDF frozen to `pdf-lib`, Payroll dual-write decided, telemetry requirement adopted). Final architecture review passed (companion doc §14). Implementation starts only after explicit Phase 0 approval, and Phase *N+1* starts only after Phase *N* passes its acceptance tests in production.
**Companion doc:** `docs/SRS013_ROOSTER_API_PAYROLL_ARCHITECTURE.md` (rationale/why). This document is the *what, exactly* — frozen contracts, not architecture prose.
**Baseline commit:** `eed9c44` (current `main`, includes the rooster-live-sync cron fix + Gmail OTP automation, both already in production).
**Validation evidence:** `scripts/rooster-employees-endpoint-check.ts` — read-only, reuses only the existing production Rooster auth layer, no captured credentials stored anywhere.

Every phase below follows the same six-part contract you asked for:
Endpoints → Sheets changes → New APIs → Impact on existing code → Rollback plan → Acceptance tests.

**Global rule enforced in every phase:** no existing Sheet tab's schema changes, no existing API response *removes or renames* a field (additive only), and no existing file's *behavior* changes for existing callers.

**Global rollback mechanism (applies to every phase, not repeated each time):**
1. Every new feature is gated by one new env var (`FEATURE_X_ENABLED`, default `false` until explicitly turned on in Vercel). Flipping it off is a 10-second Vercel dashboard/CLI action — **no redeploy, no code change** — and immediately hides the new UI entry point and makes the new API route return `503 { enabled:false }`.
2. Underneath that, standard Vercel one-click "instant rollback to previous deployment" is always available (as already used in this project).
3. Because every new Sheet tab is **append-only and net-new**, disabling a feature flag never leaves partial/inconsistent data in any *existing* tab — the worst case is unused rows sitting in a new tab, which is harmless.
4. Standard `git revert <commit>` + redeploy is the final fallback if the flag itself needs to disappear entirely.

---

## Phase 0 — Foundation (RoosterClient, Smart Cache, Request Queue, Audit Log) — ✅ SHIPPED 2026-07-27

### 1. Endpoints used
None new to Rooster itself — Phase 0 only wraps auth/session machinery that **already exists and is already in production** (`getRoosterLiveHeaders`, `smartRefreshRoosterAuth`). No new outbound HTTP calls are introduced in this phase.

### 2. Google Sheets changes
**New tab: `سجل_العمليات`** (unified audit log; used by Phases 1/3/4/5, not Phase 0 itself, but created now so later phases can depend on it).

| Col | Header | Type | Notes |
|---|---|---|---|
| A | `logId` | string (UUID) | |
| B | `domain` | string | `payroll` \| `rent` \| `rooster_import` \| `rider_data` |
| C | `action` | string | e.g. `create`, `correct`, `void` |
| D | `entityType` | string | `rider` \| `supervisor` \| `rent_contract` \| `shift_import` |
| E | `entityCode` | string | |
| F | `actorCode` | string | from JWT |
| G | `actorName` | string | from JWT |
| H | `beforeJson` | string | JSON snapshot, empty on create |
| I | `afterJson` | string | JSON snapshot |
| J | `timestamp` | ISO string | |

Created via `ensureSheetExists('سجل_العمليات', [...headers])` — **idempotent, safe to run multiple times, never touches any other tab.**

### 3. New APIs
| Route | Method | Auth | Purpose |
|---|---|---|---|
| *(none public yet)* | — | — | Phase 0 ships only internal libraries: `lib/rooster/RoosterClient.ts`, `lib/rooster/roosterCache.ts` (single-flight + 5-min TTL cache), `lib/rooster/roosterQueue.ts` (Redis semaphore, max-2-concurrent), `lib/auditLog.ts` (`appendAuditLog()`). |

`appendAuditLog()` signature (frozen):
```ts
export async function appendAuditLog(entry: {
  domain: 'payroll' | 'rent' | 'rooster_import' | 'rider_data';
  action: string;
  entityType: string;
  entityCode: string;
  actorCode: string;
  actorName: string;
  before?: unknown;
  after?: unknown;
}): Promise<void>
```

`RoosterClient` frozen surface for Phase 0 (methods added, not implemented with real business logic yet beyond wrapping existing calls):
```ts
export class RoosterClient {
  static async exportShiftsCsv(params: { cityId: string; cityLabel: string; startDate: string; endDate: string }): Promise<{ filename: string; bytes: ArrayBuffer }>;
  // searchRiders() added in Phase 2 once the endpoint is confirmed — signature TBD.
}
```
Internally, `exportShiftsCsv` calls the **existing, untouched** `exportRoosterCsv()` from `lib/roosterExport.ts` — Phase 0 does not reimplement it, only wraps it with the new cache/queue.

### 4. Impact on existing code
| File | Change | Risk |
|---|---|---|
| `lib/roosterLive/*`, `lib/roosterExport.ts`, `lib/roosterSessionStore.ts` | **None.** Read-only imports from the new wrapper files. | Zero |
| `lib/googleSheets.ts` | None — `ensureSheetExists` already exists and is called with a new tab name, no signature change. | Zero |
| New files only: `lib/rooster/RoosterClient.ts`, `lib/rooster/roosterCache.ts`, `lib/rooster/roosterQueue.ts`, `lib/auditLog.ts` | Net new | Zero (nothing calls them yet) |

### 5. Rollback plan
Delete/ignore the new files; nothing else references them yet, so a revert is a no-op for the rest of the app. The `سجل_العمليات` tab can stay empty forever with no effect.

### 6. Acceptance tests — ✅ SHIPPED & VERIFIED (2026-07-27)
1. ✅ `ensureSheetExists('سجل_العمليات', headers)` run twice in a row → tab created once, second call is a no-op, headers match exactly the table above. **Verified live** via `scripts/srs013-phase0-verify.ts` — tab created, headers byte-match the frozen contract.
2. ✅ `appendAuditLog()` called with a sample payload → exactly one new row appended, all 10 columns populated, no existing tab is touched. **Verified live** — row count `+1` on `سجل_العمليات`, zero change on `المناديب`/`المشرفين`/`الخصومات`.
3. ✅ Smart Cache + base64 round-trip (the exact mechanism `RoosterClient.exportShiftsCsv()` uses to stay byte-safe through Redis) preserves an arbitrary binary payload exactly. **Verified live** with a 4096-byte synthetic payload — 0 bytes lost/altered. (Note: `exportRoosterCsv()` itself, which the client wraps unmodified, already runs hourly in production and was not re-tested here — this test isolates the *new* code Phase 0 adds.)
4. ✅ Two concurrent calls with the *same* cache key within the TTL → only **one** real underlying call fires (single-flight de-dup via the Redis lock), confirmed by a call-counter (`realCallCount === 1`). **Bug caught and fixed during this verification:** the Upstash REST endpoint used by this project rejects `SET key value?NX=true&EX=30` (query-param flags) with `400 syntax error` — it requires path-style flags, `SET key value NX EX 30`. Fixed in `lib/upstashRest.ts#redisSetNx`; re-verified passing after the fix.
5. ✅ Three concurrent calls, queue capped at 2 → the 3rd request measurably waits for a slot (observed start-offsets `[158ms, 162ms, 1175ms]` — the 3rd started ~1 second after the first two, well past their ~500ms hold time, proving the semaphore genuinely throttles rather than just recording a metric).
6. ⏳ Existing `/api/cron/rooster-sync`, `/api/cron/rooster-live-sync`, `/api/cron/rooster-keepalive` continue to run on their normal schedule, unmodified — not independently re-run by this verification (Phase 0 code makes zero changes to any of those three files, confirmed by `git diff` scope), to be observed passively via existing Telegram/Vercel Cron logs over the next cycle as final confirmation.

**Bonus verification (not in the original acceptance list, added for confidence):** the Telemetry helper (§13) was exercised end-to-end — `GET`-equivalent `getFeatureHealthSnapshot()` correctly reflected the `exec_ms`/`cache_hit`/`cache_miss`/`queue_wait_ms`/`api_failure`/`audit_event` samples generated by tests 2–5 above, including 4 real `api_failure` samples recorded during an earlier failed run (before the SETNX fix) — proof the failure-metric path works correctly too, not just the happy path.

Full production type-check (`tsc --noEmit`) and `next build` both pass with zero errors/warnings related to any new file.

---

## Phase 1 — Automatic Shift Import — ✅ SHIPPED 2026-07-27

### 1. Endpoints used
**Rooster (external, already used today by the hourly cron — unchanged):**
```
GET https://eg.me.logisticsbackoffice.com/api/rooster/v3/shifts/export
    ?city_id={city_id}&start_at={start_at}&end_at={end_at}
    &page=0&size=50000&with_evaluations=true&with_time_zone=Africa%2FCairo
```
Auth: current session Cookie header (via `RoosterClient.exportShiftsCsv` → existing `getRoosterExportHeadersFromSheet`/env). No new Rooster endpoint.

**Zone → `city_id` mapping (frozen decision):** the system today supports exactly **one** city end-to-end (`ROOSTER_CITY=Alexandria`, `ROOSTER_CITY_ID=200`, env-driven). Rather than inventing a multi-city Sheet table with no real data behind it yet, Phase 1 ships with:
- A new optional env var `ROOSTER_CITY_MAP_JSON` (e.g. `{"Alexandria":"200"}`) — defaults to a single entry built from the existing `ROOSTER_CITY`/`ROOSTER_CITY_ID` if unset, so **zero config change is required to ship**.
- The Zone picker in the UI lists whatever keys exist in that map. Adding a second city later is a one-line env var edit, not a code change.

### 2. Google Sheets changes
**None.** Confirmed in SRS-013 §1: shift import has always been analyze-only (no persisted shift rows), and Phase 1 preserves that exactly — it only changes *where the CSV bytes come from* (Rooster live call instead of a manual upload), not what happens to the parsed data afterward.

### 3. New APIs
| Route | Method | Auth | Request | Response |
|---|---|---|---|---|
| `POST /api/rooster/shifts/import` | POST | Same guard as `app/api/shifts/legacy-analyze/route.ts` (supervisor-or-admin JWT) | `{ zone: string; startDate: string; endDate: string }` (YYYY-MM-DD, max 31-day span — enforced server-side, returns `400` if exceeded) | **Identical JSON shape** already returned by `POST /api/shifts/legacy-analyze` (reuses `analyzeLegacyShifts()` untouched) |

Gated by `FEATURE_SHIFT_IMPORT_ENABLED` (defaults `false`): if unset/false, route returns `503 { success:false, enabled:false }` and the new UI panel is hidden.

### 4. Impact on existing code
| File | Change | Risk |
|---|---|---|
| `lib/shiftAutomationLegacy.ts`, `lib/shiftsLegacyAnalyze.ts` | **None** — called as-is, same function signatures | Zero |
| `app/api/shifts/legacy-analyze/route.ts` | **None** — untouched, still works for manual CSV upload | Zero |
| `app/shifts/page.tsx` | **Additive only** — one new panel (Zone/Start/End/Import button) added above/beside the existing upload panel; existing upload flow's JSX/handlers untouched | Low (UI-only addition) |
| New file: `app/api/rooster/shifts/import/route.ts` | Net new | Zero (new route, no existing callers) |

### 5. Rollback plan
Set `FEATURE_SHIFT_IMPORT_ENABLED=false` in Vercel → new panel disappears, new route disabled, manual CSV upload (today's only path) is completely unaffected the entire time. No data to roll back (nothing is persisted by this feature).

### 6. Acceptance tests
1. With the flag off: `/shifts` page shows only today's existing upload panel; `POST /api/rooster/shifts/import` returns `503`.
2. With the flag on, as a supervisor: selecting "Alexandria" + a 7-day range returns the same report shape/fields as uploading a manually-exported CSV for the same 7 days (byte-for-byte comparable totals — cross-checked once against a real manual export).
3. Selecting a 45-day range → `400` with a clear error, UI shows a friendly message, no partial/successful request is made to Rooster.
4. Concurrent requests for the same zone+range from two different logged-in supervisors within 5 minutes → confirmed (via Phase 0 log counters) only one real Rooster export call fires.
5. Existing manual-upload `/api/shifts/legacy-analyze` flow, exercised end-to-end during this phase's testing window, returns identical results to before Phase 1 shipped.
6. Non-admin/non-supervisor JWT (or none) → `401`, matching the existing guard's behavior exactly.

**Verification (`scripts/srs013-phase1-verify.ts`, run twice against a local `next dev` server — once with the flag off/default, once with it forced on via `FEATURE_SHIFT_IMPORT_ENABLED=true` + `ROOSTER_CITY_MAP_JSON={"Alexandria":"200"}`):**
1. ✅ No token / bogus token → `401` (Tests 6a/6b).
2. ✅ `GET /api/rooster/shifts/import` status-check → `200 { success:true, enabled, zones, maxRangeDays }`.
3. ✅ Flag off (production default) → `POST` returns `503 { success:false, enabled:false }`; new UI panel stays hidden (client checks the same GET on mount).
4. ✅ Flag on, 45-day range → `400` with the exact "أقصى مدى مسموح به 31 يوم" message, before any Rooster call is attempted.
5. ✅ Flag on, unknown zone → `400` listing the configured zones, before any Rooster call is attempted.
6. ⏳ **Not independently re-tested here** (needs real Rooster session, not available in local dev): a full success round-trip (Rooster export → `analyzeLegacyShifts()` → identical shape as manual upload) and the single-flight/concurrency behavior — both rely on code paths (`RoosterClient.exportShiftsCsv`, Phase 0's cache/queue, `analyzeLegacyShifts()`) already verified independently in Phase 0 and in daily production use (manual upload + hourly `rooster-sync` cron), so the only genuinely new wiring is the route/UI glue covered by tests 1-5 above. Recommended: flip the flag on in Vercel and do one real 7-day import as a production smoke test before wider rollout.
7. ✅ Zero existing files behaviorally changed: `lib/shiftAutomationLegacy.ts`, `lib/shiftsLegacyAnalyze.ts`, `app/api/shifts/legacy-analyze/route.ts` untouched; `app/shifts/page.tsx` only gained new state/a new conditional panel + one extracted-but-behavior-identical helper (`applyAnalyzedResult`) that the existing manual-upload handler now also calls (confirmed via full `next build` — all 63 pages generated, Phase-0 regression suite re-run and still 5/5 passing).

**Post-ship production bug fix (2026-07-27, same day, found via real user smoke test):**
- **Symptom:** real import attempt → `502 "تعذر الاتصال بروستر لاستيراد الشفتات"`; Vercel logs showed `Rooster export failed: 401 {"message":"Unauthorized"}`.
- **Root cause:** `/api/rooster/v3/shifts/export` needs a freshly-minted `dhh_token`, exactly like `/api/rooster/v3/employees` (Phase 2's validated endpoint) — `exportRoosterCsv()`'s original static header resolution (env/Sheet `ROOSTER_EXPORT_HEADERS_JSON`, stable cookie only, `dhh_token` intentionally never persisted there) never provided it. This also silently affected the **pre-existing** hourly `/api/cron/rooster-sync` job — not a Phase 1-introduced bug, just exposed by it.
- **Fix:** `lib/roosterExport.ts` gained `resolveFreshRoosterExportHeaders()`, reusing the exact same production-proven `smartRefreshRoosterAuth()` self-healing already used by Live-3PL, and `exportRoosterCsv()` gained a backward-compatible optional `headersOverride` param. Applied to both `RoosterClient.exportShiftsCsv()` and the hourly cron.
- **Zone list bug, same report:** the picker showed only "Alexandria" (the single `ROOSTER_CITY`/`ROOSTER_CITY_ID` default) even though this org actually has active riders in 3 cities. `scripts/rooster-city-map-discover.ts` (read-only, reuses the already-validated employees endpoint) walked all 806 active-contract employees and confirmed: `Alexandria=200, Cairo=1, Mansoura=208` — matching `filterEmployeesWakeel3Cities()`'s existing "Alexandria, Mansoura, or Greater Cairo" business rule exactly. `ROOSTER_CITY_MAP_JSON` set in Vercel Production to this 3-city map.
- **Verified live:** `GET` status-check now returns `zones:["Alexandria","Cairo","Mansoura"]`; a real `POST` import (Alexandria, 2026-07-25→27) returned `200` with real data (523 employees, per-day booked/unassigned breakdown across 7 sub-zones) — no more `502`.

---

## Phase 2 — Rider Search *(✅ SHIPPED 2026-07-27)*

### 1. Endpoints used
**Confirmed live, 2026-07-27**, and **re-confirmed with corrected evidence during Phase 2 build** (this section's original text — written before implementation — assumed `with_field` behaved like a normal column selector; live testing during the build proved otherwise and the design below reflects what's actually true in production, not the original assumption):

- **Endpoint:** `GET https://eg.me.logisticsbackoffice.com/api/rooster/v3/employees` (single endpoint, used two different ways — see below).
- **CORRECTED FINDING #1 — `with_field` does not do what its name suggests.** Tested live with `search_id` + `with_field` set to `id_number`, `id`, `name`, `email`, `phone_number`, `field_value`, `paper_number`, `paperNumber`, `phoneNumber` (9 combinations, numeric and non-numeric `search_id` values): **every combination returns `200` when `search_id` is numeric, and `409` when it isn't — regardless of what `with_field` is set to.** In other words, this endpoint's search only ever matches the numeric `id` column; `with_field`'s value appears to be ignored server-side. Searching by phone/name/email/Paper-Number via `search_id`+`with_field` is **not possible** — the original design's "phone_number/email are confirmed literal fields" line was an untested assumption and is now retracted.
- **CORRECTED FINDING #2 — `field_value` (= Paper Number, see below) is empty on a plain list call.** A page of `content` fetched with just `filter_status=active_contract&with_contracts=true` (no `with_field`) returns `field_value: ""` for every row. Adding `with_field=id_number` to that **same list call — even with no `search_id` at all** — populates `field_value` correctly for every row in the page. This is the one genuinely load-bearing (if oddly-named) side-effect `with_field` actually has.
- **CORRECTED FINDING #3 — `field_value` is Paper Number.** Confirmed by direct comparison against Rooster's own Riders/Review UI screenshot for a known employee: `field_value: "29511120200678    "` (trailing spaces as returned) matched that employee's "Paper No" column exactly. Not documented anywhere in Rooster's API — discovered by exhaustively diffing every field in a raw response against the UI.
- **Frozen final design (implemented, not just planned):**
  1. **Worker ID search** → direct, single-row lookup: `search_id=<numeric>&with_field=id_number&filter_status=active_contract&with_contracts=true&page=0&size=5`. Fast path, tiny cache entry (`rider_search:workerId:<id>`).
  2. **Paper Number / Phone / Name / Email search** → the endpoint has no working server-side filter for these, so `RoosterClient.searchRiders()` fetches the **entire active-contract roster** (paginated, `with_field=id_number` always included so `field_value` comes back populated; ~806 rows for this org today, one Smart-Cache entry `rooster:all_active_employees`, 5-minute TTL) and filters **in-memory** in our own backend: exact-trimmed match on `field_value` for Paper Number, digit-suffix match (tolerant of `+20`/`0` prefixes) on `phone_number` for Phone, case-insensitive substring on `name`/`email`. This is exactly the fallback this section originally anticipated ("if it turns out not to be server-searchable, the UI falls back to client-side filtering over already-cached results") — it turned out to be necessary for 4 of the 5 search types, not just Paper Number.
- **Authentication method:** unchanged from the original design — `smartRefreshRoosterAuth()` (stable `CF_Authorization`/`CF_AppSession` Cookie + a freshly Okta-minted `dhh_token`), reusing `getRoosterLiveHeaders()` exactly as the Live-3PL sync does.
- **Response shape:** unchanged from the original design — Spring-Boot `Page<Employee>` envelope; `content[i]`: `id, name, email, phone_number, bank_data, birth_date, contracts[], active_contract, reporting_to, work_permit_expiry_date, batch_number, field_value, created_at, starting_point_ids`.
- **Caching strategy:** two Smart Cache entries, both 5-min TTL — `rider_search:workerId:<id>` (tiny, per-ID) and `rooster:all_active_employees` (the full roster, shared across Paper Number/Phone/Name/Email searches — a search-heavy afternoon still costs at most one real Rooster round-trip per 5 minutes for those four types combined).
- **Rate-limit strategy:** unchanged — Phase 0's Request Queue/semaphore (max-2-concurrent), Rooster exposes no rate-limit headers.
- **Failure handling:** (a) Worker ID search, no match → clean `200`, `content:[]` → `{ success:true, results:[] }`. (b) Worker ID search with a numerically **out-of-range** value (e.g. 12+ digits) → confirmed live to legitimately `409` (integer overflow on Rooster's side) → correctly mapped to `{ success:false, reason:'invalid_search_term' }`, same as a non-numeric value — this is correct behavior, not a bug. (c) full-roster fetch failing (network/`5xx`) → `{ success:false, reason:'rooster_unavailable' }`, `502`, no raw upstream text leaked.

### 2. Google Sheets changes
**None.** This is a live lookup only; nothing is written to Sheets (confirmed: no "Paper Number" concept exists in our roster data, so there's nothing to reconcile on write — merge happens in-memory at read time, see §3/§Single-Rider-Profile below).

### 3. New APIs (frozen)
| Route | Method | Auth | Request | Response |
|---|---|---|---|---|
| `GET /api/rooster/riders/search` | GET | supervisor-or-admin JWT | `?type=workerId\|paperNumber\|phone\|name\|email&q=<value>` | `{ success: true; results: MergedRiderProfile[] }` — see shape below. On failure: `{ success:false, reason: 'invalid_search_term' \| 'rooster_unavailable' }` (never a raw upstream error) |

`MergedRiderProfile` (frozen shape — every Rooster field is surfaced, none invented, per your instruction):
```ts
type MergedRiderProfile = {
  // Merged, single canonical value per field — dashboard (Sheets) wins on any field present in both sources.
  workerId?: string;        // Rooster `id`
  paperNumber?: string;     // Rooster id_number-searched field, if present
  name?: string;
  email?: string;
  phoneNumbers?: string[];  // merged from Sheets phone + Rooster phone_number, deduped
  city?: string;            // Rooster active_contract.city_name, or dashboard city if present
  company?: string;         // if returned by Rooster / present in dashboard
  jobTitle?: string;        // Rooster active_contract.job_title
  joiningDate?: string;     // Rooster active_contract.start_at (earliest contract), or dashboard hire date
  currentStatus?: string;   // Rooster active_contract.status / currently_active, merged with dashboard status
  contracts?: RoosterContract[];       // full Rooster contracts[] passthrough, unmerged (historical, Rooster-only)
  // Per-field provenance so the UI can label each value:
  fieldSources: Record<string, 'dashboard' | 'rooster'>;
};
```
Cached via Phase 0's 5-minute Smart Cache, gated by `FEATURE_RIDER_SEARCH_ENABLED`.

### Single Rider Profile — merge rule (frozen)
Priority: **Dashboard (Sheets) data + Rooster data**, merged into one object, never shown as two duplicate blocks.
- For any field present in **both** sources with different values → **dashboard value wins**, displayed with a "Dashboard" tag.
- For any field present **only in Rooster** → included as-is, displayed with a **"Live from Rooster"** tag.
- For any field present **only in Sheets** → included as-is, displayed with a **"Dashboard"** tag.
- Profile sections rendered: Personal info, Employment info, Contract info, Phone numbers, Paper Number, Worker ID, City, Current status, Company, Job title, Joining date, and any additional Rooster fields not otherwise mapped (rendered generically under "Additional Rooster Data", still tagged "Live from Rooster") — so no field returned by Rooster is ever silently dropped.

### 4. Impact on existing code
| File | Change | Risk |
|---|---|---|
| `app/riders/page.tsx`, `app/admin/riders/page.tsx` | **None** — new search lives in its own UI surface (new Single Rider Profile view), not merged into the existing Sheets-backed rider tables | Zero |
| New files only (`lib/rooster/RoosterClient.ts#searchRiders`, `app/api/rooster/riders/search/route.ts`, rider-profile UI) | Net new | Zero |

### 5. Rollback plan
`FEATURE_RIDER_SEARCH_ENABLED=false` → search box hidden, route disabled. No persisted data exists to roll back (pure read/merge, nothing written to Sheets).

### 6. Acceptance tests
1. Search by a known Worker ID → returns the same info visible on Rooster's own Riders page for that person (manually cross-checked at least 3 times during UAT), merged correctly with any existing dashboard data for the same rider.
2. Search with no results → `{ success:true, results:[] }`, UI shows a clear "not found" state, not an error.
3. Search with a malformed value for the chosen field (reproducing the confirmed `409` Hibernate error) → UI shows a friendly "invalid search term" message, **never** the raw Hibernate/SQL text.
4. Two identical searches within 5 minutes → second one served from cache (Phase 0 log counter shows 1 real Rooster call, not 2; telemetry `cache_hit` metric increments — see cross-cutting Telemetry section).
5. Search endpoint failing/Rooster session dead → `502` with a message, **no** Telegram alert fires for this (rider search is user-facing/on-demand, not a background job — alerting policy stays scoped to the existing sync/keepalive crons only, per "zero impact on existing Telegram workflow").
6. A rider present in both Rooster and the dashboard Sheet, with a conflicting field (e.g. different phone number) → merged profile shows the **dashboard** value for that field, tagged "Dashboard," and any Rooster-only fields (e.g. `work_permit_expiry_date`) still appear, tagged "Live from Rooster."

**Implementation files (all new; zero existing files modified except two 1-line-additive nav entries):**
`lib/rooster/riderMerge.ts` (types + `mergeRiderProfile()`), `lib/rooster/RoosterClient.ts` (added `searchRiders()` + the corrected fetch/filter logic above — additive to the file created in Phase 1), `app/api/rooster/riders/search/route.ts`, `app/rider-search/page.tsx`, `scripts/srs013-phase2-verify.ts`. Additive-only edits: `components/Layout.tsx` and `lib/adminFeatureAccess.ts` (one new nav entry each, reusing the existing `riders` admin-feature key — no new permission category introduced).

**Verification (`scripts/srs013-phase2-verify.ts`, run against a local `next dev` server, once with the flag off/default and once forced on via `FEATURE_RIDER_SEARCH_ENABLED=true`, against real production Rooster/Sheets data):**
1. ✅ No token / bogus token → `401` (Tests 1/2).
2. ✅ Capability check (`GET` with no `type`/`q`) → `200 { success:true, enabled, availableTypes }`, works regardless of flag state.
3. ✅ Flag off (production default) → real search request → `503 { success:false, enabled:false }`; UI page shows a clear "not enabled" state (never a 404 or blank page).
4. ✅ Flag on, invalid `type` → `400` before any Rooster call.
5. ✅ Flag on, missing `q` → `400` before any Rooster call.
6. ✅ Flag on, real Worker ID (`877614`) → `200`, one merged result, `fieldSources` shows the expected dashboard/rooster split exactly per the merge rule (dashboard `name`/`city`/`joiningDate`/`currentStatus`/`workerId` win since this rider exists in both sources; `paperNumber`/`email`/`phoneNumbers`/`company`/`jobTitle`/`contracts` are Rooster-only, tagged accordingly).
7. ✅ Flag on, unknown-but-in-range Worker ID → `200 { results: [] }` — clean not-found, not an error. (A deliberately out-of-range 12-digit value was also tried and correctly produces `400 invalid_search_term`, matching the corrected Finding above — confirmed this is genuine upstream integer-overflow behavior, not a bug in our mapping.)
8. ✅ Flag on, name substring search (`"Abanoub"`) → `200`, 2 matches, proving the full-roster-fetch-and-filter fallback works end-to-end.
9. ✅ Manual spot-check (outside the automated suite) of all 5 search types against the same real employee (`877614`) — `workerId`, `paperNumber` (`"29511120200678"`), `phone` (`"+201210378367"`), `email`, `name` — every type correctly resolved to the same employee, confirming `field_value`/`phone_number`/`email`/`name` matching all work correctly through the roster-fetch fallback after the `with_field=id_number` fix (Finding #2 above).
10. ✅ Zero existing files behaviorally changed: `app/riders/page.tsx`, `app/admin/riders/page.tsx`, `lib/adminService.ts` untouched; full `next build` — all pages generate successfully including the two new routes; Phase 0/Phase 1 regression suites re-run and still passing.

---

## Phase 3 — Payroll Ledger + Permanent Financial History

### 1. Endpoints used
None external — this phase is 100% internal (Google Sheets + our own API).

### 2. Google Sheets changes
**New tab: `سجل_المعاملات_المالية`** (append-only; rows are *never* updated or deleted by application code after creation, except the single `status` cell described below).

| Col | Header | Type | Notes |
|---|---|---|---|
| A | `transactionId` | UUID | |
| B | `entityType` | string | `rider` \| `supervisor` |
| C | `entityCode` | string | |
| D | `entityNameSnapshot` | string | captured at write time — see Feature 4 rationale |
| E | `type` | string | `bonus` \| `deduction` \| `advance` \| `adjustment` |
| F | `amount` | number | signed |
| G | `reason` | string | |
| H | `period` | string | `YYYY-MM` |
| I | `createdBy` | string | actor code |
| J | `createdByName` | string | actor name |
| K | `createdAt` | ISO string | |
| L | `status` | string | `active` \| `voided` \| `corrected` — **the only column ever mutated in-place**, and only from `active`→`corrected`/`voided`, never back |
| M | `correctsTransactionId` | string | empty unless this row supersedes another |
| N | `source` | string | **`ledger_native`** (created via the new Payroll API below) \| **`legacy_mirror`** (auto-created as a side-effect of the *existing, untouched* `خصومات_الإدارة` deduction flow — see frozen backward-compat decision below). **`calculateSupervisorSalary()`'s additive sum step reads `source='ledger_native'` rows only** — this is the frozen double-counting guard (§14 of the architecture doc). |

**Existing tabs touched:** none in schema/behavior. `الخصومات`, `السلف`, `خصومات_الإدارة`, `الأهداف`, `إعدادات_الرواتب` keep their exact current schema and behavior for every existing read/write. The **only** addition is one new, non-blocking, fire-and-forget side-effect: whenever `خصومات_الإدارة`'s existing create-deduction code path succeeds, it now also appends one mirror row into `سجل_المعاملات_المالية` with `source='legacy_mirror'` — same pattern as `sendAdminTelegramNotificationSafe` (never blocks, never fails, never rolls back the primary write; a Sheets-append failure here is only logged, not surfaced to the admin).

### 3. New APIs
| Route | Method | Auth | Request | Response |
|---|---|---|---|---|
| `POST /api/admin/payroll/transactions` | POST | admin JWT (`assertAdminApiAccess`, new feature key `payroll_ledger`) | `{ entityType, entityCode, type, amount, reason, period }` | `{ success:true, transaction: {...row, source:'ledger_native'} }` |
| `GET /api/admin/payroll/transactions` | GET | admin JWT | `?entityCode=&period=` | `{ success:true, transactions: [...] }` |
| `PATCH /api/admin/payroll/transactions/:id` | PATCH | admin JWT | `{ amount, reason }` (the "edit") | Appends a new row with `correctsTransactionId=:id`; flips original's `status` to `corrected`; returns both rows |
| `DELETE /api/admin/payroll/transactions/:id` | DELETE | admin JWT | — | Sets `status=voided` on that row only (no new row, no deletion) — this is how "delete" is expressed without ever removing a financial record |

All four gated by `FEATURE_PAYROLL_LEDGER_ENABLED`; each write calls `appendAuditLog()` from Phase 0, and (per the cross-cutting Telemetry requirement below) records `exec_ms` + `audit_event` via `recordMetric()`.

**Frozen backward-compatibility decision (no longer a choice — explicitly required):** old deductions via `خصومات_الإدارة` **keep working exactly as today, unmodified**. Simultaneously, every **new** deduction created through that existing flow **also** automatically creates a `source='legacy_mirror'` ledger row (fire-and-forget, non-blocking — see Sheets-changes section above). This satisfies both "old deductions must continue working exactly as today" and "every new deduction must also create a Ledger transaction automatically" at once, with the `source` column preventing any double-count in the salary math below.

**Additive change to existing endpoints (frozen, not a rewrite):**
- `GET /api/salary/calculate`, `GET /api/salary`, `GET /api/admin/salary/calculate` → response gains one new **optional** field: `ledgerTransactions: Transaction[]` (sum already folded into existing `netSalary`/`deductions.total` via one new addition step in `calculateSupervisorSalary()` — **this step sums `source='ledger_native'` rows only**, explicitly excluding `legacy_mirror` rows since those are already counted by the untouched `خصومات_الإدارة` sheet math; every existing field keeps its current value/meaning unchanged — verified in acceptance test #4/#8 below).

### 4. Impact on existing code
| File | Change | Risk | Mitigation |
|---|---|---|---|
| `lib/salaryService.ts` | **Additive.** One new step: fetch this period's `source='ledger_native'` rows for the supervisor, sum by `type`, add to existing totals; existing sheet-based math untouched, `legacy_mirror` rows explicitly skipped by this step. | **Medium** — this is the one hot/sensitive file touched in the entire plan | Feature-flagged: if `FEATURE_PAYROLL_LEDGER_ENABLED=false`, the new step is skipped entirely and `calculateSupervisorSalary()` behaves byte-for-byte as it does today (verified in acceptance test #1) |
| `app/api/admin/salary/admin-deductions/route.ts` | **Additive.** After its existing create-deduction logic succeeds (unchanged), one new fire-and-forget call appends a `source='legacy_mirror'` row to the ledger. | Low — wrapped in try/catch, logged-only on failure, never awaited-blocking the response | Feature-flagged: if `FEATURE_PAYROLL_LEDGER_ENABLED=false`, the mirror call is skipped entirely; existing deduction creation is 100% unaffected either way |
| `app/salary/page.tsx` | **Additive** — new "Ledger Transactions" section rendered below existing sections | Low | Flag-gated render |
| `app/admin/salaries/page.tsx` | **Additive** — new Bonus/Deduction/Advance/Adjustment entry form, alongside (not replacing) the existing admin-deductions form | Low | Flag-gated render |
| `types/index.ts` / API response types | **Additive field only**, never removed/renamed | Zero for existing consumers | TypeScript structural typing — old code that doesn't read the new field is unaffected |

### 5. Rollback plan
1. `FEATURE_PAYROLL_LEDGER_ENABLED=false` → `calculateSupervisorSalary()` skips the new step entirely, salary numbers instantly revert to today's exact values; new UI sections disappear; new API routes return `503`.
2. The ledger sheet itself is never deleted on rollback (data preservation) — it simply stops being read.
3. If a specific transaction was entered by mistake while the feature was live: use the `DELETE` endpoint (sets `voided`, excluded from all sums) — never a raw sheet-row delete.

### 6. Acceptance tests
1. **Regression guard (run first, before anything else in this phase):** for every currently-active supervisor, capture `calculateSupervisorSalary()`'s full output for the last 3 closed pay periods *before* this phase ships. After shipping with the flag OFF, recompute and diff — must be **byte-identical**. This is the single most important test in the whole plan.
2. With flag ON: add a `bonus` of 500 for supervisor X, period `2026-07` → `GET /api/salary/calculate` for X now shows `netSalary` exactly 500 higher than test #1's baseline for that period, and `ledgerTransactions` includes the new row.
3. `PATCH` that transaction's amount to 400 → original row's `status` becomes `corrected`, a new row with `amount:400` and `correctsTransactionId` set appears, `netSalary` reflects **400** (not 500, not 900).
4. `DELETE` the corrected transaction → its `status` becomes `voided`, `netSalary` for that period returns to test #1's baseline exactly.
5. Delete supervisor X via the existing `DELETE /api/admin/supervisors` flow (unchanged) → re-fetch all of X's ledger rows directly from the sheet → `entityNameSnapshot` still shows X's name correctly on every row, even though X no longer exists in `المشرفين`.
6. Non-admin JWT on any of the four new routes → `401`/`403`, matching existing admin-route guard behavior exactly.
7. Two admins submit a bonus for the same supervisor+period within the same second → **both** rows are appended (append-only has no lost-update problem, unlike the existing sheet's read-modify-write patterns) — verified by row count, not overwritten.
8. **Double-counting guard (new, critical):** create a deduction of 300 for supervisor Y via the **existing, untouched** `خصومات_الإدارة` flow → confirm (a) `خصومات_الإدارة` sheet gets its row exactly as it does today, (b) exactly **one** new `source='legacy_mirror'` row appears in `سجل_المعاملات_المالية`, and (c) `GET /api/salary/calculate` for Y shows the deduction counted **exactly once** (not twice) — proves the `source`-filtered sum step in `salaryService.ts` correctly excludes the mirror row.
9. Temporarily force the mirror-write to fail (e.g. bad Sheets creds in a test env) → the original `خصومات_الإدارة` deduction creation still returns `200` and succeeds normally; only a log entry records the failed mirror — proves the fire-and-forget guarantee.

---

## Phase 4 — Rent Management

### 1. Endpoints used
None external.

### 2. Google Sheets changes
**New tab: `عقود_الإيجار`**

| Col | Header | Type |
|---|---|---|
| A | `contractId` | UUID |
| B | `office` | string |
| C | `governorate` | string |
| D | `monthlyRent` | number |
| E | `paymentDay` | number (1–28) |
| F | `landlord` | string |
| G | `notes` | string |
| H | `active` | boolean |
| I | `createdAt` | ISO string |
| J | `createdBy` | string |

**New tab: `مدفوعات_الإيجار`**

| Col | Header | Type |
|---|---|---|
| A | `paymentId` | UUID |
| B | `contractId` | string (FK) |
| C | `month` | `YYYY-MM` |
| D | `paidDate` | ISO string (empty if unpaid) |
| E | `amount` | number |
| F | `status` | `paid` \| `pending` \| `overdue` (computed at read time from `paymentDay` vs today when `paidDate` is empty, not stored as stale) |
| G | `recordedBy` | string |
| H | `createdAt` | ISO string |

### 3. New APIs
| Route | Method | Auth | Purpose |
|---|---|---|---|
| `GET/POST /api/admin/rent/offices` | GET/POST | admin JWT, feature key `rent_management` | list/create rent contracts |
| `GET/POST /api/admin/rent/payments` | GET/POST | admin JWT | list/record payments |
| `GET /api/cron/rent-reminder` | GET | `isCronAuthorized` (same as all other crons) | daily job, Telegram reminder N days before `paymentDay` for contracts with no `paidDate` this month |

New cron entry in `vercel.json`: `{ "path": "/api/cron/rent-reminder", "schedule": "0 8 * * *" }` (daily 08:00 UTC) — **additive array entry**, does not touch any existing cron's schedule/path.

`NotificationType` union in `lib/adminTelegramNotifier.ts` gains one new value: `'rent_reminder'` — additive to the existing 8-value union, the 8 existing call sites are unaffected (TypeScript union widening is non-breaking).

### 4. Impact on existing code
| File | Change | Risk |
|---|---|---|
| `lib/adminTelegramNotifier.ts` | **Additive** — one new `NotificationType` value + one new `case` in `formatNotificationMessage`'s switch; all existing cases untouched | Low |
| `vercel.json` | **Additive** — one new array entry | Zero (existing 7 entries untouched, confirmed by diff) |
| `lib/adminFeatureAccess.ts` | **Additive** — one new `AdminFeatureKey` (`rent_management`) added to the existing union/type + menu defs | Zero |

### 5. Rollback plan
`FEATURE_RENT_ENABLED=false` disables the two CRUD routes and hides the sidebar entry. The cron route itself checks the same flag and no-ops (skips sending any Telegram message) if disabled — so even if the Vercel Cron fires on schedule, it's a silent no-op, not an error.

### 6. Acceptance tests
1. Create a rent contract with `paymentDay=5` → appears in `عقود_الإيجار` with all fields correct.
2. Record a payment for the current month → `مدفوعات_الإيجار` gets a row, contract's computed status for this month becomes `paid`.
3. A contract with no payment recorded and today > `paymentDay` → computed status `overdue`; today ≤ `paymentDay` → `pending`.
4. Run `/api/cron/rent-reminder` manually 3 days before a contract's `paymentDay` with no payment recorded → exactly one Telegram message fires, correctly formatted, and existing notification types (termination/assignment/etc.) fired in the same test window are unaffected (regression check on the shared notifier module).
5. With `FEATURE_RENT_ENABLED=false`, invoke the cron anyway → `200 { skipped:true }`, zero Telegram sends, zero errors.
6. Existing 8 Telegram notification call sites (termination, assignment, reactivation, equipment ×2, ticketing, rider-metadata-reminder, rooster keepalive/live-sync) each fire once during this phase's test window exactly as before — proves the `NotificationType` union addition caused no regression.

---

## Phase 5 — Monthly Financial Report

### 1. Endpoints used
None external — pure aggregation over Phase 3 + Phase 4 data plus the existing salary calculator.

### 2. Google Sheets changes
None. Pure read-aggregation; no new tab required for the MVP (see SRS-013 §6 — a frozen "report snapshot" tab is an explicitly optional Phase-2 enhancement, not part of this freeze).

### 3. New APIs
| Route | Method | Auth | Request | Response |
|---|---|---|---|---|
| `GET /api/admin/financial-report/monthly` | GET | admin JWT | `?month=&year=&format=json\|excel\|pdf` | `json`: `{ totalSalaries, totalBonuses, totalDeductions, totalAdvances, totalRent, otherExpenses, grandTotal, previousMonth: {...}, trendPct }`. `excel`/`pdf`: file download |

Gated by `FEATURE_MONTHLY_REPORT_ENABLED`. **PDF decision frozen: `pdf-lib`, real PDF engine, no browser print** (SRS-013 §6/§12) — `format=pdf` calls new `lib/pdf/monthlyFinancialReportPdf.ts` → `buildMonthlyReportPdf(reportData): Promise<Buffer>`, returns an actual downloadable `.pdf` file, not printable HTML.

### 4. Impact on existing code
| File | Change | Risk |
|---|---|---|
| `lib/exportExcelAsync.ts` | **None** — called as-is for the Excel branch | Zero |
| `package.json` | **Additive** — one new dependency, `pdf-lib` (pure JS, no Chromium/Puppeteer) | Low |
| Everything else | Net new files only | Zero |

### 5. Rollback plan
`FEATURE_MONTHLY_REPORT_ENABLED=false` → route disabled, sidebar entry hidden. Purely additive read feature; nothing to roll back data-wise.

### 6. Acceptance tests
1. Report for a month with known Phase 3/4 data → `grandTotal` equals the manually-computed sum of all five components (cross-checked by hand once during UAT).
2. Previous-month comparison and trend % are correct for two consecutive months with different totals.
3. `format=excel` → downloadable `.xlsx` opens correctly with matching totals.
4. `format=pdf` → downloadable **`.pdf` file (generated via `pdf-lib`, not `window.print()`)** opens correctly in a real PDF viewer, with totals matching the JSON response exactly.
5. Non-admin JWT → `401`.
6. Month with zero data in Phase 3/4 tabs (e.g. before they existed) → all-zero report, not a crash — proves the aggregation is defensive against empty new tabs.

---

## Cross-Cutting: Telemetry & Health Metrics (applies to every phase above)

Frozen per your explicit addition — *"Every new feature must expose telemetry and health metrics... so we can monitor production behavior without enabling debug logs."* Full spec in `SRS013_ROOSTER_API_PAYROLL_ARCHITECTURE.md` §13; summary here since it touches every phase's acceptance criteria:

- New `lib/telemetry.ts` → `recordMetric({ feature, metric, value?, tags? })`, storing into Redis (Upstash, same account as existing caches) with a 48h rolling window (`EXPIRE`) — bounded, no new infra.
- Every new subsystem instruments itself: `RoosterClient` calls (`exec_ms`, `api_failure`), Smart Cache (`cache_hit`/`cache_miss`), Request Queue (`queue_wait_ms`), `appendAuditLog()` (`audit_event`), and each new write path in Phases 1/3/4 (`exec_ms`, `api_failure`).
- New route `GET /api/admin/health/metrics` (admin-only) renders per-feature aggregates (p50/p95 exec time, cache hit ratio %, failure counts) — a plain admin page, no new dashboard framework.
- **Acceptance test (applies once, verified across all phases together, not repeated per-phase):** after Phases 0–5 are live, `GET /api/admin/health/metrics` shows non-zero, sane values for every feature that has been exercised at least once (cache hit ratio between 0–100%, exec times in a plausible ms range, failure counts matching any deliberately-forced failures from each phase's own acceptance tests) — proving observability works without flipping on debug logs anywhere.
- **Zero impact on existing features:** purely new instrumentation on purely new code paths; metric-recording itself is fire-and-forget and can never fail or slow down the real request it's measuring.

---

## Sign-off Checklist

- [x] Endpoint for Feature 2 resolved — **✅ Endpoint Confirmed**, live-validated (SRS-013 §2 / this doc's Phase 2 §1)
- [x] PDF export decision made — **✅ Frozen to `pdf-lib`** (real PDF engine, no browser print) (SRS-013 §6 / this doc's Phase 5 §3)
- [x] Decision on `خصومات_الإدارة` — **✅ Frozen: leave as-is AND auto-mirror every new deduction into the ledger** (`source='legacy_mirror'`, excluded from salary sums) (SRS-013 §3 / this doc's Phase 3 §2–3)
- [x] Telemetry & health-metrics requirement — **✅ Adopted, frozen** (SRS-013 §13 / cross-cutting section above)
- [ ] Soft-delete scope decision (confirmed out-of-scope by default per SRS-013 §4) — no action needed unless you want to revisit
- [ ] Final architecture review re-run for breaking changes / race conditions / permission leaks / cache invalidation / Sheets consistency / rollback safety — **✅ Completed, passed** (SRS-013 §14)
- [x] Approval to begin **Phase 0** — **✅ granted 2026-07-27, shipped same day.** New files only (`lib/telemetry.ts`, `lib/upstashRest.ts`, `lib/auditLog.ts`, `lib/rooster/*`, `app/api/admin/health/metrics/route.ts`, `scripts/srs013-phase0-verify.ts`); zero existing files modified (confirmed by `git diff` scope); all acceptance tests passed live against real Sheets/Redis.
- [x] Approval to begin **Phase 1** — **✅ granted 2026-07-27, shipped same day.** New files: `lib/rooster/cityMap.ts`, `app/api/rooster/shifts/import/route.ts`, `scripts/srs013-phase1-verify.ts`. Modified (additive only, confirmed): `app/shifts/page.tsx` (new panel + one extracted-but-behavior-identical helper), `env.local.example` (docs only). `FEATURE_SHIFT_IMPORT_ENABLED` defaults **off** in production until you flip it on.
- [x] Approval to begin **Phase 2** — **✅ granted 2026-07-27 ("جاهز ل phase 2"), shipped same day.** New files: `lib/rooster/riderMerge.ts`, `app/api/rooster/riders/search/route.ts`, `app/rider-search/page.tsx`, `scripts/srs013-phase2-verify.ts`. Modified (additive only, confirmed): `lib/rooster/RoosterClient.ts` (+`searchRiders()`), `components/Layout.tsx` + `lib/adminFeatureAccess.ts` (one nav entry each, reusing the existing `riders` feature key), `env.local.example` (docs only). Live testing during the build **corrected** the original endpoint contract (`with_field` doesn't filter on anything except a numeric `id`; 4 of 5 search types now use a cached full-roster fetch + in-memory filter instead) — see Phase 2 §1 "CORRECTED FINDING" entries above for the evidence. **`FEATURE_RIDER_SEARCH_ENABLED` set to `true` on Vercel Production (2026-07-27, after your explicit approval) and verified live post-redeploy: `GET /api/rooster/riders/search` (capability check) → `enabled:true`; a real `type=workerId&q=877614` search → `200` with the correct merged profile.** **Phase 3 does not start until you explicitly approve it too**, per the same phase-by-phase discipline.
