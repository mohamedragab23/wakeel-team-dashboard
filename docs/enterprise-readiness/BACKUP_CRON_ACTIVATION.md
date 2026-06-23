# Daily Backup Cron Activation (Phase 4)

**Date:** 2026-06-23  
**Schedule:** `0 3 * * *` (03:00 UTC daily)  
**Endpoint:** `GET /api/cron/daily-backup`  
**Policy:** Read-only — no writes to Sheets, Neon data, or existing R2 ticketing objects.

---

## Executive summary

| Item | Status |
|------|--------|
| Cron registered in `vercel.json` | **YES** |
| API route deployed | **YES** |
| Sheets daily export | **YES** → R2 archive |
| Neon daily inventory | **YES** → R2 archive |
| R2 daily inventory | **YES** → R2 archive |
| Local scripts (`npm run backup:daily`) | **YES** (unchanged) |
| **Verdict** | **ACTIVE** |

---

## Architecture

```
Vercel Cron (03:00 UTC)
    → GET /api/cron/daily-backup  (CRON_SECRET)
        → lib/backup/dailyBackupService.ts
            ├── Sheets read-only export → R2 backups/daily/{stamp}/sheets/
            ├── Neon row-count inventory → R2 backups/daily/{stamp}/neon/
            └── R2 ListObjects (ticketing/) → R2 backups/daily/{stamp}/r2/
```

**Archive location:** Cloudflare R2 bucket `wakeel-ticketing`  
**Prefix:** `backups/daily/{timestamp}/`  
**Ticketing objects:** Not modified — only new backup files added.

---

## Cron configuration

```json
{
  "path": "/api/cron/daily-backup",
  "schedule": "0 3 * * *"
}
```

| Setting | Value |
|---------|-------|
| `maxDuration` | 300 seconds |
| Auth | `CRON_SECRET` (Bearer / `x-cron-secret`) |
| Region | `iad1` |

---

## R2 archive layout

```
backups/daily/2026-06-23T03-00-00-000Z/
  summary.json
  sheets/manifest.json
  sheets/{tab}.json
  neon/manifest.json
  r2/inventory.json
```

---

## Verification (2026-06-23)

| Component | Local test | Result |
|-----------|------------|--------|
| Neon inventory | `npm run backup:neon` | **PASS** — 5 tables |
| R2 inventory | `npm run backup:r2` | **PASS** — 1 object |
| Sheets export | `npm run backup:sheets` | **PASS** (prior runs, 39 tabs) |
| Build | `npm run build` | **PASS** |
| Production deploy | `vercel deploy --prod` | **PASS** |

### Neon snapshot

| Table | Rows |
|-------|-----:|
| tickets | 2 |
| ticket_comments | 0 |
| ticket_attachments | 2 |
| ticket_notifications | 7 |
| ticket_audit_logs | 5 |

---

## Manual trigger (admin / ops)

Requires `CRON_SECRET` on Vercel (not downloadable via CLI):

```bash
curl -H "Authorization: Bearer $CRON_SECRET" \
  https://wakeel-team-dashboard.vercel.app/api/cron/daily-backup
```

Or locally:

```bash
npm run backup:daily
```

---

## Retention policy

| Asset | Retention | Location |
|-------|-----------|----------|
| Sheets JSON (R2) | **30 days** daily | `backups/daily/` |
| Neon inventory | **90 days** | `backups/daily/*/neon/` |
| R2 inventory | **90 days** | `backups/daily/*/r2/` |
| Local `exports/` | Manual prune | Dev/CI only |

Prune old `backups/daily/` prefixes in R2 via lifecycle rule or monthly script.

---

## Restore procedure

### Google Sheets
1. Download `backups/daily/{stamp}/sheets/manifest.json` from R2.
2. Download per-tab JSON files listed in manifest.
3. **Manual restore** via Sheets UI — never bulk-replace without admin approval.

### Neon
1. Schema: `lib/ticketing/db/schema.sql`
2. Row data not in backup — inventory is audit trail only.

### R2 ticketing files
1. Compare `r2/inventory.json` across dates for drift.
2. Objects remain in `ticketing/` prefix — inventory does not delete.

---

## Files created / modified

| File | Purpose |
|------|---------|
| `app/api/cron/daily-backup/route.ts` | Cron handler |
| `lib/backup/dailyBackupService.ts` | Orchestrator |
| `lib/backup/sheetsBackup.ts` | Sheets export |
| `lib/backup/neonBackup.ts` | Neon inventory |
| `lib/backup/r2InventoryBackup.ts` | R2 inventory |
| `lib/backup/r2Archive.ts` | R2 upload helper |
| `vercel.json` | Cron schedule |

---

## Sign-off

| Policy | Met |
|--------|-----|
| No Sheets writes | Yes |
| No Neon writes | Yes |
| No R2 ticketing object writes | Yes |
| Daily cron active | Yes |

---

## Next phase

| Phase | Task |
|-------|------|
| 5 | Neon read replica (architecture only — not activated) |
