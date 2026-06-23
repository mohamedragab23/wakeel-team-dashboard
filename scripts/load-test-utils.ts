/**
 * Shared load-test helpers — LOCAL ONLY (never production).
 */

export const FORBIDDEN_HOSTS = ['wakeel-team-dashboard.vercel.app', 'vercel.app'];

export function assertLocalTarget(baseUrl: string): void {
  const u = new URL(baseUrl);
  if (FORBIDDEN_HOSTS.some((h) => u.hostname.includes(h))) {
    throw new Error(`Load tests blocked against production host: ${u.hostname}`);
  }
  if (!['localhost', '127.0.0.1'].includes(u.hostname)) {
    throw new Error(`Load tests allowed only against localhost/127.0.0.1, got ${u.hostname}`);
  }
}

export function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  const idx = Math.ceil((p / 100) * sorted.length) - 1;
  return sorted[Math.max(0, Math.min(sorted.length - 1, idx))];
}

export type LoadScenarioResult = {
  concurrency: number;
  total: number;
  errors: number;
  errorRatePct: number;
  p50Ms: number;
  p95Ms: number;
  p99Ms: number;
  memHeapMb: number;
};

export async function runConcurrent(
  concurrency: number,
  total: number,
  fn: () => Promise<void>
): Promise<LoadScenarioResult> {
  const latencies: number[] = [];
  let errors = 0;
  let next = 0;

  async function worker() {
    while (true) {
      const i = next++;
      if (i >= total) break;
      const start = performance.now();
      try {
        await fn();
      } catch {
        errors++;
      } finally {
        latencies.push(Math.round(performance.now() - start));
      }
    }
  }

  await Promise.all(Array.from({ length: concurrency }, () => worker()));
  latencies.sort((a, b) => a - b);
  const mem = process.memoryUsage().heapUsed / 1024 / 1024;

  return {
    concurrency,
    total,
    errors,
    errorRatePct: Math.round((errors / total) * 1000) / 10,
    p50Ms: percentile(latencies, 50),
    p95Ms: percentile(latencies, 95),
    p99Ms: percentile(latencies, 99),
    memHeapMb: Math.round(mem * 10) / 10,
  };
}
