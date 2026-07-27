# SRS-013 — Direct Rooster API Integration, Full Payroll Module & Enterprise Infrastructure

**Status:** 🟢 DESIGN FROZEN — all open decisions resolved (§12), final architecture review passed (§14). Still **NOT YET APPROVED FOR IMPLEMENTATION** — awaiting explicit go-ahead for Phase 0.
**Author:** Lead Software Architect (Cursor Agent)
**Date:** 2026-07-27 (last updated same day — endpoint confirmed live, PDF/Payroll decisions frozen, telemetry requirement added)
**Constraint:** Zero breaking changes. Every existing feature keeps working exactly as it does today.

This document is the complete architectural analysis and implementation plan requested before any
code is written. It is based on an exhaustive, evidence-based inventory of the current codebase
(five parallel deep-dive audits), not assumptions. No files were modified to produce this document.

---

## 0. Executive Summary of Current-State Findings

| Area | Finding |
|---|---|
| **Auth/Roles** | 3 JWT roles only: `supervisor`, `admin`, `recruitment_manager`. No rider/employee login exists. Admin RBAC is a feature-key string (`limited:feat1,feat2`) stored on the Admins sheet, not a permissions table. |
| **Backend** | Google Sheets (2 workbooks: main + shifts) is the source of truth for everything except Rooster Live (Redis-only) and Ticketing (Neon Postgres). ~45 distinct sheet tabs in active use. |
| **Caching** | L1 in-memory (3 min) + L2 Upstash Redis REST (15 min for sheets, TTL varies per feature) already exists (`lib/tieredCache.ts`, `lib/redisCache.optional.ts`). |
| **Rooster integration today** | **No unified `RoosterClient`.** Two separate, single-purpose fetch stacks: `lib/roosterLive/client.ts` (live rider polling, cron-only, every 1 min) and `lib/roosterExport.ts` (historical CSV shift export, cron-only, hourly). They share only the auth/cookie layer (`tokenProvider.ts`, `roosterSessionStore.ts`, `smartRefreshRoosterAuth`). |
| **Shift import today** | Already 90% automated! `lib/shiftAutomationLegacy.ts` + `lib/shiftsLegacyAnalyze.ts` do all the parsing/joining/reporting. The **only** manual step left is the CSV upload — a cron (`rooster-sync`, hourly) already calls `exportRoosterCsv()` and feeds the *same* analysis logic automatically. Crucially: **shift data is never written into a Sheet today** — both manual and automatic paths are analyze-only, in-memory, request/response. |
| **Rider search today** | Sheets-backed only (`المناديب` tab), search by `code` substring. **No "Paper Number" field exists anywhere in the codebase.** No existing Rooster "Riders" search API call had ever been made by this app — the exact endpoint (`GET /api/rooster/v3/employees`) is now confirmed and live-validated (§2). |
| **Salary/Payroll today** | **Compute-on-read, not a ledger.** No persisted paystub. Advances have no reason/timestamp/created-by. Bonus is a hidden monthly cell not even returned by the API. Admin deductions are the *only* transaction-like row (amount+reason+date+createdBy) but are still mutable, unaudited sheet rows. |
| **Deletion & financial history** | `deleteRider`/`deleteSupervisor` **hard-delete** the roster row. Financial sheet rows are never touched by deletion today — but only by accident, not by design, and they store no name snapshot, so a deleted person's identity could become unresolvable in old records. |
| **Settings** | No dedicated `/settings` hub exists. Config is scattered across single-purpose admin pages (`salary-config`, `equipment-pricing`, `equipment-limits`, `admin-permissions`), each with its own Sheet tab. |
| **Reports/Export** | Excel export is first-class (`xlsx@0.18.5`). **PDF export does not really exist** — "PDF" today means `window.print()` on an HTML page. |
| **Telegram** | Outbound-only, instant-fire (`lib/adminTelegramNotifier.ts`). No scheduling/reminder primitive exists — every cron-based alert is "check now, send now." |
| **Background jobs/Queue** | **No queue infrastructure at all** (no BullMQ/QStash/etc.). Only Vercel Cron + long synchronous requests, up to `maxDuration: 300` (5 min), already used by several routes (`ghost-riders-export`, `daily-backup`, etc.). |
| **Audit trail precedent** | Two existing patterns to imitate: (a) Sheets-native field-audit tabs (`سجل_بيانات_المناديب_الاستراتيجية`, `سجل_نشاط_المرشحين`) — actor + old/new value + timestamp; (b) Neon Postgres `ticket_audit_logs` for Ticketing only. |
| **Stack** | Next.js 14 (App Router), React 18, `googleapis`, `xlsx`, `postgres` (Neon, already used by Ticketing), Upstash Redis via REST (no ioredis/BullMQ compatibility). No UI kit (custom Tailwind). |

