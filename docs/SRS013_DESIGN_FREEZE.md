# SRS-013 — Design Freeze

**Status:** 🟡 AWAITING SIGN-OFF — implementation starts only after this document is approved, and Phase *N+1* starts only after Phase *N* passes its acceptance tests in production.
**Companion doc:** `docs/SRS013_ROOSTER_API_PAYROLL_ARCHITECTURE.md` (rationale/why). This document is the *what, exactly* — frozen contracts, not architecture prose.
**Baseline commit:** `eed9c44` (current `main`, includes the rooster-live-sync cron fix + Gmail OTP automation, both already in production).

Every phase below follows the same six-part contract you asked for:
Endpoints → Sheets changes → New APIs → Impact on existing code → Rollback plan → Acceptance tests.

**Global rule enforced in every phase:** no existing Sheet tab's schema changes, no existing API response *removes or renames* a field (additive only), and no existing file's *behavior* changes for existing callers.

**Global rollback mechanism (applies to every phase, not repeated each time):**
1. Every new feature is gated by one new env var (`FEATURE_X_ENABLED`, default `false` until explicitly turned on in Vercel). Flipping it off is a 10-second Vercel dashboard/CLI action — **no redeploy, no code change** — and immediately hides the new UI entry point and makes the new API route return `503 { enabled:false }`.
2. Underneath that, standard Vercel one-click "instant rollback to previous deployment" is always available (as already used in this project).
3. Because every new Sheet tab is **append-only and net-new**, disabling a feature flag never leaves partial/inconsistent data in any *existing* tab — the worst case is unused rows sitting in a new tab, which is harmless.
4. Standard `git revert <commit>` + redeploy is the final fallback if the flag itself needs to disappear entirely.

---

## Phase 0 — Foundation (RoosterClient, Smart Cache, Request Queue, Audit Log)

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

### 6. Acceptance tests
1. `ensureSheetExists('سجل_العمليات', headers)` run twice in a row → tab created once, second call is a no-op, headers match exactly the table above.
2. `appendAuditLog()` called with a sample payload → exactly one new row appended, all 10 columns populated, no existing tab is touched (verified by diffing row counts of every other tab before/after).
3. `RoosterClient.exportShiftsCsv()` called with the same params as the existing hourly cron → byte-identical CSV to calling `exportRoosterCsv()` directly (proves the wrapper changes nothing).
4. Two concurrent calls to `RoosterClient.exportShiftsCsv()` with the *same* params within the cache TTL → only **one** real outbound Rooster request fires (verified via a log counter), second caller gets the cached result.
5. Three concurrent calls with *different* params, queue capped at 2 → the 3rd request measurably waits for one of the first two to finish before firing (verified via timestamps in logs).
6. Existing `/api/cron/rooster-sync`, `/api/cron/rooster-live-sync`, `/api/cron/rooster-keepalive` continue to run on their normal schedule with `success:true` for at least one full cycle each, unmodified — proves Phase 0 shipped with zero regression.

---

## Phase 1 — Automatic Shift Import

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

---

## Phase 2 — Rider Search *(provisionally frozen — one param pending)*

### 1. Endpoints used
🔴 **Not yet known.** Everything below is frozen **except** the literal Rooster URL/method/response shape, which needs one of the two resolutions described in SRS-013 §2 (DevTools capture from you, or authorized exploratory probing). The moment that's confirmed, only `RoosterClient.searchRiders()`'s internal implementation is filled in — the API contract below does **not** change.

