/**
 * One-off cleanup: the ledger tab currently contains ONLY this session's own
 * QA test rows (feature not live yet, no real production transactions
 * exist). Wipes all data rows back to just the header so the final,
 * official end-to-end verification run starts from a pristine state.
 */
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });
import { getSheetsClientFor, getMainSpreadsheetId } from '../lib/googleSheetsAuth';
import { invalidateAfterSheetWrite } from '../lib/cacheInvalidation';
import { PAYROLL_LEDGER_SHEET_NAME } from '../lib/payrollLedger';

async function main() {
  const sheets = await getSheetsClientFor('main');
  const spreadsheetId = getMainSpreadsheetId();

  const spreadsheet = await sheets.spreadsheets.get({ spreadsheetId });
  const sheet = spreadsheet.data.sheets?.find((s: any) => s.properties?.title === PAYROLL_LEDGER_SHEET_NAME);
  if (!sheet) {
    console.log('Ledger sheet not found -- nothing to wipe.');
    return;
  }

  const current = await sheets.spreadsheets.values.get({ spreadsheetId, range: `${PAYROLL_LEDGER_SHEET_NAME}!A:A` });
  const rowCount = current.data.values?.length ?? 1;
  console.log(`Current row count (incl. header): ${rowCount}`);
  if (rowCount <= 1) {
    console.log('Already just the header -- nothing to wipe.');
    return;
  }

  await sheets.spreadsheets.batchUpdate({
    spreadsheetId,
    requestBody: {
      requests: [
        {
          deleteDimension: {
            range: {
              sheetId: sheet.properties!.sheetId,
              dimension: 'ROWS',
              startIndex: 1, // keep header (row 0)
              endIndex: rowCount,
            },
          },
        },
      ],
    },
  });

  await invalidateAfterSheetWrite(PAYROLL_LEDGER_SHEET_NAME);
  console.log(`Wiped ${rowCount - 1} data row(s) from ${PAYROLL_LEDGER_SHEET_NAME}. Header preserved.`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