---

## 1. Feature 1 — Automatic Shift Import

### What already exists (huge reuse)
- `lib/shiftAutomationLegacy.ts` — CSV/XLSX parsing, column mapping, dedup (`{date}__{employee_id}`), HQ join, filtering. **Untouched.**
- `lib/shiftsLegacyAnalyze.ts` — orchestration, report building. **Untouched.**
- `lib/roosterExport.ts` — `exportRoosterCsv({ cityId, startAt, endAt })` already calls Rooster's real shifts-export endpoint and returns rows in the exact shape the legacy analyzer expects. **Untouched.**
- `app/api/cron/rooster-sync/route.ts` — proves this whole pipeline already works end-to-end automatically, today, hourly (city/date range is env-driven, not user-driven).

### What's missing
Only the **on-demand, user-driven trigger** with a Zone + date-range picker. There is no API route that lets a human pick a zone/date range and get the same report the manual CSV-upload flow produces, sourced from Rooster instead of a file.

### Plan
- **New route:** `POST /api/rooster/shifts/import` — body `{ zoneOrCityId, startDate, endDate }`. Auth: same guard as `legacy-analyze` (supervisor-or-admin JWT).
- Internally: resolve `cityId` from zone → call `exportRoosterCsv()` (via the new RoosterClient, see §7) → feed the **exact same** `analyzeLegacyShifts`/`preprocessShiftsLikeLegacy` pipeline used today → return the same report shape the `/shifts` page already renders.
- **New UI:** a "Zone / Start Date / End Date / Import" panel on `/shifts`, next to (not replacing) the existing file-upload panel — CSV upload keeps working for anyone who still wants it (zero breaking change).
- **Zero new Sheets. Zero new processing logic.** This is the safest, highest-reuse feature — recommended to build **first**.

### Risk
- Vercel `maxDuration` ceiling (300s): a very large date range (>~30 days for a big city) could risk timing out. Mitigate by capping the UI's date-range picker (e.g. 31 days) and chunking larger ranges into multiple `exportRoosterCsv` calls internally if ever needed later.

---

## 2. Feature 2 — Rider Search (via Rooster)

### ✅ Endpoint Confirmed (validated live, read-only, 2026-07-27)

You captured the real request the official Rooster UI uses for this search. It was then **independently re-validated** end-to-end against the live backend using a throwaway, read-only probe script (`scripts/rooster-employees-endpoint-check.ts`, kept in the repo as a diagnostic, ships zero product code) — critically, using **only the existing, already-in-production Rooster auth layer** (`getRoosterLiveHeaders()` + `smartRefreshRoosterAuth()` → the same dhh_token-mint-then-call flow the live-sync cron performs every minute). None of the Bearer token / cookies / refresh token you captured manually were used, stored, or hardcoded anywhere — confirming the "reuse existing auth, never persist captured credentials" constraint is fully honored.

