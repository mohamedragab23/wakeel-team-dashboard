# Automated Backup System Report (Phase 4C)

**Date:** 2026-06-23  
**Policy:** Read-only exports only. No writes to Sheets, Neon, or R2.

---

## Scripts created

| Script | Command | What it does |
|--------|---------|--------------|
| `scripts/backup-sheets.ts` | `npm run backup:sheets` | Read-only Google Sheets export → `exports/sheets-backup-*` |
| `scripts/backup-neon.ts` | `npm run backup:neon` | Ticketing table inventory (row counts) → `exports/neon-backup-*` |
| `scripts/backup-r2.ts` | `npm run backup:r2` | R2 object inventory (ListObjects) → `exports/r2-inventory-*` |
| `scripts/run-daily-backups.ts` | `npm run backup:daily` | Runs all three sequentially |

Existing: `npm run export:sheets-backup` (used by `backup-sheets.ts`).

---

## Verification (2026-06-23)

| Backup | Result |
|--------|--------|
| Sheets (pre-Phase-4) | **PASS** — `exports/sheets-backup-2026-06-23T13-03-38-464Z` (39 tabs) |
| Neon inventory | **PASS** — `exports/neon-backup-2026-06-23T13-06-56-558Z` |
| R2 inventory | **SKIP locally** — `TICKETING_S3_*` not in `.env.local` (works on Vercel with env) |

### Neon inventory snapshot

| Table | Rows |
|-------|-----:|
| tickets | 2 |
| ticket_comments | 0 |
| ticket_attachments | 2 |
| ticket_notifications | 7 |
| ticket_audit_logs | 5 |

No row data exported (PII protection). Schema reference: `lib/ticketing/db/schema.sql`.

---

## Retention policy (recommended)

| Asset | Retention | Storage |
|-------|-----------|---------|
| Sheets JSON backups | **30 days** daily + **12 months** weekly | Off-site (`exports/` is gitignored) |
| Neon inventory | **90 days** | `exports/neon-backup-*` |
| R2 inventory | **90 days** | `exports/r2-inventory-*` |

Prune script (manual): delete folders older than retention in `exports/`.

---

## Scheduling (recommended)

Add Vercel Cron (not auto-deployed in this phase):

```json
{
  "path": "/api/cron/daily-backup",
  "schedule": "0 3 * * *"
}
```

Or run `npm run backup:daily` from CI/GitHub Actions with secrets.

---

## Restore procedure

### Google Sheets
1. Locate `exports/sheets-backup-<timestamp>/manifest.json`.
2. Open per-tab JSON files.
3. **Manual restore only** — copy values back via Sheets UI or controlled `updateSheetRange` (not automated; Sheets remains SoT).
4. Never bulk-replace production tabs without admin approval.

### Neon (ticketing)
1. Schema: `lib/ticketing/db/schema.sql` or `npm run migrate:ticketing`.
2. Row data: not exported by design — restore from ticketing operational exports if added later.

### R2
1. Use `inventory.json` to verify object keys and sizes.
2. Objects remain in bucket — inventory is audit trail only.

---

## Backup verification checklist

- [ ] `manifest.json` exists and `tabCount` = 39
- [ ] Neon manifest shows all 5 ticketing tables `exists: true`
- [ ] R2 inventory `objectCount` matches Cloudflare dashboard
- [ ] Copy `exports/` off-machine weekly

---

## Sign-off

| Requirement | Met |
|-------------|-----|
| No Sheets writes | Yes |
| No Neon writes | Yes |
| No R2 writes | Yes |
| Daily orchestrator | Yes |
| Restore documented | Yes |
