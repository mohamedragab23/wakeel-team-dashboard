# Ticketing — Neon PostgreSQL + R2 Setup (Additive Only)

**Policy:** Google Sheets remains the source of truth for all operational/analytics data. Ticketing uses a **separate** Postgres database and object storage only.

---

## Prerequisites

- Vercel project linked
- Neon account (or any Postgres compatible with `postgres` npm package)
- Cloudflare R2 or AWS S3 bucket for attachments

---

## Step 1 — Create Neon database

1. Create a new Neon project (e.g. `wakeel-ticketing`)
2. Copy the **pooled** connection string (`postgresql://...?sslmode=require`)
3. In Vercel → Settings → Environment Variables, add:

```
TICKETING_DATABASE_URL=postgresql://...
```

**Do not** point this URL at any Sheets migration — it is ticketing-only.

---

## Step 2 — Apply schema (manual, one-time)

From a machine with `TICKETING_DATABASE_URL` in `.env.local`:

```bash
npm run migrate:ticketing
```

This runs `lib/ticketing/db/schema.sql` DDL only. It does **not** read or write Google Sheets.

---

## Step 3 — Configure R2 / S3 for attachments

In Vercel environment variables:

```
TICKETING_STORAGE_PROVIDER=s3
TICKETING_S3_BUCKET=your-bucket
TICKETING_S3_REGION=auto
TICKETING_S3_ACCESS_KEY_ID=...
TICKETING_S3_SECRET_ACCESS_KEY=...
TICKETING_S3_ENDPOINT=https://<accountid>.r2.cloudflarestorage.com
TICKETING_S3_PREFIX=ticketing
```

For local dev without R2:

```
TICKETING_STORAGE_PROVIDER=local
TICKETING_LOCAL_STORAGE_PATH=.data/ticketing-attachments
```

---

## Step 4 — Enable admin feature

In the `Admins` sheet, grant the `ticketing` feature to admins who should manage tickets (via `limited:ticketing,...` or full admin).

---

## Step 5 — Deploy and verify

| Check | Expected |
|-------|----------|
| `GET /api/ticketing` without DB | 503 + graceful message |
| `GET /api/ticketing` with DB | 200 empty list or tickets |
| Dashboard / strategic ops | Unchanged |
| Google Sheets tabs | Unchanged |

---

## Rollback

1. Remove `TICKETING_DATABASE_URL` from Vercel → ticketing APIs return 503
2. Dashboard continues working
3. Postgres data retained until explicitly deleted

---

## What NOT to do

- Do not sync Sheets rows into Postgres
- Do not auto-run `migrate:ticketing` on deploy without approval
- Do not use ticketing DB for KPIs, salaries, or performance
