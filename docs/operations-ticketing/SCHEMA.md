# Operations Ticketing — Database Schema

Isolated PostgreSQL schema. **Not** stored in Google Sheets analytics tables.

## Tables

| Table | Purpose |
|-------|---------|
| `tickets` | Core request records |
| `ticket_comments` | Supervisor/admin thread |
| `ticket_attachments` | File metadata (bytes in object storage) |
| `ticket_notifications` | In-app notifications |
| `ticket_audit_logs` | Immutable status/action history |

DDL: [`lib/ticketing/db/schema.sql`](../../lib/ticketing/db/schema.sql)

## Indexes (performance)

- `tickets(supervisor_code)`, `tickets(status)`, `tickets(created_at DESC)`
- Partial index on open tickets
- `ticket_notifications(recipient_code, read_at)` for unread badge
- `ticket_attachments(ticket_id)` — metadata only; blobs external

## Scale targets

Designed for **100k+ tickets** and **1M+ attachments** when:

- Attachments stored in S3/local abstraction (not DB BLOBs)
- Paginated list APIs (`page`, `pageSize` max 100)
- Lazy attachment download via authenticated `/api/ticketing/attachments/[id]`

## Migration

```bash
# Neon / RDS / local Postgres
export TICKETING_DATABASE_URL="postgresql://user:pass@host:5432/ticketing?sslmode=require"
npm run migrate:ticketing
```

Idempotent: `CREATE TABLE IF NOT EXISTS` / `CREATE INDEX IF NOT EXISTS`.
