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

## Authentication Architecture (self-healing, zero manual intervention — best effort)

### The real problem this solves
The browser tab at `eg.me.logisticsbackoffice.com` never visibly logs anyone
out because, as long as it stays open, Cloudflare Access **silently**
re-authenticates behind the scenes — App → Cloudflare Access → IdP →
Cloudflare Access → App — reusing the still-valid SSO session, with no login
form ever shown. A cron job that only holds a *copy* of
`CF_Authorization`/`CF_AppSession` never gets that silent refresh, so once
the JWT's own `exp` passes, every sync starts failing until a human
manually re-pastes fresh cookies.

**Confirmed from a real captured token (decoding the JWT's own `iat`/`exp`
claims — no guessing):** `CF_Authorization` genuinely is a **24h** session
(`iss: https://dhlogisticsauth.cloudflareaccess.com`), matching Cloudflare
Access's default. So if syncs are failing noticeably *before* 24h have
passed, the JWT's natural expiry is **not** the cause — the two most likely
real causes are:
1. **Session collision** — someone (e.g. the account owner) logs into
   `eg.me.logisticsbackoffice.com` with the *same account* on another
   device/browser. Cloudflare Access / the app's own session store may
   invalidate the older session token when a new login happens, which would
   kill the cron's copied cookie long before its `exp` claim says it should
   die. **Fix:** use a dedicated account for this integration that nobody
   logs into day-to-day (see the recommendation near the bottom of Step 1b).
2. A Cloudflare Access re-validation rule unrelated to `exp` (e.g. device
   posture, IP reputation, or a policy re-check) silently revoking the
   session early.

Either way, the self-heal layers below recover automatically regardless of
*why* the session died — they don't depend on knowing the exact cause.

### How auto-recovery works now (three layers, in order)
```
Layer 0 — Cloudflare Access Service Token (if IT/Talabat issues one)
  CF-Access-Client-Id / CF-Access-Client-Secret → never expires, nothing else needed.

Layer 1 — dhh_token mint (cheap, every sync)
  CF_Authorization (still valid) → POST /api/iam-login/auth/okta_token → fresh dhh_token (2h)

Layer 2 — silent Cloudflare Access session replay (only when Layer 1 fails)
  Stored Cookie (CF_Authorization + CF_AppSession, plus the IdP-domain
  cookie in ROOSTER_OKTA_COOKIE if configured) replays the same redirect
  chain a browser tab does, using `tough-cookie` so cookies are attached
  per-domain across the App ↔ IdP hop (lib/roosterLive/sessionKeepAlive.ts).
  On success, the fresh cookie is written back into the Google Sheet
  automatically (lib/roosterSessionStore.ts → setRoosterExportHeadersInSheet)
  — no DevTools, no laptop, no human.
  → If a real login FORM is actually reached, the underlying SSO session is
    truly dead and Layer 2 fails on purpose; only then does the existing
    Telegram alert ask a human to log in for real.
```

This runs two ways:
- **Reactively**, inside every live-sync call (`lib/roosterLive/client.ts`) on
  401 / HTML-instead-of-JSON.
- **Proactively**, via `/api/cron/rooster-keepalive` every 3 hours (see
  `vercel.json`) — well inside the confirmed 24h window, so in the common
  case the session gets refreshed before it ever has a chance to expire, and
  the live-sync never even hits a failure to react to.

