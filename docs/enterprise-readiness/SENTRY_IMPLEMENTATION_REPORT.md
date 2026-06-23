# Sentry Implementation Report (Phase 4B)

**Date:** 2026-06-23  
**SDK:** `@sentry/nextjs` ^10.60.0  
**Policy:** Placeholders only — no secrets committed.

---

## What was implemented

| Component | File | Purpose |
|-----------|------|---------|
| Client SDK | `sentry.client.config.ts` | Frontend errors + browser tracing |
| Server SDK | `sentry.server.config.ts` | API / SSR error tracking |
| Edge SDK | `sentry.edge.config.ts` | Middleware / edge routes |
| Instrumentation | `instrumentation.ts` | Server/edge init + `onRequestError` |
| Global error UI | `app/global-error.tsx` | Captures unhandled React errors |
| Build wrapper | `next.config.js` | `withSentryConfig` + source maps upload |
| Strategic Ops trace | `app/api/admin/strategic-ops/route.ts` | `Sentry.startSpan` on `buildReport` |
| Ticketing trace | `app/api/ticketing/route.ts` | `Sentry.startSpan` on `listTickets` |

---

## Environment placeholders (`.env.example`)

```env
# NEXT_PUBLIC_SENTRY_DSN=
# SENTRY_DSN=
# SENTRY_ORG=
# SENTRY_PROJECT=
# SENTRY_AUTH_TOKEN=
```

| Variable | Required for | Secret |
|----------|--------------|--------|
| `NEXT_PUBLIC_SENTRY_DSN` | Client + browser errors | Public DSN (safe in client) |
| `SENTRY_DSN` | Server-side (optional if public set) | Same project DSN |
| `SENTRY_ORG` | Source map upload at build | Org slug |
| `SENTRY_PROJECT` | Source map upload | Project slug |
| `SENTRY_AUTH_TOKEN` | CI/Vercel build upload | **Keep secret** |

Sentry is **disabled** when DSN is unset (`enabled: Boolean(dsn)`).

---

## Features

| Feature | Status |
|---------|--------|
| Frontend monitoring | Yes (client config) |
| API monitoring | Yes (server + `onRequestError`) |
| Next.js App Router | Yes |
| Error tracking | Yes |
| Request tracing | Yes (`tracesSampleRate` 10% prod / 100% dev) |
| Performance monitoring | Yes (browser + server spans) |
| Strategic Ops tracing | Yes (custom span) |
| Ticketing tracing | Yes (custom span) |
| Source maps | Yes (via `withSentryConfig` when auth token set) |

---

## Verification

| Check | Result |
|-------|--------|
| `npm run build` | **PASS** |
| Instrumentation hook | Loaded (`instrumentation.ts` + `instrumentationHook: true`) |
| Sentry bundle in client | Yes (First Load JS ~164 kB shared) |
| Middleware size | 95.1 kB (includes Sentry edge) |
| Error capture live test | **Skipped** — no DSN configured (by design) |

### Manual error capture test (after DSN set)

1. Set `NEXT_PUBLIC_SENTRY_DSN` on Vercel.
2. Deploy.
3. Visit `/api/health/diagnostics` or trigger test route.
4. Confirm event in Sentry Issues dashboard.

---

## Business logic impact

| Area | Changed |
|------|---------|
| Strategic Ops calculations | **No** — span wrapper only |
| Talabat | **No** |
| Riders / Salary / Recruitment | **No** |
| Google Sheets | **No** |

---

## Rollback

1. Remove Sentry env vars.
2. Revert `next.config.js` to plain `module.exports = nextConfig` if full removal needed.
3. Redeploy.

---

## Sign-off

| Requirement | Met |
|-------------|-----|
| Sentry implemented | Yes |
| No secrets in repo | Yes |
| Build passes | Yes |
| Additive only | Yes |
