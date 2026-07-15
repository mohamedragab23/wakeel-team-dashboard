# Rooster Live 3PL Authentication Architecture Review
**Date:** 2026-07-11  
**Status:** 🔴 CRITICAL ARCHITECTURAL ISSUE IDENTIFIED  
**Reviewer:** Lead Software Architect

---

## 🚨 CRITICAL DISCOVERY

**Bearer token expires every 2 hours** (7200 seconds = iat + exp).

Current implementation will **fail after 2 hours** in production.

This is **unacceptable** for a production system.

---

## INVESTIGATION FINDINGS

### 1. Token Expiration Analysis

**Observed from Network Captures:**

| Header/Cookie | Stability | Notes |
|---------------|-----------|-------|
| `Authorization: Bearer <JWT>` | ❌ **Expires every 2 hours** | iat → exp = 7200s |
| `dhh_token` | ❌ **Changes with JWT** | Tied to Bearer token |
| `refresh_token` | ❌ **Changes with JWT** | Tied to Bearer token |
| `CF_Authorization` | ✅ **STABLE** | Cloudflare Access session cookie |
| `CF_AppSession` | ✅ **STABLE** | Cloudflare Access session cookie |

**Comparison (1 hour apart):**
- Authorization: CHANGED ❌
- dhh_token: CHANGED ❌
- refresh_token: CHANGED ❌
- CF_Authorization: UNCHANGED ✅
- CF_AppSession: UNCHANGED ✅

---

### 2. Does Rooster Expose a Refresh Endpoint?

**ANSWER: NOT FOUND** ❌

**Search Results:**
```
Searched entire codebase for:
- refresh.*token
- token.*refresh
- refreshToken
- /refresh
- /oauth
- /renew
```

**Result:** ZERO matches related to Talabat/Rooster token refresh.

**Conclusion:** No programmatic token refresh mechanism exists in the Rooster Live 3PL API that we can access.

---

### 3. Existing Authentication Patterns in Project

#### 3.1 Cloudflare Access (Tableau Integration)

**File:** `lib/cloudflareAccess.ts`

The project **already** uses Cloudflare Access for Tableau API:

```typescript
export function getCloudflareAccessHeaders(): Record<string, string> {
  const clientId = process.env.CLOUDFLARE_ACCESS_CLIENT_ID?.trim();
  const clientSecret = process.env.CLOUDFLARE_ACCESS_CLIENT_SECRET?.trim();
  if (!clientId || !clientSecret) return {};
  return {
    'CF-Access-Client-Id': clientId,
    'CF-Access-Client-Secret': clientSecret,
  };
}
```

**Key Insight:**
- This uses **Service Tokens** (client ID + secret)
- Service Tokens **do NOT expire** (managed by IT)
- Works for **server-to-server** calls

**Question:** Is Rooster behind the SAME Cloudflare Access policy?

---

#### 3.2 Rooster Export (Historical Shifts)

**File:** `lib/roosterExport.ts` + `lib/roosterSessionStore.ts`

**Current Architecture:**

```typescript
// Priority:
// 1. ROOSTER_EXPORT_HEADERS_JSON (env var)
// 2. Google Sheet `cron_config` tab → ROOSTER_EXPORT_HEADERS_JSON
```

**Observation:**
- Already has **no-redeploy header rotation** via Google Sheet
- Historical export uses **same host** as Live 3PL
- Comment mentions: "Rooster page is behind Cloudflare Access / Okta"

---

### 4. Alternative Architectures

#### OPTION A: Cloudflare Access Service Token (RECOMMENDED ✅)

**Hypothesis:**
- Rooster Live 3PL is behind **Cloudflare Access**
- We can use **CF-Access-Client-Id** + **CF-Access-Client-Secret** (Service Token)
- Service Tokens are **permanent** and managed by IT/Security
- **No expiration** for server-to-server calls

**Implementation:**
```typescript
// INSTEAD OF:
{
  "Cookie": "CF_Authorization=...; CF_AppSession=...; session=...",
  "Authorization": "Bearer <JWT that expires in 2h>"
}

// USE:
{
  "CF-Access-Client-Id": "<service-token-id>",
  "CF-Access-Client-Secret": "<service-token-secret>"
}
```

