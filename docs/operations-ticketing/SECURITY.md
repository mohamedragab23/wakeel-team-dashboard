# Operations Ticketing — Security Review

## Authentication & authorization

- JWT validation on every API route (`verifyToken`).
- Supervisors: list/detail **only** `supervisor_code = JWT.code`.
- Admins: require `ticketing` feature in `limited:` permissions (or full admin).
- Closed tickets: supervisors cannot comment or attach.

## Upload security

- Max **20 MB** per file.
- Allowlist MIME: PDF, PNG, JPEG only.
- Allowlist extensions: `.pdf`, `.png`, `.jpg`, `.jpeg`.
- `sanitizeFilename()` strips path separators and unsafe characters.
- Storage keys: UUID prefix under `tickets/{ticketId}/` — no user-controlled paths.
- Local provider blocks `..` path traversal.

## Attachment delivery

- No public URLs; files served only via authenticated API.
- `Content-Disposition` + `X-Content-Type-Options: nosniff`.
- `Cache-Control: private, no-store`.

## XSS

- React escapes comment/ticket text by default.
- No `dangerouslySetInnerHTML` in ticketing UI.

## Injection

- Parameterized SQL via `postgres` tagged templates.
- Zod validation on all write payloads.

## Audit

- `ticket_audit_logs` append-only from application layer.
- Status transitions logged with actor + timestamps.

## Recommendations

- Rotate `JWT_SECRET` on compromise (same as main app).
- Use TLS for Postgres (`sslmode=require`).
- S3 bucket: block public access, encryption at rest (SSE-S3 or KMS).
