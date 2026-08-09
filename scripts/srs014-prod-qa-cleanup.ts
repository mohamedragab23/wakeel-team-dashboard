import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });
import { getSheetData, deleteSheetRow } from '../lib/googleSheets';
import { SHEET_EQUIPMENT_LIABILITY } from '../lib/equipmentLiability/constants';
import { SHEET_EQUIPMENT_AUTO_DEDUCTIONS } from '../lib/equipmentDeductions/constants';
import { SHEET_PAYOUT_CYCLES } from '../lib/payoutCycles/constants';
import { SHEET_EQUIPMENT_RETURN_SETTLEMENT } from '../lib/equipmentReturns/settlement';
import { PAYROLL_LEDGER_SHEET_NAME } from '../lib/payrollLedger';

const QA = 'SRS014QA_';

async function wipe(sheet: string) {
  let data: unknown[][] = [];
  try {
    data = await getSheetData(sheet, false);
  } catch (e) {
    console.log('skip missing/failed', sheet, String(e));
    return 0;
  }
  const rows: number[] = [];
  for (let i = 1; i < data.length; i++) {
    if (data[i].some((c) => String(c ?? '').includes(QA))) rows.push(i + 1);
  }
  rows.sort((a, b) => b - a);
  let n = 0;
  for (const r of rows) {
    if (await deleteSheetRow(sheet, r)) n += 1;
    await new Promise((x) => setTimeout(x, 500));
  }
  console.log(sheet, 'deleted', n);
  return n;
}

async function main() {
  await wipe(SHEET_EQUIPMENT_LIABILITY);
  await wipe(SHEET_EQUIPMENT_AUTO_DEDUCTIONS);
  await wipe(SHEET_PAYOUT_CYCLES);
  await wipe(SHEET_EQUIPMENT_RETURN_SETTLEMENT);
  await wipe(PAYROLL_LEDGER_SHEET_NAME);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
