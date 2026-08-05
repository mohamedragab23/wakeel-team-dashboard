/**
 * SRS-012 follow-up (2026-08-03) — cross-instance coordination for Layer 3
 * (full Okta username/password + Gmail-OTP login).
 *
 * **Root cause of the live bug this fixes:** `recoverRoosterAuthFully()` had
 * zero concurrency protection. Whenever more than one caller hit a dead
 * session around the same time (e.g. the "استيراد تلقائي من Rooster" button
 * in the dashboard + the `rooster-keepalive`/`rooster-live-sync` crons, or
 * even just the same sync's own per-page retry loop across several 401s in
 * a row), EACH caller independently started its own real Okta
 * username/password login and triggered its OWN "send OTP" email. Okta's
 * email-OTP `passCode` only validates against the exact `stateToken` of the
 * login attempt that requested it — but `gmailOtpReader.ts` searches Gmail
 * by sender + subject only (there is no per-attempt identifier Okta puts in
 * the email itself), so two concurrent attempts race for whichever OTP
 * email happens to be returned first. Whoever's flow reads the *other*
 * flow's code fails verification with a valid-looking, just-arrived code —
 * exactly the symptom reported: the dashboard "keeps logging in one after
 * another and failing" while "the codes DO arrive on Gmail, it just never
 * logs in". Each failure then triggered yet another full login attempt,
 * repeating the race indefinitely (and risking an Okta rate-limit/lockout —
 * this exact failure mode was flagged as Risk #4 in
 * `docs/SRS012_AUTH_RECOVERY_ENGINE_DESIGN.md` but the "single attempt +
 * cool-down" mitigation described there was never actually implemented).
 *
 * This module adds the missing mitigation, using the exact same
 * optional/fail-open Upstash Redis primitives already used by
 * `lib/rooster/roosterCache.ts` (single-flight lock) and
 * `lib/rooster/roosterQueue.ts` (semaphore) for the *new* Rooster features —
 * reused here, not reinvented, for the *existing* Live-3PL/export auth path:
 *
 * 1. **Single-flight lock** (`acquireFullRecoveryLock`/`releaseFullRecoveryLock`):
 *    only one Layer-3 login runs at a time, cross-instance. Every other
 *    concurrent caller waits briefly for that one attempt's result
 *    (`waitForCachedFullRecoveryOutcome`) instead of starting a second,
 *    racing Okta login.
 * 2. **Cooldown** (`isFullRecoveryCoolingDown`/`startFullRecoveryCooldown`):
 *    after ANY completed attempt (success or failure) a short window opens
 *    during which a brand new Layer-3 attempt is skipped outright — this is
 *    what stops rapid sequential retries (not just truly concurrent ones)
 *    from hammering Okta one login after another.
 *
 * Fail-open, matching the rest of this codebase: with no Upstash Redis
 * configured, the lock is always "acquired" (single-instance dev/local use
 * is unaffected) and the cooldown is always "not active" — i.e. this module
 * is a pure safety net on top of production's existing Redis, never a new
 * hard dependency.
 *
 * 2026-08-05 follow-up: the lock + 90s cooldown above stop the *concurrency*
 * race, but on their own still allow up to ~40 real Okta login attempts/hour
 * for as long as some future, still-unknown cause keeps making every single
 * attempt fail cleanly one after another (this incident's actual root cause
 * turned out to be the Gmail OAuth refresh token's 7-day Testing-mode
 * expiry — see `gmailOtpReader.ts` — but that is exactly the kind of thing
 * that can recur or have a sibling cause later). `recordFullRecoveryFailure`
 * adds a 3-strikes breaker on top: after 3 consecutive failures it extends
 * the cooldown to `TRIPPED_COOLDOWN_MS` and reports `tripped: true` so the
 * caller can fire one clearly-worded, deduplicated alert instead of staying
 * in an unbounded 90s retry loop against a persistently broken credential.
 */
import { redisSetNx, redisDel, redisIncr, redisExpire, isUpstashConfigured } from '@/lib/upstashRest';
import { redisCacheGet, redisCacheSet } from '@/lib/redisCache.optional';

const LOCK_KEY = 'rooster:auth:full_recovery:lock';
/** Generous upper bound on one full Layer-3 attempt: Okta login + trigger
 *  (~seconds) + up to 90s of Gmail OTP polling + the CF Access redirect
 *  chain + a final dhh_token mint. Also doubles as the safety-net TTL if a
 *  process crashes mid-attempt without releasing the lock. */
const LOCK_TTL_SECONDS = 150;

const COOLDOWN_KEY = 'rooster:auth:full_recovery:cooldown_until';
/** Matches SRS-012 §5 Risk #4's intended mitigation ("cool-down before the
 *  next scheduled attempt") — long enough to absorb a burst of sequential
 *  401s/retries from one sync run without ever hammering Okta, short enough
 *  that a genuinely fixed session doesn't stay artificially blocked. */
const DEFAULT_COOLDOWN_MS = 90_000;

