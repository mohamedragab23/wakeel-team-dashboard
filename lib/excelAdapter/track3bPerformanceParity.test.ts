/**
 * Track 3B adapter compatibility tests — SheetJS vs ExcelJS adapter.
 * Does not migrate production callers.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import * as XLSX from 'xlsx';
import ExcelJS from 'exceljs';
import {
  parseCsvToMatrix,
  readWorkbook,
  UnsupportedLegacyXlsError,
} from '@/lib/excelAdapter';
import { processPerformanceExcel } from '@/lib/excelProcessor';
import {
  parseTableauPerformanceExport,
  mergeCodDebt,
} from '@/lib/tableauPerformanceTransform';
import { parsePerformanceFileBuffer } from '@/lib/performanceFileImport';

type CellProbe = {
  r: number;
  c: number;
  sheetJs: { value: unknown; jsType: string };
  adapter: { value: unknown; jsType: string };
  exceljs: { value: unknown; jsType: string; text: string; type: number; numFmt?: string };
};

function jsType(v: unknown): string {
  if (v === null) return 'null';
  if (v instanceof Date) return 'Date';
  return typeof v;
}

function toAb(buf: Buffer): ArrayBuffer {
  return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer;
}

function sheetJsMatrix(
  buf: Buffer,
  opts: { raw: boolean; cellDates?: boolean }
): unknown[][] {
  const wb = XLSX.read(buf, { type: 'array', cellDates: opts.cellDates ?? false });
  const ws = wb.Sheets[wb.SheetNames[0]];
  return XLSX.utils.sheet_to_json(ws, {
    header: 1,
    defval: '',
    raw: opts.raw,
  }) as unknown[][];
}

function sheetJsCsvMatrix(text: string): unknown[][] {
  const wb = XLSX.read(text, { type: 'string', raw: false });
  const ws = wb.Sheets[wb.SheetNames[0]];
  return XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' }) as unknown[][];
}

async function adapterMatrix(
  buf: Buffer,
  opts: {
    raw: boolean | 'ssf-display';
    dateMode?: 'native' | 'excel-serial';
    merged?: 'exceljs-fill' | 'sheetjs-anchor-only';
  }
): Promise<unknown[][]> {
  const wb = await readWorkbook(buf);
  return wb.sheetToMatrix(undefined, {
    defval: '',
    raw: opts.raw,
    dateMode: opts.dateMode ?? 'native',
    merged: opts.merged,
  });
}

async function excelJsCellMap(buf: Buffer): Promise<Map<string, CellProbe['exceljs']>> {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buf);
  const ws = wb.worksheets[0];
  const map = new Map<string, CellProbe['exceljs']>();
  ws.eachRow({ includeEmpty: true }, (row, r) => {
    row.eachCell({ includeEmpty: true }, (cell, c) => {
      map.set(`${r - 1},${c - 1}`, {
        value: cell.value,
        jsType: jsType(cell.value),
        text: String(cell.text ?? ''),
        type: cell.type,
        numFmt: cell.numFmt,
      });
    });
  });
  return map;
}

function padMatrix(a: unknown[][], b: unknown[][]): { rows: number; cols: number } {
  const rows = Math.max(a.length, b.length);
  const cols = Math.max(
    ...a.map((r) => r.length),
    ...b.map((r) => r.length),
    0
  );
  return { rows, cols };
}

async function compareRawFalse(buf: Buffer): Promise<CellProbe[]> {
  const sj = sheetJsMatrix(buf, { raw: false });
  const ad = await adapterMatrix(buf, { raw: 'ssf-display', merged: 'sheetjs-anchor-only' });
  const ej = await excelJsCellMap(buf);
  const { rows, cols } = padMatrix(sj, ad);
  const probes: CellProbe[] = [];
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const sv = sj[r]?.[c] ?? '';
      const av = ad[r]?.[c] ?? '';
      probes.push({
        r,
        c,
        sheetJs: { value: sv, jsType: jsType(sv) },
        adapter: { value: av, jsType: jsType(av) },
        exceljs: ej.get(`${r},${c}`) ?? {
          value: '',
          jsType: 'string',
          text: '',
          type: 0,
        },
      });
    }
  }
  return probes;
}

function mismatches(probes: CellProbe[]): CellProbe[] {
  return probes.filter((p) => {
    if (p.sheetJs.jsType !== p.adapter.jsType) return true;
    if (p.sheetJs.value instanceof Date && p.adapter.value instanceof Date) {
      return p.sheetJs.value.getTime() !== p.adapter.value.getTime();
    }
    return JSON.stringify(p.sheetJs.value) !== JSON.stringify(p.adapter.value);
  });
}

function writeTableauCrosstab(): Buffer {
  const headers = [
    'Rider ID',
    'Actual Working Hours',
    'Break Hours',
    'Late Login',
    'No Show Shifts',
    'No Show Execused',
    'Completed Orders',
    'Acceptance Rate',
    'Contract Name',
  ];
  const ws = XLSX.utils.aoa_to_sheet([headers]);
  ws['A2'] = { t: 's', v: 'W123' };
  ws['B2'] = { t: 'n', v: 8.5 };
  ws['C2'] = { t: 's', v: '1.5' };
  ws['D2'] = { t: 'n', v: 0 };
  ws['E2'] = { t: 'n', v: 0 };
  ws['F2'] = { t: 'n', v: 0 };
  ws['G2'] = { t: 'n', v: 12 };
  ws['H2'] = { t: 'n', v: 0.85, z: '0%' };
  ws['I2'] = { t: 's', v: 'wakeel' };
  ws['A3'] = { t: 's', v: 'W124' };
  ws['B3'] = { t: 'n', v: 7 };
  ws['C3'] = { t: 'n', v: 0 };
  ws['D3'] = { t: 'n', v: 0 };
  ws['E3'] = { t: 'n', v: 0 };
  ws['F3'] = { t: 'n', v: 0 };
  ws['G3'] = { t: 'n', v: 3 };
  ws['H3'] = { t: 's', v: '85%' };
  ws['I3'] = { t: 's', v: 'wakeel' };
  ws['G4'] = { t: 'n', v: 1234.5, z: '#,##0.00' };
  ws['A4'] = { t: 's', v: 'W125' };
  ws['B4'] = { t: 'n', v: 0 };
  ws['C4'] = { t: 'n', v: 0 };
  ws['D4'] = { t: 'n', v: 0 };
  ws['E4'] = { t: 'n', v: 0 };
  ws['F4'] = { t: 'n', v: 0 };
  ws['H4'] = { t: 'n', v: 0.85, z: '0%' };
  ws['I4'] = { t: 's', v: 'wakeel' };
  ws['!ref'] = 'A1:I4';
  const book = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(book, ws, 'Crosstab');
  return Buffer.from(XLSX.write(book, { type: 'buffer', bookType: 'xlsx' }) as Buffer);
}

function writeLegacyNineCol(): Buffer {
  const headers = [
    'تاريخ',
    'كود المندوب',
    'ساعات',
    'بريك',
    'تأخير',
    'غياب',
    'طلبات',
    'قبول',
    'محفظة',
  ];
  const ws = XLSX.utils.aoa_to_sheet([headers]);
  const put = (addr: string, cell: XLSX.CellObject | string | number) => {
    if (typeof cell === 'number') ws[addr] = { t: 'n', v: cell };
    else if (typeof cell === 'string') ws[addr] = { t: 's', v: cell };
    else ws[addr] = cell;
  };
  // row 2: Excel date serial 44927 formatted
  put('A2', { t: 'n', v: 44927, z: 'm/d/yy' });
  put('B2', 'R-A');
  put('C2', 8);
  put('D2', 0);
  put('E2', 0);
  put('F2', 'لا');
  put('G2', 10);
  put('H2', { t: 'n', v: 0.85, z: '0%' });
  put('I2', 50);
  // row 3: serial 60 + string hours + percent text
  put('A3', { t: 'n', v: 60, z: 'm/d/yy' });
  put('B3', 'R-B');
  put('C3', '9.25');
  put('D3', 0);
  put('E3', 0);
  put('F3', 'لا');
  put('G3', 1);
  put('H3', '85%');
  put('I3', 0);
  // row 4: ISO
  put('A4', '2023-01-01');
  put('B4', 'R-C');
  put('C4', 1);
  put('D4', 0);
  put('E4', 0);
  put('F4', 'لا');
  put('G4', 0);
  put('H4', '0%');
  put('I4', 0);
  // row 5: US M/D/YYYY
  put('A5', '1/15/2023');
  put('B5', 'R-D');
  put('C5', 2);
  put('D5', 0);
  put('E5', 0);
  put('F5', 'لا');
  put('G5', 0);
  put('H5', '0%');
  put('I5', 0);
  // row 6: empty date (merged-cell stand-in)
  put('A6', '');
  put('B6', 'R-E');
  put('C6', 3);
  put('D6', 0);
  put('E6', 0);
  put('F6', 'لا');
  put('G6', 0);
  put('H6', '0%');
  put('I6', 0);
  ws['!ref'] = 'A1:I6';
  const book = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(book, ws, 'أداء');
  return Buffer.from(XLSX.write(book, { type: 'buffer', bookType: 'xlsx' }) as Buffer);
}

function writeLegacyXls(): Buffer {
  const ws = XLSX.utils.aoa_to_sheet([
    [
      'Rider ID',
      'Actual Working Hours',
      'Acceptance Rate',
      'Contract Name',
    ],
    ['Wxls', 8, '85%', 'wakeel'],
  ]);
  const book = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(book, ws, 'Crosstab');
  return Buffer.from(XLSX.write(book, { type: 'buffer', bookType: 'xls' }) as Buffer);
}

describe('Track 3B SheetJS vs adapter cell parity (ssf-display)', () => {
  it('Tableau crosstab: SheetJS raw:false equals adapter ssf-display', async () => {
    const buf = writeTableauCrosstab();
    const probes = await compareRawFalse(buf);
    const bad = mismatches(probes);
    const percent = probes.find((p) => p.r === 1 && p.c === 7);
    const formattedNum = probes.find((p) => p.r === 3 && p.c === 6);
    console.log('[3B] Tableau ssf-display mismatches', bad.length, 'of', probes.length);
    console.log('[3B] H2 percent SheetJS', percent?.sheetJs, 'adapter', percent?.adapter);
    console.log('[3B] G4 formatted num SheetJS', formattedNum?.sheetJs, 'adapter', formattedNum?.adapter);
    assert.equal(percent?.sheetJs.value, '85%');
    assert.equal(percent?.adapter.value, '85%');
    assert.equal(formattedNum?.sheetJs.value, '1,234.50');
    assert.equal(formattedNum?.adapter.value, '1,234.50');
    assert.equal(bad.length, 0);
  });

  it('legacy 9-col: date/percent cells match under ssf-display', async () => {
    const buf = writeLegacyNineCol();
    const probes = await compareRawFalse(buf);
    const d44927 = probes.find((p) => p.r === 1 && p.c === 0);
    const d60 = probes.find((p) => p.r === 2 && p.c === 0);
    const iso = probes.find((p) => p.r === 3 && p.c === 0);
    const mdY = probes.find((p) => p.r === 4 && p.c === 0);
    const empty = probes.find((p) => p.r === 5 && p.c === 0);
    const pct = probes.find((p) => p.r === 1 && p.c === 7);
    assert.equal(d44927?.sheetJs.value, '1/1/23');
    assert.equal(d44927?.adapter.value, '1/1/23');
    assert.equal(d60?.sheetJs.value, '2/29/00');
    assert.equal(d60?.adapter.value, '2/29/00');
    assert.equal(iso?.sheetJs.value, '2023-01-01');
    assert.equal(iso?.adapter.value, '2023-01-01');
    assert.equal(mdY?.sheetJs.value, '1/15/2023');
    assert.equal(mdY?.adapter.value, '1/15/2023');
    assert.equal(empty?.sheetJs.value, '');
    assert.equal(empty?.adapter.value, '');
    assert.equal(pct?.sheetJs.value, '85%');
    assert.equal(pct?.adapter.value, '85%');
  });

  it('merged date column: sheetjs-anchor-only leaves child empty like SheetJS', async () => {
    const buf = writeMergedDateColumn();
    const sjFalse = sheetJsMatrix(buf, { raw: false });
    const adFalse = await adapterMatrix(buf, {
      raw: 'ssf-display',
      merged: 'sheetjs-anchor-only',
    });
    const sjTrue = sheetJsMatrix(buf, { raw: true });
    const adTrue = await adapterMatrix(buf, {
      raw: true,
      dateMode: 'excel-serial',
      merged: 'sheetjs-anchor-only',
    });
    assert.equal(sjFalse[2][0], '');
    assert.equal(adFalse[2][0], '');
    assert.equal(sjTrue[2][0], '');
    assert.equal(adTrue[2][0], '');
  });
});

function writeMergedDateColumn(): Buffer {
  const ws = XLSX.utils.aoa_to_sheet([
    ['تاريخ', 'كود المندوب'],
    [{ t: 'n', v: 44927, z: 'm/d/yy' }, 'R-M1'],
    ['', 'R-M2'],
  ]);
  ws['A2'] = { t: 'n', v: 44927, z: 'm/d/yy' };
  ws['B2'] = { t: 's', v: 'R-M1' };
  ws['A3'] = { t: 's', v: '' };
  ws['B3'] = { t: 's', v: 'R-M2' };
  ws['!merges'] = [{ s: { r: 1, c: 0 }, e: { r: 2, c: 0 } }];
  ws['!ref'] = 'A1:B3';
  const book = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(book, ws, 'merge');
  return Buffer.from(XLSX.write(book, { type: 'buffer', bookType: 'xlsx' }) as Buffer);
}

describe('Track 3B raw:true upload-path vs adapter excel-serial', () => {
  it('legacy numeric serials: adapter excel-serial matches SheetJS raw:true including serial 60', async () => {
    const buf = writeLegacyNineCol();
    const sj = sheetJsMatrix(buf, { raw: true, cellDates: false });
    const ad = await adapterMatrix(buf, { raw: true, dateMode: 'excel-serial' });
    assert.equal(sj[1][0], 44927);
    assert.equal(ad[1][0], 44927);
    assert.equal(sj[2][0], 60);
    assert.equal(ad[2][0], 60);
  });

  it('string hours stay strings on both raw:true paths', async () => {
    const buf = writeLegacyNineCol();
    const sj = sheetJsMatrix(buf, { raw: true });
    const ad = await adapterMatrix(buf, { raw: true, dateMode: 'excel-serial' });
    assert.equal(sj[2][2], '9.25');
    assert.equal(ad[2][2], '9.25');
    assert.equal(sj[1][2], 8);
    assert.equal(ad[1][2], 8);
  });
});

describe('Track 3B business parsers on both matrices', () => {
  it('adapter ssf-display cells match the Tableau SheetJS formatted matrix', async () => {
    const buf = writeTableauCrosstab();
    const produced = await parseTableauPerformanceExport(toAb(buf), 'excel');
    assert.equal(produced.rows.length, 3);
    assert.equal(produced.rows[0].acceptance, '85%');
    assert.equal(produced.rows[1].acceptance, '85%');
    assert.equal(produced.rows[0].hours, 8.5);
    assert.equal(produced.rows[2].orders, 1235);

    const ad = await adapterMatrix(buf, { raw: 'ssf-display' });
    const sj = sheetJsMatrix(buf, { raw: false });
    assert.equal(ad[1][7], sj[1][7]);
    assert.equal(ad[1][7], '85%');
    assert.equal(ad[3][6], sj[3][6]);
    assert.equal(ad[3][6], '1,234.50');
  });

  it('processPerformanceExcel unforced dates match on serial 60; forcedDate equalizes all dates', async () => {
    const buf = writeLegacyNineCol();
    const sj = sheetJsMatrix(buf, { raw: true });
    const ad = await adapterMatrix(buf, { raw: true, dateMode: 'excel-serial' });
    const sjU = processPerformanceExcel(sj as unknown[][], {});
    const adU = processPerformanceExcel(ad as unknown[][], {});
    const sjF = processPerformanceExcel(sj as unknown[][], { forcedDate: '2026-08-19' });
    const adF = processPerformanceExcel(ad as unknown[][], { forcedDate: '2026-08-19' });
    const sj60 = sjU.data.find((d) => d.riderCode === 'R-B');
    const ad60 = adU.data.find((d) => d.riderCode === 'R-B');
    assert.equal(sj60?.date, '1900-02-29');
    assert.equal(ad60?.date, '1900-02-29');
    assert.equal(sjU.data.find((d) => d.riderCode === 'R-E')?.date, adU.data.find((d) => d.riderCode === 'R-E')?.date);
    assert.deepEqual(
      sjF.data.map((d) => d.date),
      adF.data.map((d) => d.date)
    );
    assert.ok(sjF.data.every((d) => d.date === '2026-08-19'));
  });

  it('parsePerformanceFileBuffer uses Tableau first then legacy+forcedDate; COD merge does not parse Excel', async () => {
    const buf = writeLegacyNineCol();
    const parsed = await parsePerformanceFileBuffer(toAb(buf), '2026-08-19');
    assert.equal(parsed.source, 'legacy');
    assert.ok(parsed.warnings.some((w) => w.includes('rider_id')));
    assert.ok(parsed.rows.every((r) => r.hours >= 0));
    const merged = mergeCodDebt(parsed.rows, new Map([['R-A', 99]]));
    assert.equal(merged.find((r) => r.riderCode === 'R-A')?.debt, 99);
  });
});

describe('Track 3B CSV current behavior (do not migrate)', () => {
  it('SheetJS string raw:false vs PapaParse parseCsvToMatrix is not identical', async () => {
    const text =
      'Rider ID,Actual Working Hours,Acceptance Rate,Contract Name\nW1,8.5,85%,wakeel\nW2,,,\n"W3, quoted",1.25,0.85,wakeel\n';
    const sj = sheetJsCsvMatrix(text);
    const papa = parseCsvToMatrix(text, { defval: '' });
    const produced = await parseTableauPerformanceExport(toAb(Buffer.from(text, 'utf8')), 'csv');
    console.log('[3B] CSV SheetJS', JSON.stringify(sj));
    console.log('[3B] CSV Papa', JSON.stringify(papa));
    console.log('[3B] CSV parseTableau rows', produced.rows);
    assert.equal(produced.rows[0].acceptance, '85%');
    assert.notEqual(JSON.stringify(sj), JSON.stringify(papa));
  });
});

describe('Track 3B .xls production-path evidence', () => {
  it('SheetJS production parsers can read bookType=xls; ExcelJS readWorkbook rejects OLE', async () => {
    const xls = writeLegacyXls();
    assert.equal(xls[0], 0xd0);
    const tab = await parseTableauPerformanceExport(toAb(xls), 'excel');
    assert.equal(tab.rows[0]?.riderCode, 'Wxls');
    const parsed = await parsePerformanceFileBuffer(toAb(xls), '2026-08-19');
    assert.equal(parsed.source, 'tableau');
    await assert.rejects(() => readWorkbook(xls, { filename: 'perf.xls' }), UnsupportedLegacyXlsError);
  });
});