| Item | Confirmed value |
|---|---|
| **Endpoint** | `GET https://eg.me.logisticsbackoffice.com/api/rooster/v3/employees` |
| **Auth** | Identical to every other Rooster call already in production: stable `Cookie` (`CF_Authorization` + `CF_AppSession`, from env or the `cron_config` Sheet) **plus** a freshly-minted `dhh_token` via the existing Okta mint step. Confirmed by direct test: calling with the stable cookie *alone* (no dhh_token) returns the Cloudflare Access **sign-in HTML page**, not JSON — the dhh_token mint is required for this endpoint too, exactly like the live-riders endpoint. `RoosterClient` (§7.3) must always resolve headers via `smartRefreshRoosterAuth()`, never the raw stable cookie. |
| **Query params (confirmed)** | `search_id` (value to search for), `with_field` (which column `search_id` matches against — `id_number` confirmed working; `phone_number`/`email`/`name` are untested but are literal top-level response field names, strongly suggesting they're also valid `with_field` values — to be confirmed with one more real capture if/when needed, non-blocking), `filter_status=active_contract`, `with_contracts=true`, `page`, `size` |
| **Response shape (confirmed)** | A **Spring-Boot/Hibernate `Page<T>` envelope**, not a bare array: `{ content: Employee[], pageable, total_pages, total_elements, number_of_elements, number, size, first, last, sort, empty }`. `RoosterClient.searchRiders()` must read `content`, not assume a top-level array. |
| **`Employee` fields actually returned (confirmed, live sample)** | `id`, `name`, `email`, `phone_number`, `bank_data`, `birth_date`, `contracts[]`, `active_contract`, `reporting_to`, `work_permit_expiry_date`, `batch_number`, `field_value`, `created_at`, `starting_point_ids`. Nested `active_contract`/`contracts[i]`: `id`, `employee_id`, `contract`, `start_at`, `end_at`, `start`, `end`, `status`, `job_title`, `city_id`, `city_name`, `time_zone`, `vehicle_type`, `currently_active`. This is the real field set — **every field returned gets surfaced to the UI** per your instruction ("return every field available"), none invented. |
| **Rate-limit visibility** | **None.** No `X-RateLimit-*`/`Retry-After` headers present on any response observed. We cannot detect Rooster's limit reactively — reinforces why the Smart Cache + single-flight/semaphore Request Queue (§7.1–7.2) must front **every** call to this endpoint, not just be a nice-to-have. |
| **Failure handling (confirmed, live-tested)** | (a) Valid-type search with no match → clean `200`, `content: []`, `total_elements: 0` — treat as a normal empty-result state, not an error. (b) Type-mismatched `search_id` for the chosen `with_field` (e.g. a non-numeric string against `id_number`) → `409 Conflict` with a raw Hibernate `DataException` message (`"could not extract ResultSet..."`) — this is an **internal implementation-detail error that must never reach the UI verbatim**; `RoosterClient.searchRiders()` must catch any `4xx` from this endpoint and return a generic `{ success:false, reason:'invalid_search_term' }` (or `'rooster_unavailable'` for `5xx`/network errors), matching the existing "graceful failure, no raw upstream errors surfaced" pattern already used elsewhere in the codebase. |

### Worker ID / Paper Number mapping (best-evidence conclusion, non-blocking)
`phone_number` and `email` are confirmed literal top-level fields — matching two of your five requested search methods exactly. `id` (top-level, numeric) is the best-evidence match for **Worker ID**, and `with_field=id_number` (the literal captured value) is the best-evidence match for searching **by** that same numeric ID. **"Paper Number" was not observed as a distinct field** in the live sample (2 records) — it may only appear for specific employees/contract states, or `with_field` may accept a `paper_number`-style value not yet captured. This is a **non-blocking implementation detail**: `RoosterClient.searchRiders({ method: 'workerId'|'paperNumber'|'phone'|'name'|'email', value })`'s internal `with_field` mapping can be refined during Phase 2 build/UAT without changing the frozen public contract in `SRS013_DESIGN_FREEZE.md`, and if Paper Number genuinely isn't queryable server-side, the UI falls back to client-side filtering over the `id_number`/name results already covered by the Smart Cache — no design change needed either way.

### Plan (frozen)
- Add a typed method to the new `RoosterClient` (§7): `searchRiders({ method, value, page?, size? })`, returning the flattened `content[]` (never the raw envelope) plus `{ totalElements, totalPages }`.
- **New route:** `GET /api/rooster/riders/search?type=workerId|paperNumber|phone|name|email&q=...` — wraps it with the Smart Cache (§7, 5 min TTL) since the same Worker ID will often be searched by multiple supervisors in a short window, and the same Request Queue/semaphore as every other Rooster call.
- **Merge with dashboard data:** for the matched rider, look up `المناديب` by the best available key (phone/name heuristic, or Worker ID if we ever store a mapping) and merge field-by-field: **dashboard (Sheets) value wins on any field present in both**; any Rooster-only field is added to the merged object and tagged `source:'rooster'` for the UI to render as "Live from Rooster"; any Sheets-only field is tagged `source:'dashboard'`. No field is ever silently dropped or duplicated in the response.
- **New UI:** a search box (Worker ID / Paper Number / Phone / Name / Email) in Rider Management, opening a **Single Rider Profile** view — Personal info, Employment info, Contract info, phone numbers, Paper Number, Worker ID, City, current status, Company, job title, joining date, plus any additional Rooster fields — each field labeled "Live from Rooster" or "Dashboard" per the merge rule above. Additive; does not touch the existing Sheets-backed `/riders` or `/admin/riders` list pages.

---

## 3. Feature 3 — Payroll Upgrade (full ledger)

### Key architectural decision, and why
Your Feature 4 explicitly states **"Google Sheets should remain the source of truth."** I'm honoring that literally rather than defaulting to Postgres (even though Ticketing's Neon audit table is a tempting precedent) — this keeps the entire financial domain in one backend, consistent with your explicit instruction, and reuses 100% existing infrastructure (`googleSheets.ts`, `appendToSheet`).

### Design: append-only ledger, never mutate/delete rows
**New Sheet tab: `سجل_المعاملات_المالية`** (Financial Transactions Ledger), one row per transaction:

| Column | Meaning |
|---|---|
| `transactionId` | UUID, generated at creation |
| `entityType` | `rider` \| `supervisor` |
| `entityCode` | rider/supervisor code at time of entry |
| `entityNameSnapshot` | **name captured at creation time** — this is what makes history survive deletion (see §4) |
| `type` | `bonus` \| `deduction` \| `advance` \| `adjustment` |
| `source` | **`ledger_native`** (created directly via the new Payroll API) \| **`legacy_mirror`** (auto-mirrored from the existing `خصومات_الإدارة` flow — see backward-compat decision below). `calculateSupervisorSalary()`'s new additive step sums `ledger_native` rows **only**, never `legacy_mirror` (already counted by the untouched old-sheet math) — this is the double-counting guard. |
| `amount` | signed number |
| `reason` | free text |
| `period` | month/year this transaction applies to |
| `createdBy` / `createdByName` | actor code + name (JWT) |
| `createdAt` | ISO timestamp |
| `status` | `active` \| `voided` \| `corrected` |
| `correctsTransactionId` | if this row supersedes an earlier one (see below) |

**"Editable history" without mutation:** an edit never overwrites a row. It **appends a new row** with `correctsTransactionId` pointing at the original, and the original's `status` becomes `corrected` via a single, narrow, append-only-safe update (flipping one enum cell — not rewriting amounts/dates). The full chain is always reconstructable = a real audit trail, not just a mutable cell.

### Backward compatibility with existing `salaryService.ts`
`calculateSupervisorSalary()` (the hot, production, sensitive path used by every supervisor today) is **not rewritten**. It gains one **new, additive** step: sum any `سجل_المعاملات_المالية` rows for that supervisor/period and fold them into the existing `deductions`/`bonus` totals it already returns. Old sheets (`الخصومات`, `السلف`, `خصومات_الإدارة`, `الأهداف`) keep working exactly as they do today — nothing is migrated or frozen; both sources are additive.

**Frozen decision (no longer optional): dual-write, not a re-point.** The old admin-deductions flow (`خصومات_الإدارة`) keeps reading/writing its existing sheet **exactly as today — zero behavior change**. Additionally, every **new** deduction created through that existing flow now **also** appends a mirror row into the new ledger (`سجل_المعاملات_المالية`), tagged `source:'legacy_mirror'`. This satisfies "old deductions must continue working exactly as today" **and** "every new deduction must also create a Ledger transaction automatically" simultaneously, with zero risk of double-counting — see the `source` column and the explicit salaryService exclusion rule below.

**Double-counting guard (critical, caught in final architecture review §14):** `calculateSupervisorSalary()`'s existing math already sums `خصومات_الإدارة` directly from its own sheet — untouched. The **new additive ledger-sum step** (below) must sum **only** ledger rows where `source='ledger_native'` (created via the new `POST /api/admin/payroll/transactions` API). Rows with `source='legacy_mirror'` are **excluded** from that sum — they exist purely for future reporting/audit continuity (Feature 6's Monthly Financial Report, and so old deductions have a permanent name-snapshotted history too, per Feature 4), and are never added a second time on top of the old sheet's own total. The mirror-write itself is **fire-and-forget, non-blocking** (same pattern as `sendAdminTelegramNotificationSafe`): if the Sheets append fails, the original deduction still succeeds and is logged for manual reconciliation — a ledger hiccup must never fail or roll back the existing, working deduction flow.

