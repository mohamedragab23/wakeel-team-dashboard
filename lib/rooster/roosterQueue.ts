/**
 * SRS-013 §7.2 — "Request Queue" for the new Rooster-backed features.
 *
 * Implemented as a Redis-backed concurrency semaphore (max-N-concurrent),
 * not a real queue service — Upstash here is REST-only (not
 * ioredis-compatible), so BullMQ isn't usable, and given Rooster exposes
 * zero rate-limit headers (confirmed live, SRS-013 §2), a proactive cap on
 * concurrent outbound calls is the only protection available.
 *
 * Fail-open: if Redis isn't configured, or any Redis call errors, `fn` runs
 * immediately with zero throttling — a Redis outage must never fully block
 * a Rooster call. Mirrors the existing "optional Redis" philosophy used
 * throughout this codebase.
 */
import { redisDecr, redisExpire, redisIncr, isUpstashConfigured } from '@/lib/upstashRest';
import { recordMetric } from '@/lib/telemetry';

const QUEUE_KEY = 'rooster:queue:concurrent';
const DEFAULT_MAX_CONCURRENT = 2;
const DEFAULT_ACQUIRE_TIMEOUT_MS = 10_000;
const POLL_BASE_MS = 150;
// Safety net: if a process crashes mid-hold without releasing its slot, the
// counter self-resets after this many seconds rather than staying stuck
// forever (Redis EXPIRE on the counter key, set only when it's first created).
const SAFETY_TTL_SECONDS = 60;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Runs `fn` after acquiring one of `maxConcurrent` slots (default 2) in a
 * global, cross-instance semaphore. Waits (with jittered polling) up to
 * `acquireTimeoutMs` (default 10s) for a slot; fails open and runs `fn`
 * anyway past that timeout rather than blocking indefinitely.
 *
 * Records a `queue_wait_ms` telemetry sample every call (SRS-013 §13),
 * including the zero-wait case (proves the metric works even when nothing
 * is actually contended).
 */
export async function withRoosterQueue<T>(
  fn: () => Promise<T>,
  opts?: { maxConcurrent?: number; acquireTimeoutMs?: number }
): Promise<T> {
  if (!isUpstashConfigured()) {
    return fn();
  }

  const max = opts?.maxConcurrent ?? DEFAULT_MAX_CONCURRENT;
  const timeoutMs = opts?.acquireTimeoutMs ?? DEFAULT_ACQUIRE_TIMEOUT_MS;
  const startedWaitingAt = Date.now();
  let holdingSlot = false;

  // eslint-disable-next-line no-constant-condition
  while (true) {
    const count = await redisIncr(QUEUE_KEY);
    if (count === null) {
      // Redis error mid-acquire -- fail-open, proceed without a slot.
      break;
    }
    if (count === 1) {
      void redisExpire(QUEUE_KEY, SAFETY_TTL_SECONDS);
    }
    if (count <= max) {
      holdingSlot = true;
      break;
    }
    // Over capacity -- release the increment we just took and wait our turn.
    await redisDecr(QUEUE_KEY);
    if (Date.now() - startedWaitingAt > timeoutMs) {
      // Fail-open after the timeout rather than blocking forever.
      break;
    }
    await sleep(POLL_BASE_MS + Math.floor(Math.random() * 75));
  }

  const waitedMs = Date.now() - startedWaitingAt;
  void recordMetric({ feature: 'rooster_client', metric: 'queue_wait_ms', value: waitedMs });

  try {
    return await fn();
  } finally {
    if (holdingSlot) {
      await redisDecr(QUEUE_KEY);
    }
  }
}
