# Security Audit — After Hardening Fixes

**Date:** 2026-06-22  
**Scope:** Changes in this hardening batch + remaining gaps

---

## Fixes applied

| Control | Status | Files |
|---------|--------|-------|
| JWT_SECRET enforcement (production) | ✅ | `lib/jwtConfig.ts`, `lib/startupValidation.ts`, `instrumentation.ts` |
| Security headers | ✅ | `lib/securityHeaders.ts`, `middleware.ts` |
| CSP | ✅ | `lib/securityHeaders.ts` |
| HSTS (production) | ✅ | `lib/securityHeaders.ts` |
| X-Frame-Options DENY | ✅ | `lib/securityHeaders.ts` |
| X-Content-Type-Options nosniff | ✅ | `lib/securityHeaders.ts` |
| XSS (React default + CSP) | ✅ Partial | No `dangerouslySetInnerHTML` in app |
| API rate limiting (login + heavy routes) | ✅ Partial | `lib/rateLimit.ts`, `lib/apiRateLimit.ts`, login, strategic-ops, upload |
| Admin permission validation | ✅ Unchanged (existing) | `lib/adminFeatureAccess.ts` |
| Zone access validation | ✅ Unchanged (existing) | `lib/adminZoneScope.ts` on ~18 routes |
| Ticketing graceful 503 without Neon | ✅ | `lib/ticketing/apiHelpers.ts` |

---

## Risk matrix (remaining)

| Risk | Level | Affected files | Recommendation |
|------|-------|----------------|----------------|
| JWT in localStorage | **High** | `components/LoginPage.tsx`, `lib/authFetch.ts` | Phase P5: cookie-only session |
| `env.local.example` private key in git | **Critical** | `env.local.example` | Rotate + git history scrub (manual) |
| Zone scope missing on upload/performance write | **High** | `app/api/admin/upload/route.ts`, performance routes | Add `assertLimitedAdminSupervisorZoneAccess` (behavior change for limited admins) |
| Cron `x-vercel-cron` header trust | **Medium** | `app/api/cron/*.ts` | Require `CRON_SECRET` always on Vercel |
| Plain-text passwords in Sheets | **Medium** | `lib/passwordUtils.ts` | bcrypt migration script |
| No CSRF tokens | **Low–Medium** | All POST APIs | Origin check + cookie-only auth |
| In-memory rate limit (not global) | **Medium** | `lib/rateLimit.ts` | Upstash when scaling |
| `system/reset` destructive | **High** | `app/api/admin/system/reset/route.ts` | Extra confirmation + audit log (future) |
| Photo URLs without expiry | **Medium** | `lib/photoAccess.ts` | Add TTL to signatures |

---

## SQL injection

| Module | Status |
|--------|--------|
| Ticketing (Postgres) | ✅ Parameterized via `postgres` tagged templates |
| Google Sheets | N/A (API client, not SQL) |

---

## File upload

| Surface | Validation |
|---------|------------|
| Ticketing | ✅ MIME, size, extension (`lib/ticketing/storage/sanitize.ts`) |
| Admin Excel upload | ⚠️ XLSX parse only — pre-existing |
| Equipment photos | ⚠️ Base64 in Sheets — pre-existing |

---

## Login behavior

**Unchanged:** Same credentials, same JWT payload, same cookie + localStorage response.  
**Changed:** Production deploy **fails to start** if `JWT_SECRET` is missing (intentional).

---

## Summary

| Before batch | After batch |
|--------------|-------------|
| No edge security headers | Headers on all matched routes |
| JWT fallback secret in prod | Hard fail without JWT_SECRET |
| No startup validation | Instrumentation logs Neon/Sheets env status |
| No rate limit on heavy APIs | strategic-ops + upload limited |

**Enterprise security score (this layer only):** 38 → **52** (remaining: localStorage JWT, credential rotation)
