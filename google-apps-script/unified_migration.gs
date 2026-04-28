/**
 * Unified Dashboard - Google Apps Script migrator/analyzer
 *
 * Runs INSIDE Google Sheets (so it avoids local Node/OpenSSL service-account issues).
 *
 * What it does:
 * - Analyzes two source spreadsheets (007Sup + Shifts)
 * - Writes a structured report into a tab named "__analysis__" in the UNIFIED spreadsheet
 * - Creates required unified tabs:
 *   overview, shifts_hours, cities_report, supervisors_report, csv_uploads, settings
 * - Builds/merges "overview" rows using header-based detection across source tabs
 * - Adds SUMIF/AVERAGEIF/COUNTIF formulas for summary tabs
 *
 * Old spreadsheets are NEVER modified.
 */

const SOURCE_007SUP_ID = '1Oxdp2vH0DHkEZwxxUdQhzMgfco9yVKlkJ9llkB4oSqE';
const SOURCE_SHIFTS_ID = '1VmWRo_RRM2hxphSrFaZHe8eairN4mTwpw2BYqHuICp4';
const UNIFIED_ID = '1HbSrZQ02CsdU0XqnHUNg168e_khH50ZUdmj-FMyalf0';

const REQUIRED_TABS = {
  overview: ['employee_name', 'city', 'hours', 'date', 'supervisor', 'source'],
  shifts_hours: ['employee_name', 'total_hours', 'average_hours', 'shift_count'],
  cities_report: ['city', 'employee_count', 'total_hours', 'average_hours'],
  supervisors_report: ['supervisor', 'employee_count', 'total_hours', 'average_hours'],
  csv_uploads: ['upload_date', 'file_name', 'row_count', 'status', 'notes'],
  settings: ['key', 'value'],
  __analysis__: ['section', 'name', 'value'],
};

function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu('Unified Dashboard')
    .addItem('1) Analyze sources → write report', 'runAnalyzeOnly')
    .addItem('2) Build unified tabs + formulas', 'runCreateUnifiedStructure')
    .addItem('3) Build overview (merge data)', 'runBuildOverview')
    .addItem('4) Full run (analyze + build)', 'runFull')
    .addToUi();
}

function runAnalyzeOnly() {
  const unified = SpreadsheetApp.openById(UNIFIED_ID);
  const analysisSheet = ensureTab(unified, '__analysis__', REQUIRED_TABS.__analysis__);
  analysisSheet.clearContents();
  writeHeaders(analysisSheet, REQUIRED_TABS.__analysis__);

  const report = analyzeSources_();
  writeAnalysisReport_(analysisSheet, report);
}

function runCreateUnifiedStructure() {
  const unified = SpreadsheetApp.openById(UNIFIED_ID);
  createUnifiedStructure_(unified);
}

function runBuildOverview() {
  const unified = SpreadsheetApp.openById(UNIFIED_ID);
  createUnifiedStructure_(unified);
  buildOverview_(unified);
  applySummaryFormulas_(unified);
  applySettings_(unified);
}

function runFull() {
  runAnalyzeOnly();
  runBuildOverview();
}

/**
 * -----------------------
 * Analysis
 * -----------------------
 */

function analyzeSources_() {
  const sources = [
    { key: '007Sup', id: SOURCE_007SUP_ID },
    { key: 'Shifts', id: SOURCE_SHIFTS_ID },
  ];

  const out = [];
  sources.forEach((src) => {
    const ss = SpreadsheetApp.openById(src.id);
    const sheets = ss.getSheets();
    out.push({
      sourceKey: src.key,
      spreadsheetId: src.id,
      spreadsheetName: ss.getName(),
      sheetCount: sheets.length,
      tabs: sheets.map((sh) => analyzeTab_(sh)),
    });
  });
  return out;
}

function analyzeTab_(sh) {
  const name = sh.getName();
  const lastRow = sh.getLastRow();
  const lastCol = sh.getLastColumn();
  const frozenRows = sh.getFrozenRows();
  const tabColor = sh.getTabColor();

  const header = lastRow >= 1 && lastCol >= 1 ? sh.getRange(1, 1, 1, Math.min(lastCol, 30)).getDisplayValues()[0] : [];

  // Formula scan: first 25 rows x first 30 cols (fast and enough to classify)
  const scanRows = Math.min(lastRow, 25);
  const scanCols = Math.min(lastCol, 30);
  let formulaCells = 0;
  const formulaExamples = [];
  if (scanRows > 0 && scanCols > 0) {
    const formulas = sh.getRange(1, 1, scanRows, scanCols).getFormulas();
    for (let r = 0; r < formulas.length; r++) {
      for (let c = 0; c < formulas[r].length; c++) {
        const f = formulas[r][c];
        if (f && f.toString().trim()) {
          formulaCells++;
          if (formulaExamples.length < 8) {
            formulaExamples.push(`${a1_(r + 1, c + 1)}=${f}`);
          }
        }
      }
    }
  }

  return {
    name,
    lastRow,
    lastCol,
    frozenRows,
    tabColor: tabColor || '',
    header,
    formulaCellsFirst25x30: formulaCells,
    formulaExamplesFirst25x30: formulaExamples,
  };
}