**Key Insight:**
- `Authorization: Bearer` tokens expire every **2 hours** ❌ (never used)
- `CF_Authorization` + `CF_AppSession` cookies genuinely last **24h**
  (verified by decoding a real token's `iat`/`exp`) — if the sync still
  fails sooner, see the session-collision/re-validation note above.
- dhh_token auto-refreshes on every sync (Layer 1, zero manual intervention)
- The 24h session itself now also self-heals automatically (Layer 2), **as
  long as the underlying SSO session is still alive** — this is a
  best-effort replay, not a guarantee; if the IdP's own absolute session
  limit is hit, a human still has to log in once.

### Required environment variables
| Var | Required | Notes |
|---|---|---|
| `UPSTASH_REDIS_REST_URL` / `UPSTASH_REDIS_REST_TOKEN` (or `KV_REST_API_URL`/`KV_REST_API_TOKEN`) | **Yes** | Shared snapshot store. Without this, `/api/live-riders` returns 503. One-click "Upstash" or "KV" integration in the Vercel dashboard. |
| `CRON_SECRET` | Yes (already set for existing crons) | Authorizes the sync trigger. |
| `ROOSTER_LIVE_CITY_ID` | No | Falls back to `ROOSTER_CITY_ID` (currently `200` = Alexandria). |
| `ROOSTER_LIVE_URL_TEMPLATE` | No | Defaults to the documented endpoint; override only if Talabat changes the path. |
| `CF_ACCESS_ROOSTER_CLIENT_ID` / `CF_ACCESS_ROOSTER_CLIENT_SECRET` | No (best option if available) | Cloudflare Access Service Token — permanent auth, request from IT/Talabat if this endpoint is behind a policy they can issue one for. Skips everything below when set. |
| `ROOSTER_APP_ORIGIN` | No | Defaults to the host from `ROOSTER_LIVE_URL_TEMPLATE` (`https://eg.me.logisticsbackoffice.com`). |
| `ROOSTER_KEEPALIVE_URL` | No | Real HTML page behind Cloudflare Access used for the silent replay. Defaults to `{ROOSTER_APP_ORIGIN}/dashboard/rooster/live-3pl`. |
| `ROOSTER_OKTA_ORIGIN` / `ROOSTER_OKTA_COOKIE` (or Sheet row `ROOSTER_OKTA_COOKIE`) | No, but may improve Layer 2's odds | The upstream IdP's own session cookie — see "Capturing the IdP cookie" below. Without it, Layer 2 still runs on the app cookie alone and may still succeed, but is more likely to hit a real login form if the app session itself is what expired. |
| `ROOSTER_DROP_COOKIE_NAMES` | No | Comma-separated extra cookie names to strip (beyond `dhh_token`/`refresh_token`/known analytics) if a new rotating cookie shows up. |

## One-time setup

### Step 1: Configure Authentication (Google Sheet - RECOMMENDED)

Open Google Sheet `cron_config` tab, add this row:

| Key | Value |
|-----|-------|
| `ROOSTER_EXPORT_HEADERS_JSON` | `{"Cookie":"CF_AppSession=...; CF_Authorization=...; refresh_token=...; dhh_token=..."}` |

**How to get the app cookie:**
1. Open Chrome DevTools (F12)
2. Go to https://eg.me.logisticsbackoffice.com
3. Log in normally (this app's IdP is `dhlogisticsauth.cloudflareaccess.com` —
   a Cloudflare Access-hosted login, not a separate `*.okta.com` domain you
   can browse to independently)
4. In DevTools → Network tab, find any request to `eg.me.logisticsbackoffice.com`
5. Copy the **entire** `Cookie` header value. In practice, for this app, the
   only cookies scoped to `eg.me.logisticsbackoffice.com` are
   `CF_Authorization`, `CF_AppSession`, `dhh_token`, and `refresh_token` —
   there is no separate app-level `session` cookie in the current version of
   the site. Copying "the full header" is still the safest habit in case
   that ever changes.
6. Paste in Google Sheet (format: `{"Cookie":"...full header..."}`) — or run
   `node scripts/rooster-cookie-push-to-sheet.mjs` (see below) to do this
   for you from a `Cookie.xlsx` export.

**⚠️ IMPORTANT:**
- **Do NOT include** `Authorization: Bearer` header (expires every 2 hours) — stripped automatically if pasted anyway.
- `dhh_token`/`refresh_token` are stripped and re-minted automatically — fine to leave them in or out.
- **Do include** `CF_AppSession` and `CF_Authorization` at minimum.

**Example:**
```json
{"Cookie":"CF_AppSession=6d4825a95f41ceb9; CF_Authorization=eyJhbGciOiJSUzI1NiIsImtpZCI6IjE3NmE0NmU3..."}
```

### Verifying a cookie before deploying it (recommended)

Instead of eyeballing DevTools, export cookies for
`eg.me.logisticsbackoffice.com` from a browser extension (e.g.
"Cookie-Editor") as `.xlsx`, save it as `Cookie.xlsx` at the repo root
(already gitignored — never commit it), then:

```bash
node scripts/rooster-cookie-check.mjs        # validates it live (mint + one riders page) without touching the Sheet
node scripts/rooster-cookie-push-to-sheet.mjs  # writes it to cron_config → ROOSTER_EXPORT_HEADERS_JSON
npx tsx scripts/rooster-sync-dry-run.ts        # runs the REAL production sync function locally, end-to-end
```

`rooster-cookie-check.mjs` also decodes `CF_Authorization`'s own `iat`/`exp`
claims and prints the account identity/issuer — useful for confirming which
account the cookie belongs to and exactly when it expires, without waiting
for a failure.

### Step 1b (optional): Capturing an upstream IdP cookie for the deep self-heal

The app-domain cookie above is enough for the cheap `dhh_token` refresh
(Layer 1) and is what Layer 2 tries first. If Layer 2 ever needs to go one
hop further upstream (the app session itself is dead, not just `dhh_token`),
it can also replay a stored IdP-domain cookie if one is configured:

1. Set `ROOSTER_OKTA_ORIGIN` (Vercel env var) to the IdP's own origin.
   `dhlogisticsauth.cloudflareaccess.com`'s `iss` claim doesn't reveal which
   upstream identity provider backs it, but a real captured cookie export
   for this account also contained a live `accounts.google.com` session
   (matching a `@talabat.com` Google Workspace-style login) — `
   https://accounts.google.com` is the best current candidate to try.
2. Capture that domain's `Cookie` header the same way (DevTools → Network,
   any request to that domain) and add a second row to `cron_config`:

