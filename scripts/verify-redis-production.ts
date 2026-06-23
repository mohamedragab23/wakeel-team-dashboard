/**
 * Redis production verification (read-only).
 * No Google Sheets writes. Uses synthetic cache keys only.
 *
 * Usage:
 *   npm run verify:redis
 *   npx vercel env run --environment production -- npx tsx scripts/verify-redis-production.ts
 */
import { config } from 'dotenv';
import path from 'path';
import { CACHE_KEYS } from '../lib/cache';
import {
  getRedisRestToken,
  getRedisRestUrl,
  isRedisCacheConfigured,
  redisCacheDelete,
  redisCacheGet,
  redisCacheSet,
} from '../lib/redisCache.optional';
import { tieredCacheDelete, tieredCacheGet, tieredCacheSet } from '../lib/tieredCache';

config({ path: path.resolve('.env.local') });
config({ path: path.resolve('.env.vercel.prod') });
config({ path: path.resolve('.env.development.local') });

const PROBE = 'verify:redis-prod';

type Timed = { label: string; ms: number; ok: boolean };

async function timed<T>(label: string, fn: () => Promise<T>): Promise<Timed> {
  const start = performance.now();
  try {
    await fn();
    return { label, ms: Math.round(performance.now() - start), ok: true };
  } catch {
    return { label, ms: Math.round(performance.now() - start), ok: false };
  }
}

async function verifyDomainCache(
  label: string,
  key: string,
  payload: Record<string, unknown>
): Promise<Record<string, unknown>> {
  await tieredCacheDelete(key);

  const coldStart = performance.now();
  const miss = await tieredCacheGet(key);
  const coldMs = Math.round(performance.now() - coldStart);

  await tieredCacheSet(key, payload, 120_000);

  const l2Start = performance.now();
  const l2Hit = await tieredCacheGet(key);
  const l2Ms = Math.round(performance.now() - l2Start);

  const l1Start = performance.now();
  const l1Hit = await tieredCacheGet(key);
  const l1Ms = Math.round(performance.now() - l1Start);

  await tieredCacheDelete(key);
  const afterDelete = await tieredCacheGet(key);

  const hits = Number(Boolean(l2Hit)) + Number(Boolean(l1Hit));
  return {
    label,
    keyPrefix: key.split(':')[0] + ':',
    coldMissMs: coldMs,
    l2HitMs: l2Ms,
    l1HitMs: l1Ms,
    l2Populated: l2Hit !== null,
    l1Populated: l1Hit !== null,
    invalidated: afterDelete === null,
    hitRatioPct: Math.round((hits / 2) * 100),
  };
}

