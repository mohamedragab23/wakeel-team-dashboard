import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import * as XLSX from 'xlsx';
import {
  createWorkbook,
  readFirstSheetMatrix,
  readWorkbook,
  UnsupportedLegacyXlsError,
} from '@/lib/excelAdapter';

function sheetJsMatrix(buf: Buffer, raw: boolean): unknown[][] {
  const wb = XLSX.read(buf, { type: 'array' });
  const ws = wb.Sheets[wb.SheetNames[0]];
  return XLSX.utils.sheet_to_json(ws, {
    header: 1,
    defval: '',
    raw,
  }) as unknown[][];
}

function assertMatrixEqual(actual: unknown[][], expected: unknown[][], label: string) {
  assert.equal(actual.length, expected.length, `${label} row count`);
  const cols = Math.max(
    ...actual.map((r) => r.length),
    ...expected.map((r) => r.length),
    0
  );
  for (let r = 0; r < expected.length; r++) {
    for (let c = 0; c < cols; c++) {
      const a = actual[r]?.[c] ?? '';
      const e = expected[r]?.[c] ?? '';
      assert.equal(a, e, `${label} r${r}c${c} adapter=${JSON.stringify(a)} sheetjs=${JSON.stringify(e)}`);
      assert.equal(typeof a, typeof e, `${label} type r${r}c${c}`);
    }
  }
}

function writeSerials(): Buffer {
  const ws = XLSX.utils.aoa_to_sheet([['n'], [null], [null], [null], [null], [null]]);
  ws['A2'] = { t: 'n', v: 59, z: 'm/d/yy' };
  ws['A3'] = { t: 'n', v: 60, z: 'm/d/yy' };
  ws['A4'] = { t: 'n', v: 61, z: 'm/d/yy' };
  ws['A5'] = { t: 'n', v: 44927, z: 'm/d/yy' };
  ws['A6'] = { t: 'n', v: 44927.5, z: 'm/d/yy' };
  ws['!ref'] = 'A1:A6';
  const book = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(book, ws, 's');
  return Buffer.from(XLSX.write(book, { type: 'buffer', bookType: 'xlsx' }) as Buffer);
}

function writeDisplayFixture(): Buffer {
  const ws = XLSX.utils.aoa_to_sheet([['label', 'value']]);
  ws['A2'] = { t: 's', v: 'pct' };
  ws['B2'] = { t: 'n', v: 0.85, z: '0%' };
  ws['A3'] = { t: 's', v: 'num' };
  ws['B3'] = { t: 'n', v: 1234.5, z: '#,##0.00' };
  ws['A4'] = { t: 's', v: 'date' };
  ws['B4'] = { t: 'n', v: 44927, z: 'm/d/yy' };
  ws['A5'] = { t: 's', v: 'leap' };
  ws['B5'] = { t: 'n', v: 60, z: 'm/d/yy' };
  ws['A6'] = { t: 's', v: 'iso' };
  ws['B6'] = { t: 's', v: '2023-01-01' };
  ws['A7'] = { t: 's', v: 'text' };
  ws['B7'] = { t: 's', v: 'مرحبا' };
  ws['A8'] = { t: 's', v: 'empty' };
  ws['B8'] = { t: 's', v: '' };
  ws['!ref'] = 'A1:B8';
  const book = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(book, ws, 's');
  return Buffer.from(XLSX.write(book, { type: 'buffer', bookType: 'xlsx' }) as Buffer);
}

function writeMerged(): Buffer {
  const ws = XLSX.utils.aoa_to_sheet([
    ['تاريخ', 'كود'],
    [null, 'R1'],
    [null, 'R2'],
  ]);
  ws['A2'] = { t: 'n', v: 44927, z: 'm/d/yy' };
  ws['B2'] = { t: 's', v: 'R1' };
  ws['A3'] = { t: 's', v: '' };
  ws['B3'] = { t: 's', v: 'R2' };
  ws['!merges'] = [{ s: { r: 1, c: 0 }, e: { r: 2, c: 0 } }];
  ws['!ref'] = 'A1:B3';
  const book = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(book, ws, 's');
  return Buffer.from(XLSX.write(book, { type: 'buffer', bookType: 'xlsx' }) as Buffer);
}

