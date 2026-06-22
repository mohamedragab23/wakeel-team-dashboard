# Phase 0 — Repository Audit (Read-Only)

**Audit date:** 2026-06-22  
**Auditor role:** Principal Architect / DevOps / Security (inspection only)  
**Scope:** Full repository inspection — **no code changes, no migrations, no Neon connection, no production behavior changes performed during this audit.**

---

## Executive confirmations

| Requirement | Status | Evidence |
|-------------|--------|----------|
| Google Sheets remains source of truth | **CONFIRMED** | All riders, performance, salaries, strategic ops, recruitment read/write via `lib/googleSheets.ts` + `GOOGLE_SHEETS_SPREADSHEET_ID` |
| No existing data modified during this audit | **CONFIRMED** | Read-only inspection; no API calls, no scripts executed |
| No historical data migration | **CONFIRMED** | No Sheets→Postgres transfer code; `scripts/migrate-ticketing.ts` targets **Postgres schema only** (manual, optional) |
| Ticketing isolated from Sheets | **CONFIRMED** | Zero `googleSheets` imports under `lib/ticketing/**` |

---

## Inspection statistics

| Metric | Count |
|--------|------:|
| TypeScript/TSX files (excl. `node_modules`, `.next`) | **312** |
| API route handlers (`app/api/**/route.ts`) | **75** |
| Files explicitly read/grepped for this audit | **98** |
| Mutating API routes (POST/PUT/PATCH/DELETE) | **52** |
| Google Sheets write call sites (`append`/`update`/`clear`/`delete`) | **58 files** |
| Ticketing API routes (Neon-only layer) | **7** |
| Strategic ops module files (`lib/strategicOps/`) | **18** |

---

## Architecture summary

```
┌─────────────────────────────────────────────────────────────────┐
│  Next.js 14 App Router (Vercel Pro — region iad1)               │
│  ├── UI: app/** (admin, dashboard, recruitment, ticketing…)    │
│  ├── API: app/api/** (75 routes)                                │
│  ├── Middleware: security headers only (no auth gate)            │
│  └── Monitoring: @vercel/speed-insights, @vercel/analytics     │
└───────────────────────────┬─────────────────────────────────────┘
                            │
        ┌───────────────────┼───────────────────┐
        ▼                   ▼                   ▼
┌───────────────┐   ┌───────────────┐   ┌───────────────────┐
│ Google Sheets │   │ In-memory     │   │ PostgreSQL (Neon) │
│ PRIMARY SoT   │   │ cache (Map)   │   │ TICKETING ONLY    │
│ googleapis    │   │ lib/cache.ts  │   │ optional env var  │
└───────────────┘   └───────────────┘   └───────────────────┘
        │                                       │
        │                               ┌───────┴────────┐
        │                               │ S3/R2 or local │
        │                               │ ticket files   │
        └─ Equipment photos (base64     └────────────────┘
           chunks in Sheets tab)
```

**Framework:** Next.js 14.2.33, React 18, TypeScript 5.3  
**Auth:** Custom JWT (`jsonwebtoken`) + bcrypt (`lib/auth.ts`)  
**Client state:** React Query (`lib/providers/QueryProvider.tsx`), `localStorage` token  
**External feeds:** Tableau (performance sync), Cloudflare Access optional  
**Deployment:** `vercel.json` — crons hourly + daily performance sync  

---

## Files inspected (representative list)

### Core data & auth
- `lib/googleSheets.ts`, `lib/googleSheetsAuth.ts`, `lib/cache.ts`, `lib/cacheInvalidation.ts`
- `lib/auth.ts`, `lib/jwtConfig.ts`, `lib/requestAuth.ts`, `lib/passwordUtils.ts`, `lib/passwordRehash.ts`
- `lib/adminFeatureAccess.ts`, `lib/adminZoneScope.ts`, `middleware.ts`, `instrumentation.ts`, `lib/startupValidation.ts`

