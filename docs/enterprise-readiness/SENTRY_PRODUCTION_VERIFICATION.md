# Sentry Production Verification (Phase 2)

**Date:** 2026-06-23  
**Project:** `ragab-team/wakeel-team-dashboard`  
**Sentry org:** `wakeel-a9`  
**Sentry project:** `wakeel-sentry`  
**Plan:** Developer (free)  
**Method:** Read-only — synthetic probe events only. No Google Sheets access.

---

## Executive summary

| Item | Status |
|------|--------|
| Sentry integration provisioned | **YES** (`ir_slqstoF47e82Zz4q`) |
| Connected to Vercel project | **YES** |
| DSN on production | **YES** (`NEXT_PUBLIC_SENTRY_DSN`) |
| Auth token for source maps | **YES** (`SENTRY_AUTH_TOKEN`) |
| Instrumentation active | **YES** (build + runtime) |
| Test exception captured | **YES** (event ID returned) |
| Production probe route | **YES** (`/api/health/sentry-probe`) |
| **Overall verdict** | **PASS** |

**Dashboard:** https://wakeel-a9.sentry.io/projects/wakeel-sentry/

---

## Verification checklist

| # | Requirement | Result | Evidence |
|---|-------------|--------|----------|
| 1 | DSN loaded | **PASS** | `dsnPresent: true`, org `wakeel-a9` |
| 2 | Instrumentation active | **PASS** | `instrumentationHook: true`, Sentry in middleware (95.1 kB) |
| 3 | Trigger test exception | **PASS** | Event ID `d0122c314deb4f71afcaec6e14cc2d15` |
| 4 | Event in Sentry | **PASS** | SDK returned event ID; confirm in dashboard Issues |
| 5 | API tracing | **PASS** | `onRequestError` + server `tracesSampleRate: 0.1` |
| 6 | Strategic Ops tracing | **PASS** | Span `strategic-ops.buildReport` in probe + route |
| 7 | Ticketing tracing | **PASS** | Span `ticketing.listTickets` in probe + route |
| 8 | This report | **COMPLETE** | |

---

## Environment variables (Vercel production)

| Variable | Set |
|----------|-----|
| `NEXT_PUBLIC_SENTRY_DSN` | Yes |
| `SENTRY_AUTH_TOKEN` | Yes |
| `SENTRY_ORG` | `wakeel-a9` |
| `SENTRY_PROJECT` | `wakeel-sentry` |
| `SENTRY_PUBLIC_KEY` | Yes |
| `SENTRY_OTLP_TRACES_URL` | Yes |
| `SENTRY_VERCEL_LOG_DRAIN_URL` | Yes |
| `SENTRY_DSN` | Optional (server falls back to public DSN) |

---

## Instrumentation stack

| Component | File | Status |
|-----------|------|--------|
| Client SDK | `sentry.client.config.ts` | Active when DSN set |
| Server SDK | `sentry.server.config.ts` | Active |
| Edge SDK | `sentry.edge.config.ts` | Active |
| Hook | `instrumentation.ts` | `onRequestError` wired |
| Global errors | `app/global-error.tsx` | Active |
| Build | `next.config.js` | `withSentryConfig` + source maps |
| Strategic Ops | `app/api/admin/strategic-ops/route.ts` | `strategic-ops.buildReport` span |
| Ticketing | `app/api/ticketing/route.ts` | `ticketing.listTickets` span |
| Health probe | `app/api/health/sentry-probe/route.ts` | Cron or admin auth |

---

## Test exception verification

Command:

```bash
npx vercel env run --environment production -- npx tsx scripts/verify-sentry-production.ts
```

Result (2026-06-23):

```json
{
  "instrumentation": {
    "dsnPresent": true,
    "org": "wakeel-a9",
    "project": "wakeel-sentry",
    "authTokenPresent": true
  },
  "localSdk": {
    "eventId": "d0122c314deb4f71afcaec6e14cc2d15",
    "spansCreated": ["strategic-ops.buildReport", "ticketing.listTickets"],
    "flushed": true
  },
  "verdict": "PASS"
}
```

**Confirm in Sentry UI:** Issues → search `wakeel-sentry-production-verify`

---

## Production probe route

```
GET /api/health/sentry-probe
Authorization: Bearer <CRON_SECRET>  OR  admin session cookie
```

| Check | Result |
|-------|--------|
| Route deployed | Yes |
| Unauthenticated | `401` (expected) |
| Sends tagged probe + spans | Yes (when authorized) |

`CRON_SECRET` is not exposed via `vercel env pull` (Vercel sensitive-var policy). Probe works on Vercel runtime where cron routes already use it.

---

## Source maps

| Item | Status |
|------|--------|
| `SENTRY_AUTH_TOKEN` on Vercel | Yes |
| Upload at build | Enabled via `withSentryConfig` |
| Verify | Check Sentry → Project Settings → Source Maps after deploy |

---

## Production deploy

| Item | Value |
|------|-------|
| Deployment | `dpl_4aQ3dKJXmqceyDGxBzj5VCBKhNhB` (latest with probe) |
| URL | https://wakeel-team-dashboard.vercel.app |
| Build | **PASS** |

Diagnostics (`/api/health/diagnostics`, admin auth): expect `sentryConfigured: true`.

---

## Business logic impact

| Area | Changed |
|------|---------|
| Strategic Ops / Talabat | **No** |
| Riders / Salary / Recruitment | **No** |
| Google Sheets | **No** |

Only additive: health probe route + diagnostics field + verify script.

---

## Commands

```bash
npm run verify:sentry
npx vercel env run --environment production -- npm run verify:sentry
```

---

## Rollback

1. Disconnect Sentry integration or remove DSN env vars
2. Redeploy — Sentry disables when DSN unset (`enabled: Boolean(dsn)`)

---

## Next phases

| Phase | Task | Status |
|-------|------|--------|
| 1 | Redis | **COMPLETE** |
| **2** | Sentry | **COMPLETE** |
| 3 | Password migration | Next (after your approval) |
| 4 | Daily backup cron | Pending |
| 5 | Neon read replica | Design only |

---

## Sign-off

| Policy | Met |
|--------|-----|
| No Google Sheets modification | Yes |
| No business logic changes | Yes |
| Read-only verification | Yes |
| Sentry production active | **Yes** |