function writeTableauLike(): Buffer {
  const headers = [
    'Rider ID',
    'Actual Working Hours',
    'Completed Orders',
    'Acceptance Rate',
    'Contract Name',
    'ملاحظة',
  ];
  const ws = XLSX.utils.aoa_to_sheet([headers]);
  ws['A2'] = { t: 's', v: 'W123' };
  ws['B2'] = { t: 'n', v: 8.5 };
  ws['C2'] = { t: 'n', v: 1234.5, z: '#,##0.00' };
  ws['D2'] = { t: 'n', v: 0.85, z: '0%' };
  ws['E2'] = { t: 's', v: 'wakeel' };
  ws['F2'] = { t: 's', v: 'تجريبي' };
  ws['A3'] = { t: 's', v: 'W124' };
  ws['B3'] = { t: 's', v: '' };
  ws['C3'] = { t: 'n', v: 0 };
  ws['D3'] = { t: 's', v: '85%' };
  ws['E3'] = { t: 's', v: 'wakeel' };
  ws['F3'] = { t: 's', v: '' };
  ws['!ref'] = 'A1:F3';
  const book = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(book, ws, 'Crosstab');
  return Buffer.from(XLSX.write(book, { type: 'buffer', bookType: 'xlsx' }) as Buffer);
}

function writePerfNine(): Buffer {
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
  put('A2', { t: 'n', v: 44927, z: 'm/d/yy' });
  put('B2', 'R-A');
  put('C2', 8);
  put('D2', 0);
  put('E2', 0);
  put('F2', 'لا');
  put('G2', 10);
  put('H2', { t: 'n', v: 0.85, z: '0%' });
  put('I2', 50);
  put('A3', { t: 'n', v: 60, z: 'm/d/yy' });
  put('B3', 'R-B');
  put('C3', '9.25');
  put('D3', 0);
  put('E3', 0);
  put('F3', 'لا');
  put('G3', 1);
  put('H3', '85%');
  put('I3', 0);
  put('A4', '');
  put('B4', 'R-E');
  put('C4', 3);
  put('D4', 0);
  put('E4', 0);
  put('F4', 'لا');
  put('G4', 0);
  put('H4', '0%');
  put('I4', 0);
  ws['!ref'] = 'A1:I4';
  const book = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(book, ws, 'أداء');
  return Buffer.from(XLSX.write(book, { type: 'buffer', bookType: 'xlsx' }) as Buffer);
}

describe('adapter SheetJS parity raw:true excel-serial', () => {
  it('preserves 59, 60, 61, 44927, 44927.5 exactly', async () => {
    const buf = writeSerials();
    const sj = sheetJsMatrix(buf, true);
    const wb = await readWorkbook(buf);
    const ad = wb.sheetToMatrix(undefined, { raw: true, dateMode: 'excel-serial', defval: '' });
    assert.equal(sj[1][0], 59);
    assert.equal(sj[2][0], 60);
    assert.equal(sj[3][0], 61);
    assert.equal(sj[4][0], 44927);
    assert.equal(sj[5][0], 44927.5);
    assertMatrixEqual(ad, sj, 'serials raw:true');
  });
});

describe('adapter SheetJS parity ssf-display', () => {
  it('matches SheetJS raw:false for %, #,##0.00, m/d/yy, serial 60, ISO, UTF-8, empty', async () => {
    const buf = writeDisplayFixture();
    const sj = sheetJsMatrix(buf, false);
    const wb = await readWorkbook(buf);
    const ad = wb.sheetToMatrix(undefined, { raw: 'ssf-display', defval: '' });
    assert.equal(sj[1][1], '85%');
    assert.equal(sj[2][1], '1,234.50');
    assert.equal(sj[3][1], '1/1/23');
    assert.equal(sj[4][1], '2/29/00');
    assert.equal(sj[5][1], '2023-01-01');
    assert.equal(sj[6][1], 'مرحبا');
    assert.equal(sj[7][1], '');
    assertMatrixEqual(ad, sj, 'ssf-display');
  });
});

