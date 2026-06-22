# Operations Ticketing — Migration Plan

## Phase 0 — Prerequisites (no impact on existing dashboard)

1. Provision **dedicated** PostgreSQL (recommended: [Neon](https://neon.tech) serverless).
2. Set environment variables on Vercel / `.env.local` (see `ENV.md`).
3. Run `npm run migrate:ticketing` once per environment.

## Phase 1 — Deploy module (read-only for users)

1. Deploy application code (`lib/ticketing`, `app/api/ticketing`, `app/ticketing`).
2. Verify `503` is not returned when DB URL is set.
3. Enable admin permission `ticketing` for pilot admins.

## Phase 2 — Pilot

1. Train supervisors on `/ticketing/new`.
2. Train admins on `/ticketing/admin` queue.
3. Monitor DB size, attachment storage, notification latency.

## Phase 3 — Production storage

1. Switch `TICKETING_STORAGE_PROVIDER=s3`.
2. Configure bucket + IAM (least privilege: PutObject/GetObject/DeleteObject on prefix only).
3. Enable bucket versioning + lifecycle rules (see `DISASTER_RECOVERY.md`).

## Rollback

- Remove menu links / env vars — module is isolated; **no rollback** of Google Sheets analytics required.
- DB and S3 data retained for audit.

## Data separation guarantee

| System | Storage |
|--------|---------|
| Analytics, Talabat, strategic ops | Google Sheets (unchanged) |
| Ticketing | PostgreSQL + object storage |

No shared tables, caches, or report builders.
