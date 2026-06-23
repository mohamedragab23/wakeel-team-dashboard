/**
 * Read-only Redis production audit (Phase 4A).
 * Usage: npx tsx scripts/audit-redis-production.ts
 * With production env: npx vercel env run --environment production -- npx tsx scripts/audit-redis-production.ts
 */
import { config } from 'dotenv';
import path from 'path';
import { isRedisCacheConfigured, redisCacheDelete, redisCacheGet, redisCacheSet } from '../lib/redisCache.optional';
import { tieredCacheDelete, tieredCacheGet, tieredCacheSet } from '../lib/tieredCache';
import { CACHE_KEYS } from '../lib/cache';

config({ path: path.resolve('.env.local') });
config({ path: path.resolve('.env.vercel.prod') });

const AUDIT_KEY = 'audit:redis-production-probe';

async function timed<T>(label: string, fn: () => Promise<T>): Promise<{ label: string; ms: number; ok: boolean }> {
  const start = performance.now();
  try {
    await fn();
    return { label, ms: Math.round(performance.now() - start), ok: true };
  } catch {
    return { label, ms: Math.round(performance.now() - start), ok: false };
  }
}

async function main() {
  const report: Record<string, unknown> = {
    auditedAt: new Date().toISOString(),
    environment: process.env.VERCEL_ENV || process.env.NODE_ENV || 'local',
    configured: isRedisCacheConfigured(),
    urlPresent: Boolean(
      process.env.UPSTASH_REDIS_REST_URL?.trim() || process.env.KV_REST_API_URL?.trim()
    ),
    tokenPresent: Boolean(
      process.env.UPSTASH_REDIS_REST_TOKEN?.trim() || process.env.KV_REST_API_TOKEN?.trim()
    ),
    tieredEnabled: isRedisCacheConfigured(),
    latencies: [] as Array<{ label: string; ms: number; ok: boolean }>,
    cacheSimulation: {} as Record<string, unknown>,
    invalidation: {} as Record<string, unknown>,
  };

  if (!isRedisCacheConfigured()) {
    report.runtimeStatus = 'INACTIVE — UPSTASH_REDIS_REST_URL/TOKEN not set';
    report.recommendation = 'Set Upstash env vars on Vercel production and redeploy';
    console.log(JSON.stringify(report, null, 2));
    process.exit(0);
  }

  report.runtimeStatus = 'ACTIVE';

  // Latency probes
  const latencies = [];
  latencies.push(await timed('redis_ping_set', () => redisCacheSet(AUDIT_KEY, { probe: true }, 60_000)));
  latencies.push(await timed('redis_ping_get', () => redisCacheGet(AUDIT_KEY)));
  latencies.push(await timed('redis_ping_delete', () => redisCacheDelete(AUDIT_KEY)));
  report.latencies = latencies;

  // Cache hit simulation (L1 miss → L2 hit → L1 hit)
  const simKey = CACHE_KEYS.dashboardData('AUDIT', 'probe');
  await tieredCacheDelete(simKey);
  const payload = { totalHours: 1, probe: true };

  const missMs = performance.now();
  const miss = await tieredCacheGet(simKey);
  const missLatency = Math.round(performance.now() - missMs);

  await tieredCacheSet(simKey, payload, 120_000);

  const l2Ms = performance.now();
  const fromL2 = await tieredCacheGet(simKey);
  const l2Latency = Math.round(performance.now() - l2Ms);

  const l1Ms = performance.now();
  const fromL1 = await tieredCacheGet(simKey);
  const l1Latency = Math.round(performance.now() - l1Ms);

  await tieredCacheDelete(simKey);

  const hits = [fromL2, fromL1].filter(Boolean).length;
  const attempts = 3;
  report.cacheSimulation = {
    missLatencyMs: missLatency,
    l2HitLatencyMs: l2Latency,
    l1HitLatencyMs: l1Latency,
    simulatedHits: hits,
    simulatedMisses: attempts - (miss ? 1 : 0) - hits,
    estimatedHitRatioPct: Math.round((hits / attempts) * 100),
    keyPrefixes: ['dashboard:', 'riders:', 'ridersData:', 'strategic-ops:', 'salary:', 'sheet:'],
  };

  const invStart = performance.now();
  await tieredCacheDelete(simKey);
  const afterDelete = await tieredCacheGet(simKey);
  report.invalidation = {
    deleteLatencyMs: Math.round(performance.now() - invStart),
    keyGoneAfterDelete: afterDelete === null,
  };

  console.log(JSON.stringify(report, null, 2));
}

main().catch((e) => {
  console.error('[audit-redis-production] failed:', e);
  process.exit(1);
});