### Business domains (read-only inspection)
- `lib/dataService.ts`, `lib/dataFilter.ts`, `lib/adminService.ts`, `lib/salaryService.ts`
- `lib/performanceDaySheet.ts`, `lib/performanceSyncService.ts`, `lib/tableauClient.ts`
- `lib/strategicOps/buildReport.ts`, `lib/strategicOps/talabatOpsMetrics.ts`, `lib/strategicOps/dataIntegrity.ts`
- `lib/recruitment/recruitmentService.ts`, `lib/recruitment/types.ts`
- `lib/riderStrategic/riderStrategicService.ts`, `lib/equipmentPhotoStorage.ts`

### Ticketing (additive layer)
- `lib/ticketing/db/client.ts`, `lib/ticketing/db/schema.sql`, `lib/ticketing/services/*.ts`
- `app/api/ticketing/**` (7 routes)

### Destructive-capable APIs (documented, not executed)
- `app/api/admin/system/reset/route.ts`
- `app/api/admin/performance/clear/route.ts`
- `app/api/admin/performance/delete-day/route.ts`

### Config & scripts
- `package.json`, `next.config.js`, `vercel.json`, `.env.example`, `.env.production.example`
- `env.local.example` (credential risk documented)
- `scripts/migrate-ticketing.ts`, `scripts/ensure-recruitment-sheets.ts`, `scripts/ensure-equipment-sheets.ts`

### UI entry points (sample)
- `app/layout.tsx`, `components/Layout.tsx`, `components/LoginPage.tsx`
- `app/admin/strategic-ops/page.tsx`, `app/admin/dashboard/page.tsx`

---

## Google Sheets dependency map

**Spreadsheet ID:** `GOOGLE_SHEETS_SPREADSHEET_ID` (via `lib/googleSheetsAuth.ts` → `getMainSpreadsheetId()`)  
**Optional second:** `GOOGLE_SHEETS_SHIFTS_SPREADSHEET_ID` for shifts/rooster

| Sheet tab (Arabic name) | Primary consumers | Operation types |
|-------------------------|-------------------|-----------------|
| `المشرفين` | `lib/auth.ts`, `lib/adminService.ts`, supervisor APIs | Read, update, delete row |
| `Admins` (parsed tabs) | `lib/auth.ts`, `lib/adminsSheetParser.ts` | Read, update |
| `المناديب` | `lib/dataService.ts`, `lib/adminService.ts`, riders APIs | Read, append, update, delete |
| `البيانات اليومية` | `lib/dataFilter.ts`, strategic ops, performance sync, salaries | Read, append, update, **clear**, delete-day |
| `طلبات_الإقالة` | `app/api/termination-requests/route.ts`, strategic ops | Read, append, update |
| `طلبات_التعيين` | `app/api/assignment-requests/route.ts` | Read, append, update |
| `طلبات_إعادة_التفعيل` | `app/api/reactivation-requests/route.ts` | Read, append, update |
| `الخصومات`, `السلف`, `المعدات` | `lib/salaryService.ts`, deductions | Read, append |
| `استعلام أمني` | Salary calculator | Read |
| `إعدادات_الرواتب`, `الأهداف`, `أسعار_المعدات` | Salary config APIs | Read, update |
| `الديون` / `المديونية` | `lib/adminService.ts`, debts API | Read, append |
| `رصيد_COD` | `lib/codDebtLookup.ts` | Read, append |
| `مرشحين_التعيين`, `سجل_نشاط_المرشحين`, `إشعارات_التعيين`, `داتا_العروض_للمشرف` | Recruitment module | Read, append, update, delete |
| `تسليم_المعدات`, `استرجاع_المعدات`, `مخزن_صور_المعدات` | Equipment APIs | Read, append, update |
| `المخزون_الرئيسي` | Main inventory API | Read, update |
| `مزامنة_الأداء` | Performance sync queue | Read, append |
| `cron_config` (configurable) | Rooster sync | Read, update |
| Rider strategic profiles sheets | `lib/riderStrategic/*` | Read, append |

**Strategic Operations** reads `البيانات اليومية`, `المناديب`, `طلبات_الإقالة`, recruitment sheets — **read-only for KPI computation** (no separate DB).

