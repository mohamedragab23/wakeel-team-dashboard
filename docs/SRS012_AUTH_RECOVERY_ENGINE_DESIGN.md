# SRS-012: Authentication Recovery Engine — Design Document

**Status:** 🟢 IMPLEMENTED — Phase 0 (Okta probe) + manual end-to-end validation
both succeeded on 2026-07-27; Phases 2–3 (production Okta client, session
exchange, Gmail OTP reader, engine, wiring into `authRefresh.ts` as Layer 3)
are built and typecheck/build clean. **Phase 1 (Gmail OAuth) still needs the
user to run `scripts/gmail-oauth-bootstrap.mjs` once** and add the resulting
3 env vars to Vercel — until then, Layer 3 is present in code but skipped
automatically (fast fail, zero regression) because `isFullAuthRecoveryConfigured()`
returns false without them.
**Author:** Cursor Agent, with Mohamed Ragab
**Date:** 2026-07-27

## Validation Results (2026-07-27)

Manually ran the exact chain this design proposes, end-to-end, for real:
1. `POST /api/v1/authn` with real username+password → `MFA_REQUIRED`, single
   `email` factor. ✅ (confirms classic Okta Authn API, not OIE — Risk #1 resolved.)
2. Triggered the email-OTP send, verified a real OTP code → `SUCCESS` +
   `sessionToken`. ✅ (Risk #2 — no CAPTCHA/push/device-approval encountered.)
3. Exchanged `sessionToken` via the captured Cloudflare Access `/authorize`
   URL → full redirect chain (Okta → Cloudflare callback → app) → fresh
   `CF_Authorization` + `CF_AppSession`, confirmed via JWT decode
   (new `exp`, correct identity claim). ✅
4. Pushed the fresh cookie to the production Google Sheet and ran the real
   `runRoosterLiveSync()` — minted `dhh_token` (Layer 1) and fetched **100
   real riders**. ✅ Full chain proven, not just individual pieces.

This directly de-risks the two highest-likelihood blockers from §5 (Risks
#1 and #2) — both did **not** materialize. The only remaining gap before
Layer 3 is live in production is Phase 1 (Gmail OAuth bootstrap), which is
a one-time ~10 minute action only the account owner can do (Google requires
interactive consent).

---

## 0. Investigation Answers (before design)

### Q1 — How is authentication currently implemented? Exact files.

Plain global `fetch` (Node's built-in `undici`-based fetch under Next.js's Node runtime).
**No** axios, got, node-fetch, undici-directly, Playwright, or Puppeteer anywhere in the
codebase (verified by search — `googleapis` and `xlsx` are the only relevant
non-`fetch` HTTP-adjacent dependencies, and `googleapis` is used only for
Sheets API, not for HTTP auth).

| File | Role |
|---|---|
| `lib/roosterLive/tokenProvider.ts` | Resolves headers (Service Token → env → Sheet), cookie cleaning, Okta-session lookup |
| `lib/roosterLive/authRefresh.ts` | Orchestrates Layer 1 (`mintDhhTokenViaOkta`, a `fetch` POST) + Layer 2 (`smartRefreshRoosterAuth`) |
| `lib/roosterLive/sessionKeepAlive.ts` | Layer 2: replays the Cloudflare Access redirect chain with `fetch` + `tough-cookie` (`CookieJar`), now also following Cloudflare's client-side JS auto-redirect (fixed today) |
| `lib/roosterLive/client.ts` | Talabat rider-data fetch, calls `smartRefreshRoosterAuth` reactively on 401/HTML |
| `lib/cloudflareAccess.ts` | Cloudflare Access Service Token headers (Layer 0) |
| `lib/roosterSessionStore.ts` | Google Sheet (`cron_config`) read/write for the persisted cookie |

### Q2 — Can the current implementation complete an Okta login requiring OTP? Is browser automation required?

**No, it cannot today — and it never tries to.** The entire existing system is a
**cookie-replay** mechanism: it holds a *copy* of already-issued cookies and,
at most, replays Cloudflare Access's own redirect chain (Layer 2) using
whatever session is *already alive*. It never submits a username, a
password, or an OTP anywhere — there is no code path for that at all.

**Is a real headless browser (Playwright) required to do this?**
**No — not necessarily**, and I recommend against it as the primary path.
Today's trace (this session) proved `deliveryhero.okta.com` is a classic
hosted Okta tenant reachable via plain HTTP redirects with no JS execution
needed for the *Cloudflare Access* half of the chain. Okta itself exposes a
documented **server-side Authentication API** (`POST /api/v1/authn` and
`.../factors/{id}/verify`) that lets a plain HTTP client — no browser, no JS
— perform the full username → password → MFA-challenge → OTP-verify →
`sessionToken` flow, then exchange that `sessionToken` for the same
OAuth `/authorize` redirect this system already parses. This fits the
existing `fetch`-based architecture with zero new heavy dependencies.

**This is not 100% guaranteed to work for this specific Okta tenant** — some
orgs have migrated to Okta's newer "Identity Engine" (OIE), which uses a
different (but still purely HTTP/JSON, still no-browser) "Interaction Code"
API shape. Either way, no headless browser should be needed; the risk is
*which* Okta API shape to target, not *whether* an API-only approach is
possible at all. This is why the plan below starts with a **feasibility
probe** (Phase 0) before committing to full implementation. Playwright is
listed only as a documented fallback if Phase 0 disproves the API approach
(see Risks).

### Q3 — Can Gmail API be integrated safely? Does anything already exist?

**Nothing exists today** (verified by search — no `gmail`, `Gmail`, OAuth2
client, or `refresh_token` handling anywhere in the repo). `googleapis`
(already a dependency, v126, used for Sheets) **includes the Gmail API
client** — no new npm package needed.

**The critical constraint:** the existing Google auth pattern in this repo
(`lib/googleSheetsAuth.ts`) uses a **Service Account** with a private key.
Service accounts **cannot** access a personal `@gmail.com` inbox — domain-wide
delegation (the mechanism that lets a service account impersonate a mailbox)
only works for **Google Workspace**-managed domains, not personal Gmail. So
this **cannot reuse the existing service-account plumbing at all**. It needs
a genuinely different, new credential type:

> A real **OAuth 2.0 (3-legged) client**, authorized **once** by
> `mohamed.ragab2398@gmail.com` personally, producing a long-lived
> `refresh_token` that the server then uses forever (subject to the
> caveats in §5 Risks — this is the single biggest open risk in this design).

This is safe to integrate architecturally (Node runtime, `googleapis`
already present, Redis/Sheet-based secret storage patterns already
established) — but it is a **new trust boundary**: a refresh token that can
read the personal Gmail inbox is a meaningfully more sensitive secret than
the short-lived cookies this system has handled so far, and must be stored
and scoped accordingly (§4 Security).

---

## 1. Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│                     Authentication Recovery Engine                   │
│                  (new: lib/roosterLive/authRecovery/)                │
└─────────────────────────────────────────────────────────────────────┘

Trigger: reactive (401/HTML on live-sync) OR proactive (rooster-keepalive)
         AND Layer 1 (dhh_token) AND Layer 2 (silent CF replay) both failed
                                  │
                                  ▼
                    ┌──────────────────────────┐
                    │  Layer 3: Full Auth       │   ← NEW (this SRS)
                    │  Recovery Engine          │
                    └──────────────────────────┘
                                  │
        ┌─────────────────────────┼─────────────────────────┐
        ▼                         ▼                         ▼
 3a. Start Okta login      3b. Wait for + read       3c. Submit OTP,
 (username/password         OTP from Gmail            follow redirect
  via Okta Authn API)        (Gmail API, poll)         chain to app
        │                         │                         │
        ▼                         ▼                         ▼
 stateToken/factorId      6-digit code, parsed      fresh CF_Authorization
 (kept in-memory for       from message body          + CF_AppSession
  this one invocation)                                      │
                                                              ▼
                                                  setRoosterExportHeadersInSheet()
                                                  (existing function, reused)
                                                              │
                                                              ▼
                                                  resume sync (existing flow)
                                                              │
                                              ┌───────────────┴───────────────┐
                                              ▼                               ▼
                                     SUCCESS: low-noise                FAILURE (all
                                     Telegram note (existing            layers exhausted):
                                     pattern, "healedAuthDeep")          existing Telegram
                                                                         alert (existing
                                                                         pattern, unchanged)
```

**Key architectural decision: everything runs inside ONE serverless
invocation**, not a multi-request state machine. Okta's `stateToken` /
`factorId` only need to survive for the duration of "submit
password → wait for email → submit OTP", which happens inside a single
function call with an internal bounded polling loop (e.g. poll Gmail every
5s, up to ~90s). This avoids persisting a partial-login state to Redis/Sheet
across requests, which would add real complexity (expiry, replay, partial
failure cleanup) for no benefit — Vercel Pro/Fluid compute supports
sufficiently long single-invocation durations for this (needs
`maxDuration` raised on this specific route; default is too short).

### New modules (implementation phase, not yet written)

| Module | Responsibility |
|---|---|
| `lib/roosterLive/authRecovery/oktaAuthnClient.ts` | Wraps Okta's Authentication API: start login, trigger email-factor challenge, verify OTP → `sessionToken` |
| `lib/roosterLive/authRecovery/oktaSessionExchange.ts` | Exchanges `sessionToken` for the OAuth `/authorize` redirect → follows the chain (reuses `tough-cookie` pattern from `sessionKeepAlive.ts`) → fresh app cookies |
| `lib/roosterLive/authRecovery/gmailOtpReader.ts` | Gmail API client (OAuth2, refresh-token-based), polls for the OTP email, parses the 6-digit code |
| `lib/roosterLive/authRecovery/engine.ts` | Orchestrates the above 3 into one `recoverRoosterAuthFully()` call; called from `authRefresh.ts` as **Layer 3**, only after Layers 1–2 fail |
| `lib/gmailOAuth.ts` | Generic OAuth2 client bootstrap (token refresh, credential loading) — separate from `lib/googleSheetsAuth.ts` since it's a fundamentally different credential type |
| `scripts/gmail-oauth-bootstrap.mjs` | **One-time, human-run, local** script to complete the initial OAuth consent and print the `refresh_token` to store in Vercel env — never runs in production |

`lib/roosterLive/authRefresh.ts` gains exactly one new call site: if
`smartRefreshRoosterAuth`'s existing Layer 1+2 path fails with
`okta_login_form_required` (or similar), it calls the new Layer 3 engine
before giving up and alerting Telegram. **No existing function signature
changes** beyond adding this one internal fallback branch.

---

## 2. Sequence Diagram (text)

```
Cron/reactive trigger          Layer 3 Engine              Okta                Gmail API           Sheet/Telegram
       │                            │                        │                    │                     │
       │  Layers 1+2 already failed │                        │                    │                     │
       ├───────────────────────────>│                        │                    │                     │
       │                            │  POST /api/v1/authn     │                    │                     │
       │                            │  {username, password}   │                    │                     │
       │                            ├───────────────────────>│                    │                     │
       │                            │  MFA_REQUIRED            │                    │                     │
       │                            │  stateToken, factorId    │                    │                     │
       │                            │<───────────────────────┤                    │                     │
       │                            │  POST .../factors/{id}/verify (trigger send) │                     │
       │                            ├───────────────────────>│                    │                     │
       │                            │  MFA_CHALLENGE (email sent)                  │                     │
       │                            │<───────────────────────┤                    │                     │
       │                            │                        │  (Okta emails OTP  │                     │
       │                            │                        │   → forwarded to   │                     │
       │                            │                        │   Gmail inbox)     │                     │
       │                            │  users.messages.list(query, after=now)       │                     │
       │                            ├──────────────────────────────────────────────>│                     │
       │                            │  poll loop, ~5s interval, ~90s budget         │                     │
       │                            │  [] → [] → [one match]                       │                     │
       │                            │<──────────────────────────────────────────────┤                     │
       │                            │  users.messages.get(id) → parse "886687"     │                     │
       │                            ├──────────────────────────────────────────────>│                     │
       │                            │<──────────────────────────────────────────────┤                     │
       │                            │  POST .../factors/{id}/verify {passCode}     │                     │
       │                            ├───────────────────────>│                    │                     │
       │                            │  SUCCESS, sessionToken   │                    │                     │
       │                            │<───────────────────────┤                    │                     │
       │                            │  GET /oauth2/v1/authorize?...&sessionToken=  │                     │
       │                            ├───────────────────────>│                    │                     │
       │                            │  302 → Cloudflare Access callback (existing  │                     │
       │                            │  redirect-following logic from sessionKeepAlive.ts reused) │        │
       │                            │  ... → 200, fresh CF_Authorization/CF_AppSession Set-Cookie │        │
       │                            │<─────────────────────────────────────────────┤                     │
       │                            │  setRoosterExportHeadersInSheet(freshCookie) │                     │
       │                            ├──────────────────────────────────────────────────────────────────>│
       │  fresh headers returned    │                                                                    │
       │<───────────────────────────┤                                                                    │
       │  resume sync normally      │                                                                    │
       │                            │  low-noise "healedViaFullRecovery" Telegram note (existing pattern)│
       │                            ├──────────────────────────────────────────────────────────────────>│
```

On **any** step failing (wrong password stored, Okta blocks the login as
suspicious, OTP email never arrives within the poll budget, OTP rejected,
final redirect hits an unexpected page) → the engine returns a structured
failure reason, Layers 1–3 are exhausted, and the **existing** Telegram
alert path fires (unchanged from today) — this satisfies "Telegram alert
ONLY if automatic recovery fails completely."

---

## 3. Required Google APIs / credentials

| API | Scope | Credential type | Notes |
|---|---|---|---|
| Gmail API | `https://www.googleapis.com/auth/gmail.readonly` | **OAuth 2.0 refresh token** (new — see §0 Q3) | Read-only is deliberately the minimum scope — the engine never needs to send/delete/modify mail |
| Sheets API | (existing) `spreadsheets` | Existing service account | Reused as-is, only writes the recovered cookie — no changes |

No Gmail API access is needed at all for the *Apps Script* the user already
has for Telegram — that stays completely untouched, it's a different
Google account context (Apps Script runs bound to the Sheet/inbox itself, not
called from Vercel).

---

## 4. Security Considerations

This design introduces genuinely more sensitive secrets than anything this
system has stored before (cookies are short-lived and revocable by design;
these are not):

1. **The Okta account password itself** must be stored server-side to
   automate login. This is qualitatively different from a cookie.
   **Strong recommendation, elevated to a near-hard-requirement here:**
   use a **dedicated bot/service Okta account**, not
   `eg.wakeel.ext@talabat.com`'s real human-owned credential if that's a
   personal account — for two independent reasons:
   - **Blast radius:** a leaked bot password is scoped/revocable by IT
     independently of a human's real corporate identity.
   - **This directly fixes the original "session collision" root cause**
     from the earlier investigation (a human logging in elsewhere kills the
     bot's session) — a dedicated account nobody else ever logs into removes
     that failure mode entirely, on top of enabling this feature.
2. **Gmail `refresh_token`** grants read access to the entire personal
   inbox, indefinitely, until revoked. Store it **only** as a Vercel
   encrypted environment variable — **not** in the Google Sheet (unlike the
   Rooster cookies, which are fine there since they're short-lived/rotated
   automatically). Same for the Okta password: Vercel env, never the Sheet.
3. **Least-privilege Gmail scope:** `gmail.readonly`, never
   `gmail.modify`/`gmail.settings.basic` — the engine only ever reads, never
   touches the inbox, the forwarding rule, or the existing Apps Script/label
   setup.
4. **Query narrowing:** search only `from:` the known Okta-forwarding sender
   pattern, `newer_than` the exact moment this login attempt started (not a
   broad inbox scan) — reduces both the chance of matching a stale/replayed
   OTP and the amount of inbox content the engine ever has to read.
5. **No credential ever logged.** Structured logs (`logStructured`, existing
   pattern) get event names/status/reasons only — this repo's existing
   convention already avoids logging secret values; the new modules follow
   the same rule explicitly for password/refresh_token/sessionToken/OTP.
6. **Zero change to the employee-facing Telegram bot or its Apps Script** —
   the new engine reads Gmail directly and independently; it does not read
   from Telegram, does not call the Telegram bot API for OTP purposes, and
   does not touch the Apps Script project at all.

---

## 5. Risks and Limitations (ranked by likelihood of blocking full automation)

| # | Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|---|
| 1 | `deliveryhero.okta.com` has migrated to Okta Identity Engine, where classic `POST /api/v1/authn` is deprecated/unavailable | Medium | High (needs the OIE "Interaction Code" API shape instead — same no-browser approach, different request/response shapes) | **Phase 0 feasibility probe** (below) determines this *before* full build |
| 2 | Okta / Cloudflare Access applies adaptive/risk-based policy (unfamiliar device, foreign IP/country — Vercel runs in `iad1`/US, the captured JWT showed a `country: EG` claim) and challenges with something beyond email OTP (push approval, CAPTCHA, "verify it's you" email link instead of a code) | Medium | High — no code can solve a human-approval push or CAPTCHA | Dedicated bot account (mitigates "unfamiliar device" flagging over time as it builds trust); if it happens, this specific login attempt fails cleanly and existing Telegram alert fires — **not a silent break** |
| 3 | Gmail OAuth refresh token expires after 7 days if the OAuth consent screen stays in Google's "Testing" publish status (Google's policy for unverified apps requesting restricted scopes) | Medium-High if left unaddressed | High (breaks "zero manual" weekly) | Recommend submitting the consent screen for Google verification (takes time, may need a privacy policy page); **interim mitigation**: proactively track token health and send a once-off Telegram reminder ~2 days before expected expiry, so a 30-second re-consent replaces routine involvement — not full manual auth-recovery |
| 4 | Okta rate-limits or temporarily locks the account after repeated automated attempts (e.g. if OTP arrives late and passCode is retried multiple times) | Low-Medium | Medium | Single attempt per detected failure, bounded retries, exponential backoff, and a cool-down before the *next* scheduled attempt (proactive keepalive is every 3h, plenty of spacing) |
| 5 | Vercel function `maxDuration` (default too short for a ~90s poll budget) | Low (config fix) | Low | Set `maxDuration` on this specific route; confirm current plan tier supports it |
| 6 | Gmail forwarding delay (rare, but SMTP forwarding is not always instant) exceeds the poll budget | Low | Medium (one failed attempt, not a break — retried at next trigger) | Generous but bounded poll window (~90s); failure here is a normal "this attempt didn't work, will retry" case, not fatal |
| 7 | Playwright fallback (only if Risk #1 fully blocks the API approach) does not run well on Vercel's default serverless functions (Chromium binary size/cold-start/execution limits) | N/A unless Risk #1 materializes | High | Would require `@sparticuz/chromium` + increased memory/duration, or moving this one job off Vercel entirely (e.g., a small dedicated worker) — explicitly **not** the preferred path; flagged only for completeness |

**Honest summary:** Risks #1 and #2 are the ones that actually determine
whether "zero manual intervention, ever" is achievable versus "manual
intervention drops from ~daily/weekly to a rare edge case, with a clear
alert when it happens." I cannot know which outcome we get without actually
probing Okta's live API — hence Phase 0 below runs a **safe, read-only-ish
probe** (it will submit real credentials but stop *before* triggering an
OTP send or completing login) to observe exactly which of these risks
materializes, before any further build effort.

---

## 6. Implementation Plan

**Phase 0 — Feasibility probe (small, fast, must pass before continuing)**
1. One `POST /api/v1/authn` call with the dedicated bot account's real
   credentials (once IT provisions one — see §4.1) or the current account if
   no dedicated one exists yet.
2. Inspect the response: does it return `MFA_REQUIRED` with an `email`
   factor (classic engine, our plan works as designed), or a redirect
   pointing at OIE endpoints (`/oauth2/.../v1/authorize` + `interaction_code`
   flow — plan adapts, same no-browser principle), or something unexpected
   (CAPTCHA/device-approval page — Playwright fallback discussion needed)?
3. **Stop immediately after observing the response type** — do not proceed
   to trigger a real OTP send during this probe unless explicitly continuing
   into Phase 1.
4. Report findings, get go/no-go before Phase 1.

**Phase 1 — Gmail OAuth bootstrap (one-time, human-in-the-loop by design)**
1. Create/confirm a GCP project + enable Gmail API.
2. Configure OAuth consent screen (External, `gmail.readonly` only).
3. Create OAuth Client (Desktop app type — simplest one-time flow).
4. `scripts/gmail-oauth-bootstrap.mjs` (local-only): opens the consent URL,
   user approves once, script exchanges the code for a `refresh_token`,
   prints it for you to paste into Vercel env vars. **This script never
   runs in production and is not part of any cron.**
5. Verify: a follow-up script queries Gmail for a real recent Okta OTP email
   and correctly parses the code — proves the read+parse path end-to-end
   before it's wired into the recovery engine.

**Phase 2 — Okta Authentication client**
1. Implement `oktaAuthnClient.ts` against whichever API shape Phase 0
   confirmed.
2. Implement `oktaSessionExchange.ts` (sessionToken → cookies), reusing the
   `tough-cookie`/redirect-following pattern already proven in
   `sessionKeepAlive.ts` today.
3. Unit-test each step against captured fixtures (no live calls in tests).

**Phase 3 — Engine + wiring**
1. `authRecovery/engine.ts` ties Phases 1+2 together as Layer 3.
2. Wire into `authRefresh.ts` as the final fallback after Layers 1–2.
3. `maxDuration` + logging + retry/backoff + the Telegram-only-on-total-failure
   behavior (reusing the exact existing alert code path/style).

**Phase 4 — Controlled real-world test**
1. Deliberately let Layers 1–2 fail against a test/expired cookie (not
   production-critical timing) and observe Layer 3 recover for real, once,
   under supervision, before trusting it unattended.

**Estimated effort:** Phase 0 (~30 min, needs your go-ahead + credentials),
Phase 1 (~1–2 hrs, needs ~10 min of your hands-on OAuth consent), Phases 2–4
(~1 day of focused implementation + testing).

---

## 7. Requirements Checklist

| Requirement | Status in this design |
|---|---|
| Zero impact on Telegram / employee workflow | ✅ Untouched — different Google/Gmail read path entirely, no shared code |
| Zero manual cookie extraction | ✅ Layer 3 obtains cookies itself via the Okta session exchange |
| Zero manual OTP entry | ✅ Read via Gmail API — **conditional on Phase 0 confirming the Okta API path** (see Risk #1/#2) |
| Production-grade implementation | ✅ Structured logging, retries/backoff, existing alerting conventions reused |
| Secure credential storage | ✅ Vercel env vars for password/refresh_token (not the Sheet); read-only Gmail scope only |
| Automatic retries | ✅ Bounded retries within one invocation + natural retry at next scheduled trigger |
| Proper logging | ✅ `logStructured`, same convention as all other Rooster Live code |
| Graceful failure | ✅ Structured failure reasons at every step, never throws unhandled |
| Telegram alert ONLY on complete failure | ✅ Reuses the exact existing "all layers exhausted" alert path — no new alert triggers for partial/expected states |

---

## 8. Probability of Success

- **Gmail OTP read/parse:** ~95% — standard, well-documented Google API,
  the only real risk is the one-time OAuth bootstrap and the Testing-mode
  token-expiry policy (both one-time/occasional, not per-recovery risks).
- **Okta programmatic login (Phase 0 outcome unknown until probed):**
  ~60–75% the classic/no-browser API path works cleanly; if it doesn't, an
  OIE-flavored equivalent very likely still exists (still no-browser), so
  realistically ~85%+ that *some* pure-API approach works, with Playwright
  as an explicit last resort I'd recommend against absorbing into this
  Vercel deployment.
- **Combined, fully unattended, end-to-end recovery on any given trigger:**
  my honest estimate is **~70–85%** once Phase 0 confirms the API shape and
  a dedicated bot account is in place — with the remaining cases caught by
  the existing Telegram alert (which the requirements explicitly treat as
  an acceptable outcome, not a failure of the design).

---

## Open items needing your decision before Phase 0 can start

1. Can IT/Talabat provision a **dedicated bot Okta account** for this
   integration (strongly recommended, see §4.1)? If not, Phase 0 would need
   to run against the existing personal account, which I'd rather avoid.
2. OK to proceed with Phase 0's live probe (submits real credentials to
   Okta, stops before completing login) once a bot account exists?
3. OK with `gmail.readonly` scope and the one-time manual OAuth consent step
   (~10 minutes of your time, once)?
