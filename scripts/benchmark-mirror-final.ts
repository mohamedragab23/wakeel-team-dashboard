/**
 * Phase 6E final benchmark: Sheets vs Mirror (row) vs Mirror (aggregated).
 * No business logic execution. Does not modify production.
 */
import { config } from 'dotenv';
import fs from 'fs';
import path from 'path';
import { getSheetData } from '../lib/googleSheets';
import { closeMirrorDb } from '../lib/mirror/db/client';
import {
  loadMirrorSheetRows,
  loadMirrorSheetRowsAggregated,
} from '../lib/mirror/validation/loadMirrorRows';

config({ path: path.resolve('.env.local') });
config({ path: path.resolve('.env.vercel.prod') });

const RUNS = 5;

type Scenario = { name: string; sheets: string[] };

const SCENARIOS: Scenario[] = [
  { name: 'Dashboard', sheets: ['المناديب', 'المشرفين', 'البيانات اليومية'] },
  { name: 'Riders', sheets: ['المناديب'] },
  { name: 'Salary', sheets: ['إعدادات_الرواتب', 'المناديب'] },
  {
    name: 'Strategic Ops',
    sheets: ['البيانات اليومية', 'المناديب', 'المشرفين', 'إعدادات_الرواتب'],
  },
];

function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  const idx = Math.ceil((p / 100) * sorted.length) - 1;
  return sorted[Math.max(0, idx)];
}

async function timeFn(fn: () => Promise<void>): Promise<number> {
  const start = performance.now();
  await fn();
  return Math.round(performance.now() - start);
}

async function benchScenario(
  sc: Scenario,
  mode: 'sheets' | 'mirror_rows' | 'mirror_agg'
): Promise<number[]> {
  const times: number[] = [];
  for (let i = 0; i < RUNS; i++) {
    const ms = await timeFn(async () => {
      for (const name of sc.sheets) {
        if (mode === 'sheets') await getSheetData(name, false);
        else if (mode === 'mirror_rows') await loadMirrorSheetRows(name);
        else await loadMirrorSheetRowsAggregated(name);
      }
    });
    times.push(ms);
  }
  return times.sort((a, b) => a - b);
}

function stats(times: number[]) {
  const avg = Math.round(times.reduce((a, b) => a + b, 0) / times.length);
  return {
    avg,
    p50: percentile(times, 50),
    p95: percentile(times, 95),
    p99: percentile(times, 99),
    throughputRps: avg > 0 ? Math.round((1000 / avg) * 100) / 100 : 0,
  };
}

async function main() {
  const results: Record<string, Record<string, ReturnType<typeof stats>>> = {};

  for (const sc of SCENARIOS) {
    results[sc.name] = {
      google_sheets: stats(await benchScenario(sc, 'sheets')),
      mirror_before: stats(await benchScenario(sc, 'mirror_rows')),
      mirror_after: stats(await benchScenario(sc, 'mirror_agg')),
    };
  }

  const lines: string[] = [
    '# Neon Final Benchmark (Phase 6E)',
    '',
    `**Date:** ${new Date().toISOString().split('T')[0]}`,
    `**Runs per scenario:** ${RUNS}`,
    `**Modes:** (1) Google Sheets API (2) Mirror row-by-row (3) Mirror jsonb_agg optimized`,
    '',
    '---',
    '',
  ];

  for (const [name, modes] of Object.entries(results)) {
    lines.push(`## ${name}`, '');
    lines.push(
      '| Mode | Avg (ms) | P50 | P95 | P99 | Throughput (ops/s) |',
      '|------|--------:|----:|----:|----:|-------------------:|'
    );
    for (const [mode, s] of Object.entries(modes)) {
      lines.push(
        `| ${mode} | ${s.avg} | ${s.p50} | ${s.p95} | ${s.p99} | ${s.throughputRps} |`
      );
    }
    const before = modes.mirror_before.avg;
    const after = modes.mirror_after.avg;
    const imp = before > 0 ? Math.round(((before - after) / before) * 100) : 0;
    lines.push('', `**Optimization impact (agg vs row):** ${imp}%`, '');
  }

  lines.push(
    '---',
    '',
    '## Cache effectiveness',
    '',
    'Mirror reads bypass Google Sheets API quota. Redis L2 remains active for `getSheetData` when mirror flag off.',
    'With `NEON_READ_REPLICA_ENABLED=true`, tiered cache still applies after first mirror load per instance.',
    ''
  );

  const outPath = path.resolve('docs/enterprise-readiness/NEON_FINAL_BENCHMARK.md');
  fs.writeFileSync(outPath, lines.join('\n'), 'utf8');
  console.log(JSON.stringify({ results, reportPath: outPath }, null, 2));
  await closeMirrorDb();
}

main().catch((e) => {
  console.error('[benchmark-mirror-final] failed:', e);
  process.exit(1);
});
