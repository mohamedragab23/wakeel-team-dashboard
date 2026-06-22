# Session Migration Validation Report

**Date:** 2026-06-22  
**Scope:** Post–Phase 2 cookie-only auth migration (static code audit + build)  
**Prerequisite:** [PHASE2_REPORT.md](./PHASE2_REPORT.md)  
**Method:** Repository grep, file inspection, architecture trace — **no production API calls executed**

---

## Executive summary

| # | Verification | Result | Severity of gaps |
|---|--------------|--------|------------------|
| 1 | No route depends on localStorage JWT | **PASS** | None |
| 2 | No API requires client `Authorization: Bearer` | **PASS** (cookie path sufficient) | Low — server still accepts Bearer for tooling |
| 3 | Authenticated requests work via httpOnly cookie | **PASS** (static) | Manual smoke test recommended post-deploy |
| 4 | Logout clears cookies correctly | **PASS** | None |
| 5 | Session expiration behaves correctly | **PASS** (design) | Manual expiry test recommended |
| 6 | Admin permissions still work | **PASS** (code paths intact) | Smoke test recommended |
| 7 | Supervisor permissions still work | **PASS** (code paths intact) | Smoke test recommended |
| 8 | Zone restrictions still work | **PASS** (Phase 1 guards present) | Smoke test with limited admin recommended |

**Overall:** Migration is **validated for Phase 3 entry** from a static/code perspective. Post-deploy smoke tests are listed at the end.

---

## Inspection statistics

| Metric | Count |
|--------|------:|
| Client files using `authFetch` | **57** |
| Client `localStorage.getItem('token')` reads | **0** |
| Client `Authorization: Bearer` for session JWT | **0** |
| Protected API routes using `extractBearerToken` | **70** |
| Admin routes using `assertAdminApiAccess` | **33** |
| Zone guard call sites (Phase 1) | **6 files** |
| API route files total | **83** |

---

## 1. No route still depends on localStorage JWT

**Result: PASS**

### Evidence

| Check | Finding |
|-------|---------|
| `localStorage.getItem('token')` in `app/`, `components/` | **0 matches** |
| `localStorage.setItem('token', …)` | **0 matches** |
| `sessionStorage` token usage | **0 matches** |

### Remaining `localStorage` token references (cleanup only)

| File | Usage |
|------|-------|
| `lib/clientSession.ts` | `localStorage.removeItem('token')` on login/logout — **legacy cleanup**, not auth |

### Session profile storage (non-JWT)

| File | Behavior |
|------|----------|
| `lib/clientSession.ts` | User profile in `sessionStorage` key `wakeel_user` |
| `getStoredUser()` | Falls back to legacy `localStorage.getItem('user')` for one-time migration — **no JWT** |

### Client API auth pattern

All authenticated browser → API traffic uses:

```typescript
// lib/authFetch.ts
return fetch(input, {
  credentials: init.credentials ?? 'include', // sends wakeel_auth_token cookie
  headers: getClientAuthHeaders(init.headers), // no Authorization header
});
```

**57 files** import and call `authFetch` for `/api/*` requests.

### Exceptions (intentional, unauthenticated)

| File | Call | Reason |
|------|------|--------|
| `components/LoginPage.tsx` | `fetch('/api/auth/login')` | No session yet |
| `components/Layout.tsx` | `fetch('/api/auth/logout', { credentials: 'include' })` | Clears cookie |

---

## 2. No API still expects Authorization: Bearer token

**Result: PASS** (cookie-only clients work; Bearer not required)

### Server auth extraction

```5:16:lib/requestAuth.ts
/** Extract JWT from Authorization header or httpOnly cookie. */
export function extractBearerToken(request: NextRequest | Request): string | null {
  const header = request.headers.get('authorization')?.replace(/^Bearer\s+/i, '').trim();
  if (header) return header;

  const cookies = (request as NextRequest).cookies;
  if (cookies?.get) {
    const fromCookie = cookies.get(AUTH_COOKIE_NAME)?.value?.trim();
    if (fromCookie) return fromCookie;
  }

  return null;
}
```

| Aspect | Status |
|--------|--------|
| Cookie name | `wakeel_auth_token` (`AUTH_COOKIE_NAME`) |
| Client sends Bearer | **No** |
| Server requires Bearer only | **No** — cookie satisfies `extractBearerToken` |
| Server accepts Bearer header | **Yes** — optional backward-compat for scripts/curl |

### Non-session Bearer usage (unrelated to user JWT)

| File | Purpose |
|------|---------|
| `lib/redisCache.optional.ts` | Upstash REST API token |
| `lib/supervisorNotifier.ts` | Resend / WhatsApp external APIs |

These are **service credentials**, not user session tokens.

### Deprecated client helper

| Symbol | Status |
|--------|--------|
| `getClientAuthToken()` | Always returns `null` — safe stub, no callers depend on it for auth |

---

## 3. All authenticated requests work with httpOnly cookies

**Result: PASS** (static architecture verified)

### Login → cookie flow