---

## APIs that can modify Google Sheets data

All require authenticated JWT unless noted. Grouped by risk.

### Critical impact (bulk clear / mass delete)

| Route | Method | Sheets affected | Gate |
|-------|--------|-----------------|------|
| `/api/admin/system/reset` | POST | `البيانات اليومية`, `المناديب`, request/debt/deduction tabs | `debug` permission |
| `/api/admin/performance/clear` | POST | `البيانات اليومية` (clear all rows) | `performance_upload` |
| `/api/admin/performance/delete-day` | POST | `البيانات اليومية` (delete by date) | `performance_upload` |

### High impact (bulk write / sync)

| Route | Method | Operation |
|-------|--------|-----------|
| `/api/admin/upload` | POST | Riders + performance Excel → append/update |
| `/api/admin/performance-import` | POST | Performance rows |
| `/api/admin/performance-sync` | POST | Tableau → replace day rows |
| `/api/cron/performance-sync` | GET | Automated daily sync |
| `/api/admin/riders` | POST/PUT/DELETE | Rider CRUD |
| `/api/admin/supervisors` | POST/PUT/DELETE | Supervisor CRUD |
| `/api/recruitment/candidates/bulk` | POST | Bulk candidate import |
| `/api/recruitment/reset-manager-data` | POST | Recruitment data reset |
| `/api/sync` | POST | Legacy IndexedDB → Sheets sync |

### Medium impact (workflow writes)

| Route | Domain |
|-------|--------|
| `/api/assignment-requests` | POST/PUT — assignment workflow |
| `/api/termination-requests` | POST/PUT — termination workflow |
| `/api/reactivation-requests` | POST/PUT |
| `/api/equipment-deliveries`, `/api/equipment-returns` | POST/PUT |
| `/api/supervisor/deductions-upload` | POST |
| `/api/admin/deductions-reconcile` | POST |
| `/api/admin/salary/*` | POST/PUT |
| `/api/rider-strategic-profiles` | PUT |
| `/api/recruitment/**` | Multiple POST/PUT/DELETE |

### Ticketing (Postgres + object storage — **not Sheets**)

| Route | Storage |
|-------|---------|
| `/api/ticketing/*` | `TICKETING_DATABASE_URL` + S3/local attachments |

Returns **503** when `TICKETING_DATABASE_URL` unset — **does not touch Sheets**.

---

## Existing authentication mechanisms

| Component | Location | Behavior |
|-----------|----------|----------|
| Supervisor login | `lib/auth.ts` → sheet `المشرفين` col E password | JWT 7d, role `supervisor` |
| Admin login | `lib/auth.ts` → `Admins` sheet | JWT 7d, role `admin`, `permissions`, `dataZone` |
| Recruitment manager | `lib/authConstants.ts` | role `recruitment_manager` |
| Password verify | `lib/passwordUtils.ts` | bcrypt + **legacy plain-text fallback** |
| Token extraction | `lib/requestAuth.ts` | Bearer header or `wakeel_auth_token` httpOnly cookie |
| JWT secret | `lib/jwtConfig.ts` | Production requires `JWT_SECRET`; dev fallback |
| Feature gates | `lib/adminFeatureAccess.ts` | `limited:feature1,feature2` |
| Zone scope | `lib/adminZoneScope.ts` | Filters supervisors/riders for limited admins |
| Ticketing auth | `lib/ticketing/ticketingAuth.ts` | Supervisor own tickets; admin `ticketing` feature |
| Cron auth | `app/api/cron/*.ts` | `x-vercel-cron` header OR `x-cron-secret` |
| Login rate limit | `lib/rateLimit.ts` | 10 attempts / 15 min per IP+code |

**Client session:** Token stored in **`localStorage`** (`components/LoginPage.tsx`) **and** httpOnly cookie — XSS amplifies theft risk.

**Middleware:** Does **not** validate JWT; applies security headers only (`middleware.ts`).

---

## Existing storage mechanisms

