/**
 * SRS-014 Phase 4D.5 — fail-closed Redis NX lock for financial apply.
 *
 * NEVER reuse acquireAutoDeductionLock (fail-open when Redis unset).
 * Unconfigured / transport failure ⇒ redis_unavailable (no financial mutation).
 */

import { randomUUID } from 'node:crypto';
import type { FinancialApplyLock } from '@/lib/equipmentDeductions/financialApply';
import {
  isUpstashConfigured,
  redisDel,
  redisGet,
  redisSetNxDetailed,
  type RedisSetNxDetailedResult,
} from '@/lib/upstashRest';

/** Bounded TTL for one financial-apply attempt. */
export const FINANCIAL_APPLY_LOCK_TTL_SECONDS = 120;

const LOCK_PREFIX = 'srs014:financial_apply:lock:';

export function financialApplyLockRedisKey(economicKey: string): string {
  return `${LOCK_PREFIX}${String(economicKey || '').trim()}`;
}

function newLockToken(): string {
  if (typeof randomUUID === 'function') return randomUUID();
  return `fal_${Date.now()}_${Math.random().toString(36).slice(2)}`;
}

export type FinancialApplyLockRedisPort = {
  isConfigured: () => boolean;
  setNx: (
    key: string,
    value: string,
    ttlSeconds: number
  ) => Promise<RedisSetNxDetailedResult>;
  get: (key: string) => Promise<string | null>;
  del: (key: string) => Promise<void>;
};

/** Production Redis port — fail-closed when Upstash is unset or transport fails. */
export function createProductionFinancialApplyLockRedis(): FinancialApplyLockRedisPort {
  return {
    isConfigured: () => isUpstashConfigured(),
    setNx: (key, value, ttl) => redisSetNxDetailed(key, value, ttl),
    get: (key) => redisGet(key),
    del: async (key) => {
      await redisDel(key);
    },
  };
}

/**
 * Acquire exclusive lock on economicKey.
 * Redis unset / transport error → redis_unavailable (fail closed).
 * NX miss → lock_busy.
 */
export async function acquireFinancialApplyLock(
  economicKey: string,
  redis: FinancialApplyLockRedisPort = createProductionFinancialApplyLockRedis(),
  ttlSeconds: number = FINANCIAL_APPLY_LOCK_TTL_SECONDS
): Promise<FinancialApplyLock> {
  const key = financialApplyLockRedisKey(economicKey);
  if (!String(economicKey || '').trim()) {
    return { ok: false, reason: 'lock_busy' };
  }
  if (!redis.isConfigured()) {
    return { ok: false, reason: 'redis_unavailable' };
  }

  const token = newLockToken();
  const nx = await redis.setNx(key, token, ttlSeconds);
  if (nx === 'unavailable') {
    return { ok: false, reason: 'redis_unavailable' };
  }
  if (nx !== 'acquired') {
    return { ok: false, reason: 'lock_busy' };
  }

  return {
    ok: true,
    release: async () => {
      const cur = await redis.get(key);
      if (cur === token) await redis.del(key);
    },
  };
}

/** Pure helper for tests: only matching owner may release. */
export function canReleaseFinancialApplyLock(
  currentValue: string | null,
  token: string
): boolean {
  return Boolean(token) && currentValue === token;
}

/**
 * In-process exclusive lock that still fail-closes on empty key.
 * For unit tests that do not need Redis semantics.
 */
export function createMemoryFailClosedLockRedis(opts?: {
  configured?: boolean;
  /** Force next setNx results in order, then 'acquired'. */
  setNxQueue?: RedisSetNxDetailedResult[];
}): FinancialApplyLockRedisPort & {
  held: Map<string, string>;
  setConfigured: (v: boolean) => void;
} {
  let configured = opts?.configured !== false;
  const held = new Map<string, string>();
  const queue = [...(opts?.setNxQueue || [])];
  return {
    held,
    setConfigured(v) {
      configured = v;
    },
    isConfigured: () => configured,
    async setNx(key, value, _ttl) {
      if (!configured) return 'unavailable';
      if (queue.length > 0) {
        const next = queue.shift()!;
        if (next === 'acquired') held.set(key, value);
        return next;
      }
      if (held.has(key)) return 'busy';
      held.set(key, value);
      return 'acquired';
    },
    async get(key) {
      return held.get(key) ?? null;
    },
    async del(key) {
      held.delete(key);
    },
  };
}
