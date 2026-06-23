# Final Production Release Report

**Release tag:** `release-enterprise-v1`  
**Date:** 2026-06-23  
**Application:** Wakeel Team Operations Dashboard  
**Production URL:** https://wakeel-team-dashboard.vercel.app  
**Policy:** Google Sheets = sole source of truth. No bulk migration. Production mirror **OFF**.

---

## Release summary

Enterprise Phases 1–6 deliver operational hardening without changing Strategic Ops, Talabat, Salary, or Riders business logic.

| Phase | Scope | Status |
|-------|-------|--------|
| 1 | Redis (Upstash) | Active on production |
| 2 | Sentry monitoring | Active on production |
| 3 | Password bcrypt migration | Complete (14 accounts) |
| 4 | Daily backup cron → R2 | Active (`0 3 * * *`) |
| 5 | Neon read mirror (implementation) | Built; **not activated on production** |
| 6 | Preview mirror UAT + query audit | Complete; **KEEP_PRODUCTION_ON_SHEETS** |

**Enterprise readiness score:** 7.9 / 10 ([ENTERPRISE_READINESS_FINAL.md](./ENTERPRISE_READINESS_FINAL.md))

---

## What ships in this release

### Infrastructure

- Upstash Redis L2 cache (`KV_REST_API_*`)
- Sentry error monitoring + source maps (`NEXT_PUBLIC_SENTRY_DSN`)
- Cloudflare R2 ticketing storage + daily backup archives
- Neon ticketing database (`TICKETING_DATABASE_URL`)
- Neon mirror tables (sync/read code; flags off on production)

### Cron jobs (`vercel.json`)

| Schedule | Path | Purpose |
|----------|------|---------|
| `0 * * * *` | `/api/cron/rooster-sync` | Rooster sync |
| `0 10 * * *` | `/api/cron/performance-sync` | Performance sync |
| `0 3 * * *` | `/api/cron/daily-backup` | Sheets + Neon + R2 inventory backup |

### Production feature flags

| Flag | Production |
|------|------------|
| `NEON_READ_REPLICA_ENABLED` | **OFF** |
| `MIRROR_SYNC_ENABLED` | **OFF** |
| `PASSWORD_LEGACY_PLAIN_ENABLED` | **OFF** |

Preview environment: mirror flags **ON** for continued UAT.

---

## Documentation index

All reports: `docs/enterprise-readiness/README.md`

Key deliverables:

- [REDIS_PRODUCTION_VERIFICATION.md](./REDIS_PRODUCTION_VERIFICATION.md)
- [SENTRY_PRODUCTION_VERIFICATION.md](./SENTRY_PRODUCTION_VERIFICATION.md)
- [PASSWORD_MIGRATION_REPORT.md](./PASSWORD_MIGRATION_REPORT.md)
- [BACKUP_CRON_ACTIVATION.md](./BACKUP_CRON_ACTIVATION.md)
- [MIRROR_DATA_VALIDATION_REPORT.md](./MIRROR_DATA_VALIDATION_REPORT.md)
- [PRODUCTION_MIRROR_RECOMMENDATION.md](./PRODUCTION_MIRROR_RECOMMENDATION.md)

---

## Verification commands

```bash
npm run verify:redis
npm run verify:sentry
npm run env:pull   # refresh local prod env snapshot
curl https://wakeel-team-dashboard.vercel.app/api/health
```

---

## Rollback

### Application rollback (Vercel)

```bash
# List recent production deployments
npx vercel ls wakeel-team-dashboard --prod -S ragab-team

# Promote previous deployment (replace DEPLOYMENT_URL)
npx vercel rollback DEPLOYMENT_URL -S ragab-team
```

### Git rollback

```bash
git checkout release-enterprise-v1^   # parent commit
# or redeploy a prior deployment from Vercel dashboard
```

### Feature rollback (no redeploy)

| Feature | Action |
|---------|--------|
| Redis | Remove `KV_REST_API_*` from Vercel production env |
| Sentry | Remove `NEXT_PUBLIC_SENTRY_DSN` |
| Mirror (if ever enabled) | Unset `NEON_READ_REPLICA_ENABLED` + redeploy |

Google Sheets data is never modified by mirror sync (read-only from Sheets).

---

## Post-deploy verification

**Verified at:** 2026-06-23T18:32:00Z  
**Deployment:** `dpl_GTx3kcPEoRgnbABhYjN8A6Ydgwuw`  
**Git:** `9916ae5` · tag `release-enterprise-v1`

| Check | Status | Details |
|-------|--------|---------|
| **Redis** | **ACTIVE** | `KV_REST_API_URL` + `KV_REST_API_TOKEN` on production. Read/write/delete OK. L1+L2 cache populated for strategic-ops, riders, salary, dashboard. Hit ratio 67% on probe. |
| **Sentry** | **ACTIVE** | `NEXT_PUBLIC_SENTRY_DSN` set. SDK flush OK; event `cfda6cf7…` captured via API. Org `wakeel-a9` / project `wakeel-sentry`. |
| **R2** | **ACTIVE** | `TICKETING_S3_*` configured. Inventory script: 1 object listed (read-only probe). Daily archives path: `backups/daily/{stamp}/`. |
| **Ticketing** | **ACTIVE** | `TICKETING_DATABASE_URL` on production. `/api/ticketing` → **401** (auth gate, not 503). Neon + R2 wired. |
| **Backup cron** | **CONFIGURED** | `vercel.json`: `0 3 * * *` → `/api/cron/daily-backup`. Route live → **401** without `CRON_SECRET` (expected). Next run: 03:00 UTC daily. |
| **Production health** | **OK** | `GET /api/health` → `{"ok":true,"service":"next"}` |
| **Build version** | `9916ae5` | `release-enterprise-v1` · Vercel deployment `dpl_GTx3kcPEoRgnbABhYjN8A6Ydgwuw` |
| **Mirror flags (prod)** | **OFF** | No `MIRROR_SYNC_ENABLED` / `NEON_READ_REPLICA_ENABLED` on production |

### Rollback command

```bash
npx vercel rollback dpl_GTx3kcPEoRgnbABhYjN8A6Ydgwuw -S ragab-team
```

Or promote a prior deployment from the [Vercel dashboard](https://vercel.com/ragab-team/wakeel-team-dashboard).

---

## Sign-off

| Requirement | Met |
|-------------|-----|
| Google Sheets unchanged | Yes |
| No business logic changes | Yes |
| Build passes | Yes |
| Production mirror off | Yes |
| Tag `release-enterprise-v1` | Yes |
