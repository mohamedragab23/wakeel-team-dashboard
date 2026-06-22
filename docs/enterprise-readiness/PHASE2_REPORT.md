# Phase 2 — Enterprise Hardening Report

**Date:** 2026-06-22  
**Prerequisite:** [PHASE1_REPORT.md](./PHASE1_REPORT.md)  
**Policy:** Google Sheets remains source of truth. No Sheets migration. Neon connection is manual ops only.

---

## Executive confirmations

| Requirement | Status |
|-------------|--------|
| Google Sheets remains source of truth | **CONFIRMED** |
| No existing sheet data modified | **CONFIRMED** — code-only changes |
| No historical data migration | **CONFIRMED** |
| Neon not auto-connected | **CONFIRMED** — setup doc only; env must be set manually |

---

## Changes delivered

| ID | Change | Risk | Sheets impact |
|----|--------|------|---------------|
| P2-01 | Cookie-only auth — JWT in httpOnly cookie only | Medium | None |
| P2-02 | Login API omits `token` from JSON body | Low | None |
| P2-03 | `lib/clientSession.ts` — user profile in sessionStorage | Low | None |
| P2-04 | Migrated ~58 client files to `authFetch` | Medium | None |
| P2-05 | Optional Upstash Redis L2 cache (`lib/redisCache.optional.ts`) | Low | Read cache only |
| P2-06 | [TICKETING_NEON_R2_SETUP.md](./TICKETING_NEON_R2_SETUP.md) | None | Documentation |

---

## Cookie-only auth (P2-01–04)

**Before:** JWT stored in `localStorage` + sent as `Authorization: Bearer` on every request.  
**After:** JWT set as `wakeel_auth_token` httpOnly cookie on login; client uses `authFetch` with `credentials: 'include'`.

| Component | Change |
|-----------|--------|
| `app/api/auth/login` | Sets cookie; JSON response excludes `token` |
| `lib/authFetch.ts` | No Bearer header; cookie only |
| `lib/clientSession.ts` | Non-sensitive user profile in `sessionStorage` |
| `components/LoginPage.tsx` | Stores user profile only |
| `components/Layout.tsx` | Session guard via `/api/auth/verify` |
| All dashboard/recruitment/ticketing pages | `authFetch` instead of `localStorage` token |

**Full admins / supervisors:** Same login UX; session survives via cookie.

**Legacy sessions:** Old `localStorage` tokens are cleared on next login via `setStoredUser`.

---

## Optional Upstash Redis (P2-05)

When `UPSTASH_REDIS_REST_URL` + `UPSTASH_REDIS_REST_TOKEN` are set:

- `getSheetData` checks in-memory cache → Redis → Google Sheets API
- Writes populate both in-memory and Redis (15 min TTL)
- `cacheInvalidation` deletes matching Redis keys on rider workflow changes
- Without env vars: behavior identical to Phase 1 (in-memory only)

---

## Ticketing provisioning (P2-06)

Manual setup guide for Neon + R2 — no automatic connection or Sheets migration.

See [TICKETING_NEON_R2_SETUP.md](./TICKETING_NEON_R2_SETUP.md).

---

## Build validation

**Command:** `npm run build`  
**Date:** 2026-06-22  
**Result:** **PASS** (exit code 0)

---

## Outstanding manual ops

| Priority | Item |
|----------|------|
| P0 | Rotate Google service account key (was in git history) |
| P0 | Confirm `JWT_SECRET` in Vercel production |
| P1 | Run `npm run export:sheets-backup` weekly |
| P2 | Provision Upstash Redis when ready (optional) |
| P2 | Provision Neon + R2 when enabling ticketing |

---

## Rollback

```bash
git revert <phase-2-commit-sha>
```

Users may need to log in again after rollback if cookie format changes.