| Asset | Mechanism | Code |
|-------|-----------|------|
| All operational data | Google Sheets cells | `lib/googleSheets.ts` |
| Server read cache | In-memory `Map`, 3–15 min TTL | `lib/cache.ts` |
| Client cache | React Query 10 min stale | `lib/providers/QueryProvider.tsx` |
| Legacy client DB | IndexedDB `007SupDB` | `lib/database.ts` (legacy; `/api/sync` only) |
| Equipment photos | Base64 chunks in `مخزن_صور_المعدات` | `lib/equipmentPhotoStorage.ts` |
| Excel uploads | In-memory buffer → parsed → Sheets | `lib/excelProcessorServer.ts` |
| Ticket attachments | Local `.data/` or S3/R2 | `lib/ticketing/storage/` |
| Ticket records | PostgreSQL (optional) | `lib/ticketing/db/` |

**No automated object-storage backup of Sheets data exists in code.**

---

## Existing backup mechanisms

| Mechanism | Present? | Notes |
|-----------|----------|-------|
| Google Sheets version history | **External** (Google UI) | Not invoked by app |
| Automated export to S3/GCS | **No** | Not in codebase |
| Postgres PITR (ticketing) | **Only if Neon provisioned** | Manual `migrate:ticketing` |
| `npm run env:pull` | Vercel env backup | Secrets only, not sheet data |
| Recruitment Excel export | **Yes** | `app/api/recruitment/export/route.ts` (on-demand) |
| Client export utilities | Partial | `lib/strategicOps/clientExport.ts` (report download) |

**Gap:** No scheduled, tested backup of the primary spreadsheet.

---

## Security risks found

### Critical

| ID | Finding | Location |
|----|---------|----------|
| C1 | **Service account private key in tracked file** `env.local.example` (PEM format) | `env.local.example` (git-tracked) |
| C2 | **`system/reset` can clear multiple production tabs** when admin invokes debug reset | `app/api/admin/system/reset/route.ts` |
| C3 | **JWT stored in `localStorage`** — any XSS → 7-day session theft | `components/LoginPage.tsx`, ~40 client fetch sites |

### High

| ID | Finding | Location |
|----|---------|----------|
| H1 | Zone-limited admins can write globally on upload/performance routes (no `adminZoneScope` on mutating uploads) | `app/api/admin/upload/route.ts`, performance-import/clear/sync |
| H2 | Plain-text password fallback for legacy sheet passwords | `lib/passwordUtils.ts` L18–19 |
| H3 | Cron accepts `x-vercel-cron` without `CRON_SECRET` on Vercel | `app/api/cron/performance-sync/route.ts` |
| H4 | `getSheetData` swallows errors → returns `[]` (silent empty data) | `lib/googleSheets.ts` L53–56 |
| H5 | No global API rate limiting (login only) | `lib/rateLimit.ts` |
| H6 | `performance/clear` wipes entire daily performance tab | `app/api/admin/performance/clear/route.ts` |

### Medium

| ID | Finding | Location |
|----|---------|----------|
| M1 | Hardcoded spreadsheet ID fallback in `next.config.js` | `next.config.js` L43 |
| M2 | Equipment photos in Sheets (cell size / quota limits) | `lib/equipmentPhotoStorage.ts` |
| M3 | Photo signed URLs — expiry not verified in audit | `lib/photoAccess.ts` |
| M4 | `health/google-sheets` open in non-production | `app/api/health/google-sheets/route.ts` |
| M5 | In-memory rate limit not shared across Vercel instances | `lib/rateLimit.ts` |

---

## Performance risks found

| ID | Risk | Location | Impact |
|----|------|----------|--------|
| P1 | Full tab read `A:Z` on every cache miss | `lib/googleSheets.ts` | Linear slowdown as rows grow |
| P2 | Strategic ops loads full daily sheet + riders + recruitment with `useCache: false` | `lib/strategicOps/buildReport.ts` | 30–120s, large JSON |
| P3 | Supervisor performance: N× `getSupervisorRiders` per request (daily sheet now single-read) | `app/api/admin/supervisor-performance/route.ts` | Still N rider fetches |
| P4 | Fake pagination (load all → slice) | `app/api/admin/riders/route.ts`, recruitment | Memory spikes |
| P5 | Per-instance cache — stampede on cold start | `lib/cache.ts` | Inconsistent freshness |
| P6 | Performance sync deletes by full sheet scan | `lib/performanceDaySheet.ts` | Cron timeout risk |
| P7 | No Google API 429 retry/backoff | `lib/googleSheets.ts` | Quota errors under load |