| Key | Value |
|-----|-------|
| `ROOSTER_OKTA_COOKIE` | `{"Cookie":"...IdP domain cookie header..."}` |

Without this, Layer 2 still runs on the app cookie alone and may still
succeed — this step only matters if that alone isn't enough.

**Recommended, separately:** use a dedicated account for this integration
(not a human's daily-use login) so the cron's session is never silently
invalidated by that same person logging into the same account elsewhere —
this is the most likely explanation if syncs still fail noticeably before
the 24h mark after this fix.

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
- **dhh_token (2h TTL):** Automatically refreshed on every sync via Okta endpoint (Layer 1).
- **CF_Authorization (24h TTL, confirmed by JWT `iat`/`exp`):** Automatically
  refreshed via a silent Cloudflare Access session replay (Layer 2) —
  reactively on failure, and proactively every 3h via
  `/api/cron/rooster-keepalive`. On success, the fresh cookie is written
  back to the Google Sheet automatically.
- **Manual intervention only needed** when the underlying SSO session itself
  is fully gone (Layer 2 hits a real login form) — the Telegram alert only
  fires in that case.

### Monitoring
- If a sync's own reactive self-heal fails, it returns `502` with a clear error message.
- `/api/cron/rooster-keepalive` runs every 3h and sends an early, calmer
  Telegram warning if the session is about to need a real re-login —
  **before** the live-sync itself starts failing.
- Structured log events to watch for (`logStructured`):
  - `rooster_live_deep_refresh_ok` / `rooster_keepalive_ok` — auto-healed, no action needed.
  - `rooster_live_deep_refresh_failed` / `rooster_keepalive_failed` — Layer 2 failed (`reason` field explains why: `okta_login_form_required` means a human is genuinely required).
- A single missed sync self-heals on the next successful run (TTL is 6 minutes, cadence is 60s).
- Dashboard flags data as "stale" if older than 150 seconds.

### Maintenance Schedule
**Every sync (automated):** dhh_token auto-refreshes (Layer 1, zero action needed).
**Every 3h (automated):** proactive session keepalive (Layer 2) tries to refresh CF_Authorization before it expires.
**On failure only (rare, best-effort):** if both layers fail, Telegram asks for a fresh login+cookie paste — frequency depends entirely on how long the underlying SSO session survives (24h nominally, less if the session is invalidated early — see the session-collision note above), which this system cannot control.

### Troubleshooting

**Error:** `Rooster live auth rejected (401). Auto-refresh (dhh_token mint + silent session replay) failed.`
**Cause:** Both self-heal layers failed — the underlying Okta SSO session is fully gone.
**Fix:** Update Google Sheet `cron_config` with a fresh **full** Cookie header from the browser (see Step 1 above), and ideally also add `ROOSTER_OKTA_COOKIE` (Step 1b) so Layer 2 has a better chance next time.

**Error:** `Cannot refresh: CF_Authorization cookie missing`
**Cause:** Cookie header doesn't contain CF_Authorization.
**Fix:** Verify Google Sheet has the correct format: `{"Cookie":"CF_AppSession=...; CF_Authorization=..."}`

**Log event:** `rooster_session_refresh_hit_login_form` / reason `okta_login_form_required`
**Cause:** Layer 2's redirect replay reached a real Okta username/password form — the IdP session itself expired, not just CF_Authorization.
**Fix:** Same as above — a human has to log in once. Consider a dedicated bot account (see Step 1b) so this isn't tied to someone's personal daily login habits.

**Error:** `Removed Authorization: Bearer header (expires in 2h)`
**Action:** None — this is expected behavior. System automatically removed the short-lived token.

### What we could NOT fully automate (be honest about this)
Layer 2 replicates the *HTTP-level* Cloudflare Access ↔ Okta redirect
handshake using the captured cookies — it cannot pass an actual Okta
username/password/MFA prompt, because that requires either a real browser
executing JavaScript or headless-browser credential automation (Playwright +
TOTP for authenticator-app-based MFA), which was deliberately not built here
given the credential-handling risk and brittleness of that approach (see
`.cursor/ROOSTER_LIVE_AUTH_ARCHITECTURE_REVIEW.md` for the full trade-off
analysis of that option). If Layer 2 keeps failing with
`okta_login_form_required` even with a dedicated bot account and a
correctly captured Okta cookie, that means Okta's own SSO session for this
app has an absolute lifetime shorter than what any HTTP replay can extend —
at that point, either (a) request a Cloudflare Access **Service Token**
(Layer 0) from IT/Talabat, which removes this whole problem permanently, or
(b) ask to explicitly build the headless-browser + credentials fallback,
which needs your input on the account's MFA type first.
