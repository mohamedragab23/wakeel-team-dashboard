# Enterprise Implementation Plan

**Date:** 2026-06-22  
**Policy:** Google Sheets remains the **primary source of truth**. No bulk migration. No automatic Sheets → Postgres transfer.

---

## Change register

| ID | Change | Risk | Rollback | Validation | Impact |
|----|--------|------|----------|------------|--------|
| C01 | Security headers in `middleware.ts` | Low | Revert `middleware.ts` | Load any page; check response headers in DevTools | No data/API logic change |
| C02 | JWT_SECRET required in production (`lib/jwtConfig.ts`) | Low | Restore previous `getJwtSecret` fallback | Deploy without JWT_SECRET → build/start fails; with secret → login works | Login unchanged when secret set |
| C03 | `instrumentation.ts` + `lib/startupValidation.ts` | Low | Delete `instrumentation.ts`, remove hook from `next.config.js` | Server logs show startup warnings | Ticketing 503 if Neon unset; dashboard OK |
| C04 | `.env.production.example` | None | Delete file | N/A | Documentation only |
| C05 | API rate limits (strategic-ops, upload) | Low | Remove `checkApiRateLimit` calls | 13th request/min → 429 | Full admins unaffected under normal use |
| C06 | Supervisor performance: single daily sheet read | Low | Revert `dataFilter.ts` + route | Same JSON output; faster response | **No business logic change** |
| C07 | `@vercel/speed-insights` + `@vercel/analytics` | Low | Remove from `app/layout.tsx` | Vercel dashboard after deploy | Client-only RUM |
| C08 | Optional Sentry stub (`lib/observability/sentry.optional.ts`) | None | Delete file | N/A | No runtime dependency |
| C09 | Enterprise documentation (this folder) | None | Delete docs | N/A | No runtime change |
| C10 | Sanitize `env.local.example` (Phase 1) | Low | Revert file | No secrets in example | None |
| C11 | Zone scope on upload + performance writes (Phase 1) | Medium | Revert `adminZoneScope.ts` + 5 routes | Limited admin gets 403 on global ops | Limited admins only |
| C12 | Read-only Sheets backup script (Phase 1) | None | Delete script | Manual run exports JSON | Read-only |

## Explicitly NOT in scope (per data protection policy)

| Item | Reason |
|------|--------|
| Google Sheets → Postgres migration | Forbidden |
| Modifying sheet tabs/rows | Forbidden |
| Running `migrate:ticketing` against production without approval | Manual ops only |
| Changing `system/reset` or `performance/clear` | Destructive; documented only |
| Removing `localStorage` JWT | Would change client login flow; deferred |

---

## Rollback procedure (any code change)

1. `git revert <commit-sha>`
2. Deploy previous Vercel deployment (Instant Rollback)
3. Verify: login, dashboard, riders list, one strategic-ops load
4. Confirm: no env vars removed from Vercel

**Sheets rollback:** Not required — no sheet writes in this hardening batch.

---

## Validation checklist (post-deploy)

- [ ] `npm run build` passes
- [ ] Admin login works
- [ ] Supervisor login works
- [ ] `/api/dashboard` returns data
- [ ] `/api/admin/strategic-ops` returns report (same shape)
- [ ] `/api/ticketing` returns 503 OR data (depending on Neon)
- [ ] Response headers include `X-Frame-Options`, `CSP`
- [ ] Speed Insights receives data (after traffic)

---

## Phased roadmap (future — requires separate approval)

| Phase | Work | Sheets impact |
|-------|------|---------------|
| P1 | Rotate leaked credentials in `env.local.example` | None — **done in Phase 1** (rotate live key in GCP still required) |
| P2 | Neon + R2 for ticketing only | None |
| P3 | Upstash Redis (cache layer) | None — read cache only |
| P4 | Weekly Sheets export backup to R2 | Read-only export — **script added Phase 1** |
| P5 | Cookie-only auth (remove localStorage JWT) | None |
| P6 | Zone scope on admin upload/performance writes | Limited admins only — **done Phase 1** |

Each future phase requires its own entry in this document before execution.
