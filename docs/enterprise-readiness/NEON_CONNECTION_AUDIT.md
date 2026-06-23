# Neon / Ticketing Database Connection Audit

**Date:** 2026-06-22  
**Method:** Codebase inspection, local env audit, production HTTP probe — **no migrations run, no code modified, no Google Sheets access**

---

## Executive conclusion

| Question | Answer |
|----------|--------|
| Is Neon connected to the **ticketing module**? | **NO** |
| Is `TICKETING_DATABASE_URL` configured? | **NO** (local + production runtime) |
| Does runtime code open PostgreSQL for ticketing? | **NO** (guarded; returns 503) |
| Were ticketing migrations executed for this app? | **NO evidence** (cannot connect) |
| Do ticketing tables exist with data? | **Not verified** — no app connection string available |

**Neon appears provisioned on Vercel** (user dashboard shows `POSTGRES_URL`, `NEON_PROJECT_ID`, etc.) but the application **only reads `TICKETING_DATABASE_URL`**, which is **not set**. Neon is **not wired** to the ticketing code path.

---

## 1. Is `TICKETING_DATABASE_URL` configured?

### Code requirement

```7:9:lib/ticketing/db/client.ts
export function isTicketingDbConfigured(): boolean {
  return Boolean(process.env.TICKETING_DATABASE_URL?.trim());
}
```

No fallback to `POSTGRES_URL`, `DATABASE_URL`, or other Neon-injected variables (grep: **zero** references in `.ts`/`.tsx`).

### `.env.local` (local machine)

| Check | Result |
|-------|--------|
| File exists | Yes |
| Keys present (18 total) | Google Sheets, JWT, Tableau, Cron, Rooster, Telegram |
| `TICKETING_DATABASE_URL` | **NOT SET** |
| `POSTGRES_URL` / `DATABASE_URL` | **NOT SET** |

Verified via read-only key enumeration (values not logged).

### `.env.production` (local)

| Check | Result |
|-------|--------|
| File exists | **No** |

### Repository templates only

| File | `TICKETING_DATABASE_URL` |
|------|--------------------------|
| `.env.example` | Commented placeholder |
| `.env.production.example` | Empty placeholder |

### Vercel environment variables

| Source | Result |
|--------|--------|
| `vercel env ls production` (CLI) | **Failed** — invalid/missing Vercel token locally |
| User-provided Vercel dashboard screenshot | Neon vars present: `POSTGRES_URL`, `POSTGRES_PASSWORD`, `POSTGRES_DATABASE`, `DATABASE_URL_UNPOOLED`, `NEON_PROJECT_ID`, `PGUSER`, `POSTGRES_PRISMA_URL` |
| `TICKETING_DATABASE_URL` in screenshot | **NOT VISIBLE** — not listed among env vars shown |

### Production runtime proof

```http
GET https://wakeel-team-dashboard.vercel.app/api/ticketing
→ HTTP 503
→ {"success":false,"error":"… TICKETING_DATABASE_URL … migrate:ticketing"}
```

This response is produced **only** when `isTicketingDbConfigured()` is false (`lib/ticketing/apiHelpers.ts`), meaning **production deploy does not have `TICKETING_DATABASE_URL` at runtime**.

---

## 2. Does runtime code create a PostgreSQL connection?

### Connection creation path

| Step | Location | When it runs |
|------|----------|--------------|
| Config check | `isTicketingDbConfigured()` | Every ticketing API request |
| Early exit | `wrapTicketingHandler` → 503 | If URL missing |
| Pool create | `getTicketingSql()` → `postgres(url, …)` | Only if URL set |

### Ticketing API routes (all wrapped)

- `app/api/ticketing/route.ts`
- `app/api/ticketing/[id]/route.ts`
- `app/api/ticketing/[id]/comments/route.ts`
- `app/api/ticketing/[id]/attachments/route.ts`
- `app/api/ticketing/attachments/[id]/route.ts`
- `app/api/ticketing/notifications/route.ts`
- `app/api/ticketing/metrics/route.ts`