describe('adapter merged sheetjs-anchor-only', () => {
  it('keeps anchor and blanks children like SheetJS header:1', async () => {
    const buf = writeMerged();
    const sj = sheetJsMatrix(buf, true);
    const wb = await readWorkbook(buf);
    const filled = wb.sheetToMatrix(undefined, {
      raw: true,
      dateMode: 'excel-serial',
      defval: '',
    });
    const anchored = wb.sheetToMatrix(undefined, {
      raw: true,
      dateMode: 'excel-serial',
      defval: '',
      merged: 'sheetjs-anchor-only',
    });
    assert.equal(sj[1][0], 44927);
    assert.equal(sj[2][0], '');
    assert.equal(anchored[1][0], 44927);
    assert.equal(anchored[2][0], '');
    assert.notEqual(filled[2][0], '');
    assertMatrixEqual(anchored, sj, 'merged raw:true');
  });
});

describe('adapter formula cached result', () => {
  it('uses formula result like existing unwrap behavior', async () => {
    const created = createWorkbook();
    created.addAoASheet('f', [['n'], [10], [null]]);
    created.sheet().getCell('A3').value = { formula: 'A2*2', result: 20 };
    const buf = await created.writeBuffer();
    const loaded = await readWorkbook(buf);
    const raw = loaded.sheetToMatrix(undefined, { raw: true, defval: '' });
    assert.equal(raw[2][0], 20);
  });
});

describe('adapter Tableau-like and performance-like matrices', () => {
  it('Tableau-like ssf-display matches SheetJS raw:false', async () => {
    const buf = writeTableauLike();
    const sj = sheetJsMatrix(buf, false);
    const wb = await readWorkbook(buf);
    const ad = wb.sheetToMatrix(undefined, { raw: 'ssf-display', defval: '' });
    assert.equal(sj[1][3], '85%');
    assert.equal(sj[1][2], '1,234.50');
    assert.equal(sj[1][5], 'تجريبي');
    assert.equal(sj[2][1], '');
    assertMatrixEqual(ad, sj, 'tableau-like');
  });

  it('performance-like raw:true serials and string hours match SheetJS', async () => {
    const buf = writePerfNine();
    const sj = sheetJsMatrix(buf, true);
    const wb = await readWorkbook(buf);
    const ad = wb.sheetToMatrix(undefined, { raw: true, dateMode: 'excel-serial', defval: '' });
    assert.equal(sj[1][0], 44927);
    assert.equal(sj[2][0], 60);
    assert.equal(sj[1][2], 8);
    assert.equal(sj[2][2], '9.25');
    assert.equal(sj[3][0], '');
    assertMatrixEqual(ad, sj, 'perf raw:true');
  });

  it('performance-like ssf-display matches SheetJS raw:false', async () => {
    const buf = writePerfNine();
    const sj = sheetJsMatrix(buf, false);
    const wb = await readWorkbook(buf);
    const ad = wb.sheetToMatrix(undefined, { raw: 'ssf-display', defval: '' });
    assertMatrixEqual(ad, sj, 'perf ssf-display');
  });
});

describe('adapter .xls fallback vs ExcelJS reject', () => {
  it('readFirstSheetMatrix uses SheetJS for OLE; readWorkbook rejects', async () => {
    const ws = XLSX.utils.aoa_to_sheet([['a'], [1]]);
    const book = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(book, ws, 's');
    const xls = Buffer.from(XLSX.write(book, { type: 'buffer', bookType: 'xls' }) as Buffer);
    assert.equal(xls[0], 0xd0);
    const matrix = await readFirstSheetMatrix(xls, {
      filename: 'perf.xls',
      raw: true,
      defval: '',
      legacyXlsFallback: true,
    });
    assert.equal(matrix[1][0], 1);
    await assert.rejects(() => readWorkbook(xls, { filename: 'perf.xls' }), UnsupportedLegacyXlsError);
  });
});

describe('adapter empty / header-only', () => {
  it('header-only xlsx matches SheetJS', async () => {
    const ws = XLSX.utils.aoa_to_sheet([['كود', 'اسم']]);
    const book = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(book, ws, 's');
    const buf = Buffer.from(XLSX.write(book, { type: 'buffer', bookType: 'xlsx' }) as Buffer);
    const sj = sheetJsMatrix(buf, true);
    const wb = await readWorkbook(buf);
    const ad = wb.sheetToMatrix(undefined, { raw: true, defval: '' });
    assert.equal(sj.length, 1);
    assertMatrixEqual(ad, sj, 'header-only');
  });
});