const OUTCOME_KEY = 'rooster:auth:full_recovery:last_outcome';
/** Kept just long enough for concurrent waiters from the same burst to pick
 *  it up; not meant as a general-purpose cache (the minted `dhh_token` it
 *  may contain has its own much longer real TTL, reusing it for a minute is
 *  harmless). */
const OUTCOME_TTL_MS = 60_000;

const FAILCOUNT_KEY = 'rooster:auth:full_recovery:failcount';
const FAILCOUNT_WINDOW_SECONDS = 60 * 60; // consecutive-failure counting window
const TRIP_THRESHOLD = 3; // consecutive failures before extending the cooldown
const TRIPPED_COOLDOWN_MS = 2 * 60 * 60 * 1000; // extended backoff once tripped

const TRIP_ALERT_DEDUPE_KEY = 'rooster:auth:full_recovery:trip_alert_sent';
const TRIP_ALERT_DEDUPE_SECONDS = TRIPPED_COOLDOWN_MS / 1000; // one alert per trip window, not one per attempt

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Attempts to become the single, cross-instance holder of the Layer-3
 * recovery attempt. Returns `true` when Redis isn't configured (fail-open —
 * nothing else to coordinate with).
 */
export async function acquireFullRecoveryLock(): Promise<boolean> {
  if (!isUpstashConfigured()) return true;
  return redisSetNx(LOCK_KEY, String(Date.now()), LOCK_TTL_SECONDS);
}

/** Always safe to call even if the lock was never actually held (no-op then). */
export async function releaseFullRecoveryLock(): Promise<void> {
  await redisDel(LOCK_KEY);
}

/** Whether a Layer-3 attempt should be skipped right now because a previous
 *  one (success or failure) just finished within the cool-down window. */
export async function isFullRecoveryCoolingDown(): Promise<{ cooling: boolean; retryAfterMs?: number }> {
  const until = await redisCacheGet<number>(COOLDOWN_KEY);
  if (typeof until === 'number' && until > Date.now()) {
    return { cooling: true, retryAfterMs: until - Date.now() };
  }
  return { cooling: false };
}

/** Opens a cool-down window starting now — call once per completed attempt. */
export async function startFullRecoveryCooldown(durationMs: number = DEFAULT_COOLDOWN_MS): Promise<void> {
  await redisCacheSet(COOLDOWN_KEY, Date.now() + durationMs, durationMs);
}

/**
 * Call once per genuinely failed Layer-3 attempt (not for the "cooldown
 * already active" fast-fail — that isn't a real Okta attempt). Increments
 * the consecutive-failure counter; once it reaches `TRIP_THRESHOLD`, extends
 * the cooldown to `TRIPPED_COOLDOWN_MS` and returns `tripped: true`.
 */
export async function recordFullRecoveryFailure(): Promise<{ tripped: boolean; consecutiveFailures: number }> {
  if (!isUpstashConfigured()) return { tripped: false, consecutiveFailures: 0 };
  const count = await redisIncr(FAILCOUNT_KEY);
  if (count === null) return { tripped: false, consecutiveFailures: 0 };
  void redisExpire(FAILCOUNT_KEY, FAILCOUNT_WINDOW_SECONDS);
  if (count >= TRIP_THRESHOLD) {
    await startFullRecoveryCooldown(TRIPPED_COOLDOWN_MS);
    return { tripped: true, consecutiveFailures: count };
  }
  return { tripped: false, consecutiveFailures: count };
}

/** Call once per successful Layer-3 attempt — clears the streak so a later, unrelated failure doesn't inherit it. */
export async function resetFullRecoveryFailureCount(): Promise<void> {
  await redisDel(FAILCOUNT_KEY);
}

/** True only once per trip window — caller uses this to decide whether to send the special "automation paused itself" alert. */
export async function shouldSendFullRecoveryTripAlert(): Promise<boolean> {
  if (!isUpstashConfigured()) return true; // no dedupe available -- better to over-alert than stay silent
  return redisSetNx(TRIP_ALERT_DEDUPE_KEY, String(Date.now()), TRIP_ALERT_DEDUPE_SECONDS);
}

/** Publishes the just-completed attempt's outcome for any concurrent waiters. */
export async function cacheFullRecoveryOutcome<T>(outcome: T): Promise<void> {
  await redisCacheSet(OUTCOME_KEY, outcome, OUTCOME_TTL_MS);
}

/**
 * For a caller that lost the lock race: polls briefly for the in-flight
 * holder's result instead of starting a second, racing Okta login. Returns
 * `null` (never throws) if nothing shows up within `timeoutMs` — the caller
 * is expected to fail fast in that case (see `authRefresh.ts`) rather than
 * block for the holder's full ~150s budget.
 */
export async function waitForCachedFullRecoveryOutcome<T>(params?: {
  timeoutMs?: number;
  pollIntervalMs?: number;
}): Promise<T | null> {
  const timeoutMs = params?.timeoutMs ?? 15_000;
  const pollIntervalMs = params?.pollIntervalMs ?? 2_000;
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    const cached = await redisCacheGet<T>(OUTCOME_KEY);
    if (cached !== null) return cached;
    await sleep(pollIntervalMs);
  }
  return null;
}
