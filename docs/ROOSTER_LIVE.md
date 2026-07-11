# Talabat Live 3PL Integration (`rooster-live`)

## What this is
Displays Talabat's Live 3PL rider-ops state (wallet, breaks, late time, rider
state) inside the dashboard, scoped per supervisor, refreshed ~every 60s.
This is a separate, additive feature — it does not touch Google Sheets,
the existing `rooster-sync` (historical shifts export), auth, or any
existing page/route.

## Architecture
```
Talabat Live 3PL API
   │  (1 call/min — the ONLY process that talks to Talabat)
   ▼
External minute-scheduler (cron-job.org / GitHub Actions / QStash)
   │  Authorization: Bearer CRON_SECRET
   ▼
GET /api/cron/rooster-live-sync
   │  fetch all pages → map → overwrite one Redis key
   ▼
Redis (Upstash / Vercel KV) — single snapshot key, ~6 min TTL, no history stored
   ▲
   │  read-only, JWT-scoped
GET /api/live-riders
   ▲
   │  React Query, refetchInterval: 60s
/live-riders page (supervisor + admin)
```

No Postgres: the product requirement is "current state," not history, so a
relational store adds infrastructure without benefit here. See the
architecture discussion in-repo commit history / PR description for the
full reasoning.

## Authentication Architecture (Zero Manual Intervention)

### How It Works

```
CF_Authorization (24h) + CF_AppSession
            │
            │ (every 60s)
            ▼
GET /api/rider-live-operations/...
            │
            ├─ 200 OK → Success
            │
            └─ 401 → Auto-refresh via POST /api/iam-login/auth/okta_token
                        │
                        ├─ Success → Retry with new dhh_token
                        │
                        └─ Fail → Alert (CF_Authorization expired, update Google Sheet)
```

**Key Insight:** 
- `Authorization: Bearer` tokens expire every **2 hours** ❌
- `CF_Authorization` cookies last **24 hours** ✅
- System **auto-refreshes** dhh_token when it expires (zero manual intervention)

### Required environment variables
| Var | Required | Notes |
|---|---|---|
| `UPSTASH_REDIS_REST_URL` / `UPSTASH_REDIS_REST_TOKEN` (or `KV_REST_API_URL`/`KV_REST_API_TOKEN`) | **Yes** | Shared snapshot store. Without this, `/api/live-riders` returns 503. One-click "Upstash" or "KV" integration in the Vercel dashboard. |
| `CRON_SECRET` | Yes (already set for existing crons) | Authorizes the sync trigger. |
| `ROOSTER_LIVE_CITY_ID` | No | Falls back to `ROOSTER_CITY_ID` (currently `200` = Alexandria). |
| `ROOSTER_LIVE_URL_TEMPLATE` | No | Defaults to the documented endpoint; override only if Talabat changes the path. |

## One-time setup

### Step 1: Configure Authentication (Google Sheet - RECOMMENDED)

Open Google Sheet `cron_config` tab, add this row:

| Key | Value |
|-----|-------|
| `ROOSTER_EXPORT_HEADERS_JSON` | `{"Cookie":"CF_AppSession=...; CF_Authorization=..."}` |

**How to get cookies:**
1. Open Chrome DevTools (F12)
2. Go to https://eg.me.logisticsbackoffice.com
3. Login with Okta + OTP
4. In DevTools → Network tab, find any request to `eg.me.logisticsbackoffice.com`
5. Copy the `Cookie` header value (should contain `CF_Authorization` and `CF_AppSession`)
6. Paste in Google Sheet (format: `{"Cookie":"CF_AppSession=...; CF_Authorization=..."}`)

**⚠️ IMPORTANT:** 
- **Do NOT include** `Authorization: Bearer` header (expires every 2 hours)
- **Do NOT include** `dhh_token` in Cookie (system auto-refreshes it)
- **ONLY include:** `CF_AppSession` + `CF_Authorization` (both last 24 hours)

**Example:**
```json
{"Cookie":"CF_AppSession=6d4825a95f41ceb9; CF_Authorization=eyJhbGciOiJSUzI1NiIsImtpZCI6IjE3NmE0NmU3..."}
```

### Step 2: Enable Redis
1. Enable Upstash Redis (or Vercel KV) on the Vercel project
2. Env vars are auto-injected

### Step 3: Verify Field Names
**Verify the raw field names** in `lib/roosterLive/mapper.ts` against one real response:
1. Open DevTools → Network → filter `rider-live-operations`
2. Copy one rider row's JSON
3. Compare with `FIELD_CANDIDATES` in `lib/roosterLive/mapper.ts`
4. Add any missing field names

### Step 4: Setup External Scheduler
Point an external scheduler (cron-job.org / QStash) at:
```
GET https://<your-domain>/api/cron/rooster-live-sync
Header: Authorization: Bearer <CRON_SECRET>
Interval: 60 seconds
```

### Step 5: Verify
1. Open `/live-riders` as supervisor
2. Confirm riders + KPIs populate within ~2 sync cycles

## Operational notes

### Auto-Refresh Behavior
- **dhh_token (2h TTL):** Automatically refreshed on 401 errors via Okta endpoint
- **CF_Authorization (24h TTL):** Update in Google Sheet once every ~23 hours
- **Zero manual intervention** for dhh_token expiration

### Monitoring
- If `CF_Authorization` expires (24h), sync returns `502` with clear error message
- Check scheduler failure notifications for `rooster_live_refresh_failed_permanent` errors
- A single missed sync self-heals on the next successful run (TTL is 6 minutes, cadence is 60s)
- Dashboard flags data as "stale" if older than 150 seconds

### Maintenance Schedule
**Daily (automated):** dhh_token auto-refreshes every 2h (zero action needed)  
**Weekly (5 min):** Update CF_Authorization in Google Sheet (once every ~6 days to be safe)

### Troubleshooting

**Error:** `Rooster live auth rejected (401). Auto-refresh failed.`  
**Cause:** CF_Authorization cookie expired (24h TTL)  
**Fix:** Update Google Sheet `cron_config` with new cookies from browser (see Step 1 above)

**Error:** `Cannot refresh: CF_Authorization cookie missing`  
**Cause:** Cookie header doesn't contain CF_Authorization  
**Fix:** Verify Google Sheet has correct format: `{"Cookie":"CF_AppSession=...; CF_Authorization=..."}`

**Error:** `Removed Authorization: Bearer header (expires in 2h)`  
**Action:** None - this is expected behavior. System automatically removed short-lived token.
