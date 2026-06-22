# Operations Ticketing — Disaster Recovery

## PostgreSQL

- Enable **automated backups** (Neon/RDS: daily + PITR).
- Test restore quarterly to staging `TICKETING_DATABASE_URL`.
- Export critical audit logs to cold storage (optional S3 parquet monthly).

## Object storage (S3)

- Enable **versioning** on ticketing bucket.
- Cross-region replication for production (optional).
- Lifecycle: transition old attachments to Glacier after N days if policy allows.

## Application

- Redeploy previous Vercel deployment if bad release (ticketing isolated — safe).
- Env vars backup: document `TICKETING_*` in secrets manager.

## RTO / RPO (targets)

| Asset | RPO | RTO |
|-------|-----|-----|
| Postgres tickets | ≤ 1 h (managed backup) | ≤ 4 h |
| Attachments | 0 with versioning | ≤ 4 h |
| Notifications | Acceptable loss ≤ 24 h | ≤ 1 h |

## Incident checklist

1. Disable ticketing menu (remove env `TICKETING_DATABASE_URL`) — analytics unaffected.
2. Restore DB snapshot to new instance; update connection string.
3. Verify S3 bucket integrity; re-run attachment spot checks.
4. Re-enable module; notify pilot users.