async function main() {
  const url = getRedisRestUrl();
  const tokenPresent = Boolean(getRedisRestToken());
  const configured = isRedisCacheConfigured();

  const report: Record<string, unknown> = {
    verifiedAt: new Date().toISOString(),
    environment: process.env.VERCEL_ENV || 'local',
    runtimeConnection: {
      configured,
      urlPresent: Boolean(url),
      tokenPresent,
      urlSource: process.env.UPSTASH_REDIS_REST_URL?.trim()
        ? 'UPSTASH_REDIS_REST_URL'
        : process.env.KV_REST_API_URL?.trim()
          ? 'KV_REST_API_URL'
          : 'none',
      tokenSource: process.env.UPSTASH_REDIS_REST_TOKEN?.trim()
        ? 'UPSTASH_REDIS_REST_TOKEN'
        : process.env.KV_REST_API_TOKEN?.trim()
          ? 'KV_REST_API_TOKEN'
          : 'none',
      status: configured ? 'ACTIVE' : 'INACTIVE',
    },
  };

  if (!configured) {
    report.verdict = 'FAIL — Redis env vars not set';
    report.recommendation =
      'Run: vercel integration add upstash/upstash-kv -n wakeel-redis-cache -m primaryRegion=iad1 -p free';
    console.log(JSON.stringify(report, null, 2));
    process.exit(1);
  }

  // 1–3: Runtime connection, reads, writes
  const pingSet = await timed('redis_write_set', () =>
    redisCacheSet(`${PROBE}:ping`, { ts: Date.now() }, 60_000)
  );
  const pingGet = await timed('redis_read_get', async () => {
    const v = await redisCacheGet<{ ts: number }>(`${PROBE}:ping`);
    if (!v?.ts) throw new Error('read miss');
  });
  const pingDel = await timed('redis_write_delete', () => redisCacheDelete(`${PROBE}:ping`));

  report.readWrite = {
    writeSet: pingSet,
    readGet: pingGet,
    writeDelete: pingDel,
    allOk: pingSet.ok && pingGet.ok && pingDel.ok,
  };

  // 4: Cache hit ratio (tiered simulation)
  const ratioKey = CACHE_KEYS.dashboardData('VERIFY', 'ratio');
  await tieredCacheDelete(ratioKey);
  const attempts = 3;
  let hits = 0;
  const miss1 = await tieredCacheGet(ratioKey);
  if (!miss1) hits += 0;
  await tieredCacheSet(ratioKey, { probe: true }, 120_000);
  const hit2 = await tieredCacheGet(ratioKey);
  if (hit2) hits += 1;
  const hit3 = await tieredCacheGet(ratioKey);
  if (hit3) hits += 1;
  await tieredCacheDelete(ratioKey);

  report.cacheHitRatio = {
    attempts,
    hits,
    misses: attempts - hits,
    hitRatioPct: Math.round((hits / attempts) * 100),
    missRatioPct: Math.round(((attempts - hits) / attempts) * 100),
  };

  // 5–8: Domain caches
  const domains = await Promise.all([
    verifyDomainCache('strategic_ops', CACHE_KEYS.strategicOpsReport({
      startDate: '2026-01-01',
      endDate: '2026-01-31',
      zone: 'VERIFY',
      supervisorCode: 'VERIFY',
      scopeKey: 'probe',
      talabatKey: 'probe',
    }), { report: 'probe' }),
    verifyDomainCache('riders', CACHE_KEYS.supervisorRiders('VERIFY'), { riders: [] }),
    verifyDomainCache('salary', CACHE_KEYS.salaryCalculation('VERIFY', '2026-01-01', '2026-01-31'), { total: 0 }),
    verifyDomainCache('dashboard', CACHE_KEYS.dashboardData('VERIFY', 'last'), { totalHours: 0 }),
  ]);
  report.domainCaches = domains;

  // 9: Latency before/after
  const latencies = [pingSet, pingGet, pingDel];
  const domainCold = domains.map((d) => (d as { coldMissMs: number }).coldMissMs);
  const domainL2 = domains.map((d) => (d as { l2HitMs: number }).l2HitMs);
  const avg = (arr: number[]) => Math.round(arr.reduce((a, b) => a + b, 0) / arr.length);

  report.latency = {
    redisPingMs: latencies,
    beforeCacheAvgMs: avg(domainCold),
    afterCacheL2AvgMs: avg(domainL2),
    improvementPct:
      avg(domainCold) > 0
        ? Math.round(((avg(domainCold) - avg(domainL2)) / avg(domainCold)) * 100)
        : 0,
  };

  const allDomainsOk = domains.every(
    (d) =>
      (d as { l2Populated: boolean }).l2Populated &&
      (d as { l1Populated: boolean }).l1Populated &&
      (d as { invalidated: boolean }).invalidated
  );

  report.verdict =
    pingSet.ok && pingGet.ok && pingDel.ok && allDomainsOk ? 'PASS' : 'FAIL';

  console.log(JSON.stringify(report, null, 2));
  process.exit(report.verdict === 'PASS' ? 0 : 1);
}

main().catch((e) => {
  console.error('[verify-redis-production] failed:', e);
  process.exit(1);
});
