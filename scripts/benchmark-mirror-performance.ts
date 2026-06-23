/**
 * Mirror vs Sheets read latency benchmark (validation only).
 * Does NOT enable NEON_READ_REPLICA_ENABLED. No business logic execution.
 *
 * Usage: npm run benchmark:mirror
 */
import { config } from 'dotenv';
import fs from 'fs';
import path from 'path';
import { getSheetData } from '../lib/googleSheets';
import { isMirrorReadEnabled, MIRROR_SHEET_NAMES } from '../lib/mirror/config';
import { closeMirrorDb } from '../lib/mirror/db/client';
import { loadMirrorSheetRows } from '../lib/mirror/validation/loadMirrorRows';

config({ path: path.resolve('.env.local') });
config({ path: path.resolve('.env.vercel.prod') });

type Timed = { label: string; ms: number; rowCount: number };

async function timeSheets(sheets: string[]): Promise<Timed> {
  const start = performance.now();
  let rowCount = 0;
  for (const name of sheets) {
    const rows = await getSheetData(name, false);
    rowCount += rows.length;
  }
  return { label: 'google_sheets', ms: Math.round(performance.now() - start), rowCount };
}

async function timeMirror(sheets: string[]): Promise<Timed> {
  const start = performance.now();
  let rowCount = 0;
  for (const name of sheets) {
    const rows = (await loadMirrorSheetRows(name)) ?? [];
    rowCount += rows.length;
  }
  return { label: 'neon_mirror', ms: Math.round(performance.now() - start), rowCount };
}

function improvement(sheetsMs: number, mirrorMs: number): string {
  if (sheetsMs <= 0) return 'N/A';
  const pct = Math.round(((sheetsMs - mirrorMs) / sheetsMs) * 100);
  return mirrorMs < sheetsMs ? `${pct}% faster` : `${Math.abs(pct)}% slower`;
}

async function main() {
  if (isMirrorReadEnabled()) {
    console.error('[benchmark-mirror] Abort: NEON_READ_REPLICA_ENABLED must be false');
    process.exit(1);
  }

  const scenarios = [
    {
      name: 'Dashboard reads',
      sheets: ['المناديب', 'المشرفين', 'البيانات اليومية'],
      note: 'Same tabs loaded by getDashboardData (data fetch only)',
    },
    {
      name: 'Riders reads',
      sheets: ['المناديب'],
      note: 'Riders list source tab',
    },
    {
      name: 'Salary reads',
      sheets: ['إعدادات_الرواتب', 'المناديب'],
      note: 'Salary config + riders tabs (mirror-covered only)',
    },
    {
      name: 'Strategic Ops reads',
      sheets: ['البيانات اليومية', 'المناديب', 'المشرفين', 'إعدادات_الرواتب'],
      note: 'Mirror-covered input tabs only — no buildStrategicOpsReport execution',
    },
  ];

  const results: Array<{
    scenario: string;
    note: string;
    sheets: Timed;
    mirror: Timed;
    delta: string;
  }> = [];

  for (const sc of scenarios) {
    const sheets = await timeSheets(sc.sheets);
    const mirror = await timeMirror(sc.sheets);
    results.push({
      scenario: sc.name,
      note: sc.note,
      sheets,
      mirror,
      delta: improvement(sheets.ms, mirror.ms),
    });
  }

  const avgSheets = Math.round(results.reduce((s, r) => s + r.sheets.ms, 0) / results.length);
  const avgMirror = Math.round(results.reduce((s, r) => s + r.mirror.ms, 0) / results.length);

  const lines: string[] = [
    '# Mirror Performance Benchmark',
    '',
    `**Date:** ${new Date().toISOString().split('T')[0]}`,
    `**Method:** Cold read — Sheets API vs Neon SQL (mirror tables). No cache. No \`NEON_READ_REPLICA_ENABLED\`.`,
    '',
    '---',
    '',
    '## Summary',
    '',
    `| Metric | Google Sheets | Neon Mirror |`,
    `|--------|--------------:|------------:|`,
    `| Avg latency (4 scenarios) | **${avgSheets} ms** | **${avgMirror} ms** |`,
    `| Overall | — | **${improvement(avgSheets, avgMirror)}** |`,
    '',
    '---',
    '',
    '## Per-scenario results',
    '',
    '| Scenario | Sheets (ms) | Mirror (ms) | Rows | Delta |',
    '|----------|------------:|------------:|-----:|-------|',
  ];

  for (const r of results) {
    lines.push(
      `| ${r.scenario} | ${r.sheets.ms} | ${r.mirror.ms} | ${r.sheets.rowCount} | ${r.delta} |`
    );
  }

  lines.push(
    '',
    '### Notes',
    ''
  );
  for (const r of results) {
    lines.push(`- **${r.scenario}:** ${r.note}`);
  }

  lines.push(
    '',
    '---',
    '',
    '## Caveats',
    '',
    '- Benchmarks measure **raw tab fetch** only, not full API response assembly.',
    '- Strategic Ops / Talabat **logic was not executed** (per safety rules).',
    '- Mirror lacks tabs not in sync set (e.g. termination, debts) — full Strategic Ops still needs Sheets for non-mirror tabs.',
    '- Production reads remain on Sheets until `NEON_READ_REPLICA_ENABLED=true` on preview.',
    ''
  );

  const outPath = path.resolve('docs/enterprise-readiness/MIRROR_PERFORMANCE_BENCHMARK.md');
  fs.writeFileSync(outPath, lines.join('\n'), 'utf8');

  console.log(JSON.stringify({ results, avgSheets, avgMirror, reportPath: outPath }, null, 2));
  await closeMirrorDb();
}

main().catch((e) => {
  console.error('[benchmark-mirror] failed:', e);
  process.exit(1);
});
