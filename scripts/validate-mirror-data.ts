/**
 * Safe mirror validation: sync Sheets → Neon, compare row-by-row, write report.
 * Does NOT enable NEON_READ_REPLICA_ENABLED. No Sheets writes.
 *
 * Usage: npm run validate:mirror
 */
import { config } from 'dotenv';
import fs from 'fs';
import path from 'path';
import { closeMirrorDb } from '../lib/mirror/db/client';
import { isMirrorReadEnabled, isMirrorSyncEnabled } from '../lib/mirror/config';
import { syncSheetsToMirror } from '../lib/mirror/sync/syncSheetsToMirror';
import { validateMirrorAgainstSheets } from '../lib/mirror/validation/compareMirror';

config({ path: path.resolve('.env.local') });
config({ path: path.resolve('.env.vercel.prod') });

function mdReport(
  sync: Awaited<ReturnType<typeof syncSheetsToMirror>>,
  validation: Awaited<ReturnType<typeof validateMirrorAgainstSheets>>
): string {
  const lines: string[] = [
    '# Mirror Data Validation Report',
    '',
    `**Date:** ${validation.validatedAt.split('T')[0]}`,
    `**Sync run ID:** ${sync.runId}`,
    `**Policy:** Google Sheets = SoT. No Sheets writes. \`NEON_READ_REPLICA_ENABLED\` = **${isMirrorReadEnabled()}**`,
    '',
    '---',
    '',
    '## Executive summary',
    '',
    `| Item | Value |`,
    `|------|-------|`,
    `| Sync | ${sync.allOk ? '**PASS**' : '**FAIL**'} |`,
    `| Data validation | ${validation.passed ? '**PASS**' : '**FAIL**'} |`,
    `| Overall match | **${validation.overallMatchPercentage}%** |`,
    `| Threshold | 100% per table |`,
    '',
    '---',
    '',
    '## Per-table results',
    '',
    '| Sheet | Sheet rows | Mirror rows | Missing | Extra | Hash mismatches | Match % | Status |',
    '|-------|----------:|------------:|--------:|------:|----------------:|--------:|--------|',
  ];

  for (const t of validation.tables) {
    lines.push(
      `| ${t.sheetName} | ${t.sheetRowCount} | ${t.mirrorRowCount} | ${t.missingRows} | ${t.extraRows} | ${t.hashMismatches} | ${t.matchPercentage}% | ${t.passed ? 'PASS' : 'FAIL'} |`
    );
  }

  lines.push(
    '',
    '---',
    '',
    '## Sync summary',
    '',
    '| Sheet | Upserted | Deleted | Row count |',
    '|-------|----------:|--------:|----------:|'
  );
  for (const s of sync.sheets) {
    lines.push(
      `| ${s.sheetName} | ${s.rowsUpserted} | ${s.rowsDeleted} | ${s.rowCount} |`
    );
  }

  lines.push(
    '',
    '---',
    '',
    '## Sign-off',
    '',
    '| Rule | Met |',
    '|------|-----|',
    '| No Google Sheets writes | Yes |',
    '| Production read switch | No (`NEON_READ_REPLICA_ENABLED` off) |',
    '| 100% match required | ' + (validation.passed ? 'Yes' : '**No**') + ' |',
    ''
  );

  return lines.join('\n');
}

async function main() {
  if (isMirrorReadEnabled()) {
    console.error('[validate-mirror] Abort: NEON_READ_REPLICA_ENABLED must be false for safe validation');
    process.exit(1);
  }

  console.log('[validate-mirror] Starting initial sync (Sheets → Neon, read-only on Sheets)…');
  const sync = await syncSheetsToMirror(undefined, { force: true });

  console.log('[validate-mirror] Comparing mirror vs Sheets…');
  const validation = await validateMirrorAgainstSheets();

  const outPath = path.resolve(
    'docs/enterprise-readiness/MIRROR_DATA_VALIDATION_REPORT.md'
  );
  fs.writeFileSync(outPath, mdReport(sync, validation), 'utf8');

  const summary = { sync, validation, reportPath: outPath };
  console.log(JSON.stringify(summary, null, 2));

  await closeMirrorDb();

  if (!sync.allOk || !validation.passed) {
    console.error('[validate-mirror] VALIDATION FAILED — match below 100% on one or more tables');
    process.exit(1);
  }
  console.log('[validate-mirror] VALIDATION PASSED — 100% match on all tables');
}

main().catch((e) => {
  console.error('[validate-mirror] failed:', e);
  process.exit(1);
});
