# Operations Ticketing — Scalability Review

## Database

- **PostgreSQL** with connection pool (`max: 10` per serverless instance).
- Indexed filters: status, supervisor, zone, created_at.
- Pagination mandatory on list endpoints.
- JSONB `payload` for type-specific fields — avoids wide sparse tables.

## Attachments

- Metadata in DB; **blobs in object storage** (not Google Sheets, not DB BYTEA).
- Lazy UI: attachment bytes fetched only on preview/download.
- Target: 1M attachments without loading dashboard analytics.

## Notifications

- Indexed `(recipient_code, read_at)` for O(1) unread counts.
- Poll interval 90s (configurable in UI) — upgrade path: SSE/WebSocket later.

## Serverless (Vercel)

- Ticketing routes are `force-dynamic` — no static coupling to analytics pages.
- Cold starts: keep schema migration separate from request path.
- For heavy traffic: dedicated Neon compute + connection pooling (PgBouncer).

## Horizontal scale

- Stateless API nodes; shared Postgres + S3.
- No in-memory ticket cache shared with strategic ops `cache.ts`.

## Load testing suggestions

- 1k concurrent list requests with `pageSize=25`
- 100 parallel 20MB uploads (verify storage limits)
- 100k row seed + `EXPLAIN ANALYZE` on filtered list queries
