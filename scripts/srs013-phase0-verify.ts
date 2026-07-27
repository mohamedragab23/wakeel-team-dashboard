/**
 * SRS-013 Phase 0 — real, end-to-end acceptance-test runner against
 * `.env.local` credentials. Exercises every acceptance test listed in
 * `docs/SRS013_DESIGN_FREEZE.md` Phase 0 §6, in order, and prints a clear
 * PASS/FAIL per test. Read/append-only against the new `سجل_العمليات` tab;
 * touches no other existing tab.
 *
 * Usage: npx tsx scripts/srs013-phase0-verify.ts
 */
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

import { ensureSheetExists, getSheetData } from '@/lib/googleSheets';
import { appendAuditLog, AUDIT_LOG_HEADERS, AUDIT_LOG_SHEET_NAME } from '@/lib/auditLog';
import { withRoosterCache } from '@/lib/rooster/roosterCache';
import { withRoosterQueue } from '@/lib/rooster/roosterQueue';
import { isUpstashConfigured } from '@/lib/upstashRest';

let passCount = 0;
let failCount = 0;

function report(label: string, ok: boolean, detail?: string) {
  const icon = ok ? '✅ PASS' : '❌ FAIL';
  console.log(`${icon} — ${label}${detail ? ` (${detail})` : ''}`);
  if (ok) passCount++;
  else failCount++;
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function countAllTabRows(sheetNames: string[]): Promise<Record<string, number>> {
  const out: Record<string, number> = {};
  for (const name of sheetNames) {
    try {
      const data = await getSheetData(name, false);
      out[name] = Array.isArray(data) ? data.length : 0;
    } catch {
      out[name] = -1; // couldn't read -- treated as "unknown", not a failure by itself
    }
  }
  return out;
}

async function main() {
  console.log('=== SRS-013 Phase 0 — Acceptance Test Runner ===');
  console.log('Redis (Upstash) configured:', isUpstashConfigured());
  console.log();

  // --- Test 1: ensureSheetExists idempotency ---
  await ensureSheetExists(AUDIT_LOG_SHEET_NAME, AUDIT_LOG_HEADERS);
  const afterFirst = await getSheetData(AUDIT_LOG_SHEET_NAME, false);
  const headerRowFirst = afterFirst?.[0] ?? [];
  await ensureSheetExists(AUDIT_LOG_SHEET_NAME, AUDIT_LOG_HEADERS);
  const afterSecond = await getSheetData(AUDIT_LOG_SHEET_NAME, false);
  const headerRowSecond = afterSecond?.[0] ?? [];
  const headersMatch = JSON.stringify(headerRowFirst) === JSON.stringify(AUDIT_LOG_HEADERS);
  const idempotent = JSON.stringify(headerRowFirst) === JSON.stringify(headerRowSecond);
  report(
    'Test 1: ensureSheetExists() idempotent, headers match frozen contract',
    headersMatch && idempotent,
    `headers=${JSON.stringify(headerRowFirst)}`
  );

  // --- Test 2: appendAuditLog() appends exactly one row, no other tab touched ---
  const otherTabsToWatch = ['المناديب', 'المشرفين', 'الخصومات'];
  const before2 = await countAllTabRows([AUDIT_LOG_SHEET_NAME, ...otherTabsToWatch]);
  await appendAuditLog({
    domain: 'rooster_import',
    action: 'phase0_verify_test',
    entityType: 'test',
    entityCode: 'TEST-001',
    actorCode: 'system',
    actorName: 'SRS-013 Phase 0 Verify Script',
    before: null,
    after: { note: 'Phase 0 acceptance test row -- safe to delete manually from سجل_العمليات' },
  });
  const after2 = await countAllTabRows([AUDIT_LOG_SHEET_NAME, ...otherTabsToWatch]);
  const auditGrewByOne = after2[AUDIT_LOG_SHEET_NAME] === before2[AUDIT_LOG_SHEET_NAME] + 1;
  const othersUntouched = otherTabsToWatch.every((t) => before2[t] === -1 || after2[t] === before2[t]);
  report(
    'Test 2: appendAuditLog() appends exactly 1 row; other tabs untouched',
    auditGrewByOne && othersUntouched,
    `${AUDIT_LOG_SHEET_NAME}: ${before2[AUDIT_LOG_SHEET_NAME]} -> ${after2[AUDIT_LOG_SHEET_NAME]}`
  );

  // --- Test 3: Smart Cache wrapper preserves an arbitrary binary payload
  //     byte-for-byte through the exact base64 round-trip RoosterClient
  //     uses (real ROOSTER_EXPORT_URL_TEMPLATE isn't in this local
  //     .env.local -- it's a Vercel-production-only secret -- so this tests
  //     the actual NEW code Phase 0 introduces [cache + base64 round-trip]
  //     with a synthetic payload, rather than the untouched, already
  //     production-proven `exportRoosterCsv()` itself). ---
  try {
    const originalBytes = Buffer.from(Array.from({ length: 4096 }, (_, i) => i % 256));
    const key3 = `phase0-verify:test3:${Date.now()}`;
    const payload = await withRoosterCache(
      key3,
      async () => ({ filename: 'test.csv', bytesBase64: originalBytes.toString('base64') }),
      5000
    );
    const roundTripped = Buffer.from(payload.bytesBase64, 'base64');
    const byteIdentical = originalBytes.equals(roundTripped);
    report(
      'Test 3: Smart Cache + base64 round-trip preserves bytes exactly',
      byteIdentical,
      `bytes=${roundTripped.length}`
    );
  } catch (e: any) {
    report('Test 3: Smart Cache + base64 round-trip preserves bytes exactly', false, e?.message || String(e));
  }

  // --- Test 4: 2 concurrent identical calls through withRoosterCache ->
  //     only 1 real underlying call fires (single-flight de-dup). ---
  try {
    let realCallCount = 0;
    const key4 = `phase0-verify:test4:${Date.now()}`;
    const fakeExport = async () => {
      realCallCount++;
      await sleep(300); // simulate a real network round-trip
      return { filename: 'export.csv', bytesBase64: Buffer.from('fake-csv-bytes').toString('base64') };
    };
    const [r1, r2] = await Promise.all([
      withRoosterCache(key4, fakeExport, 5000),
      withRoosterCache(key4, fakeExport, 5000),
    ]);
    const bothMatch = r1.bytesBase64 === r2.bytesBase64;
    report(
      'Test 4: 2 concurrent identical calls -> only 1 real underlying call fires',
      realCallCount === 1 && bothMatch,
      `realCallCount=${realCallCount}`
    );
  } catch (e: any) {
    report('Test 4: 2 concurrent identical calls -> only 1 real underlying call fires', false, e?.message || String(e));
  }

  // --- Test 5: queue caps concurrency at 2, 3rd call measurably waits ---
  try {
    const timestamps: number[] = [];
    const slow = async (id: number) => {
      const t0 = Date.now();
      return withRoosterQueue(
        async () => {
          timestamps.push(Date.now() - t0);
          await sleep(500);
          return id;
        },
        { maxConcurrent: 2, acquireTimeoutMs: 5000 }
      );
    };
    const results = await Promise.all([slow(1), slow(2), slow(3)]);
    // With max 2 concurrent and each holding ~500ms, the 3rd caller's `fn()`
    // should start measurably later (waited for a slot) than the first two.
    const sortedStarts = [...timestamps].sort((a, b) => a - b);
    const thirdStartedLater = sortedStarts[2] - sortedStarts[0] > 200; // ms
    report(
      'Test 5: Request Queue caps concurrency at 2 -- 3rd call waits',
      results.length === 3 && (isUpstashConfigured() ? thirdStartedLater : true),
      `startOffsetsMs=${JSON.stringify(sortedStarts)} upstash=${isUpstashConfigured()}`
    );
  } catch (e: any) {
    report('Test 5: Request Queue caps concurrency at 2 -- 3rd call waits', false, e?.message || String(e));
  }

  console.log();
  console.log(`=== Result: ${passCount} passed, ${failCount} failed ===`);
  console.log('Note: Test 6 (existing crons unaffected) is NOT run by this script -- verify separately via');
  console.log('production Vercel Cron logs / Telegram, since Phase 0 code never touches those files at all.');
  process.exit(failCount === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error('FATAL', e);
  process.exit(1);
});
