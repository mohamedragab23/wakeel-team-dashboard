# Weekly Google Sheets Backup Procedure

**Policy:** Google Sheets remains the source of truth. This procedure is **read-only** — it never modifies sheet data.

---

## Automated export (recommended)

From the project root with `.env.local` configured:

```bash
npm run export:sheets-backup
```

**Output:** `exports/sheets-backup-<ISO-timestamp>/`

| File | Contents |
|------|----------|
| `manifest.json` | Spreadsheet ID, export time, per-tab row counts |
| `<tab-name>.json` | Full tab values as JSON (`values` array) |

The `exports/` directory is gitignored. Copy the backup folder to secure off-site storage (encrypted drive, S3 bucket, etc.).

---

## Weekly schedule

| Step | Action |
|------|--------|
| 1 | Run `npm run export:sheets-backup` on a machine with valid credentials |
| 2 | Verify `manifest.json` tab count matches expected tabs |
| 3 | Copy folder to off-site storage with date in path, e.g. `backups/2026-06-22/` |
| 4 | Retain at least 4 weekly snapshots (1 month) |
| 5 | Optionally verify one tab row count against Google Sheets UI |

---

## Manual fallback (no script)

1. Open the spreadsheet in Google Sheets
2. **File → Download → Microsoft Excel (.xlsx)** for full workbook
3. Store in encrypted off-site location with date stamp
4. Google **Version history** (File → Version history) provides additional recovery points

---

## What this does NOT do

- Does not migrate data to Postgres or any other database
- Does not modify, delete, or append sheet rows
- Does not run automatically in production (manual or scheduled CI job only)

---

## Restoring from backup

1. Identify the snapshot date in `manifest.json`
2. Open the target tab JSON and compare row counts
3. Use Google Sheets UI or a controlled import script to restore **only with explicit approval**
4. Never run restore scripts against production without a rollback plan
