# Operations Ticketing — Production Deployment

## Environment variables

```env
# Required
TICKETING_DATABASE_URL=postgresql://...

# Storage (development)
TICKETING_STORAGE_PROVIDER=local
TICKETING_LOCAL_STORAGE_PATH=.data/ticketing-attachments

# Storage (production)
TICKETING_STORAGE_PROVIDER=s3
TICKETING_S3_BUCKET=your-bucket
TICKETING_S3_REGION=eu-west-1
TICKETING_S3_ACCESS_KEY_ID=...
TICKETING_S3_SECRET_ACCESS_KEY=...
# Optional: R2/MinIO
# TICKETING_S3_ENDPOINT=https://...
# TICKETING_S3_PREFIX=ticketing
```

## Vercel steps

1. Create Neon project → copy connection string → `TICKETING_DATABASE_URL`.
2. Run `npm run migrate:ticketing` locally against production URL (once).
3. Create S3 bucket (private); set ticketing env vars.
4. Deploy branch; smoke test:
   - Supervisor creates ticket at `/ticketing/new`
   - Admin sees queue at `/ticketing/admin`
   - Notification badge increments
5. Grant `limited:...,ticketing` to regional admins as needed.

## Performance isolation

- Ticketing uses **separate** DB connection — no Google Sheets quota impact.
- Do not mount ticketing data fetchers on `/admin/dashboard` or strategic-ops pages.

## Monitoring

- Alert on `503` rate for `/api/ticketing/*`
- Postgres: connection count, slow queries > 500ms
- S3: 4xx/5xx on PutObject/GetObject

## Local development

```bash
# Docker Postgres
docker run -d -p 5433:5432 -e POSTGRES_PASSWORD=dev postgres:16
export TICKETING_DATABASE_URL=postgresql://postgres:dev@127.0.0.1:5433/postgres
npm run migrate:ticketing
npm run dev
```

Attachments stored under `.data/ticketing-attachments` (gitignored).