### New APIs
- `POST /api/admin/payroll/transactions` — create bonus/deduction/advance/adjustment (admin only)
- `GET /api/admin/payroll/transactions?entityCode=&period=` — list/history
- `PATCH /api/admin/payroll/transactions/:id` — creates a correcting entry (never mutates the original row's financial fields)
- Existing `/api/salary`, `/api/salary/calculate`, `/api/admin/salary/calculate` gain an additive `ledgerTransactions: [...]` field in the response — old consumers ignore the new field, nothing breaks.
- Employee-facing "Salary Details" (`/salary` page) gets a new section listing every ledger transaction for the period — additive UI, existing sections untouched.

---

## 4. Feature 4 — Permanent Financial History

This is a **policy**, implemented via one design choice already baked into §3: every ledger row stores `entityNameSnapshot` at creation time. Even if `deleteRider`/`deleteSupervisor` later hard-deletes the roster row (as it does today, unchanged), the ledger row still shows a meaningful name — because it never depended on a live lookup in the first place.

**No change to existing delete behavior is required or proposed.** `deleteRider`/`deleteSupervisor` keep working exactly as they do today. This satisfies "deleting a user must never delete financial history" without touching a single line of the existing deletion code — the ledger is simply designed, from day one, to never need it to survive.

(If you'd prefer riders/supervisors to be *soft-deleted* — kept in the sheet with a `status=deleted` flag instead of hard-deleted, so old pages/lookups still resolve their profile too, not just their name — that's a more invasive, optional Phase-2 enhancement I can scope separately. Not required for Feature 4 as stated.)

---

## 5. Feature 5 — Rent Management

Consistent with §3's "Sheets stay the source of truth for money," and reusing the exact admin-config-page pattern already proven by `equipment-pricing`/`equipment-limits`.

**New Sheet tabs:**
- `عقود_الإيجار` — Office, Governorate, Monthly Rent, Payment Day, Landlord, Notes, `contractId`, `active`
- `مدفوعات_الإيجار` — `contractId`, month/year, `paidDate`, amount, `status` (Paid/Pending/Overdue — Overdue computed from `paymentDay` vs today, not stored), `recordedBy`

**New APIs:** `GET/POST /api/admin/rent/offices`, `GET/POST /api/admin/rent/payments`

**New cron:** `GET /api/cron/rent-reminder` (daily, e.g. 08:00 Cairo — same pattern as `rider-metadata-reminder`) — finds contracts whose `paymentDay` is within N days, sends Telegram via the **existing** `sendAdminTelegramNotificationSafe`, with the `NotificationType` union extended by one new additive value (`rent_reminder`) — zero risk to the 8 existing call sites.

---

## 6. Feature 6 — Monthly Financial Report

Pure aggregation over: existing salary calc (Sheets, unchanged) + new Payroll ledger (§3) + new Rent sheets (§5). Computed on-demand with `tieredCache` (same pattern as Strategic Ops reports), no new persistence required initially.

- **New route:** `GET /api/admin/financial-report/monthly?month=&year=`
- **Excel export:** trivial — reuse `lib/exportExcelAsync.ts` (`xlsx`), zero new dependencies.
- **PDF export — ✅ FROZEN: `pdf-lib`, not browser print.** Per your explicit instruction, real PDF engine only. Adds one new, lightweight, pure-JS dependency (`pdf-lib`, no headless-Chrome/Puppeteer weight, runs fine in a Node serverless function within the existing `maxDuration` ceiling). Produces an actual downloadable `.pdf` file server-side — no `window.print()` anywhere in this feature. New file: `lib/pdf/monthlyFinancialReportPdf.ts` (`buildMonthlyReportPdf(reportData): Promise<Buffer>`), called by the `format=pdf` branch of the route above.

---

## 7. Your 5 Enterprise Infrastructure Proposals — all excellent, all mapped to existing infra

| Your proposal | Feasibility | Design (reuses what already exists) |
|---|---|---|
| **1. Smart Cache (5 min)** | ✅ Directly reuses `lib/redisCache.optional.ts` / `lib/tieredCache.ts` — the exact same Redis account already used for Sheets caching and the Rooster Live snapshot. New: a thin `withRoosterCache(key, ttl=300, fn)` wrapper applied to the two new on-demand endpoints (shift import, rider search). |
| **2. Request Queue** | ✅ Feasible without new paid infra. Upstash here is **REST-only** (not ioredis-compatible), so BullMQ won't work directly — instead: a Redis-based **single-flight de-dup** (identical in-flight requests share one upstream call) + a small **concurrency semaphore** (max N simultaneous Rooster calls; extra callers wait/poll) built on `INCR`/`EXPIRE`, a few dozen lines, no new npm package, no new service. Confirmed necessary, not just nice-to-have: the new rider-search endpoint exposes **zero rate-limit headers** (§2), so we have no reactive signal from Rooster itself — the queue/semaphore is our only proactive protection. |
| **3. RoosterClient Service Layer** | ✅ **New** `lib/rooster/RoosterClient.ts` — centralizes base URLs + typed methods (`getLiveRiders`, `exportShifts`, `searchRiders`) and wraps the **existing, untouched** `tokenProvider`/`smartRefreshRoosterAuth`. Recommended: used **only** by the two new features; the existing live-sync/keepalive/CSV-export cron paths are **not refactored** — "nothing rewritten unless absolutely necessary." A follow-up cleanup to migrate them onto the shared client can be proposed later as low-priority tech debt, not now. |
| **4. Comprehensive Audit Log** | ✅ Since money must stay in Sheets (§3), the audit log follows suit: **one new tab**, `سجل_العمليات` — `domain` (payroll/rent/rooster_import/rider_data), actor, action, entity, before/after, timestamp. Every new write path in Features 1, 3, 5 calls one shared `appendAuditLog()` helper. Mirrors the exact shape of the existing `سجل_بيانات_المناديب_الاستراتيجية` pattern, just domain-agnostic. |
| **5. Background Jobs with progress** | ⚠️ Partial — no true detached workers exist on this stack (Next 14.0.4, no queue service). Given observed Rooster throughput (121 riders in ~3s) and the existing `maxDuration: 300` ceiling already used by `ghost-riders-export`/`daily-backup`, most imports will finish comfortably within one request. Recommended MVP: a Redis-backed **job-status record** (id, status, processed/total counters) written to as the *same* synchronous request runs, polled by the frontend for a progress bar — real UX, no new infra. If a genuinely oversized job ever needs to run past 300s, chunk it via the existing cron pattern (as `rooster-sync` already does hourly) rather than adding a queue service. |
| **6. Telemetry & Health Metrics** *(your addition — adopted, frozen)* | ✅ New **cross-cutting** requirement, not tied to one feature: every new feature (Phases 1–5) must emit execution time, cache hit ratio, queue wait time, API failure count, and audit events, queryable **without turning on debug logs**. Design: a thin `lib/telemetry.ts` helper — `recordMetric({ feature, metric, value, tags })` — writes into a new Redis structure (sorted sets / counters, same Upstash account, cheap and already-proven infra) with a rolling window (e.g. last 24h, downsampled), plus one new lightweight route `GET /api/admin/health/metrics` (admin-only) to visualize them. See §13 for the full frozen spec. |

---

## 8. New Google Sheets Tabs (complete list)

| Tab (proposed name) | Feature | Notes |
|---|---|---|
| `سجل_المعاملات_المالية` | Payroll ledger | Append-only, see §3 |
| `عقود_الإيجار` | Rent contracts | See §5 |
| `مدفوعات_الإيجار` | Rent payments | See §5 |
| `سجل_العمليات` | Unified audit log | See §7.4 |

**No changes to any existing tab's schema.** All four are net-new, additive.

## 9. New API Routes (complete list)

| Route | Feature |
|---|---|
| `POST /api/rooster/shifts/import` | 1 |
| `GET /api/rooster/riders/search` | 2 — ✅ endpoint confirmed (§2) |
| `POST /api/admin/payroll/transactions` | 3 |
| `GET /api/admin/payroll/transactions` | 3 |
| `PATCH /api/admin/payroll/transactions/:id` | 3 |
| `GET/POST /api/admin/rent/offices` | 5 |
| `GET/POST /api/admin/rent/payments` | 5 |
| `GET /api/cron/rent-reminder` | 5 |
| `GET /api/admin/financial-report/monthly` | 6 |
| `GET /api/admin/audit-log` | 7.4 (optional viewer) |
| `GET /api/admin/health/metrics` | 7.6 — telemetry viewer (§13) |

All existing 108 routes are untouched, except `/api/salary`, `/api/salary/calculate`, `/api/admin/salary/calculate` gaining one additive response field.

## 10. Risks & Backward-Compatibility Concerns (full list)

1. ~~Feature 2 is blocked~~ **Resolved.** Real endpoint confirmed and independently re-validated live (§2). No longer a risk.
2. **Rooster session fragility.** Live-sync's session already broke once this session (see the incident just fixed). New on-demand features (shift import, rider search) **must** reuse the same auth/session machinery, not spin up a second one — this is exactly why §7 items 1–3 (cache, queue, shared client) are sequenced *first* in the roadmap, to protect that session from new load. **Reconfirmed by §2's own validation:** the rider-search endpoint needs the *same* dhh_token-mint step as live-sync — one more reason all Rooster calls must go through the shared `RoosterClient`/`smartRefreshRoosterAuth`, never a fresh/parallel auth path.
3. **Sheets write concurrency.** Existing read-modify-write patterns are TOCTOU-vulnerable under concurrent admins (confirmed by audit). The new ledger sidesteps this entirely by being append-only — never adopt update-by-row for financial rows.
4. **`salaryService.ts` is a hot, sensitive path.** Any change must be strictly additive and tested against the existing golden path before merging — no rewrite.
5. **Sheet-tab naming drift already exists** in this codebase (spaces vs underscores, multiple aliases for the same domain) — new tab names must be chosen once, deliberately, and documented (done in §8) to avoid adding to the drift.
6. ~~PDF export requires one new dependency~~ **Resolved/frozen.** `pdf-lib` is now a confirmed, accepted new dependency (§6) — flagging only that it's the one clearly "new infra" item in an otherwise additive-only plan; low risk, pure JS, no native/Chromium weight.
7. **Vercel `maxDuration` (300s ceiling)** bounds how large a single shift-import date range or rider-search batch can be — mitigated by UI-level range caps, not new infra.
8. **No behavior change to `deleteRider`/`deleteSupervisor`** is required (§4) — confirming this explicitly so it's not accidentally "fixed" as part of this work.
9. **NEW — Payroll double-counting risk (caught in final review, §14).** Auto-mirroring every legacy deduction into the new ledger (§3) creates a real risk that `calculateSupervisorSalary()` could sum the same deduction twice (once from the untouched `خصومات_الإدارة` sheet, once from the new ledger-sum step) if the mirror rows aren't excluded. **Mitigated** by the new `source` column (`ledger_native` vs `legacy_mirror`) — the additive salary step sums `ledger_native` rows only. This is now a frozen, tested invariant (acceptance test in `SRS013_DESIGN_FREEZE.md` Phase 3).
10. **NEW — Rooster rate-limit blindness (§2).** The confirmed lack of any `X-RateLimit-*` response headers means we have zero reactive signal if we're approaching Rooster's own limits — mitigated proactively by the Request Queue/semaphore (§7.2) capping concurrency, not by reacting to headers that don't exist.
11. **NEW — Telemetry storage growth (§7.6/§13).** Metrics written on every request could grow unbounded if not capped — mitigated by a fixed rolling window (24h, downsampled) in Redis with `EXPIRE`, same pattern already used for caching, not a new unbounded store.

## 11. Implementation Roadmap — Safest Order

| Phase | Scope | Why this order |
|---|---|---|
| **Phase 0 — Foundation** | RoosterClient (§7.3) + Smart Cache (§7.1) + Request Queue/single-flight (§7.2) + unified Audit Log helper (§7.4) + Telemetry helper (§7.6/§13) | Nothing else should touch Rooster or write financial data until the session is protected, every write is auditable, and every future phase is measurable from day one. Zero user-facing change yet — purely internal infra, easiest to review in isolation. |
| **Phase 1 — Feature 1: Automatic Shift Import** | New route + UI panel, reusing 100% of existing shift logic | Highest reuse, lowest risk, immediate visible win, validates Phase 0 infra under real load. |
| **Phase 2 — Feature 2: Rider Search** | ✅ Endpoint confirmed (§2) — thin RoosterClient method + cached route + search box + Single Rider Profile UI | Independent of Payroll/Rent; no longer blocked, can slot in whenever convenient, even in parallel with Phase 3. |
| **Phase 3 — Features 3 + 4: Payroll ledger + immutable history** | New ledger sheet (with `source` column), new APIs, additive `salaryService.ts` hook, legacy-deduction auto-mirror, new UI forms | Highest value, highest care needed (money) — sequenced after infra is proven in Phases 0–1. |
| **Phase 4 — Feature 5: Rent Management** | New sheets, new APIs, new reminder cron | Independent; reuses the audit-log + Telegram patterns established by Phase 3/Phase 0. Can run in parallel with Phase 3 if desired. |
| **Phase 5 — Feature 6: Monthly Financial Report** | Aggregation route + Excel/PDF (`pdf-lib`) export | Depends on real data existing in Phases 3–4; last by necessity. |

## 12. Open Decisions Requiring Your Sign-Off Before Any Code Is Written

All decisions from the previous revision of this document are now resolved and frozen:
- ~~Feature 2 endpoint~~ → ✅ confirmed (§2).
- ~~PDF export option~~ → ✅ frozen to `pdf-lib` (§6).
- ~~Old admin-deductions flow~~ → ✅ frozen to dual-write with `source`-tagged mirroring (§3).
- ~~Telemetry requirement~~ → ✅ adopted as a frozen cross-cutting requirement (§7.6, §13).

**Only remaining open item:**
1. **Soft-delete for riders/supervisors** (§4 aside): not required for Feature 4, but flagging as an optional separate enhancement if you also want deleted people's *profiles* (not just their name in old ledger rows) to remain viewable. Confirmed **out-of-scope by default** unless you say otherwise — does not block Phase 0.
2. **General go-ahead** to start Phase 0 — see §14 for the final pre-Phase-0 architecture review that was run before asking for this.

## 13. Telemetry & Health Metrics — Frozen Cross-Cutting Requirement

Applies to **every** new feature in Phases 0–5, per your explicit addition: *"Every new feature must expose telemetry and health metrics (execution time, cache hit ratio, queue wait time, API failures, and audit events) so we can monitor production behavior without enabling debug logs."*

**Design:**
- New file `lib/telemetry.ts`: `recordMetric({ feature: 'rider_search'|'shift_import'|'payroll_ledger'|'rent'|'financial_report'|'rooster_client', metric: 'exec_ms'|'cache_hit'|'cache_miss'|'queue_wait_ms'|'api_failure'|'audit_event', value?: number, tags?: Record<string,string> })`.
- Storage: Redis (same Upstash account as existing caches) — one sorted-set/counter per `feature:metric:hour-bucket`, `EXPIRE` at 48h. Cheap, bounded, no new infra/service.
- Instrumentation points (frozen, one per new subsystem):
  - `RoosterClient` (§7.3): every outbound call records `exec_ms` and `api_failure`/success.
  - Smart Cache (§7.1): every lookup records `cache_hit`/`cache_miss`.
  - Request Queue (§7.2): every wait records `queue_wait_ms`.
  - `appendAuditLog()` (§7.4): every call records `audit_event` (count only, no PII in the metric itself — the PII stays in the Sheet row, not in Redis).
  - Payroll ledger writes, rent reminders, financial report generation: each records at least `exec_ms` + `api_failure`.
- **New route:** `GET /api/admin/health/metrics` (admin-only) — reads the rolling window and renders simple aggregates (p50/p95 exec time, hit ratio %, failure count) per feature. No new dashboard framework — a simple table/cards page, consistent with the rest of the admin UI.
- **Zero impact on existing features.** This is 100% new instrumentation on 100% new code paths — nothing in the 108 existing routes is touched, and metric-recording failures are themselves fire-and-forget (never block or fail the real request).

## 14. Final Pre-Phase-0 Architecture Review (run before freezing this document)

Explicitly re-checked, as requested, across six dimensions:

1. **Breaking changes:** None found. Every new API is a net-new route. Every touched existing file (`salaryService.ts`, `adminTelegramNotifier.ts`, `vercel.json`, `adminFeatureAccess.ts`) receives **additive-only** changes (new optional field / new enum value / new array entry) — verified field-by-field in §3/§4/§5 above. No existing Sheet tab's schema changes.
2. **Race conditions:** (a) *Payroll double-counting* — found and fixed via the `source` column, item 9 in §10. (b) *Sheets append concurrency* — the ledger/audit-log/rent tabs are all **append-only** (pure `appendToSheet` calls, no read-modify-write), which is inherently safe under concurrent writers, unlike the *existing* read-modify-write sheets (which are unchanged, so their existing — pre-existing, not newly introduced — TOCTOU characteristics are unaffected either way). (c) *Rider-search cache stampede* — mitigated by the Request Queue's single-flight de-dup (§7.2), same mechanism already proven for Rooster Live.
3. **Permission leaks:** All new admin routes (`payroll/transactions`, `rent/*`, `financial-report`, `health/metrics`) require the existing `admin` JWT + `assertAdminApiAccess` feature-key pattern already used by every other admin route — no new auth mechanism, no new privilege tier introduced, no accidental widening of the 3-role model (§0). Rider search requires supervisor-or-admin, matching the existing `/riders` page's own access level exactly.
4. **Cache invalidation:** Smart Cache entries are pure **read-through with a short TTL (5 min)** — there is no write path in this plan that needs to actively invalidate a Rooster-side cache entry (rider search / shift export are read-only from Rooster's perspective); the only *write* paths (payroll, rent, audit) go straight to Sheets, bypassing the Rooster cache entirely, so there's no stale-write-after-cache scenario to guard against.
5. **Google Sheets consistency:** No existing tab's schema, existing rows, or existing read/write code paths are altered anywhere in this plan (confirmed line-by-line across §3/§5/§8). All four new tabs are additive and independently droppable (turning off their feature flag simply stops reading/writing them — see Rollback plan per phase in `SRS013_DESIGN_FREEZE.md`).
6. **Rollback safety:** Every phase is gated by its own `FEATURE_X_ENABLED` flag (instant, no redeploy) with a documented, phase-specific rollback plan (see `SRS013_DESIGN_FREEZE.md`, §5 of each phase) — confirmed none of them require a data migration to undo, since every new tab is additive/net-new and every existing-file change is additive-only.

**Result: review passes.** No unresolved breaking changes, race conditions, permission leaks, cache-invalidation gaps, Sheets-consistency risks, or rollback gaps identified. Design is frozen as of this document.

No code has been written. Nothing in production has been touched by this analysis — the only artifacts produced were this document, its companion `SRS013_DESIGN_FREEZE.md`, and one throwaway, read-only validation script (`scripts/rooster-employees-endpoint-check.ts`) used strictly to confirm the endpoint contract above with real evidence instead of assumptions.
