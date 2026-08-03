import assert from 'node:assert/strict';
import { afterEach, beforeEach, describe, it } from 'node:test';

/**
 * Fakes the Upstash Redis REST API (the same wire protocol used by both
 * `lib/upstashRest.ts` and `lib/redisCache.optional.ts`) with a plain
 * in-memory Map, so `recoveryLock.ts` can be exercised exactly as it runs
 * in production (real SETNX/GET/DEL/expiry semantics) without a real Redis
 * instance or a real network call.
 */
const store = new Map<string, string>();
let originalFetch: typeof fetch;

function jsonResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), { status: 200, headers: { 'content-type': 'application/json' } });
}

function installFakeUpstash(): void {
  store.clear();
  (globalThis as any).fetch = async (input: any): Promise<Response> => {
    const url = new URL(String(input));
    const segments = url.pathname.split('/').filter(Boolean).map(decodeURIComponent);
    const [cmd, ...rest] = segments;

    if (cmd === 'set') {
      const key = rest[0];
      const value = rest[1];
      const flags = rest.slice(2);
      if (flags.includes('NX')) {
        if (store.has(key)) return jsonResponse({ result: null });
        store.set(key, value);
        return jsonResponse({ result: 'OK' });
      }
      store.set(key, value);
      return jsonResponse({ result: 'OK' });
    }
    if (cmd === 'get') {
      const key = rest[0];
      return jsonResponse({ result: store.has(key) ? store.get(key) : null });
    }
    if (cmd === 'del') {
      let removed = 0;
      for (const key of rest) {
        if (store.delete(key)) removed += 1;
      }
      return jsonResponse({ result: removed });
    }
    return jsonResponse({ result: null });
  };
}

describe('recoveryLock (SRS-012 concurrency fix)', () => {
  beforeEach(() => {
    originalFetch = globalThis.fetch;
    process.env.UPSTASH_REDIS_REST_URL = 'https://fake-upstash.example.com';
    process.env.UPSTASH_REDIS_REST_TOKEN = 'fake-token';
    installFakeUpstash();
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    delete process.env.UPSTASH_REDIS_REST_URL;
    delete process.env.UPSTASH_REDIS_REST_TOKEN;
    store.clear();
  });

  it('only lets ONE caller acquire the full-recovery lock at a time -- this is the fix for concurrent Okta logins racing for the same Gmail OTP', async () => {
    const { acquireFullRecoveryLock, releaseFullRecoveryLock } = await import('./recoveryLock');

    const first = await acquireFullRecoveryLock();
    const second = await acquireFullRecoveryLock();
    const third = await acquireFullRecoveryLock();

    assert.equal(first, true, 'first caller should win the lock');
    assert.equal(second, false, 'a concurrent second caller must NOT also start its own Okta login');
    assert.equal(third, false, 'a concurrent third caller must NOT also start its own Okta login');

    await releaseFullRecoveryLock();
    const afterRelease = await acquireFullRecoveryLock();
    assert.equal(afterRelease, true, 'lock must be acquirable again once released');
  });

  it('lets a waiter reuse the in-flight holder\'s cached outcome instead of starting a second login', async () => {
    const { acquireFullRecoveryLock, cacheFullRecoveryOutcome, waitForCachedFullRecoveryOutcome } = await import(
      './recoveryLock'
    );

    const gotLock = await acquireFullRecoveryLock();
    assert.equal(gotLock, true);

    const outcome = { headers: { Cookie: 'CF_Authorization=abc' }, healedViaDeepSessionRefresh: false, healedViaFullRecovery: true };
    await cacheFullRecoveryOutcome(outcome);

    const reused = await waitForCachedFullRecoveryOutcome<typeof outcome>({ timeoutMs: 500, pollIntervalMs: 20 });
    assert.deepEqual(reused, outcome, 'a losing caller should reuse the exact result the lock holder produced');
  });

  it('a waiter times out with null (never throws) if no result appears in time, instead of blocking forever', async () => {
    const { waitForCachedFullRecoveryOutcome } = await import('./recoveryLock');

    const start = Date.now();
    const reused = await waitForCachedFullRecoveryOutcome({ timeoutMs: 100, pollIntervalMs: 20 });
    const elapsed = Date.now() - start;

    assert.equal(reused, null);
    assert.ok(elapsed >= 90, `should have actually waited close to the timeout, waited ${elapsed}ms`);
  });

  it('opens a cool-down window after a completed attempt, blocking an immediate next attempt', async () => {
    const { isFullRecoveryCoolingDown, startFullRecoveryCooldown } = await import('./recoveryLock');

    const before = await isFullRecoveryCoolingDown();
    assert.equal(before.cooling, false, 'no cooldown should be active yet');

    await startFullRecoveryCooldown(5_000);
    const during = await isFullRecoveryCoolingDown();
    assert.equal(during.cooling, true, 'a fresh attempt right after a completed one must be skipped');
    assert.ok((during.retryAfterMs ?? 0) > 0);
  });

  it('cool-down naturally expires -- a new attempt is allowed again afterwards', async () => {
    const { isFullRecoveryCoolingDown, startFullRecoveryCooldown } = await import('./recoveryLock');

    await startFullRecoveryCooldown(50);
    const stillCooling = await isFullRecoveryCoolingDown();
    assert.equal(stillCooling.cooling, true);

    await new Promise((resolve) => setTimeout(resolve, 80));
    const afterExpiry = await isFullRecoveryCoolingDown();
    assert.equal(afterExpiry.cooling, false, 'cooldown should have expired on its own');
  });

  it('fails open (no cross-instance protection, but never blocks) when Upstash is not configured', async () => {
    delete process.env.UPSTASH_REDIS_REST_URL;
    delete process.env.UPSTASH_REDIS_REST_TOKEN;

    const { acquireFullRecoveryLock, isFullRecoveryCoolingDown, waitForCachedFullRecoveryOutcome } = await import(
      './recoveryLock'
    );

    assert.equal(await acquireFullRecoveryLock(), true);
    assert.equal(await acquireFullRecoveryLock(), true, 'without Redis there is no cross-instance coordination possible');
    assert.equal((await isFullRecoveryCoolingDown()).cooling, false);
    assert.equal(await waitForCachedFullRecoveryOutcome({ timeoutMs: 50, pollIntervalMs: 10 }), null);
  });
});