function writeAnalysisReport_(analysisSheet, report) {
  const rows = [];
  report.forEach((src) => {
    rows.push(['source', src.sourceKey, src.spreadsheetName]);
    rows.push(['spreadsheet_id', src.sourceKey, src.spreadsheetId]);
    rows.push(['tab_count', src.sourceKey, String(src.sheetCount)]);
    rows.push(['', '', '']);
    src.tabs.forEach((t) => {
      rows.push([`${src.sourceKey}:tab`, t.name, `rows=${t.lastRow}, cols=${t.lastCol}, frozen=${t.frozenRows}, tabColor=${t.tabColor}`]);
      rows.push([`${src.sourceKey}:header`, t.name, JSON.stringify(t.header)]);
      rows.push([`${src.sourceKey}:formulas`, t.name, `cells(first25x30)=${t.formulaCellsFirst25x30}`]);
      (t.formulaExamplesFirst25x30 || []).forEach((ex) => rows.push([`${src.sourceKey}:formula_example`, t.name, ex]));
      rows.push(['', '', '']);
    });
    rows.push(['', '', '']);
  });

  if (rows.length > 0) {
    analysisSheet.getRange(2, 1, rows.length, 3).setValues(rows);
    analysisSheet.setFrozenRows(1);
    analysisSheet.autoResizeColumns(1, 3);
  }
}

/**
 * -----------------------
 * Unified structure
 * -----------------------
 */

function createUnifiedStructure_(unified) {
  const order = ['overview', 'shifts_hours', 'cities_report', 'supervisors_report', 'csv_uploads', 'settings', '__analysis__'];
  order.forEach((name) => ensureTab(unified, name, REQUIRED_TABS[name]));

  // Styling: bold headers + freeze
  order.forEach((name) => {
    const sh = unified.getSheetByName(name);
    if (!sh) return;
    writeHeaders(sh, REQUIRED_TABS[name]);
    sh.setFrozenRows(1);
    sh.getRange(1, 1, 1, REQUIRED_TABS[name].length).setFontWeight('bold').setBackground('#111827').setFontColor('#FFFFFF');
    sh.autoResizeColumns(1, REQUIRED_TABS[name].length);
  });
}

function ensureTab(ss, name, headers) {
  let sh = ss.getSheetByName(name);
  if (!sh) {
    sh = ss.insertSheet(name);
  }
  if (headers && headers.length) {
    writeHeaders(sh, headers);
  }
  return sh;
}

function writeHeaders(sh, headers) {
  if (!headers || headers.length === 0) return;
  sh.getRange(1, 1, 1, headers.length).setValues([headers]);
}

/**
 * -----------------------
 * Overview builder
 * -----------------------
 */

function buildOverview_(unified) {
  const overview = unified.getSheetByName('overview');
  if (!overview) throw new Error('Missing overview tab');

  // Clear old rows but keep header
  if (overview.getLastRow() > 1) {
    overview.getRange(2, 1, overview.getLastRow() - 1, overview.getLastColumn()).clearContent();
  }

  const normalizedRows = [];

  // 1) 007Sup → from "البيانات اليومية" joined with "المناديب"
  normalizedRows.push.apply(normalizedRows, extractFrom007Sup_());

  // 2) Shifts → from "All Citys" joined with "all" (employee → supervisor)
  normalizedRows.push.apply(normalizedRows, extractFromShifts_());

  // Sort by date desc (date stored as Date object when possible)
  normalizedRows.sort((a, b) => {
    const da = toDate_(a[3]);
    const db = toDate_(b[3]);
    const ta = da ? da.getTime() : 0;
    const tb = db ? db.getTime() : 0;
    return tb - ta;
  });

  if (normalizedRows.length > 0) {
    overview.getRange(2, 1, normalizedRows.length, 6).setValues(
      normalizedRows.map((r) => {
        // force hours numeric, date to Date where possible
        const hours = typeof r[2] === 'number' ? r[2] : Number(r[2]) || 0;
        const d = toDate_(r[3]);
        return [r[0], r[1], hours, d || r[3], r[4], r[5]];
      })
    );
  }

  overview.autoResizeColumns(1, 6);
}

