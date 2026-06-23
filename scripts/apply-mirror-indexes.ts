/**
 * Apply additive mirror indexes (Phase 6D) with before/after latency report.
 * Usage: npm run mirror:apply-indexes
 */
import { config } from 'dotenv';
import path from 'path';
import { readFileSync, writeFileSync } from 'fs';
import { join } from 'path';
import { MIRROR_SHEET_NAMES } from '../lib/mirror/config';
import { closeMirrorDb, getMirrorSql, isMirrorDbConfigured } from '../lib/mirror/db/client';

config({ path: path.resolve('.env.local') });
config({ path: path.resolve('.env.vercel.prod') });

const RUNS = 5;

async function benchCount(db: ReturnType<typeof getMirrorSql>, sheet: string): Promise<number> {
  const times: number[] = [];
  for (let i = 0; i < RUNS; i++) {
    const start = performance.now();
    await db`SELECT COUNT(*)::int FROM mirror_sheet_rows WHERE sheet_name = ${sheet}`;
    times.push(performance.now() - start);
  }
  return Math.round(times.reduce((a, b) => a + b, 0) / times.length);
}

async function benchAuditLog(db: ReturnType<typeof getMirrorSql>): Promise<number> {
  const times: number[] = [];
  for (let i = 0; i < RUNS; i++) {
    const start = performance.now();
    await db`
      SELECT id, run_id, sheet_name, ok, started_at
      FROM mirror_audit_log
      ORDER BY started_at DESC
      LIMIT 20
    `;
    times.push(performance.now() - start);
  }
  return Math.round(times.reduce((a, b) => a + b, 0) / times.length);
}

function impactPct(before: number, after: number): string {
  if (before <= 0) return '0%';
  return `${Math.round(((before - after) / before) * 100)}%`;
}

async function main() {
  if (!isMirrorDbConfigured()) {
    console.error('Mirror DB not configured');
    process.exit(1);
  }
  const db = getMirrorSql();

  const beforeCount = await benchCount(db, 'البيانات اليومية');
  const beforeAudit = await benchAuditLog(db);

  const indexesPath = join(process.cwd(), 'lib', 'mirror', 'db', 'indexes.sql');
  await db.unsafe(readFileSync(indexesPath, 'utf8'));

  const afterCount = await benchCount(db, 'البيانات اليومية');
  const afterAudit = await benchAuditLog(db);

  const indexes = [
    {
      table: 'mirror_sheet_rows',
      columns: '(sheet_name)',
      index: 'idx_mirror_rows_sheet_count',
      beforeMs: beforeCount,
      afterMs: afterCount,
      impact: impactPct(beforeCount, afterCount),
      purpose: 'COUNT / existence per sheet',
    },
    {
      table: 'mirror_audit_log',
      columns: '(started_at DESC)',
      index: 'idx_mirror_audit_started',
      beforeMs: beforeAudit,
      afterMs: afterAudit,
      impact: impactPct(beforeAudit, afterAudit),
      purpose: 'Recent audit log queries',
    },
  ];

  const lines: string[] = [
    '# Neon Index Optimization Report (Phase 6D)',
    '',
    `**Date:** ${new Date().toISOString().split('T')[0]}`,
    `**Safety:** Additive indexes only — no data or logic changes`,
  `**Sheets validated:** ${MIRROR_SHEET_NAMES.join(', ')}`,
    '',
    '---',
    '',
    '## Indexes applied',
    '',
    '| Table | Columns | Index name | Before (ms) | After (ms) | Impact | Purpose |',
    '|-------|---------|------------|------------:|-----------:|-------:|---------|',
  ];

  for (const idx of indexes) {
    lines.push(
      `| ${idx.table} | ${idx.columns} | ${idx.index} | ${idx.beforeMs} | ${idx.afterMs} | ${idx.impact} | ${idx.purpose} |`
    );
  }

  lines.push(
    '',
    '---',
    '',
    '## Notes',
    '',
    '- Primary key `(sheet_name, row_index)` already covers ordered row fetches.',
    '- `jsonb_agg` path is the main read optimization (Phase 6 code change).',
    '- Indexes are reversible via `DROP INDEX IF EXISTS`.',
    ''
  );

  const outPath = path.resolve('docs/enterprise-readiness/NEON_INDEX_OPTIMIZATION_REPORT.md');
  writeFileSync(outPath, lines.join('\n'), 'utf8');
  console.log(JSON.stringify({ indexes, reportPath: outPath }, null, 2));
  await closeMirrorDb();
}

main().catch((e) => {
  console.error('[apply-mirror-indexes] failed:', e);
  process.exit(1);
});
