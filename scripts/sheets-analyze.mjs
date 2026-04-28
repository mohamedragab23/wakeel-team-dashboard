import dotenv from 'dotenv';
import { google } from 'googleapis';

dotenv.config({ path: '.env.local' });

const SPREADSHEETS = [
  { key: '007Sup', id: '1Oxdp2vH0DHkEZwxxUdQhzMgfco9yVKlkJ9llkB4oSqE' },
  { key: 'Shifts', id: '1VmWRo_RRM2hxphSrFaZHe8eairN4mTwpw2BYqHuICp4' },
  { key: 'Unified', id: '1HbSrZQ02CsdU0XqnHUNg168e_khH50ZUdmj-FMyalf0' },
];

function getServiceAccountFromEnv() {
  const email = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL?.trim();
  const privateKey = process.env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, '\n');
  if (!email || !privateKey) {
    throw new Error('Missing GOOGLE_SERVICE_ACCOUNT_EMAIL or GOOGLE_PRIVATE_KEY in environment');
  }
  return { client_email: email, private_key: privateKey };
}

async function getSheetsClient() {
  const auth = new google.auth.GoogleAuth({
    credentials: getServiceAccountFromEnv(),
    scopes: ['https://www.googleapis.com/auth/spreadsheets.readonly'],
  });
  const authClient = await auth.getClient();
  return google.sheets({ version: 'v4', auth: authClient });
}

async function getTabHeaderAndSamples(sheets, spreadsheetId, title) {
  const range = `${title}!A:Z`;
  const [formatted, formula] = await Promise.all([
    sheets.spreadsheets.values.get({
      spreadsheetId,
      range,
      majorDimension: 'ROWS',
      valueRenderOption: 'FORMATTED_VALUE',
    }),
    sheets.spreadsheets.values.get({
      spreadsheetId,
      range,
      majorDimension: 'ROWS',
      valueRenderOption: 'FORMULA',
    }),
  ]);

  const values = formatted.data.values || [];
  const formulaValues = formula.data.values || [];

  const header = values[0] || [];
  const headerFormulas = formulaValues[0] || [];

  const sampleRows = values.slice(1, 6);

  // Count formula cells in the first 20 rows (lightweight heuristic)
  const scanRows = formulaValues.slice(0, 21);
  let formulaCellCount = 0;
  let formulaExamples = [];
  for (let r = 0; r < scanRows.length; r++) {
    const row = scanRows[r] || [];
    for (let c = 0; c < row.length; c++) {
      const v = row[c];
      if (typeof v === 'string' && v.startsWith('=')) {
        formulaCellCount++;
        if (formulaExamples.length < 8) {
          formulaExamples.push({ a1: `${String.fromCharCode(65 + c)}${r + 1}`, formula: v });
        }
      }
    }
  }

  return {
    range,
    rowCountGuess: Math.max(0, values.length - 1),
    header,
    headerFormulas,
    sampleRows,
    formulaCellCountFirst20Rows: formulaCellCount,
    formulaExamplesFirst20Rows: formulaExamples,
  };
}

async function analyzeSpreadsheet(sheets, spreadsheetId) {
  const meta = await sheets.spreadsheets.get({
    spreadsheetId,
    fields:
      'properties(title,locale,timeZone),sheets(properties(sheetId,title,index,hidden,tabColor,frozenRowCount,gridProperties(rowCount,columnCount)))',
  });

  const spreadsheetTitle = meta.data.properties?.title || '';
  const locale = meta.data.properties?.locale || '';
  const timeZone = meta.data.properties?.timeZone || '';

  const tabs = (meta.data.sheets || []).map((s) => s.properties).filter(Boolean);
  const tabsSorted = tabs.sort((a, b) => (a.index ?? 0) - (b.index ?? 0));

  const tabReports = [];
  for (const t of tabsSorted) {
    const title = t.title;
    if (!title) continue;
    const basic = {
      title,
      hidden: !!t.hidden,
      tabColor: t.tabColor || null,
      frozenRowCount: t.frozenRowCount ?? 0,
      grid: t.gridProperties || null,
    };

    // We skip very large tabs? (keep it safe but still useful)
    const sample = await getTabHeaderAndSamples(sheets, spreadsheetId, title);
    tabReports.push({ ...basic, ...sample });
  }

  return {
    spreadsheetId,
    spreadsheetTitle,
    locale,
    timeZone,
    tabCount: tabReports.length,
    tabs: tabReports,
  };
}

function printReport(report) {
  const { spreadsheetId, spreadsheetTitle, tabCount, locale, timeZone, tabs } = report;
  console.log(`\n==============================`);
  console.log(`Spreadsheet: ${spreadsheetTitle}`);
  console.log(`ID: ${spreadsheetId}`);
  console.log(`Locale/TimeZone: ${locale} / ${timeZone}`);
  console.log(`Tabs: ${tabCount}`);
  console.log(`==============================\n`);

  for (const tab of tabs) {
    console.log(`--- Tab: "${tab.title}" ---`);
    console.log(`Hidden: ${tab.hidden} | Frozen rows: ${tab.frozenRowCount}`);
    if (tab.grid) {
      console.log(
        `Grid(rowCount=${tab.grid.rowCount ?? '?'}, colCount=${tab.grid.columnCount ?? '?'})`
      );
    }
    if (tab.tabColor) {
      console.log(`TabColor: ${JSON.stringify(tab.tabColor)}`);
    }
    console.log(`Rows(data guess): ${tab.rowCountGuess}`);
    console.log(`Header: ${JSON.stringify(tab.header)}`);
    const headerFormulaCells = (tab.headerFormulas || []).filter(
      (v) => typeof v === 'string' && v.startsWith('=')
    );
    console.log(`Header formulas: ${headerFormulaCells.length}`);
    console.log(`Formula cells (first 20 rows scan): ${tab.formulaCellCountFirst20Rows}`);
    if ((tab.formulaExamplesFirst20Rows || []).length > 0) {
      console.log(`Formula examples:`);
      for (const ex of tab.formulaExamplesFirst20Rows) {
        console.log(`  - ${ex.a1}: ${ex.formula}`);
      }
    }
    console.log(`Sample rows (first 5):`);
    for (const r of tab.sampleRows || []) {
      console.log(`  ${JSON.stringify(r)}`);
    }
    console.log('');
  }
}

const targetKey = process.argv[2]; // optional: 007Sup | Shifts | Unified

const main = async () => {
  const sheets = await getSheetsClient();
  const targets = targetKey ? SPREADSHEETS.filter((s) => s.key === targetKey) : SPREADSHEETS;
  if (targets.length === 0) {
    throw new Error(`Unknown target "${targetKey}". Use one of: ${SPREADSHEETS.map((s) => s.key).join(', ')}`);
  }

  for (const t of targets) {
    const report = await analyzeSpreadsheet(sheets, t.id);
    printReport(report);
  }
};

main().catch((e) => {
  console.error('ANALYZE_ERROR:', e?.message || e);
  process.exit(1);
});