### 2. Google Sheets changes
**None.** This is a live lookup only; nothing is written to Sheets (confirmed: no "Paper Number" concept exists in our roster data, so there's nothing to reconcile).

### 3. New APIs (frozen contract regardless of the endpoint above)
| Route | Method | Auth | Request | Response |
|---|---|---|---|---|
| `GET /api/rooster/riders/search` | GET | supervisor-or-admin JWT | `?q=<worker id, paper number, name, or phone>` | `{ success: true; results: RoosterRiderSearchResult[] }` where each result is `{ workerId, paperNumber, name, phone, vehicle, status, zone, email }` (fields present only if Rooster returns them — no invented data) |

Cached via Phase 0's 5-minute Smart Cache, gated by `FEATURE_RIDER_SEARCH_ENABLED`.

### 4. Impact on existing code
| File | Change | Risk |
|---|---|---|
| `app/riders/page.tsx`, `app/admin/riders/page.tsx` | **None** — new search lives in its own UI surface, not merged into the existing Sheets-backed rider tables (different data source, avoid conflating "our roster" with "Rooster's live record") | Zero |
| New files only | Net new | Zero |

### 5. Rollback plan
`FEATURE_RIDER_SEARCH_ENABLED=false` → search box hidden, route disabled. No persisted data exists to roll back.

### 6. Acceptance tests
1. Search by a known Worker ID → returns the same info visible on Rooster's own Riders page for that person (manually cross-checked at least 3 times during UAT).
2. Search with no results → `{ success:true, results:[] }`, UI shows a clear "not found" state, not an error.
3. Two identical searches within 5 minutes → second one served from cache (Phase 0 log counter shows 1 real Rooster call, not 2).
4. Search endpoint failing/Rooster session dead → `502` with a message, **no** Telegram alert fires for this (rider search is user-facing/on-demand, not a background job — alerting policy stays scoped to the existing sync/keepalive crons only, per "zero impact on existing Telegram workflow").

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

**Existing tabs touched:** none. `الخصومات`, `السلف`, `خصومات_الإدارة`, `الأهداف`, `إعدادات_الرواتب` keep their exact current schema and behavior.

### 3. New APIs
| Route | Method | Auth | Request | Response |
|---|---|---|---|---|
| `POST /api/admin/payroll/transactions` | POST | admin JWT (`assertAdminApiAccess`, new feature key `payroll_ledger`) | `{ entityType, entityCode, type, amount, reason, period }` | `{ success:true, transaction: {...row} }` |
| `GET /api/admin/payroll/transactions` | GET | admin JWT | `?entityCode=&period=` | `{ success:true, transactions: [...] }` |
| `PATCH /api/admin/payroll/transactions/:id` | PATCH | admin JWT | `{ amount, reason }` (the "edit") | Appends a new row with `correctsTransactionId=:id`; flips original's `status` to `corrected`; returns both rows |
| `DELETE /api/admin/payroll/transactions/:id` | DELETE | admin JWT | — | Sets `status=voided` on that row only (no new row, no deletion) — this is how "delete" is expressed without ever removing a financial record |

All four gated by `FEATURE_PAYROLL_LEDGER_ENABLED`; each write calls `appendAuditLog()` from Phase 0.

**Additive change to existing endpoints (frozen, not a rewrite):**
- `GET /api/salary/calculate`, `GET /api/salary`, `GET /api/admin/salary/calculate` → response gains one new **optional** field: `ledgerTransactions: Transaction[]` (sum already folded into existing `netSalary`/`deductions.total` via one new addition step in `calculateSupervisorSalary()`; every existing field keeps its current value/meaning unchanged — verified in acceptance test #4 below).

### 4. Impact on existing code
| File | Change | Risk | Mitigation |
|---|---|---|---|
| `lib/salaryService.ts` | **Additive.** One new step: fetch this period's ledger rows for the supervisor, sum by `type`, add to existing totals; existing sheet-based math untouched. | **Medium** — this is the one hot/sensitive file touched in the entire plan | Feature-flagged: if `FEATURE_PAYROLL_LEDGER_ENABLED=false`, the new step is skipped entirely and `calculateSupervisorSalary()` behaves byte-for-byte as it does today (verified in acceptance test #1) |
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

Gated by `FEATURE_MONTHLY_REPORT_ENABLED`. **PDF format decision still open per SRS-013 §12.2** — this contract works identically either way (only the internal renderer differs); does not block freezing everything else in this phase.

### 4. Impact on existing code
| File | Change | Risk |
|---|---|---|
| `lib/exportExcelAsync.ts` | **None** — called as-is for the Excel branch | Zero |
| Everything else | Net new files only | Zero |

### 5. Rollback plan
`FEATURE_MONTHLY_REPORT_ENABLED=false` → route disabled, sidebar entry hidden. Purely additive read feature; nothing to roll back data-wise.

### 6. Acceptance tests
1. Report for a month with known Phase 3/4 data → `grandTotal` equals the manually-computed sum of all five components (cross-checked by hand once during UAT).
2. Previous-month comparison and trend % are correct for two consecutive months with different totals.
3. `format=excel` → downloadable `.xlsx` opens correctly with matching totals.
4. `format=pdf` → downloadable/printable output matching the JSON totals (exact mechanism per the open PDF decision).
5. Non-admin JWT → `401`.
6. Month with zero data in Phase 3/4 tabs (e.g. before they existed) → all-zero report, not a crash — proves the aggregation is defensive against empty new tabs.

---

## Sign-off Checklist

- [ ] Endpoint for Feature 2 resolved (SRS-013 §2 / this doc's Phase 2 §1)
- [ ] PDF export decision made (Option A vs B, SRS-013 §6 / this doc's Phase 5 §3)
- [ ] Decision on `خصومات_الإدارة` (leave as-is vs. re-point to new ledger) — leaving as-is is the default if not specified
- [ ] Soft-delete scope decision (confirmed out-of-scope by default per SRS-013 §4)
- [ ] Approval to begin **Phase 0** — every later phase is individually testable and revertable, and will not start until the previous phase's acceptance tests have passed in production.
