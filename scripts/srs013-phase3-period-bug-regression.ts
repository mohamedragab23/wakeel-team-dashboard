/**
 * Targeted regression test for the period-derivation bug found during the
 * Phase 3 production UI smoke test (2026-07-28):
 *
 * app/admin/salaries/page.tsx's default "من تاريخ" is computed as
 * `new Date(y, m, 1).toISOString().split('T')[0]`, which for UTC+2/+3
 * timezones rolls back to the last day of the PREVIOUS month (e.g. for
 * July 2026 it produces "2026-06-30", not "2026-07-01"). Before the fix,
 * calculateSupervisorSalary() derived the ledger's calendar-month lookup
 * from that same (buggy) startDate, so it silently queried the WRONG
 * month's ledger transactions whenever called with this exact default
 * range -- a real admin using the page as-is would never see their
 * same-month bonus/deduction reflected in netSalary.
 *
 * This script calls calculateSupervisorSalary() with EXACTLY that buggy
 * range (mirroring the real default) and proves a same-calendar-month
 * ledger transaction is now correctly counted.
 *
 * Run: npx tsx scripts/srs013-phase3-period-bug-regression.ts
 */
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });
import { calculateSupervisorSalary } from '../lib/salaryService';
import { appendLedgerTransaction, findLedgerTransactionById } from '../lib/payrollLedger';
import { invalidateSalaryCaches } from '../lib/cacheInvalidation';
import { getSheetData, deleteSheetRow } from '../lib/googleSheets';
import { PAYROLL_LEDGER_SHEET_NAME } from '../lib/payrollLedger';

let passed = 0;
let failed = 0;
function check(name: string, ok: boolean, detail: string) {
  if (ok) { passed++; console.log(`✅ PASS — ${name}: ${detail}`); }
  else { failed++; console.log(`❌ FAIL — ${name}: ${detail}`); }
}

async function cleanupRow(transactionId: string) {
  const rows = await getSheetData(PAYROLL_LEDGER_SHEET_NAME, false);
  for (let i = rows.length - 1; i >= 1; i--) {
    if (rows[i]?.[0] === transactionId) {
      await deleteSheetRow(PAYROLL_LEDGER_SHEET_NAME, i + 1);
      return;
    }
  }
}

async function main() {
  console.log('=== SRS-013 Phase 3 — period-derivation bug regression ===\n');
  process.env.FEATURE_PAYROLL_LEDGER_ENABLED = 'true';

  // Exactly reproduce app/admin/salaries/page.tsx's real, observed default
  // range for "current month" as of 2026-07-28 (the buggy startDate).
  const buggyStart = '2026-06-30';
  const realEnd = '2026-07-28';
  const supervisorCode = 'WA-001';

  await invalidateSalaryCaches();
  const before = await calculateSupervisorSalary(supervisorCode, buggyStart, realEnd);
  console.log(`Baseline (buggy default range) netSalary=${(before as any).netSalary}`);

  const tx = await appendLedgerTransaction({
    entityType: 'supervisor',
    entityCode: supervisorCode,
    entityNameSnapshot: 'Mohamed Hassan Wakeel',
    type: 'bonus',
    rawAmount: 123,
    reason: 'SRS-013 Phase 3 period-bug regression test -- safe to ignore',
    period: '2026-07',
    createdBy: 'QA-ADMIN',
    createdByName: 'QA Admin',
    source: 'ledger_native',
  });
  console.log(`Created bonus 123 with period="2026-07", transactionId=${tx.transactionId}`);

  await invalidateSalaryCaches();
  const after = await calculateSupervisorSalary(supervisorCode, buggyStart, realEnd);
  const delta = Number((after as any).netSalary) - Number((before as any).netSalary);
  check(
    'Bonus created under period="2026-07" is counted when queried with the buggy default range (startDate=2026-06-30, endDate=2026-07-28)',
    Math.abs(delta - 123) < 0.01,
    `delta=${delta} (expected 123)`
  );

  await cleanupRow(tx.transactionId);
  const stillThere = await findLedgerTransactionById(tx.transactionId);
  check('Cleanup removed the test row', !stillThere, `found after cleanup=${!!stillThere}`);

  delete process.env.FEATURE_PAYROLL_LEDGER_ENABLED;
  console.log(`\n=== Result: ${passed} passed, ${failed} failed ===`);
  if (failed > 0) process.exit(1);
}

main().catch((e) => { console.error(e); process.exit(1); });
