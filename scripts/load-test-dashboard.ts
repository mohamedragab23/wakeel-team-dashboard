/**
 * Local load test: /api/health and /api/dashboard (401 expected without auth).
 * DO NOT run against production.
 */
import { assertLocalTarget, runConcurrent } from './load-test-utils';

const BASE = process.env.LOAD_TEST_BASE_URL || 'http://127.0.0.1:3000';
const SCENARIOS = [50, 100, 250, 500];

async function main() {
  assertLocalTarget(BASE);
  const results = [];

  for (const concurrency of SCENARIOS) {
    const health = await runConcurrent(concurrency, concurrency, async () => {
      const res = await fetch(`${BASE}/api/health`);
      if (!res.ok) throw new Error(String(res.status));
    });
    const dashboard = await runConcurrent(concurrency, concurrency, async () => {
      const res = await fetch(`${BASE}/api/dashboard`);
      if (res.status !== 401) throw new Error(`expected 401 got ${res.status}`);
    });
    results.push({ concurrency, health, dashboard });
    console.log(`[load-test-dashboard] concurrency=${concurrency}`, JSON.stringify({ health, dashboard }));
  }

  console.log(JSON.stringify({ base: BASE, results }, null, 2));
}

main().catch((e) => {
  console.error('[load-test-dashboard] failed:', e.message);
  process.exit(1);
});
