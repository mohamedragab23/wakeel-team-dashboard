# Neon Ticketing Activation Report

**Date:** 2026-06-22  
**Policy:** Google Sheets remains source of truth. No historical migration. No Sheets data modified. Ticketing only on existing Neon DB.

---

## Executive summary

| Item | Result |
|------|--------|
| `POSTGRES_URL` on Vercel | **YES** (pulled via `vercel env pull`) |
| Compatible with `lib/ticketing/db/client.ts` | **YES** (`postgresql://` pooled Neon host) |
| Second database created | **NO** — `TICKETING_DATABASE_URL` = same URL as `POSTGRES_URL` |
| Migrations executed | **YES** — `lib/ticketing/db/schema.sql` applied |
| Production data inserted | **NO** — all tables row count **0** |
| Google Sheets / Strategic Ops / Talabat | **NOT TOUCHED** |

---

## 1. `POSTGRES_URL` verification (Vercel production)

Pulled with: `npx vercel env pull .env.vercel.prod --environment=production`

| Variable | Present |
|----------|---------|
| `POSTGRES_URL` | **Yes** |
| `NEON_PROJECT_ID` | **Yes** |
| `TICKETING_DATABASE_URL` (before) | **No** |
| `TICKETING_DATABASE_URL` (after) | **Yes** (added = `POSTGRES_URL`) |

### URL format compatibility

```json
{
  "protocol": "postgresql:",
  "host": "ep-tiny-sound-atfztisu-pooler.c-9.us-east-1.aws.neon.tech",
  "port": "5432",
  "database": "neondb",
  "hasSslMode": true,
  "compatible": true
}
```

`postgres` npm package (`lib/ticketing/db/client.ts`) accepts standard `postgresql://` URLs — **compatible**.

---

## 2. Environment variables used

| Variable | Where set | Purpose |
|----------|-----------|---------|
| `POSTGRES_URL` | Vercel (Neon integration) | Source connection string |
| `TICKETING_DATABASE_URL` | `.env.local` + **Vercel production** | App reads this only (`client.ts`) |
| Value relationship | `TICKETING_DATABASE_URL` **equals** `POSTGRES_URL` | Same `neondb` database |

**Not used by ticketing code:** `DATABASE_URL`, `POSTGRES_PRISMA_URL`, `PGHOST`, etc.

---

## 3. Migrations executed

| Command | Result |
|---------|--------|
| `npx tsx scripts/activate-ticketing-neon.ts` | **Success** |
| SQL source | `lib/ticketing/db/schema.sql` |
| Type | `CREATE TABLE IF NOT EXISTS` (idempotent) |
| Sheets impact | **None** |

---

## 4. Tables created / verified

| Table | Exists | Row count |
|-------|--------|----------:|
| `tickets` | Yes | 0 |
| `ticket_comments` | Yes | 0 |
| `ticket_attachments` | Yes | 0 |
| `ticket_notifications` | Yes | 0 |
| `ticket_audit_logs` | Yes | 0 |

---

## 5. Build validation

```
npm run build → PASS (exit code 0)
```

49 pages, ticketing routes compiled, middleware 27.9 kB.

---

## 6. API & page validation (local `npm run start`)

| Endpoint | Status | Meaning |
|----------|--------|---------|
| `GET /api/ticketing` | **401** | DB connected; auth required (not 503) |
| `GET /api/ticketing/metrics` | **401** | DB connected; auth required |
| `GET /ticketing/new` | **200** | Page loads |
| `GET /ticketing/my` | **200** | Page loads |
| `GET /ticketing/admin` | **200** | Page loads |

**Before activation:** production returned **503** (`TICKETING_DATABASE_URL` missing).  
**After activation (local):** **401** confirms PostgreSQL path is live.

### Production note

`TICKETING_DATABASE_URL` was added to **Vercel production** env. **Redeploy required** for `wakeel-team-dashboard.vercel.app` to return 401 instead of 503 on ticketing APIs.

---

## Files inspected

| Category | Files |
|----------|-------|
| DB client | `lib/ticketing/db/client.ts`, `lib/ticketing/db/schema.sql` |
| API gate | `lib/ticketing/apiHelpers.ts` |
| Routes | `app/api/ticketing/route.ts`, `app/api/ticketing/metrics/route.ts` |
| Services | `lib/ticketing/services/*.ts` (read-only; unchanged) |
| Env | `.env.vercel.prod` (pulled), `.env.local` (updated) |
| Scripts (new) | `scripts/verify-neon-url.ts`, `scripts/activate-ticketing-neon.ts`, `scripts/sync-ticketing-env-local.ts`, `scripts/sync-ticketing-env-vercel.ts` |
| Explicitly not modified | `lib/strategicOps/**`, `lib/googleSheets.ts`, salary/recruitment/riders logic |

---

## Rollback plan

### Disable ticketing only (Sheets unaffected)

1. Vercel → remove `TICKETING_DATABASE_URL` or redeploy from `phase2-stable` tag
2. Ticketing APIs return **503**; dashboard/analytics unchanged

### Remove ticketing tables (optional, destructive to ticketing only)

```sql
DROP TABLE IF EXISTS ticket_audit_logs, ticket_notifications, ticket_attachments, ticket_comments, tickets CASCADE;
```

**Does not affect Google Sheets or Neon tables used by other services.**

### Full app rollback

```bash
git checkout phase2-stable
# Vercel Instant Rollback to prior deployment
```

---

## Ops checklist (post-report)

- [ ] **Redeploy** Vercel production to load `TICKETING_DATABASE_URL`
- [ ] Confirm `GET https://wakeel-team-dashboard.vercel.app/api/ticketing` → **401** (not 503)
- [ ] Login as supervisor → test `/ticketing/new` create flow (optional)
- [ ] Copy `exports/sheets-backup-*` off-site if not already done

---

## Sign-off

| Statement | Verified |
|-----------|----------|
| No Google Sheets data modified | Yes |
| No historical data migration | Yes |
| Single Neon database (no second DB) | Yes |
| Ticketing schema only | Yes |
| Zero production rows inserted | Yes |