| Step | Implementation |
|------|----------------|
| 1 | `POST /api/auth/login` validates credentials against Google Sheets |
| 2 | JWT signed (`expiresIn: '7d'`) |
| 3 | Token **omitted** from JSON body (`const { token, ...sessionPayload } = result`) |
| 4 | Cookie set: `httpOnly`, `sameSite: 'lax'`, `secure` in production, `maxAge: 604800` |

### Request → API flow

| Layer | Mechanism |
|-------|-----------|
| Client | `authFetch` → `credentials: 'include'` |
| Server | `extractBearerToken` → reads `wakeel_auth_token` cookie |
| Validation | `verifyToken(token)` on every protected route |

### Coverage map

| Domain | Client entry | Server auth |
|--------|--------------|-------------|
| Supervisor dashboard | `app/dashboard/page.tsx` → `authFetch` | `app/api/dashboard/route.ts` |
| Admin modules | `app/admin/**` → `authFetch` | `assertAdminApiAccess` + `extractBearerToken` |
| Recruitment | `components/recruitment/**` → `authFetch` | Recruitment routes + `extractBearerToken` |
| Ticketing | `app/ticketing/**` → `authFetch` | `lib/ticketing/ticketingAuth.ts` |
| Uploads (FormData) | `components/ExcelUploadEnhanced.tsx` → `authFetch` | Cookie sent without manual headers |

### Middleware note

`middleware.ts` applies **security headers only** — it does not gate auth. Session validation happens in `Layout` (`/api/auth/verify`) and per-route API handlers.

---

## 4. Logout clears cookies correctly

**Result: PASS**

### Client logout (`components/Layout.tsx`)

```typescript
clearClientSession();  // sessionStorage + legacy localStorage cleanup
void fetch('/api/auth/logout', { method: 'POST', credentials: 'include' });
router.push('/');
```

### Server logout (`app/api/auth/logout/route.ts`)

| Cookie attribute | Value |
|------------------|-------|
| Name | `wakeel_auth_token` |
| Value | `''` (empty) |
| `maxAge` | `0` (immediate expiry) |
| `httpOnly` | `true` |
| `path` | `/` |

### `clearClientSession` clears

- `sessionStorage.wakeel_user`
- Legacy `localStorage.user`
- Legacy `localStorage.token`

---

## 5. Session expiration behaves correctly

**Result: PASS** (design verified; runtime test recommended)

| Mechanism | Value | Location |
|-----------|-------|----------|
| JWT TTL | `7d` | `lib/auth.ts` — `jwt.sign(..., { expiresIn: '7d' })` |
| Cookie TTL | `7 * 24 * 60 * 60` seconds | `app/api/auth/login/route.ts` |
| Expired token handling | `jwt.verify` → `null` | `lib/auth.ts` `verifyToken()` |
| Client detection | `GET /api/auth/verify` → **401** | `app/api/auth/verify/route.ts` |
| Client response | `clearClientSession()` + redirect `/` | `components/Layout.tsx` |

### Alignment

JWT expiry and cookie `maxAge` are **aligned at 7 days**.

### Edge case (low risk)

On **network error** during `guardSession`, `Layout` may fall back to `getStoredUser()` cached profile without a live verify. API calls will still fail with 401 if the cookie is expired. **Recommendation for Phase 3:** remove offline profile fallback or re-verify on next successful network.

---

## 6. Admin permissions still work

**Result: PASS** (code paths intact)

### JWT claims (admin login)

Embedded in JWT and returned by `/api/auth/verify`:

- `role: 'admin'` or `'recruitment_manager'`
- `permissions` (e.g. `limited:dashboard,riders,...`)
- `dataZone`, `adminOrgRole`, `linkedSupervisorCode`

### Server enforcement

| Mechanism | Files | Purpose |
|-----------|-------|---------|
| `assertAdminApiAccess(decoded, feature)` | **33 admin route handlers** | Feature gate per API |
| `parseLimitedFeatures` | `lib/adminFeatureAccess.ts` | Parse `limited:` prefix |
| `filterAdminMenuForPermissions` | `components/Layout.tsx` | Menu visibility |
| Route guards in Layout | `/admin`, `/recruitment`, `/ticketing` paths | Role + feature redirects |

### Representative admin routes verified

- `app/api/admin/riders/route.ts` — `assertAdminApiAccess` + zone scope on POST/PUT/DELETE
- `app/api/admin/strategic-ops/route.ts` — feature + zone filter on read
- `app/api/admin/admin-permissions/route.ts` — granting admin only
- `app/api/admin/system/reset/route.ts` — `debug` feature gate

### Client

All inspected admin pages use `authFetch` — permissions enforced server-side from cookie JWT.

---

## 7. Supervisor permissions still work

**Result: PASS** (code paths intact)

### Server scoping

| API | Supervisor check | Data scope |
|-----|------------------|------------|
| `app/api/dashboard/route.ts` | `decoded.role === 'supervisor'` | `getDashboardData(decoded.code)` |
| `app/api/riders/route.ts` | role check | `getSupervisorRiders(decoded.code)` |
| `app/api/performance/route.ts` | role check | Supervisor code from JWT |
| `app/api/supervisor/deductions-upload/route.ts` | supervisor auth | Own team only |
| `app/api/termination-requests/route.ts` | supervisor vs admin paths | Supervisor code in writes |