### Connection status

| Environment | PostgreSQL connection for ticketing |
|-------------|-------------------------------------|
| Local (`.env.local`) | **Never attempted** — URL missing |
| Production (`wakeel-team-dashboard.vercel.app`) | **Never attempted** — 503 before `getTicketingSql()` |

**Services that would connect** (if URL were set): `ticketService.ts`, `notificationService.ts`, `attachmentService.ts`, `auditService.ts` — none reached in production today.

---

## 3. Are ticketing migrations already executed?

### Migration mechanism

| Item | Detail |
|------|--------|
| Script | `npm run migrate:ticketing` → `scripts/migrate-ticketing.ts` |
| SQL | `lib/ticketing/db/schema.sql` |
| Auto-run on deploy | **No** — manual only |
| CI / `vercel.json` hook | **None** |

### Migration status

| Check | Result |
|-------|--------|
| `TICKETING_DATABASE_URL` available locally | **No** — script would exit code 1 immediately |
| Production app connects to DB | **No** — 503 |
| Evidence migrations ran | **None found** |

**Verdict: Migrations for the ticketing app connection have NOT been executed** (or if run manually against another URL, that URL is not wired to the deployed app).

---

## 4. Database tables and row counts

### Expected tables (`lib/ticketing/db/schema.sql`)

- `tickets`
- `ticket_comments`
- `ticket_attachments`
- `ticket_notifications`
- `ticket_audit_logs`

### Inspection result

| Table | Exists? | Row count |
|-------|---------|-----------|
| `tickets` | **Unknown** | **N/A** |
| `ticket_comments` | **Unknown** | **N/A** |
| `ticket_attachments` | **Unknown** | **N/A** |
| `ticket_notifications` | **Unknown** | **N/A** |
| `ticket_audit_logs` | **Unknown** | **N/A** |

**Reason:** No `TICKETING_DATABASE_URL` available for read-only audit query. The Neon `POSTGRES_URL` on Vercel is **not used by application code** and was not queried (would require separate credentials handling outside app contract).

---

## Summary table

| Metric | Status |
|--------|--------|
| **Connection status** | **DISCONNECTED** — ticketing module inactive |
| **Migration status** | **NOT APPLIED** (for app-bound connection) |
| **Tables found** | **Not inspected** |
| **Row counts** | **N/A** |
| **Google Sheets impact** | **None** — ticketing isolated |
| **Production dashboard** | **Works** — ticketing returns 503 only |

---

## Architecture note (Neon vs app)

```
Vercel Environment                    Application code
─────────────────────                 ──────────────────
POSTGRES_URL          ──X──►          (not read)
NEON_PROJECT_ID       ──X──►          (not read)
DATABASE_URL_UNPOOLED ──X──►          (not read)

TICKETING_DATABASE_URL (missing) ──►  lib/ticketing/db/client.ts
                                      → 503 on all /api/ticketing/*
```

Neon **infrastructure** may exist; **application integration** does not.

---

## To connect Neon (ops only — not executed in this audit)

1. In Vercel → Environment Variables, add **`TICKETING_DATABASE_URL`** = pooled Neon connection string (can copy from `POSTGRES_URL` if same database intended).
2. Redeploy.
3. Run **`npm run migrate:ticketing`** once manually against that URL (requires explicit approval).
4. Verify `GET /api/ticketing` returns 200 (with admin auth) instead of 503.

---

## Audit limitations

- Vercel CLI not authenticated on this machine — variable list partly from dashboard screenshot.
- Did not connect to Neon using `POSTGRES_URL` directly (outside app env contract).
- Phase 3 `/api/health/diagnostics` not deployed to production yet (404 on probe).

---

## Sign-off

| Statement | Verified |
|-----------|----------|
| No code modified | Yes |
| No migrations executed | Yes |
| No Google Sheets data touched | Yes |
| Ticketing not connected at runtime | Yes |
