/**
 * SRS-013 Phase 3 rollout — idempotent sheet-preparation step.
 *
 * Ensures every Google Sheets tab this phase depends on exists with the
 * exact schema the *existing, already-shipped* code expects. Safe to run
 * any number of times: `ensureSheetExists()` is a no-op if the tab is
 * already there (never touches existing data/columns of a tab that
 * already exists).
 *
 * - خصومات_الإدارة: pre-existing legacy feature (admin-deductions route),
 *   documented in its own UI as "create this tab manually if missing" --
 *   this script does that automatically instead, using the exact column
 *   order the existing GET/POST handlers already read/write
 *   (app/api/admin/salary/admin-deductions/route.ts): supervisorCode,
 *   date, reason, amount, createdBy.
 * - سجل_المعاملات_المالية: the new Phase 3 ledger tab -- already
 *   auto-created lazily by lib/payrollLedger.ts on first use; this just
 *   proves that ahead of time / re-confirms the header row.
 *
 * Run: npx tsx scripts/srs013-phase3-ensure-sheets.ts
 */
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });
import { ensureSheetExists } from '../lib/googleSheets';
import { getSheetsClientFor, getMainSpreadsheetId } from '../lib/googleSheetsAuth';
import { PAYROLL_LEDGER_SHEET_NAME, PAYROLL_LEDGER_HEADERS } from '../lib/payrollLedger';

const ADMIN_DEDUCTIONS_SHEET = 'خصومات_الإدارة';
const ADMIN_DEDUCTIONS_HEADERS = ['كود المشرف', 'التاريخ', 'السبب', 'المبلغ', 'المسجل'];

async function listTabs(): Promise<string[]> {
  const sheets = await getSheetsClientFor('main');
  const spreadsheet = await sheets.spreadsheets.get({ spreadsheetId: getMainSpreadsheetId() });
  return (spreadsheet.data.sheets || []).map((s: any) => s.properties?.title).filter(Boolean);
}

async function main() {
  console.log('=== SRS-013 Phase 3 — Sheet preparation ===\n');

  const before = await listTabs();
  console.log(`Tabs before: ${before.length} total.`);
  console.log(`  خصومات_الإدارة present? ${before.includes(ADMIN_DEDUCTIONS_SHEET)}`);
  console.log(`  سجل_المعاملات_المالية present? ${before.includes(PAYROLL_LEDGER_SHEET_NAME)}\n`);

  console.log(`Ensuring "${ADMIN_DEDUCTIONS_SHEET}" exists with headers: ${ADMIN_DEDUCTIONS_HEADERS.join(', ')}`);
  await ensureSheetExists(ADMIN_DEDUCTIONS_SHEET, ADMIN_DEDUCTIONS_HEADERS);

  console.log(`Ensuring "${PAYROLL_LEDGER_SHEET_NAME}" exists with headers: ${PAYROLL_LEDGER_HEADERS.join(', ')}`);
  await ensureSheetExists(PAYROLL_LEDGER_SHEET_NAME, PAYROLL_LEDGER_HEADERS);

  const after = await listTabs();
  console.log(`\nTabs after: ${after.length} total.`);
  console.log(`  خصومات_الإدارة present? ${after.includes(ADMIN_DEDUCTIONS_SHEET)}`);
  console.log(`  سجل_المعاملات_المالية present? ${after.includes(PAYROLL_LEDGER_SHEET_NAME)}`);

  const ok = after.includes(ADMIN_DEDUCTIONS_SHEET) && after.includes(PAYROLL_LEDGER_SHEET_NAME);
  console.log(`\n${ok ? '✅ All required Phase 3 sheets are present.' : '❌ Something is still missing.'}`);
  if (!ok) process.exit(1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
