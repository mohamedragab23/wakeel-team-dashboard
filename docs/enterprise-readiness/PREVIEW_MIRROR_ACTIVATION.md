# Preview Mirror Activation (Phase 6A)

**Date:** 2026-06-23  
**Policy:** Google Sheets = source of truth. Production unchanged.

---

## Activation status

| Environment | `MIRROR_SYNC_ENABLED` | `NEON_READ_REPLICA_ENABLED` | Status |
|-------------|----------------------|----------------------------|--------|
| **Preview** | `true` | `true` | Active (Vercel Preview env) |
| **Production** | unset / false | unset / false | Unchanged |

Verified via `vercel env ls preview` and `vercel env ls production` (no MIRROR/NEON_READ vars on production).

---

## Code changes (additive)

| Change | Purpose |
|--------|---------|
| `loadMirrorSheetRowsAggregated()` | Single-round-trip `jsonb_agg` read path |
| `tryGetMirrorSheetData()` | Uses aggregated loader when mirror enabled |
| `lib/mirror/db/indexes.sql` | Additive read indexes |
| Build fix: `syncSheetsToMirror.ts` row_data cast | TypeScript only — no logic change |

---

## Preview deployment

Preview deploy triggered via `vercel deploy --yes -S ragab-team` (non-`--prod`).

| Check | Result |
|-------|--------|
| `npm run build` | Pass |
| Preview deployment | **READY** — `dpl_8EoVUSNh2Nfqxc65Dr1hiFUGPMij` |
| Preview URL | https://wakeel-team-dashboard-hmn3dg3tj-ragab-team.vercel.app |
| Production flags | Unchanged |
| Google Sheets writes | None |
| Business logic | Unchanged |

---

## Rollback

1. Remove or set `MIRROR_SYNC_ENABLED=false` and `NEON_READ_REPLICA_ENABLED=false` on Preview only.
2. Redeploy preview.
3. Drop indexes if needed: `DROP INDEX IF EXISTS idx_mirror_rows_sheet_count; DROP INDEX IF EXISTS idx_mirror_audit_started;`

Production requires no action — mirror flags were never set.
