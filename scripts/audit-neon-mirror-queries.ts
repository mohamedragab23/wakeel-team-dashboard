/**
 * Neon mirror query audit with EXPLAIN ANALYZE (read-only).
 * Usage: npm run audit:mirror-queries
 */
import { config } from 'dotenv';
import path from 'path';
import fs from 'fs';
import { MIRROR_SHEET_NAMES } from '../lib/mirror/config';
import { closeMirrorDb, getMirrorSql, isMirrorDbConfigured } from '../lib/mirror/db/client';

config({ path: path.resolve('.env.local') });
config({ path: path.resolve('.env.vercel.prod') });

type ExplainRow = {
  query: string;
  sheet?: string;
  plan: string;
  executionMs: number;
  scanType: string;
  rowsExamined: number;
};

function parsePlan(planText: string): { scanType: string; rowsExamined: number } {
  const lines = planText.split('\n');
  let scanType = 'unknown';
  let rowsExamined = 0;
  for (const line of lines) {
    if (/Seq Scan/i.test(line)) scanType = 'Seq Scan';
    if (/Index Scan|Index Only Scan|Bitmap Index Scan/i.test(line)) scanType = 'Index Scan';
    const m = line.match(/rows=(\d+)/);
    if (m) rowsExamined = Math.max(rowsExamined, Number(m[1]));
  }
  return { scanType, rowsExamined };
}

async function explainQuery(
  db: ReturnType<typeof getMirrorSql>,
  label: string,
  sql: string,
  sheet?: string
): Promise<ExplainRow> {
  const start = performance.now();
  const res = await db.unsafe(`EXPLAIN (ANALYZE, BUFFERS, FORMAT TEXT) ${sql}`);
  const executionMs = Math.round(performance.now() - start);
  const plan = (res as Array<Record<string, string>>)
    .map((r) => r['QUERY PLAN'])
    .join('\n');
  const { scanType, rowsExamined } = parsePlan(plan);
  return { query: label, sheet, plan, executionMs, scanType, rowsExamined };
}

async function main() {
  if (!isMirrorDbConfigured()) {
    console.error('Mirror DB not configured');
    process.exit(1);
  }

  const db = getMirrorSql();
  const results: ExplainRow[] = [];

  for (const sheet of MIRROR_SHEET_NAMES) {
    const safe = sheet.replace(/'/g, "''");
    results.push(
      await explainQuery(
        db,
        'mirror_row_fetch',
        `SELECT row_index, row_data FROM mirror_sheet_rows WHERE sheet_name = '${safe}' ORDER BY row_index ASC`,
        sheet
      )
    );
    results.push(
      await explainQuery(
        db,
        'mirror_agg_fetch',
        `SELECT COALESCE(jsonb_agg(row_data ORDER BY row_index), '[]'::jsonb) FROM mirror_sheet_rows WHERE sheet_name = '${safe}'`,
        sheet
      )
    );
    results.push(
      await explainQuery(
        db,
        'mirror_count',
        `SELECT COUNT(*)::int FROM mirror_sheet_rows WHERE sheet_name = '${safe}'`,
        sheet
      )
    );
  }

  results.push(
    await explainQuery(
      db,
      'sync_state_lookup',
      `SELECT sheet_name, row_count, last_sync_at FROM mirror_sync_state ORDER BY sheet_name`
    )
  );

  results.push(
    await explainQuery(
      db,
      'audit_log_recent',
      `SELECT id, run_id, sheet_name, ok, started_at FROM mirror_audit_log ORDER BY started_at DESC LIMIT 20`
    )
  );

  const lines: string[] = [
    '# Neon Mirror Query Audit (Phase 6C)',
    '',
    `**Date:** ${new Date().toISOString().split('T')[0]}`,
    `**Method:** EXPLAIN (ANALYZE, BUFFERS) — read-only`,
    '',
    '---',
    '',
    '## Summary',
    '',
    '| Query | Sheet | Scan type | Rows examined | Time (ms) |',
    '|-------|-------|-----------|--------------:|----------:|',
  ];

  for (const r of results) {
    lines.push(
      `| ${r.query} | ${r.sheet ?? '—'} | ${r.scanType} | ${r.rowsExamined} | ${r.executionMs} |`
    );
  }

  lines.push('', '---', '', '## Detailed plans', '');
  for (const r of results) {
    lines.push(`### ${r.query}${r.sheet ? ` — ${r.sheet}` : ''}`, '', '```', r.plan, '```', '');
  }

  lines.push(
    '---',
    '',
    '## Optimization recommendations',
    '',
    '1. **Use `jsonb_agg` single-query path** for large tabs (البيانات اليومية) — reduces round-trip row deserialization.',
    '2. **Primary key `(sheet_name, row_index)`** already supports ordered scans — no seq scan on full table when filtered by sheet.',
    '3. **Additive indexes** in `lib/mirror/db/indexes.sql` — sheet_name count + audit_log started_at.',
    '4. **Avoid `SELECT *` on mirror_audit_log** for hot paths — use limited columns.',
    ''
  );

  const outPath = path.resolve('docs/enterprise-readiness/NEON_QUERY_AUDIT.md');
  fs.writeFileSync(outPath, lines.join('\n'), 'utf8');
  console.log(JSON.stringify({ results, reportPath: outPath }, null, 2));
  await closeMirrorDb();
}

main().catch((e) => {
  console.error('[audit-neon-mirror-queries] failed:', e);
  process.exit(1);
});
