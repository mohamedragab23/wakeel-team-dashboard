# Phase 1 — Enterprise Hardening Report

**Date:** 2026-06-22  
**Prerequisite:** [PHASE0_AUDIT.md](./PHASE0_AUDIT.md)  
**Policy:** Google Sheets remains source of truth. No migrations. No Neon connection. No production data modified by this phase.

---

## Executive confirmations

| Requirement | Status |
|-------------|--------|
| Google Sheets remains source of truth | **CONFIRMED** — no new databases wired to operational data |
| No existing sheet data modified | **CONFIRMED** — code changes only; no scripts executed against production |
| No historical data migration | **CONFIRMED** — backup script is read-only export |
| Neon not connected | **CONFIRMED** — ticketing remains optional (503 without env) |

---

## Changes delivered

| ID | Change | Risk | Sheets impact |
|----|--------|------|---------------|
| P1-01 | Sanitized `env.local.example` (removed real private key, spreadsheet IDs, JWT) | Low | None |
| P1-02 | Zone scope on `admin/upload` — riders rejected if out of scope; performance rows filtered | Medium | Limited admins only |
| P1-03 | Block limited admins from global performance writes (import apply, sync POST, clear, delete-day) | Low | Limited admins only |
| P1-04 | Read-only backup script `scripts/export-sheets-backup.ts` + `npm run export:sheets-backup` | None | Read-only |
| P1-05 | [SHEETS_BACKUP_PROCEDURE.md](./SHEETS_BACKUP_PROCEDURE.md) | None | Documentation |
| P1-06 | `exports/` added to `.gitignore` | None | None |

### Files modified

- `env.local.example`
- `lib/adminZoneScope.ts`
- `app/api/admin/upload/route.ts`
- `app/api/admin/performance-import/route.ts`
- `app/api/admin/performance-sync/route.ts`
- `app/api/admin/performance/clear/route.ts`
- `app/api/admin/performance/delete-day/route.ts`
- `package.json`
- `.gitignore`
- `docs/enterprise-readiness/README.md`

### Files created

- `scripts/export-sheets-backup.ts`
- `docs/enterprise-readiness/SHEETS_BACKUP_PROCEDURE.md`
- `docs/enterprise-readiness/PHASE1_REPORT.md` (this file)

---

## Behavior changes (limited admins only)

Full admins (`permissions` without `limited:` prefix) are **unchanged**.

| Route | Before | After |
|-------|--------|-------|
| `POST /api/admin/upload` (riders) | Could assign riders to any supervisor | 403 if any row targets supervisor outside scope |
| `POST /api/admin/upload` (performance) | Wrote all rows | Writes only in-scope riders; reports `skippedOutOfScope` |
| `POST /api/admin/performance-import` (apply) | Full day replace | **403** for limited admins |
| `POST /api/admin/performance-sync` | Sync/approve/skip | **403** for limited admins on POST |
| `POST /api/admin/performance/clear` | Wipe daily tab | **403** for limited admins |
| `POST /api/admin/performance/delete-day` | Delete day globally | **403** for limited admins |

Preview/read endpoints for performance import and sync GET are unchanged.

---

## Outstanding items (manual / Phase 2)

| Priority | Item | Owner |
|----------|------|-------|
| **P0** | Rotate Google service account key in GCP (key was in git history via `env.local.example`) | Ops |
| **P0** | Confirm `JWT_SECRET` set in Vercel production | Ops |
| **P1** | Run first `npm run export:sheets-backup` and store off-site | Ops |
| **P2** | Neon + R2 for ticketing (additive) | When ticketing goes live |
| **P2** | Cookie-only auth (remove localStorage JWT) | Engineering |
| **P2** | Upstash Redis shared cache | Engineering |

---

## Build validation

**Command:** `npm run build`  
**Date:** 2026-06-22  
**Result:** **PASS** (exit code 0)

| Check | Status |
|-------|--------|
| TypeScript compile | Pass |
| Lint | Pass |
| Static pages | 49 generated |
| Middleware | 27.4 kB |

---

## Rollback

```bash
git revert <phase-1-commit-sha>
```

No sheet rollback required — no sheet writes were performed during Phase 1 implementation.
