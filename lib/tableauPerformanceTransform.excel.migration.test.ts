/**
 * Phase 3B Tableau Excel migration tests.
 * Compare migrated Excel reader against the EXACT production SheetJS contract:
 *   XLSX.read({ type:'array', raw:false })
 *   + sheet_to_json({ header:1, defval:'' })  // raw NOT passed
 * Do NOT compare against sheet_to_json({ raw:false }).
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import * as XLSX from 'xlsx';
import {
  createWorkbook,
  readFirstSheetMatrix,
  readWorkbook,
  UnsupportedLegacyXlsError,
} from '@/lib/excelAdapter';
import { parseTableauPerformanceExport } from '@/lib/tableauPerformanceTransform';

const TABLEAU_EXCEL_OPTS = {
  raw: true as const,
  dateMode: 'excel-serial' as const,
  merged: 'sheetjs-anchor-only' as const,
  defval: '',
  legacyXlsFallback: true,
};

function toAb(buf: Buffer): ArrayBuffer {
  return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer;
}

function productionSheetJsMatrix(buf: Buffer): unknown[][] {
  const wb = XLSX.read(buf, { type: 'array', raw: false });
  const ws = wb.Sheets[wb.SheetNames[0]];
  return XLSX.utils.sheet_to_json(ws, {
    header: 1,
    defval: '',
  }) as unknown[][];
}

function jsType(v: unknown): string {
  if (v === null) return 'null';
  if (v instanceof Date) return 'Date';
  return typeof v;
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
      assert.equal(
        a,
        e,
        `${label} r${r}c${c} migrated=${JSON.stringify(a)}/${jsType(a)} sheetjs=${JSON.stringify(e)}/${jsType(e)}`
      );
      assert.equal(jsType(a), jsType(e), `${label} typeof r${r}c${c}`);
    }
  }
}

function writeXlsx(ws: XLSX.WorkSheet, name = 'Crosstab'): Buffer {
  const book = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(book, ws, name);
  return Buffer.from(XLSX.write(book, { type: 'buffer', bookType: 'xlsx' }) as Buffer);
}

function writeTableauLike(): Buffer {
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
    'ملاحظة',
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
  ws['J2'] = { t: 's', v: 'تجريبي' };
  ws['A3'] = { t: 's', v: 'W124' };
  ws['B3'] = { t: 'n', v: 7 };
  ws['C3'] = { t: 'n', v: 0 };
  ws['D3'] = { t: 'n', v: 0 };
  ws['E3'] = { t: 'n', v: 0 };
  ws['F3'] = { t: 'n', v: 0 };
  ws['G3'] = { t: 'n', v: 3 };
  ws['H3'] = { t: 's', v: '85%' };
  ws['I3'] = { t: 's', v: 'wakeel' };
  ws['J3'] = { t: 's', v: '' };
  ws['A4'] = { t: 's', v: 'W125' };
  ws['B4'] = { t: 'n', v: 0 };
  ws['C4'] = { t: 'n', v: 0 };
  ws['D4'] = { t: 'n', v: 0 };
  ws['E4'] = { t: 'n', v: 0 };
  ws['F4'] = { t: 'n', v: 0 };
  ws['G4'] = { t: 'n', v: 1234.5, z: '#,##0.00' };
  ws['H4'] = { t: 'n', v: 0.85, z: '0%' };
  ws['I4'] = { t: 's', v: 'wakeel' };
  ws['J4'] = { t: 's', v: '' };
  ws['A5'] = { t: 's', v: 'serials' };
  ws['B5'] = { t: 'n', v: 20 };
  ws['C5'] = { t: 'n', v: 200.85 };
  ws['D5'] = { t: 'n', v: 59, z: 'm/d/yy' };
  ws['E5'] = { t: 'n', v: 60, z: 'm/d/yy' };
  ws['F5'] = { t: 'n', v: 61, z: 'm/d/yy' };
  ws['G5'] = { t: 'n', v: 44927, z: 'm/d/yy' };
  ws['H5'] = { t: 'n', v: 44927.5, z: 'm/d/yy' };
  ws['I5'] = { t: 's', v: '2023-01-01' };
  ws['J5'] = { t: 's', v: '' };
  ws['!ref'] = 'A1:J5';
  return writeXlsx(ws);
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
  return writeXlsx(ws, 'merge');
}

describe('Phase 3B Tableau Excel migration vs production SheetJS contract', () => {
  it('xlsx matrix matches production value+typeof (numbers stay numbers)', async () => {
    const buf = writeTableauLike();
    const prod = productionSheetJsMatrix(buf);
    const migrated = await readFirstSheetMatrix(buf, TABLEAU_EXCEL_OPTS);

    assert.equal(prod[1][7], 0.85);
    assert.equal(typeof prod[1][7], 'number');
    assert.equal(prod[3][6], 1234.5);
    assert.equal(typeof prod[3][6], 'number');
    assert.equal(prod[4][1], 20);
    assert.equal(prod[4][2], 200.85);
    assert.equal(prod[4][3], 59);
    assert.equal(prod[4][4], 60);
    assert.equal(prod[4][5], 61);
    assert.equal(prod[4][6], 44927);
    assert.equal(prod[4][7], 44927.5);
    assert.equal(prod[4][8], '2023-01-01');
    assert.equal(prod[4][9], '');
    assert.equal(prod[1][9], 'تجريبي');

    assertMatrixEqual(migrated, prod, 'tableau-xlsx');
  });

  it('formula General and formula+percent match production numbers', async () => {
    const created = createWorkbook();
    created.addAoASheet('Crosstab', [['n'], [10], [null], [null]]);
    created.sheet().getCell('A3').value = { formula: 'A2*2', result: 20 };
    const pct = created.sheet().getCell('A4');
    pct.value = { formula: '0.85', result: 0.85 };
    pct.numFmt = '0%';
    const buf = await created.writeBuffer();
    const prod = productionSheetJsMatrix(buf);
    const migrated = await readFirstSheetMatrix(buf, TABLEAU_EXCEL_OPTS);
    assert.equal(prod[2][0], 20);
    assert.equal(typeof prod[2][0], 'number');
    assert.equal(prod[3][0], 0.85);
    assert.equal(typeof prod[3][0], 'number');
    assertMatrixEqual(migrated, prod, 'formula');
  });

  it('merged child cells empty like production SheetJS', async () => {
    const buf = writeMerged();
    const prod = productionSheetJsMatrix(buf);
    const migrated = await readFirstSheetMatrix(buf, TABLEAU_EXCEL_OPTS);
    assert.equal(prod[1][0], 44927);
    assert.equal(typeof prod[1][0], 'number');
    assert.equal(prod[2][0], '');
    assertMatrixEqual(migrated, prod, 'merged');
  });

  it('header-only workbook matches production', async () => {
    const ws = XLSX.utils.aoa_to_sheet([['Rider ID', 'Contract Name']]);
    const buf = writeXlsx(ws);
    const prod = productionSheetJsMatrix(buf);
    const migrated = await readFirstSheetMatrix(buf, TABLEAU_EXCEL_OPTS);
    assert.equal(prod.length, 1);
    assertMatrixEqual(migrated, prod, 'header-only');
  });

  it('.xls OLE: production reads; ExcelJS rejects; adapter fallback matches', async () => {
    const ws = XLSX.utils.aoa_to_sheet([
      ['Rider ID', 'Actual Working Hours', 'Acceptance Rate', 'Contract Name'],
      ['Wxls', 8, 0.85, 'wakeel'],
    ]);
    ws['C2'] = { t: 'n', v: 0.85, z: '0%' };
    const book = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(book, ws, 'Crosstab');
    const xls = Buffer.from(XLSX.write(book, { type: 'buffer', bookType: 'xls' }) as Buffer);
    assert.equal(xls[0], 0xd0);
    const prod = productionSheetJsMatrix(xls);
    await assert.rejects(() => readWorkbook(xls, { filename: 'perf.xls' }), UnsupportedLegacyXlsError);
    const migrated = await readFirstSheetMatrix(xls, { ...TABLEAU_EXCEL_OPTS, filename: 'perf.xls' });
    assertMatrixEqual(migrated, prod, 'xls');
    const parsed = await parseTableauPerformanceExport(toAb(xls), 'excel');
    assert.equal(parsed.rows[0]?.riderCode, 'Wxls');
    assert.equal(parsed.rows[0]?.acceptance, '85%');
  });

  it('parseTableau Excel business output matches production-era expectations', async () => {
    const buf = writeTableauLike();
    const produced = await parseTableauPerformanceExport(toAb(buf), 'excel');
    assert.equal(produced.rows.length, 3);
    assert.equal(produced.rows[0].riderCode, 'W123');
    assert.equal(produced.rows[0].hours, 8.5);
    assert.equal(produced.rows[0].acceptance, '85%');
    assert.equal(produced.rows[1].acceptance, '85%');
    assert.equal(produced.rows[2].orders, 1235);
    assert.equal(produced.rows[0].break, 1.5);
  });

  it('CSV branch remains SheetJS string path (control)', async () => {
    const text =
      'Rider ID,Actual Working Hours,Acceptance Rate,Contract Name\nW1,8.5,85%,wakeel\n';
    const produced = await parseTableauPerformanceExport(toAb(Buffer.from(text, 'utf8')), 'csv');
    assert.equal(produced.rows[0].acceptance, '85%');
    assert.equal(produced.rows[0].hours, 8.5);
  });
});