function extractFrom007Sup_() {
  const ss = SpreadsheetApp.openById(SOURCE_007SUP_ID);
  const daily = ss.getSheetByName('البيانات اليومية');
  const ridersSheet = ss.getSheetByName('المناديب');
  if (!daily || !ridersSheet) return [];

  // Build riderCode → { name, city(zone), supervisorName/code }
  const ridersLastRow = ridersSheet.getLastRow();
  const ridersLastCol = ridersSheet.getLastColumn();
  const ridersData = ridersLastRow >= 2 ? ridersSheet.getRange(2, 1, ridersLastRow - 1, Math.min(ridersLastCol, 20)).getDisplayValues() : [];
  const riderMap = {};
  for (let i = 0; i < ridersData.length; i++) {
    const row = ridersData[i];
    const code = (row[0] || '').toString().trim();
    if (!code) continue;
    riderMap[code] = {
      name: (row[1] || '').toString().trim(),
      city: (row[2] || '').toString().trim(), // "المنطقة"
      supervisorCode: (row[3] || '').toString().trim(),
      supervisorName: (row[4] || '').toString().trim(),
    };
  }

  const lastRow = daily.getLastRow();
  const lastCol = daily.getLastColumn();
  if (lastRow < 2 || lastCol < 2) return [];
  const data = daily.getRange(2, 1, lastRow - 1, Math.min(lastCol, 20)).getDisplayValues();

  // Columns (as per your analysis):
  // A=date, B=riderCode, C=hours, D=break, E=delay, F=absence, G=orders, H=acceptance, I=wallet
  const out = [];
  for (let i = 0; i < data.length; i++) {
    const row = data[i];
    const dateStr = (row[0] || '').toString().trim();
    const riderCode = (row[1] || '').toString().trim();
    if (!dateStr || !riderCode) continue;

    const meta = riderMap[riderCode] || { name: '', city: '', supervisorCode: '', supervisorName: '' };
    const employeeName = meta.name || riderCode;
    const city = meta.city || '';
    const supervisor = meta.supervisorName || meta.supervisorCode || '';

    const hours = parseFloat((row[2] || '0').toString().replace(',', '.')) || 0;
    out.push([employeeName, city, hours, dateStr, supervisor, '007Sup']);
  }
  return out;
}

function extractFromShifts_() {
  const ss = SpreadsheetApp.openById(SOURCE_SHIFTS_ID);
  const allShifts = ss.getSheetByName('All Citys');
  const employees = ss.getSheetByName('all');
  if (!allShifts) return [];

  // Build employee_name → supervisor (from "all" tab)
  const supervisorByName = {};
  if (employees) {
    const r = employees.getLastRow();
    const c = employees.getLastColumn();
    if (r >= 2 && c >= 5) {
      const data = employees.getRange(2, 1, r - 1, Math.min(c, 10)).getDisplayValues();
      // header: employee_id, employee_name, contract_name, city, supervisors
      for (let i = 0; i < data.length; i++) {
        const name = (data[i][1] || '').toString().trim();
        const sup = (data[i][4] || '').toString().trim();
        if (name && sup) supervisorByName[name] = sup;
      }
    }
  }

  const lastRow = allShifts.getLastRow();
  const lastCol = allShifts.getLastColumn();
  if (lastRow < 2 || lastCol < 17) return [];

  const data = allShifts.getRange(2, 1, lastRow - 1, 17).getDisplayValues();

  // Columns (as per your analysis):
  // C employee name
  // E starting point (we treat as city)
  // H planned start date
  // L planned duration
  // M actual start date
  // Q actual duration
  const out = [];
  for (let i = 0; i < data.length; i++) {
    const row = data[i];
    const employeeName = (row[2] || '').toString().trim();
    if (!employeeName) continue;

    const city = (row[4] || '').toString().trim(); // starting point

    const actualDate = (row[12] || '').toString().trim();
    const plannedDate = (row[7] || '').toString().trim();
    const dateStr = actualDate || plannedDate;
    if (!dateStr) continue;

    const actualDur = parseFloat((row[16] || '').toString().replace(',', '.')) || 0;
    const plannedDur = parseFloat((row[11] || '').toString().replace(',', '.')) || 0;
    const hours = actualDur || plannedDur || 0;

    const supervisor = supervisorByName[employeeName] || '';
    out.push([employeeName, city, hours, dateStr, supervisor, 'Shifts']);
  }
  return out;
}

