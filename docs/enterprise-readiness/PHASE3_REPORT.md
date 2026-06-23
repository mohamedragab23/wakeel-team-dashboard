# Phase 3 — Security & Observability Report

**Date:** 2026-06-22  
**Base tag:** `phase2-stable` (rollback checkpoint)  
**Policy:** Google Sheets remains source of truth. No business logic changes to Strategic Ops, Talabat, riders, salary, or recruitment.

---

## Pre-Phase 3 safety steps (completed)

| Step | Status | Detail |
|------|--------|--------|
| Google Sheets backup | **DONE** | `npm run export:sheets-backup` — read-only, 39 tabs |
| Push current code | **DONE** | `main` at `e984ef4` already on `origin/main` |
| Stable tag | **DONE** | `phase2-stable` exists on remote |

### Backup location

```
exports/sheets-backup-2026-06-22T15-58-50-812Z/
├── manifest.json   (39 tabs, spreadsheetId in manifest)
└── <tab>.json      (per-tab read-only export)
```

**No sheet rows were modified.** Export is read-only via Google Sheets API.

### Rollback to stable (under 1 minute)

```bash
git fetch origin
git checkout phase2-stable
# Deploy this commit on Vercel (Instant Rollback or redeploy)
```

Or revert Phase 3 only after it is committed:

```bash
git revert <phase-3-commit-sha>
```

---

## Executive confirmations

| Requirement | Status |
|-------------|--------|
| Google Sheets = source of truth | **CONFIRMED** — no schema changes, no bulk writes |
| Strategic Ops / Talabat / riders / salary / recruitment logic | **NOT MODIFIED** |
| No data migration executed | **CONFIRMED** |
| No Neon auto-connection | **CONFIRMED** — diagnostics probe only |

---

## Changes delivered

### 1. Password security

| ID | Change | Business impact |
|----|--------|-----------------|
| P3-PW-01 | `verifyPassword()` — **bcrypt-only by default** | Plain-text sheet passwords rejected unless rollback env set |
| P3-PW-02 | `PASSWORD_LEGACY_PLAIN_ENABLED=true` — temporary rollback flag | Re-enables plain-text verify + existing login-time rehash |
| P3-PW-03 | `lib/passwordMigrationSafety.ts` | Legacy detection helpers |
| P3-PW-04 | `scripts/audit-password-hashes.ts` + `npm run audit:password-hashes` | **Read-only** audit of non-bcrypt rows |
| P3-PW-05 | Startup warning if legacy flag enabled in production | Ops visibility |

**Existing login-time rehash** (`lib/passwordRehash.ts`) is **unchanged** — still upgrades plain → bcrypt on successful login when legacy flag is enabled.

### 2. Cron security

| ID | Change | Business impact |
|----|--------|-----------------|
| P3-CR-01 | `lib/cronAuth.ts` — centralized cron auth | Single policy |
| P3-CR-02 | Removed `x-vercel-cron` header-only trust | Spoofed header no longer authorizes |
| P3-CR-03 | Requires `CRON_SECRET` match via: `Authorization: Bearer`, `x-cron-secret`, or `?cron_secret=` | Vercel Cron uses Bearer when `CRON_SECRET` env is set |
| P3-CR-04 | Both cron routes updated | `performance-sync`, `rooster-sync` |

### 3. Error visibility

| ID | Change | Business impact |
|----|--------|-----------------|
| P3-ER-01 | `lib/requestTrace.ts` — `x-request-id` + structured JSON logs | Traceable requests |
| P3-ER-02 | `middleware.ts` — inject/propagate request ID | All matched routes |
| P3-ER-03 | `getSheetData()` catch — structured `logStructured('error', ...)` | **Still returns `[]` on error** (behavior unchanged) |

### 4. Health monitoring

| ID | Change | Business impact |
|----|--------|-----------------|
| P3-HL-01 | `lib/healthDiagnostics.ts` | Probes Sheets, env, Redis, Neon |
| P3-HL-02 | `GET /api/health/diagnostics` | Admin cookie or `CRON_SECRET` |
| P3-HL-03 | `GET /api/health` — lightweight liveness | No external deps |
| P3-HL-04 | `GET /api/health/google-sheets` — uses `isCronAuthorized` | Consistent cron auth |

**Diagnostics only** — no automatic recovery, no sheet writes.

---

## Files modified

### New files

| File | Purpose |
|------|---------|
| `lib/cronAuth.ts` | CRON_SECRET validation |
| `lib/requestTrace.ts` | Request IDs + structured logging |
| `lib/passwordMigrationSafety.ts` | Legacy password detection |
| `lib/healthDiagnostics.ts` | Dependency probes |
| `app/api/health/diagnostics/route.ts` | Diagnostics HTTP endpoint |
| `scripts/audit-password-hashes.ts` | Read-only password format audit |
| `docs/enterprise-readiness/PHASE3_REPORT.md` | This report |

### Modified files