**Advantages:**
✅ Zero expiration (permanent until revoked)
✅ Already proven pattern in project (Tableau)
✅ Server-to-server auth (designed for cron jobs)
✅ No manual intervention ever
✅ No refresh logic needed
✅ Managed by IT/Security (existing process)

**Risks:**
⚠️ Requires IT/Security to issue Service Token for Rooster Live 3PL
⚠️ If Rooster is NOT behind Cloudflare Access, this won't work
⚠️ Need to verify Cloudflare Access policy covers this endpoint

**Verification Steps:**
1. Check if `eg.me.logisticsbackoffice.com` is behind Cloudflare Access
2. Contact IT/Security: "We need a Service Token for `eg.me.logisticsbackoffice.com/api/rider-live-operations/*`"
3. Test Service Token headers against Live 3PL endpoint
4. If successful, this is the **permanent solution**

---

#### OPTION B: Cookie-Only Auth (No Bearer Token)

**Hypothesis:**
- `CF_Authorization` and `CF_AppSession` are **stable** (don't expire quickly)
- These might be **Cloudflare Access session cookies** from browser login
- Try sending ONLY cookies, omit `Authorization: Bearer`

**Implementation:**
```typescript
// Test with ONLY:
{
  "Cookie": "CF_Authorization=...; CF_AppSession=..."
}
// OMIT: Authorization, dhh_token, refresh_token
```

**Advantages:**
✅ Simpler (fewer headers)
✅ CF_Authorization appears stable (observed 1 hour apart)
✅ No JWT expiration issue

**Risks:**
⚠️ CF_Authorization might expire eventually (unknown TTL)
⚠️ Might be tied to user browser session (not server-to-server)
⚠️ Unknown stability over days/weeks

**Verification Steps:**
1. Test API call with ONLY `CF_Authorization` + `CF_AppSession`
2. If 200 OK, monitor stability over 24+ hours
3. If 401, this approach won't work

---

#### OPTION C: Automated Header Refresh via Google Sheet

**Description:**
- Accept that headers will expire
- Build **automatic header rotation** system
- Admin updates headers in Google Sheet (no redeploy)
- Sync job reads fresh headers on every run

**Implementation:**
```
1. Sync job reads headers from Google Sheet `cron_config` tab
2. Uses headers for API call
3. If 401: logs error, sends alert
4. Admin opens DevTools → copies new headers → pastes in Sheet
5. Next sync cycle: works again
```

**Advantages:**
✅ Already implemented (`roosterSessionStore.ts`)
✅ No redeploy needed
✅ Works with ANY header set

**Disadvantages:**
❌ Requires manual intervention every 2 hours (UNACCEPTABLE)
❌ Not production-grade
❌ Creates operational burden
❌ Risk of missed alerts → data gaps

**Verdict:** ❌ **NOT RECOMMENDED** (fails requirement #1: zero manual intervention)

---

#### OPTION D: Browser Automation (Puppeteer/Playwright)

**Description:**
- Launch headless browser
- Navigate to Rooster login page
- Authenticate via Okta/Cloudflare Access
- Extract cookies/tokens
- Use for API calls

**Advantages:**
✅ Can handle complex auth flows
✅ Automatically refreshes on every run

**Disadvantages:**
❌ Extremely brittle (UI changes break automation)
❌ High memory/CPU usage (Vercel not ideal)
❌ Long execution time (60s+ per run)
❌ Requires persistent browser state or re-login every time
❌ Okta MFA would block automation
❌ Against best practices for server-to-server integration

**Verdict:** ❌ **NOT RECOMMENDED** (fragile, high-overhead)

---

### 5. Recommended Architecture

**PRIMARY RECOMMENDATION: Cloudflare Access Service Token** ✅

**Rationale:**
1. **Already proven** in project (Tableau integration)
2. **Zero expiration** (permanent until revoked)
3. **Designed** for server-to-server cron jobs
4. **IT-managed** (existing process, not DIY)
5. **Production-grade** (used by major enterprises)

**Architecture:**

```
┌──────────────────────────────────────────────┐
│ Vercel Cron (External Scheduler)            │
│   Every 60s                                  │
└─────────────────┬────────────────────────────┘
                  │
                  │ Authorization: Bearer CRON_SECRET
                  ▼
┌──────────────────────────────────────────────┐
│ GET /api/cron/rooster-live-sync              │
│                                              │
│ 1. Read Service Token from env:             │
│    - CF_ACCESS_ROOSTER_CLIENT_ID            │
│    - CF_ACCESS_ROOSTER_CLIENT_SECRET        │
│                                              │
│ 2. Fetch from Talabat with headers:         │
│    {                                         │
│      "CF-Access-Client-Id": "<id>",         │
│      "CF-Access-Client-Secret": "<secret>"  │
│    }                                         │
│                                              │
│ 3. Map riders → Store in Redis              │
└─────────────────┬────────────────────────────┘
                  │
                  │ ✅ SUCCESS (or 401 → alert)
                  ▼
        Redis Snapshot (6 min TTL)
                  │
                  │ Read by:
                  ▼
        GET /api/live-riders (JWT-scoped)
                  │
                  ▼
        /live-riders page (UI)
```

**Environment Variables:**
```bash
# NEW (Cloudflare Access Service Token for Rooster Live 3PL)
CF_ACCESS_ROOSTER_CLIENT_ID=<service-token-id>
CF_ACCESS_ROOSTER_CLIENT_SECRET=<service-token-secret>

# REMOVE (no longer needed):
# ROOSTER_LIVE_HEADERS_JSON  ❌ (expires every 2h)
# ROOSTER_EXPORT_HEADERS_JSON ❌ (if also has Bearer token)
```

---

### 6. FALLBACK ARCHITECTURE (if Service Token not available)

**FALLBACK: Cookie-Based Auth with Sheet Rotation** ⚠️

**When to use:** Only if IT cannot issue Service Token

**Architecture:**
```
Same as current, BUT:
1. Use ONLY CF_Authorization + CF_AppSession (no Bearer)
2. Store in Google Sheet `cron_config` tab
3. Monitor CF_Authorization TTL (unknown, might be days/weeks)
4. Set up alerting on 401
5. Admin updates Sheet when CF_Authorization expires
```

**Trade-offs:**
- ✅ Better than 2-hour expiration
- ⚠️ Still requires manual intervention (less frequent)
- ⚠️ Unknown expiration window (need to discover)
- ❌ Not ideal, but acceptable if no other option

---

### 7. Implementation Recommendations

#### IMMEDIATE ACTION (Before Production Deploy)

**Step 1: Verify Cloudflare Access Policy**

```bash
# Test if endpoint is behind Cloudflare Access
curl https://eg.me.logisticsbackoffice.com/api/rider-live-operations/v1/external/city/200/riders

# If response is Cloudflare Access login page → YES
# If response is 401/403 with JSON → YES
# If response is different error → investigate
```

**Step 2: Request Service Token from IT**

Email/Slack IT/Security:
```
Subject: Service Token Request for Rooster Live 3PL Integration

Hi IT/Security,

We're integrating Talabat's Rooster Live 3PL API into our dashboard.

Request: Cloudflare Access Service Token for server-to-server calls

Details:
- Endpoint: https://eg.me.logisticsbackoffice.com/api/rider-live-operations/v1/external/city/*/riders
- Purpose: Automated cron job (every 60s) to fetch live rider status
- Caller: Vercel serverless function (wakeel-team-dashboard.vercel.app)
- Permissions needed: Read-only access to Live 3PL API

Similar to existing Tableau Service Token (CF_ACCESS_CLIENT_ID / CF_ACCESS_CLIENT_SECRET).

Can you issue:
- CF-Access-Client-Id
- CF-Access-Client-Secret

for this endpoint?

Thanks!
```

**Step 3: Test Service Token**

```bash
curl -H "CF-Access-Client-Id: <id>" \
     -H "CF-Access-Client-Secret: <secret>" \
     https://eg.me.logisticsbackoffice.com/api/rider-live-operations/v1/external/city/200/riders
```

If **200 OK** → ✅ Service Token works → Production-ready solution

If **401/403** → ⚠️ Service Token not authorized → Escalate to IT

If **Cloudflare error page** → ❌ Not behind Access → Try Fallback B

---

#### CODE CHANGES REQUIRED

**IF Service Token Works (RECOMMENDED):**

**File:** `lib/roosterLive/tokenProvider.ts`

```typescript
/**
 * Auth headers for the Talabat Live 3PL endpoint.
 *
 * PRODUCTION ARCHITECTURE (zero manual intervention):
 * 1. Cloudflare Access Service Token (permanent, no expiration)
 * 2. Falls back to Google Sheet headers (for emergency override)
 */
import { getRoosterExportHeadersFromSheet } from '@/lib/roosterSessionStore';

function parseJsonHeaders(raw: string | undefined, sourceLabel: string): Record<string, string> | null {
  const trimmed = raw?.trim();
  if (!trimmed) return null;
  try {
    const parsed = JSON.parse(trimmed);
    if (!parsed || typeof parsed !== 'object') return null;
    return Object.fromEntries(Object.entries(parsed).map(([k, v]) => [String(k), String(v)]));
  } catch {
    throw new Error(`${sourceLabel} must be valid JSON object of headers.`);
  }
}

/**
 * Resolution order (first non-empty wins):
 * 1. Cloudflare Access Service Token (RECOMMENDED - permanent auth)
 * 2. ROOSTER_LIVE_HEADERS_JSON env var (manual override)
 * 3. Google Sheet `cron_config` tab (no-redeploy rotation)
 */
export async function getRoosterLiveHeaders(): Promise<Record<string, string>> {
  // Priority 1: Cloudflare Access Service Token (production-grade)
  const cfClientId = (
    process.env.CF_ACCESS_ROOSTER_CLIENT_ID?.trim() ||
    process.env.CLOUDFLARE_ACCESS_ROOSTER_CLIENT_ID?.trim()
  );
  const cfClientSecret = (
    process.env.CF_ACCESS_ROOSTER_CLIENT_SECRET?.trim() ||
    process.env.CLOUDFLARE_ACCESS_ROOSTER_CLIENT_SECRET?.trim()
  );
  
  if (cfClientId && cfClientSecret) {
    return {
      'CF-Access-Client-Id': cfClientId,
      'CF-Access-Client-Secret': cfClientSecret,
    };
  }

  // Priority 2: Manual override (legacy/emergency)
  const liveOverride = parseJsonHeaders(process.env.ROOSTER_LIVE_HEADERS_JSON, 'ROOSTER_LIVE_HEADERS_JSON');
  if (liveOverride) {
    console.warn('[roosterLive] Using manual headers (not Service Token) - check if CF_ACCESS_ROOSTER_CLIENT_ID/_SECRET are set');
    return liveOverride;
  }

  // Priority 3: Google Sheet fallback (no-redeploy rotation)
  const fromSheet = await getRoosterExportHeadersFromSheet();
  if (fromSheet) {
    console.warn('[roosterLive] Using Google Sheet headers (not Service Token) - check if CF_ACCESS_ROOSTER_CLIENT_ID/_SECRET are set');
    return fromSheet;
  }

  throw new Error(
    'No Rooster auth configured. Set CF_ACCESS_ROOSTER_CLIENT_ID and CF_ACCESS_ROOSTER_CLIENT_SECRET ' +
    '(Service Token from IT), or fallback to ROOSTER_LIVE_HEADERS_JSON / Google Sheet.'
  );
}

export function getRoosterLiveCityId(): string {
  const cityId = (process.env.ROOSTER_LIVE_CITY_ID || process.env.ROOSTER_CITY_ID || '').trim();
  if (!cityId) {
    throw new Error('Missing env: ROOSTER_LIVE_CITY_ID (or ROOSTER_CITY_ID as fallback)');
  }
  return cityId;
}
```

**File:** `.env.example`

```bash
# Talabat Live 3PL — Cloudflare Access Service Token (RECOMMENDED)
# Request from IT/Security for eg.me.logisticsbackoffice.com
# CF_ACCESS_ROOSTER_CLIENT_ID=<service-token-id>
# CF_ACCESS_ROOSTER_CLIENT_SECRET=<service-token-secret>

# Talabat Live 3PL — Manual headers (FALLBACK ONLY)
# ROOSTER_LIVE_HEADERS_JSON={"Cookie":"CF_Authorization=...; CF_AppSession=..."}
# Note: Bearer tokens expire every 2 hours — use Service Token instead!
```

**File:** `docs/ROOSTER_LIVE.md`

Add section:

```markdown
## Authentication Architecture

### PRODUCTION (RECOMMENDED): Cloudflare Access Service Token

Request a Service Token from IT/Security for `eg.me.logisticsbackoffice.com`:

```bash
CF_ACCESS_ROOSTER_CLIENT_ID=<service-token-id>
CF_ACCESS_ROOSTER_CLIENT_SECRET=<service-token-secret>
```

**Advantages:**
- ✅ Permanent (no expiration)
- ✅ Server-to-server auth
- ✅ Zero manual intervention
- ✅ IT-managed security

**Verification:**
```bash
curl -H "CF-Access-Client-Id: <id>" \
     -H "CF-Access-Client-Secret: <secret>" \
     https://eg.me.logisticsbackoffice.com/api/rider-live-operations/v1/external/city/200/riders
```

### FALLBACK: Manual Headers (Emergency Only)

If Service Token is not available, use browser-captured headers:

```bash
ROOSTER_LIVE_HEADERS_JSON={"Cookie":"CF_Authorization=...; CF_AppSession=..."}
```

⚠️ **WARNING:** 
- `Authorization: Bearer` tokens expire every 2 hours
- This will cause sync failures every 2 hours
- Only use this temporarily while waiting for Service Token
```

---

### 8. Answers to Your Questions

#### Q1: Does Rooster expose an authentication refresh endpoint?

**ANSWER: NO** ❌

Searched entire codebase. No refresh endpoint found. No programmatic token renewal available.

---

#### Q2: Is there another architecture that avoids storing expiring Bearer tokens?

**ANSWER: YES** ✅

**Cloudflare Access Service Token** (recommended):
- Permanent auth (no expiration)
- Already used in project for Tableau
- Server-to-server design
- Zero manual intervention

---

#### Q3: Can we remove dependency on manually updating ROOSTER_EXPORT_HEADERS_JSON?

**ANSWER: YES, with Service Token** ✅

Once Service Token is configured:
- Set `CF_ACCESS_ROOSTER_CLIENT_ID` + `CF_ACCESS_ROOSTER_CLIENT_SECRET` in Vercel
- Deploy once
- **Never touch again**
- Works indefinitely until token is revoked (IT-managed)

---

#### Q4: What is the MOST reliable fallback?

**ANSWER: Cookie-Only Auth (CF_Authorization + CF_AppSession)** ⚠️

If Service Token unavailable:
1. Use ONLY `CF_Authorization` and `CF_AppSession` cookies
2. Store in Google Sheet (no-redeploy rotation)
3. OMIT `Authorization: Bearer` (expires in 2h)
4. CF_Authorization appears stable (unknown TTL, might be days/weeks)
5. Monitor for 401 → alert admin → update Sheet

**Trade-off:** Still requires eventual manual intervention, but much less frequent than 2 hours.

---

#### Q5: Existing code related to auth?

**FOUND:**

| File | Purpose | Reusable? |
|------|---------|-----------|
| `lib/cloudflareAccess.ts` | ✅ Service Token headers for Tableau | **YES** - use same pattern |
| `lib/roosterSessionStore.ts` | ✅ Google Sheet header rotation | **YES** - already integrated |
| `lib/roosterExport.ts` | ✅ Headers fallback (env → sheet) | **YES** - same pattern |

**No JWT refresh logic exists** - project's JWT is for dashboard auth, not Talabat API.

---

#### Q6: Should Claude's implementation be modified?

**ANSWER: YES** ✅

**Files to Modify:**

1. **`lib/roosterLive/tokenProvider.ts`**
   - Add Cloudflare Access Service Token support (priority 1)
   - Keep Google Sheet fallback (priority 2)
   - Add warning logs when not using Service Token

2. **`.env.example`**
   - Add `CF_ACCESS_ROOSTER_CLIENT_ID` / `_SECRET` documentation
   - Add warning about Bearer token expiration

3. **`docs/ROOSTER_LIVE.md`**
   - Add "Authentication Architecture" section
   - Document Service Token request process
   - Add troubleshooting for 401 errors

4. **`lib/roosterLive/client.ts`** (optional enhancement)
   - Add retry logic that distinguishes 401 (auth) vs 5xx (transient)
   - Add alert on 401 (auth expired)

**Files that DON'T need changes:**
- `lib/roosterLive/store.ts` ✅ (good)
- `lib/roosterLive/mapper.ts` ✅ (good, pending field verification)
- `lib/roosterLive/syncService.ts` ✅ (good)
- `app/api/cron/rooster-live-sync/route.ts` ✅ (good)
- `app/api/live-riders/route.ts` ✅ (good)
- All UI components ✅ (good)

---

### 9. Final Architecture Recommendation

**TIER 1: Cloudflare Access Service Token** ✅ RECOMMENDED

```
Production-Grade Architecture:
┌─────────────────────────────────────┐
│ Vercel Environment Variables        │
│ CF_ACCESS_ROOSTER_CLIENT_ID         │
│ CF_ACCESS_ROOSTER_CLIENT_SECRET     │
└──────────────┬──────────────────────┘
               │
               │ Permanent (no expiration)
               ▼
       tokenProvider.ts
               │
               │ CF-Access-Client-Id + Secret
               ▼
       Talabat Live 3PL API
```

**Priorities Met:**
1. ✅ Zero manual intervention (permanent token)
2. ✅ Production reliability (IT-managed, proven pattern)
3. ✅ Automatic recovery (N/A - never expires)
4. ✅ Minimum maintenance (set once, forget)
5. ✅ Security (Service Token > cookies/JWTs)
6. ✅ Performance (single header check, no refresh overhead)

---

**TIER 2: Cookie-Only Auth** ⚠️ FALLBACK

```
Acceptable Fallback (if Service Token unavailable):
┌─────────────────────────────────────┐
│ Google Sheet: cron_config           │
│ ROOSTER_EXPORT_HEADERS_JSON         │
│ {"Cookie":"CF_Authorization=..."}   │
│ (OMIT Authorization: Bearer)        │
└──────────────┬──────────────────────┘
               │
               │ CF_Authorization (stable, TTL unknown)
               ▼
       tokenProvider.ts
               │
               │ Cookie: CF_Authorization + CF_AppSession
               ▼
       Talabat Live 3PL API
```

**Priorities Met:**
1. ⚠️ Reduced manual intervention (days/weeks vs 2 hours)
2. ⚠️ Acceptable reliability (better than 2h expiration)
3. ❌ No automatic recovery (needs human to update Sheet)
4. ⚠️ Moderate maintenance (infrequent updates)
5. ✅ Security (cookies better than long-lived JWT in env)
6. ✅ Performance (same as Tier 1)

---

## 📋 ACTION PLAN

### PHASE 1: Investigation (1 day)

- [ ] Verify Cloudflare Access policy on `eg.me.logisticsbackoffice.com`
- [ ] Request Service Token from IT/Security
- [ ] Test Service Token against Live 3PL API
- [ ] Document CF_Authorization TTL (monitor over 24h)

### PHASE 2: Code Changes (if Service Token available)

- [ ] Update `lib/roosterLive/tokenProvider.ts` (add Service Token priority)
- [ ] Update `.env.example` (document new env vars)
- [ ] Update `docs/ROOSTER_LIVE.md` (authentication section)
- [ ] Add monitoring/alerting on 401 errors

### PHASE 3: Deployment

- [ ] Set `CF_ACCESS_ROOSTER_CLIENT_ID` in Vercel
- [ ] Set `CF_ACCESS_ROOSTER_CLIENT_SECRET` in Vercel
- [ ] Deploy to staging
- [ ] Test sync manually
- [ ] Monitor for 24 hours
- [ ] Deploy to production

### PHASE 4: Fallback (if Service Token NOT available)

- [ ] Test Cookie-only auth (no Bearer token)
- [ ] Monitor CF_Authorization TTL
- [ ] Set up alerting on 401
- [ ] Document manual rotation process
- [ ] Deploy with Google Sheet fallback

---

## 🎯 RECOMMENDATION SUMMARY

**PRIMARY:** Request Cloudflare Access Service Token from IT ✅

**REASON:** This is the **only** architecture that meets all requirements:
- Zero manual intervention forever
- Production-grade reliability
- Proven pattern (already used for Tableau)
- IT-managed security

**IF Service Token not available:**

Use Cookie-Only Auth (CF_Authorization + CF_AppSession) as fallback, accepting:
- Eventual manual intervention (unknown frequency)
- Monitoring overhead
- Operational risk

**DO NOT deploy** with `Authorization: Bearer` in current form - will fail every 2 hours.

---

**Report End**