### Client

Supervisor pages (`app/dashboard`, `app/riders`, `app/performance`, `app/salary`, `app/shifts`, equipment flows) all use `authFetch`.

### Ticketing

`lib/ticketing/ticketingAuth.ts` — supervisors have access by default; admins need `ticketing` feature when limited.

---

## 8. Zone restrictions still work

**Result: PASS** (Phase 1 guards present)

### Zone scope primitives (`lib/adminZoneScope.ts`)

| Function | Purpose |
|----------|---------|
| `isLimitedAdminDataScopeActive` | Detect limited admin with zone/tree |
| `getSupervisorCodesInAdminDataScope` | Resolve allowed supervisor codes |
| `assertLimitedAdminSupervisorZoneAccess` | Block single-supervisor writes |
| `assertLimitedAdminGlobalWriteDenied` | Block system-wide performance writes |
| `assertRiderUploadRowsInAdminScope` | Block out-of-zone rider upload rows |
| `filterPerformanceRowsByAdminScope` | Filter performance upload rows |

### Phase 1 write guards (verified in code)

| Route | Guard |
|-------|-------|
| `POST /api/admin/upload` (riders) | `assertRiderUploadRowsInAdminScope` |
| `POST /api/admin/upload` (performance) | `filterPerformanceRowsByAdminScope` |
| `POST /api/admin/performance-import` (apply) | `assertLimitedAdminGlobalWriteDenied` |
| `POST /api/admin/performance-sync` | `assertLimitedAdminGlobalWriteDenied` |
| `POST /api/admin/performance/clear` | `assertLimitedAdminGlobalWriteDenied` |
| `POST /api/admin/performance/delete-day` | `assertLimitedAdminGlobalWriteDenied` |

### Read-path zone filtering (pre-existing + intact)

| Route | Filter |
|-------|--------|
| `GET /api/admin/riders` | `getSupervisorCodesInAdminDataScope` |
| `GET /api/admin/supervisor-performance` | Zone scope on supervisor list |
| `GET /api/admin/strategic-ops` | Zone filter on report |
| `GET /api/riders` (admin) | Zone filter on rider list |

**Full admins** (`permissions` without `limited:`) bypass zone write blocks — unchanged.

---

## Findings and recommendations

### No blockers for Phase 3

### Low-priority observations

| ID | Finding | Recommendation |
|----|---------|----------------|
| L1 | Server still accepts `Authorization: Bearer` header | Optional Phase 3: document as admin/script-only or remove |
| L2 | `getStoredUser()` reads legacy `localStorage.user` | Remove fallback after all users re-login once |
| L3 | Layout network-error fallback shows cached profile | Re-verify session when network returns |
| L4 | `getClientAuthToken()` stub unused | Remove in Phase 3 cleanup |

---

## Post-deploy smoke test checklist

Run after deploying Phase 2 to production:

- [ ] Login as **full admin** → admin dashboard loads
- [ ] Login as **limited zone admin** → menu shows only granted features
- [ ] Limited admin **upload riders** outside zone → expect 403
- [ ] Limited admin **performance clear** → expect 403
- [ ] Login as **supervisor** → dashboard, riders, performance load
- [ ] **Logout** → cannot access `/dashboard` without re-login
- [ ] DevTools → Application → Cookies: `wakeel_auth_token` present when logged in, absent after logout
- [ ] DevTools → Application → Local Storage: **no `token` key** after login
- [ ] Expired session (or delete cookie manually) → redirect to login on next navigation

---

## Build validation

**Command:** `npm run build`  
**Date:** 2026-06-22  
**Result:** **PASS** (exit code 0)

| Check | Status |
|-------|--------|
| TypeScript compile | Pass |
| Lint | Pass |
| Static pages generated | Pass (49 pages) |
| Middleware bundle | 27.4 kB |
| Instrumentation hook | Enabled |

---

## Files inspected (key auth surface)

| Category | Files |
|----------|-------|
| Auth core | `lib/authFetch.ts`, `lib/clientSession.ts`, `lib/requestAuth.ts`, `lib/auth.ts` |
| Auth API | `app/api/auth/login/route.ts`, `logout/route.ts`, `verify/route.ts` |
| Layout / login | `components/Layout.tsx`, `components/LoginPage.tsx`, `app/page.tsx` |
| Permissions | `lib/adminFeatureAccess.ts`, `lib/adminZoneScope.ts`, `lib/ticketing/ticketingAuth.ts` |
| Sample clients | All 57 `authFetch` consumers (grep verified) |
| Sample APIs | 70 routes with `extractBearerToken` |

---

## Phase 3 readiness

| Gate | Status |
|------|--------|
| localStorage JWT eliminated | Yes |
| Cookie-only client transport | Yes |
| Server reads cookie | Yes |
| Permissions / zones code intact | Yes |
| Build passes | Yes |

**Approved to proceed to Phase 3 planning** pending post-deploy smoke tests.
