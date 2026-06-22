# Operations Ticketing — API Design

Base path: `/api/ticketing`  
Auth: `Authorization: Bearer <JWT>` (same login as dashboard)  
Response shape: `{ success: boolean, data?: T, error?: string }`

## Endpoints

| Method | Path | Role | Description |
|--------|------|------|-------------|
| GET | `/api/ticketing` | Supervisor (own) / Admin (all) | Paginated list + filters |
| POST | `/api/ticketing` | Supervisor | Create ticket (+ multipart files) |
| GET | `/api/ticketing/metrics` | Admin | Queue metrics + SLA stats |
| GET | `/api/ticketing/notifications` | Both | List + unread count |
| PATCH | `/api/ticketing/notifications` | Both | Mark read `{ id }` or `{ all: true }` |
| GET | `/api/ticketing/[id]` | Owner / Admin | Ticket + comments + attachment meta + audit |
| PATCH | `/api/ticketing/[id]` | Admin | Status, priority, admin note |
| POST | `/api/ticketing/[id]/comments` | Owner / Admin | Add comment |
| POST | `/api/ticketing/[id]/attachments` | Owner / Admin | Upload file (multipart) |
| GET | `/api/ticketing/attachments/[id]` | Owner / Admin | Secure file stream |

## List query params

- `status`, `type`, `priority`, `zone`, `search`
- `page` (default 1), `pageSize` (default 20, max 100)

## Create body (JSON or multipart)

Multipart: field `data` = JSON string, field `files` = repeated files.

### Types

- `order_issue` — zone, description, issueCategory, rider/order fields
- `security_clearance` — zone, rider, nationalId, notes
- `rider_suspension` — zone, rider, dates, reason, notes
- `general_request` — zone, subject, description

## Status workflow

`new` → `under_review` → `waiting_supervisor_response` ↔ `under_review` → `approved` | `rejected` | `closed`

Each status change writes `ticket_audit_logs` + notifications.

## Errors

- `401` — missing/invalid token
- `403` — role or ownership violation
- `503` — `TICKETING_DATABASE_URL` not configured
