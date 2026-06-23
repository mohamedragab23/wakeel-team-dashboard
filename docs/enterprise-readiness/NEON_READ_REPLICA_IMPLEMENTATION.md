# Neon Read Replica Implementation (Phase 5)

**Date:** 2026-06-23  
**Status:** **IMPLEMENTED — NOT ACTIVATED**  
**Policy:** Google Sheets remains source of truth forever. No automatic read or sync in production.

---

## Executive summary

| Item | Status |
|------|--------|
| Mirror DDL (`mirror_*` tables) | **APPLIED** on production Neon |
| Sync worker | **Implemented** (`lib/mirror/sync/`) |
| Read adapter in `getSheetData` | **Implemented** (flag-gated) |
| Cron route | **Implemented** (flag-gated, not in `vercel.json`) |
| `NEON_READ_REPLICA_ENABLED` on Vercel | **false / unset** |
| `MIRROR_SYNC_ENABLED` on Vercel | **false / unset** |
| Dashboard reads from Neon | **NO** — Sheets path active |
| **Verdict** | **READY FOR STAGED ACTIVATION** |

---

## Architecture

```
Google Sheets (SoT, writes only)
        │ read-only
        ▼
  syncSheetsToMirror()  ← MIRROR_SYNC_ENABLED=true
        │
        ▼
  Neon mirror_sheet_rows / mirror_sync_state
        │
        ▼
  getSheetData()  ← NEON_READ_REPLICA_ENABLED=true
        │
        ▼
  Dashboard / APIs
```

---

## Feature flags (default OFF)

| Variable | Purpose | Production |
|----------|---------|------------|
| `NEON_READ_REPLICA_ENABLED` | Dashboard reads from mirror | **unset** |
| `MIRROR_SYNC_ENABLED` | Allow sync scripts/cron | **unset** |
| `MIRROR_DATABASE_URL` | Optional dedicated DB URL | Falls back to `POSTGRES_URL` |

---

## Mirror tables (additive)

| Table | Purpose |
|-------|---------|
| `mirror_sheet_rows` | Row-level JSON copy of sheet tabs |
| `mirror_sync_state` | Per-tab hash, row count, last sync |
| `mirror_audit_log` | Sync run audit trail |

**Supported sheets:** المناديب، المشرفين، البيانات اليومية، إعدادات_الرواتب

Ticketing tables (`tickets`, etc.) are **unchanged**.

---

## Files created

| Path | Role |
|------|------|
| `lib/mirror/config.ts` | Flags + sheet list |
| `lib/mirror/db/schema.sql` | DDL |
| `lib/mirror/db/client.ts` | Postgres client |
| `lib/mirror/hash.ts` | Row/tab hashing |
| `lib/mirror/readAdapter.ts` | Read path for `getSheetData` |
| `lib/mirror/sync/syncSheetsToMirror.ts` | Sync worker |
| `app/api/cron/sheets-mirror-sync/route.ts` | Cron handler |
| `scripts/migrate-mirror.ts` | Apply DDL |
| `scripts/sync-sheets-mirror.ts` | Manual sync |
| `scripts/verify-mirror.ts` | Status check |

**Modified:** `lib/googleSheets.ts` — optional mirror read (additive, flag-gated)

---

## Commands

```bash
# 1. Apply schema (once per Neon database)
npm run migrate:mirror

# 2. Verify status
npm run verify:mirror

# 3. Sync (requires MIRROR_SYNC_ENABLED=true locally or on Vercel)
MIRROR_SYNC_ENABLED=true npm run sync:mirror

# 4. Enable reads (staging only — explicit approval)
# NEON_READ_REPLICA_ENABLED=true on Vercel → redeploy
```

---

## Staged activation playbook

### Stage A — Sync only (no read switch)

1. Set `MIRROR_SYNC_ENABLED=true` on Vercel preview/staging.
2. Run sync: `GET /api/cron/sheets-mirror-sync` with `CRON_SECRET`.
3. Verify: `npm run verify:mirror` → `SYNCED_READS_OFF`.

### Stage B — Enable reads (after validation)

1. Compare mirror vs Sheets row counts / spot checks.
2. Set `NEON_READ_REPLICA_ENABLED=true` on preview.
3. Load-test dashboard, riders, strategic ops, salary.
4. Promote to production with approval.

### Stage C — Optional cron (not added by default)

Add to `vercel.json` when ready:

```json
{
  "path": "/api/cron/sheets-mirror-sync",
  "schedule": "*/15 * * * *"
}
```

Requires `MIRROR_SYNC_ENABLED=true`.

---

## Rollback

1. Set `NEON_READ_REPLICA_ENABLED=false` → redeploy (instant Sheets fallback).
2. Set `MIRROR_SYNC_ENABLED=false` → stop sync.
3. Optional: `DROP TABLE mirror_sheet_rows, mirror_sync_state, mirror_audit_log;`
4. Google Sheets **unchanged**.

---

## Verification (2026-06-23)

| Check | Result |
|-------|--------|
| `npm run migrate:mirror` (production Neon) | **PASS** — tables exist |
| `npm run verify:mirror` | `NOT_ACTIVATED` / `SCHEMA_ONLY_OR_EMPTY` |
| `npm run build` | **PASS** |
| Sheets data modified | **NO** |
| Business logic changed | **NO** |

---

## Expected improvements (when activated)

| Scale | Sheets-only | Mirror + Redis |
|-------|-------------|----------------|
| 1k riders | OK | Excellent |
| 5k riders | Slow | Good |
| 10k riders | Timeout risk | Acceptable |
| 25k riders | Not viable | Needs partitioning |

See [SHEETS_SCALING_ARCHITECTURE.md](./SHEETS_SCALING_ARCHITECTURE.md) for full estimates.

---

## Sign-off

| Requirement | Met |
|-------------|-----|
| Sheets remains SoT | Yes |
| Neon read replica only | Yes |
| Incremental sync | Yes (hash diff) |
| Reversible | Yes |
| Not auto-activated | Yes |