| File | Change summary |
|------|----------------|
| `lib/passwordUtils.ts` | Bcrypt-only default; legacy behind env flag |
| `lib/googleSheets.ts` | Structured error logging in `getSheetData` |
| `lib/startupValidation.ts` | Warnings for `CRON_SECRET`, legacy passwords |
| `middleware.ts` | `x-request-id` propagation |
| `app/api/cron/performance-sync/route.ts` | `isCronAuthorized` |
| `app/api/cron/rooster-sync/route.ts` | `isCronAuthorized` |
| `app/api/health/route.ts` | Liveness metadata |
| `app/api/health/google-sheets/route.ts` | Cron auth via `isCronAuthorized` |
| `package.json` | `audit:password-hashes` script |
| `env.local.example` | `CRON_SECRET`, `PASSWORD_LEGACY_PLAIN_ENABLED` docs |
| `.env.production.example` | Same |
| `docs/enterprise-readiness/README.md` | Link to this report |

### Files explicitly NOT touched

- `lib/strategicOps/**`
- `lib/strategicOps/talabatOpsMetrics.ts`
- `lib/salaryService.ts`, `lib/salaryCalculator.ts`
- `lib/recruitment/**`
- `lib/dataService.ts` (riders logic)
- Google Sheets tab structure / row data

---

## Exact code changes (summary)

### Password (`lib/passwordUtils.ts`)

**Before:** Plain-text `stored === input` fallback always allowed.  
**After:**

```typescript
if (storedNorm.startsWith('$2')) return bcrypt.compare(...);
if (legacyPlainPasswordLoginAllowed()) return storedNorm === inputNorm; // env flag only
return false; // bcrypt-only default
```

### Cron (`lib/cronAuth.ts`)

**Before:** `x-vercel-cron` header alone → authorized.  
**After:** `CRON_SECRET` required; matched via Bearer / `x-cron-secret` / query param. No `x-vercel-cron` check.

### `getSheetData` (`lib/googleSheets.ts`)

**Before:** `console.error('Error fetching sheet...')`  
**After:** `logStructured('error', 'google_sheets_get_failed', { sheetName, range, traceId, ... })`  
**Return value on error:** still `[]` (unchanged).

### Middleware (`middleware.ts`)

Adds `x-request-id` UUID to request + response headers for tracing.

### Health (`GET /api/health/diagnostics`)

Returns:

```json
{
  "ok": true|false,
  "checkedAt": "ISO",
  "env": { "googleSheetsSpreadsheetId", "jwtSecret", "cronSecret", "redisConfigured", "neonConfigured" },
  "googleSheets": { "ok", "error?" },
  "redis": { "ok", "skipped?" },
  "neon": { "ok", "skipped?" }
}
```

---

## Rollback plan

### Immediate (production incident)

1. Vercel → Deployments → **Instant Rollback** to `phase2-stable` (`e984ef4`)
2. Or locally: `git checkout phase2-stable` and redeploy

### Partial rollback (single concern)

| Issue | Rollback action |
|-------|-----------------|
| Users cannot login (bcrypt migration) | Set `PASSWORD_LEGACY_PLAIN_ENABLED=true` in Vercel env → redeploy (no code revert) |
| Cron jobs 401 | Ensure `CRON_SECRET` is set in Vercel; Vercel Cron sends Bearer automatically |
| Diagnostics noise | Remove `/api/health/diagnostics` route (optional) |

### Password migration procedure (no bulk sheet migration)

1. **Before deploy:** `npm run audit:password-hashes` (read-only)
2. If legacy rows exist: deploy with `PASSWORD_LEGACY_PLAIN_ENABLED=true`
3. Have each user log in once (existing rehash writes bcrypt to their row only)
4. Re-run audit until `legacyPlainCount: 0`
5. Set `PASSWORD_LEGACY_PLAIN_ENABLED=false` or remove env var

---

## Validation results

### Build

```
npm run build → PASS (exit code 0)
```

| Check | Status |
|-------|--------|
| TypeScript | Pass |
| Lint | Pass |
| Pages compiled | 49+ (incl. `/api/health/diagnostics`) |

### Sheets backup

```
npm run export:sheets-backup → PASS (exit code 0)
39 tabs exported to exports/sheets-backup-2026-06-22T15-58-50-812Z/
```

### Git checkpoint

```
git tag phase2-stable → points to e984ef4
git push origin phase2-stable → already on remote
```

### Recommended post-deploy checks

- [ ] `CRON_SECRET` set in Vercel production
- [ ] `npm run audit:password-hashes` locally (read-only) — review legacy count
- [ ] `GET /api/health` → `{ ok: true }`
- [ ] `GET /api/health/diagnostics` as admin → env + probes
- [ ] Login supervisor + admin (bcrypt accounts)
- [ ] Verify cron runs after deploy (check Vercel cron logs)
- [ ] Response headers include `x-request-id`

---

## Production env requirements (Phase 3)

| Variable | Required | Notes |
|----------|----------|-------|
| `CRON_SECRET` | **Yes** (for crons) | Vercel Cron sends `Authorization: Bearer <CRON_SECRET>` |
| `PASSWORD_LEGACY_PLAIN_ENABLED` | Only during migration | Omit/`false` = bcrypt-only |
| `JWT_SECRET` | Yes | Unchanged from Phase 2 |
| Google Sheets credentials | Yes | Unchanged |

---

## Phase 3 sign-off

| Statement | Verified |
|-----------|----------|
| Google Sheets backup taken (read-only) | Yes — 39 tabs |
| `phase2-stable` tag on GitHub | Yes |
| No business logic modified | Yes |
| No sheet data modified by Phase 3 code | Yes |
| Build passes | Yes |
