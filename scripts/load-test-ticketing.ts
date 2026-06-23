/**
 * Local load test: /api/ticketing (401 without auth).
 * DO NOT run against production.
 */
import { assertLocalTarget, runConcurrent } from './load-test-utils';

const BASE = process.env.LOAD_TEST_BASE_URL || 'http://127.0.0.1:3000';
const SCENARIOS = [50, 100, 250, 500];

async function main() {
  assertLocalTarget(BASE);
  const results = [];

  for (const concurrency of SCENARIOS) {
    const r = await runConcurrent(concurrency, concurrency, async () => {
      const res = await fetch(`${BASE}/api/ticketing`);
      if (res.status !== 401) throw new Error(`expected 401 got ${res.status}`);
    });
    results.push(r);
    console.log(`[load-test-ticketing] concurrency=${concurrency}`, JSON.stringify(r));
  }

  console.log(JSON.stringify({ base: BASE, results }, null, 2));
}

main().catch((e) => {
  console.error('[load-test-ticketing] failed:', e.message);
  process.exit(1);
});