function toDate_(value) {
  if (!value) return null;
  if (Object.prototype.toString.call(value) === '[object Date]') return value;
  const s = value.toString().trim();
  if (!s) return null;
  // Try ISO
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) {
    const d = new Date(s + 'T00:00:00');
    return isNaN(d.getTime()) ? null : d;
  }
  // Try dd/mm/yyyy or mm/dd/yyyy
  if (/^\d{1,2}\/\d{1,2}\/\d{4}/.test(s)) {
    const p = s.split('/');
    const a = parseInt(p[0], 10);
    const b = parseInt(p[1], 10);
    const y = parseInt(p[2], 10);
    // If first > 12 treat as D/M
    const d1 = a > 12 ? new Date(y, b - 1, a) : new Date(y, a - 1, b);
    if (!isNaN(d1.getTime())) return d1;
  }
  const d = new Date(s);
  return isNaN(d.getTime()) ? null : d;
}

/**
 * -----------------------
 * Summary formulas
 * -----------------------
 */

function applySummaryFormulas_(unified) {
  const overview = unified.getSheetByName('overview');
  if (!overview) throw new Error('Missing overview');

  // shifts_hours
  const shifts = unified.getSheetByName('shifts_hours');
  if (shifts) {
    shifts.getRange('A2').setFormula('=SORT(UNIQUE(FILTER(overview!A2:A, overview!A2:A<>\"\")))');
    shifts.getRange('B2').setFormula('=IF(A2=\"\",\"\",SUMIF(overview!A:A,A2,overview!C:C))');
    shifts.getRange('C2').setFormula('=IF(A2=\"\",\"\",AVERAGEIF(overview!A:A,A2,overview!C:C))');
    shifts.getRange('D2').setFormula('=IF(A2=\"\",\"\",COUNTIF(overview!A:A,A2))');
    shifts.autoResizeColumns(1, 4);
  }

  // cities_report
  const cities = unified.getSheetByName('cities_report');
  if (cities) {
    cities.getRange('A2').setFormula('=SORT(UNIQUE(FILTER(overview!B2:B, overview!B2:B<>\"\")))');
    cities.getRange('B2').setFormula('=IF(A2=\"\",\"\",COUNTA(UNIQUE(FILTER(overview!A2:A, overview!B2:B=A2, overview!A2:A<>\"\"))))');
    cities.getRange('C2').setFormula('=IF(A2=\"\",\"\",SUMIF(overview!B:B,A2,overview!C:C))');
    cities.getRange('D2').setFormula('=IF(A2=\"\",\"\",AVERAGEIF(overview!B:B,A2,overview!C:C))');
    // Sort helper (optional): user can sort by column C manually; we avoid auto-sorting to keep formulas stable.
    cities.autoResizeColumns(1, 4);
  }

  // supervisors_report
  const supervisors = unified.getSheetByName('supervisors_report');
  if (supervisors) {
    supervisors.getRange('A2').setFormula('=SORT(UNIQUE(FILTER(overview!E2:E, overview!E2:E<>\"\")))');
    supervisors.getRange('B2').setFormula('=IF(A2=\"\",\"\",COUNTA(UNIQUE(FILTER(overview!A2:A, overview!E2:E=A2, overview!A2:A<>\"\"))))');
    supervisors.getRange('C2').setFormula('=IF(A2=\"\",\"\",SUMIF(overview!E:E,A2,overview!C:C))');
    supervisors.getRange('D2').setFormula('=IF(A2=\"\",\"\",AVERAGEIF(overview!E:E,A2,overview!C:C))');
    supervisors.autoResizeColumns(1, 4);
  }
}

function applySettings_(unified) {
  const settings = unified.getSheetByName('settings');
  if (!settings) return;

  // Clear old values (keep header)
  if (settings.getLastRow() > 1) {
    settings.getRange(2, 1, settings.getLastRow() - 1, 2).clearContent();
  }

  const rows = [
    ['last_update', '=IFERROR(MAX(overview!D2:D),\"\")'],
    ['total_employees', '=COUNTA(UNIQUE(FILTER(overview!A2:A, overview!A2:A<>\"\")))'],
    ['total_hours', '=SUM(overview!C2:C)'],
    ['data_source', 'Unified Dashboard'],
  ];
  settings.getRange(2, 1, rows.length, 2).setValues(rows);
  settings.autoResizeColumns(1, 2);
}

/**
 * Helpers
 */

function a1_(row, col) {
  const letters = [];
  let n = col;
  while (n > 0) {
    const r = (n - 1) % 26;
    letters.unshift(String.fromCharCode(65 + r));
    n = Math.floor((n - 1) / 26);
  }
  return `${letters.join('')}${row}`;
}

