# SRS-013 — Direct Rooster API Integration, Full Payroll Module & Enterprise Infrastructure

**Status:** 🟡 ARCHITECTURE PHASE — NOT YET APPROVED FOR IMPLEMENTATION
**Author:** Lead Software Architect (Cursor Agent)
**Date:** 2026-07-27
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
| **Rider search today** | Sheets-backed only (`المناديب` tab), search by `code` substring. **No "Paper Number" field exists anywhere in the codebase.** No existing Rooster "Riders" search API call has ever been made by this app — the exact endpoint is unknown (see Risk #1). |
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

### 🔴 Blocking open risk — must be resolved before this feature can be scoped
No code in this repository has ever called a Rooster "search riders by Worker ID / Paper Number / Name / Phone" endpoint. It doesn't exist in `lib/roosterLive/*` or `lib/roosterExport.ts`. I cannot invent its URL/shape safely — guessing and firing exploratory requests at a third-party corporate backend risks noisy failures or security flags.

**I need one of the following from you before this feature can be designed concretely:**
1. Open Rooster's **Riders** page → search for any rider → open DevTools → Network tab → copy the exact request URL, method, and response JSON for that search call, **or**
2. Explicit permission for me to run a small number of careful, read-only exploratory `GET` requests against a short list of plausible endpoint patterns (e.g. `/api/rooster/v3/riders`, `/api/rider-live-operations/v1/external/riders/search`) using our already-valid session, and report back exactly what responds.

### Plan (once the endpoint is known)
- Add a typed method to the new `RoosterClient` (§7), e.g. `searchRiders({ query })`.
- **New route:** `GET /api/rooster/riders/search?q=...` — wraps it with the Smart Cache (§7, 5 min TTL) since the same Worker ID will often be searched by multiple supervisors in a short window.
- **New UI:** a search box (Worker ID / Name / Phone) somewhere in Rider Management, showing the fields Rooster returns (phone, vehicle, status, zone, etc.) — additive, does not touch the existing Sheets-backed `/riders` or `/admin/riders` pages.
- Confirmed: "Paper Number" is a Rooster-only concept; our Sheets rider model has no equivalent field, so this feature is purely a live lookup, not something we need to persist or reconcile against `المناديب`.

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

Old admin-deductions flow (`خصومات_الإدارة`) can be **left exactly as-is** (still works, still visible), or optionally re-pointed to write into the new ledger going forward for consistency — this is your call, not a required change.

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
- **PDF export — decision needed from you:**
  - **Option A (zero new dependency):** reuse the existing Strategic Ops pattern — server returns printable HTML, browser does `window.print()`. Matches current precedent exactly, but isn't a "real" downloadable PDF file.
  - **Option B (one new, lightweight dependency):** add `pdf-lib` (pure JS, no headless-Chrome/Puppeteer weight, works fine in a Node serverless function) to generate an actual `.pdf` file server-side. Higher fidelity, small additive footprint.
  - **My recommendation: Option B**, given this is an *executive* report likely to be shared outside the dashboard (email/print), but it's genuinely your call — flag which you prefer.

---

## 7. Your 5 Enterprise Infrastructure Proposals — all excellent, all mapped to existing infra

| Your proposal | Feasibility | Design (reuses what already exists) |
|---|---|---|
| **1. Smart Cache (5 min)** | ✅ Directly reuses `lib/redisCache.optional.ts` / `lib/tieredCache.ts` — the exact same Redis account already used for Sheets caching and the Rooster Live snapshot. New: a thin `withRoosterCache(key, ttl=300, fn)` wrapper applied to the two new on-demand endpoints (shift import, rider search). |
| **2. Request Queue** | ✅ Feasible without new paid infra. Upstash here is **REST-only** (not ioredis-compatible), so BullMQ won't work directly — instead: a Redis-based **single-flight de-dup** (identical in-flight requests share one upstream call) + a small **concurrency semaphore** (max N simultaneous Rooster calls; extra callers wait/poll) built on `INCR`/`EXPIRE`, a few dozen lines, no new npm package, no new service. |
| **3. RoosterClient Service Layer** | ✅ **New** `lib/rooster/RoosterClient.ts` — centralizes base URLs + typed methods (`getLiveRiders`, `exportShifts`, `searchRiders`) and wraps the **existing, untouched** `tokenProvider`/`smartRefreshRoosterAuth`. Recommended: used **only** by the two new features; the existing live-sync/keepalive/CSV-export cron paths are **not refactored** — "nothing rewritten unless absolutely necessary." A follow-up cleanup to migrate them onto the shared client can be proposed later as low-priority tech debt, not now. |
| **4. Comprehensive Audit Log** | ✅ Since money must stay in Sheets (§3), the audit log follows suit: **one new tab**, `سجل_العمليات` — `domain` (payroll/rent/rooster_import/rider_data), actor, action, entity, before/after, timestamp. Every new write path in Features 1, 3, 5 calls one shared `appendAuditLog()` helper. Mirrors the exact shape of the existing `سجل_بيانات_المناديب_الاستراتيجية` pattern, just domain-agnostic. |
| **5. Background Jobs with progress** | ⚠️ Partial — no true detached workers exist on this stack (Next 14.0.4, no queue service). Given observed Rooster throughput (121 riders in ~3s) and the existing `maxDuration: 300` ceiling already used by `ghost-riders-export`/`daily-backup`, most imports will finish comfortably within one request. Recommended MVP: a Redis-backed **job-status record** (id, status, processed/total counters) written to as the *same* synchronous request runs, polled by the frontend for a progress bar — real UX, no new infra. If a genuinely oversized job ever needs to run past 300s, chunk it via the existing cron pattern (as `rooster-sync` already does hourly) rather than adding a queue service. |

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
| `GET /api/rooster/riders/search` | 2 — blocked on endpoint discovery |
| `POST /api/admin/payroll/transactions` | 3 |
| `GET /api/admin/payroll/transactions` | 3 |
| `PATCH /api/admin/payroll/transactions/:id` | 3 |
| `GET/POST /api/admin/rent/offices` | 5 |
| `GET/POST /api/admin/rent/payments` | 5 |
| `GET /api/cron/rent-reminder` | 5 |
| `GET /api/admin/financial-report/monthly` | 6 |
| `GET /api/admin/audit-log` | 7.4 (optional viewer) |

All existing 108 routes are untouched, except `/api/salary`, `/api/salary/calculate`, `/api/admin/salary/calculate` gaining one additive response field.

## 10. Risks & Backward-Compatibility Concerns (full list)

1. **Feature 2 is blocked** until the real Rooster rider-search endpoint is known (see §2). Nothing else depends on this.
2. **Rooster session fragility.** Live-sync's session already broke once this session (see the incident just fixed). New on-demand features (shift import, rider search) **must** reuse the same auth/session machinery, not spin up a second one — this is exactly why §7 items 1–3 (cache, queue, shared client) are sequenced *first* in the roadmap, to protect that session from new load.
3. **Sheets write concurrency.** Existing read-modify-write patterns are TOCTOU-vulnerable under concurrent admins (confirmed by audit). The new ledger sidesteps this entirely by being append-only — never adopt update-by-row for financial rows.
4. **`salaryService.ts` is a hot, sensitive path.** Any change must be strictly additive and tested against the existing golden path before merging — no rewrite.
5. **Sheet-tab naming drift already exists** in this codebase (spaces vs underscores, multiple aliases for the same domain) — new tab names must be chosen once, deliberately, and documented (done in §8) to avoid adding to the drift.
6. **PDF export requires one new dependency** if you choose Option B in §6 — the only clearly "new infra" item in this entire plan with no existing precedent. Low risk, but flagging since everything else is additive-only.
7. **Vercel `maxDuration` (300s ceiling)** bounds how large a single shift-import date range or rider-search batch can be — mitigated by UI-level range caps, not new infra.
8. **No behavior change to `deleteRider`/`deleteSupervisor`** is required (§4) — confirming this explicitly so it's not accidentally "fixed" as part of this work.

## 11. Implementation Roadmap — Safest Order

| Phase | Scope | Why this order |
|---|---|---|
| **Phase 0 — Foundation** | RoosterClient (§7.3) + Smart Cache (§7.1) + Request Queue/single-flight (§7.2) + unified Audit Log helper (§7.4) | Nothing else should touch Rooster or write financial data until the session is protected and every write is auditable. Zero user-facing change yet — purely internal infra, easiest to review in isolation. |
| **Phase 1 — Feature 1: Automatic Shift Import** | New route + UI panel, reusing 100% of existing shift logic | Highest reuse, lowest risk, immediate visible win, validates Phase 0 infra under real load. |
| **Phase 2 — Feature 2: Rider Search** | Blocked until endpoint confirmed (§2); then a thin RoosterClient method + cached route + search box | Independent of Payroll/Rent; can slot in whenever the endpoint is confirmed, even in parallel with Phase 3. |
| **Phase 3 — Features 3 + 4: Payroll ledger + immutable history** | New ledger sheet, new APIs, additive `salaryService.ts` hook, new UI forms | Highest value, highest care needed (money) — sequenced after infra is proven in Phases 0–1. |
| **Phase 4 — Feature 5: Rent Management** | New sheets, new APIs, new reminder cron | Independent; reuses the audit-log + Telegram patterns established by Phase 3/Phase 0. Can run in parallel with Phase 3 if desired. |
| **Phase 5 — Feature 6: Monthly Financial Report** | Aggregation route + Excel/PDF export | Depends on real data existing in Phases 3–4; last by necessity. |

## 12. Open Decisions Requiring Your Sign-Off Before Any Code Is Written

1. **Feature 2 blocker:** please capture the real Rooster rider-search request (DevTools → Network), or explicitly authorize a small number of exploratory probe requests.
2. **PDF export (§6):** Option A (zero-dependency, print-HTML, matches existing precedent) vs. Option B (`pdf-lib`, one new dependency, real PDF file). Recommendation: B.
3. **Old admin-deductions flow (`خصومات_الإدارة`):** leave completely as-is (default/recommended), or re-point it to write into the new ledger going forward too?
4. **Soft-delete for riders/supervisors** (§4 aside): not required for Feature 4, but flagging as an optional separate enhancement if you also want deleted people's *profiles* (not just their name in old ledger rows) to remain viewable. Confirm in/out of scope.
5. **General go-ahead** to start Phase 0 once the above are answered.

No code has been written. Nothing in production has been touched by this analysis.