---

## Data-loss risks found

| ID | Scenario | Likelihood | Mitigation today |
|----|----------|------------|------------------|
| D1 | Accidental `system/reset` POST | Low (needs debug perm) | Permission gate only |
| D2 | `performance/clear` POST | Low | Admin + `performance_upload` |
| D3 | Performance sync replaces day rows incorrectly | Medium | Auto-apply gates in sync service |
| D4 | Concurrent writes to same sheet row | Medium | No transaction model (Sheets limitation) |
| D5 | Silent empty reads after API error | Medium | Returns `[]` — dashboards show zeros |
| D6 | No automated off-site backup | **High** | Manual Google version history only |
| D7 | Ticketing Postgres data loss | Low until Neon used | No Neon = module disabled |
| D8 | **Sheets→Postgres migration** | **None in code** | `migrate-ticketing.ts` is Postgres DDL only |

**Phase 0 audit performed zero write operations — data-loss risk from this audit: none.**

---

## Migration & data-movement audit

| Script / code path | Touches Google Sheets? | Auto-runs? | Moves historical data? |
|--------------------|------------------------|------------|------------------------|
| `scripts/migrate-ticketing.ts` | **No** | **No** (manual npm script) | **No** — Postgres DDL only |
| `scripts/ensure-recruitment-sheets.ts` | Creates tab + headers if missing | Manual | No data copy |
| `scripts/ensure-equipment-sheets.ts` | Creates tabs if missing | Manual | No data copy |
| `app/api/sync/route.ts` | Writes from client IndexedDB | On admin POST | Client → Sheets (legacy) |
| Tableau performance sync | Replaces day rows in `البيانات اليومية` | Cron daily | External → Sheets (by design) |

**Confirmed: No bulk migration of historical Sheets data to Postgres exists.**

---

## Build validation

**Command:** `npm run build`  
**Date:** 2026-06-22  
**Result:** **PASS** (exit code 0)

| Check | Status |
|-------|--------|
| TypeScript compile | Pass |
| Lint | Pass |
| Static pages generated | Pass |
| Middleware bundle | 27.4 kB |
| Routes compiled | 49+ pages (incl. ticketing) |
| `instrumentationHook` | Enabled (startup validation) |

---

## Recommended Phase 1 actions (no execution in Phase 0)

Priority order — all must preserve Sheets as SoT and require explicit approval before any destructive-capable change:

1. **P0 — Credential hygiene:** Rotate Google service account key; replace `env.local.example` with placeholders only (separate approved change).
2. **P0 — Verify `JWT_SECRET` in Vercel production** (already enforced in `lib/jwtConfig.ts` for production builds).
3. **P1 — Documented weekly Sheets export** (read-only script or manual procedure) — no tab structure changes.
4. **P1 — Zone scope on admin upload/performance write routes** (behavior change for limited admins only).
5. **P1 — Provision Neon + R2 only when enabling ticketing** (additive; no Sheets migration).
6. **P2 — Cookie-only auth** (remove `localStorage` JWT) — requires UX testing.
7. **P2 — Upstash Redis** for shared cache (read-through only; Sheets unchanged).
8. **P2 — bcrypt-only password migration** for sheet-stored credentials.

---

## Phase 0 sign-off

| Statement | Verified |
|-----------|----------|
| Google Sheets is the source of truth | Yes |
| This audit modified no sheet data | Yes |
| No migrations were executed | Yes |
| No Neon connection was made | Yes |
| No production behavior was changed by this audit | Yes |
| Build passes | Yes |

**Next step:** Review this document and approve Phase 1 items individually before any implementation.
