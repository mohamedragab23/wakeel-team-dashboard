/**
 * Regression: preserveSheetJsRefShape opt-in vs default trim behavior.
 * Does not migrate ExcelUploadEnhanced — adapter API only.
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

const BASE = {
  raw: true as const,
  dateMode: 'excel-serial' as const,
  merged: 'sheetjs-anchor-only' as const,
  defval: '',
  legacyXlsFallback: true,
};

const OPT_IN = { ...BASE, preserveSheetJsRefShape: true as const };

function jsType(v: unknown): string {
  if (v === null) return 'null';
  if (v instanceof Date) return 'Date';
  return typeof v;
}

function writeXlsx(ws: XLSX.WorkSheet, name = 'T'): Buffer {
  const book = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(book, ws, name);
  return Buffer.from(XLSX.write(book, { type: 'buffer', bookType: 'xlsx' }) as Buffer);
}

function productionMatrix(buf: Buffer): unknown[][] {
  const wb = XLSX.read(new Uint8Array(buf), { type: 'array', cellDates: false });
  const ws = wb.Sheets[wb.SheetNames[0]];
  return XLSX.utils.sheet_to_json(ws, {
    header: 1,
    defval: '',
    raw: true,
  }) as unknown[][];
}

function assertExact(prod: unknown[][], got: unknown[][], label: string) {
  assert.equal(got.length, prod.length, `${label} matrix length`);
  for (let r = 0; r < prod.length; r++) {
    assert.equal(got[r].length, prod[r].length, `${label} row ${r} length`);
    for (let c = 0; c < prod[r].length; c++) {
      assert.ok(Object.is(got[r][c], prod[r][c]), `${label} r${r}c${c} value`);
      assert.equal(jsType(got[r][c]), jsType(prod[r][c]), `${label} r${r}c${c} typeof`);
    }
  }
}

describe('preserveSheetJsRefShape adapter regression', () => {
  it('default mode still trims trailing empty rows', async () => {
    const buf = writeXlsx({
      A1: { t: 's', v: 'h' },
      A2: { t: 's', v: 'v' },
      '!ref': 'A1:A4',
    });
    const def = await readFirstSheetMatrix(buf, BASE);
    assert.equal(def.length, 2);
    assert.deepEqual(def, [['h'], ['v']]);
  });

  it('opt-in preserves trailing empty rows', async () => {
    const buf = writeXlsx({
      A1: { t: 's', v: 'h' },
      A2: { t: 's', v: 'v' },
      '!ref': 'A1:A4',
    });
    const prod = productionMatrix(buf);
    const got = await readFirstSheetMatrix(buf, OPT_IN);
    assertExact(prod, got, 'trailing-rows');
    assert.equal(got.length, 4);
  });

  it('opt-in preserves trailing empty columns', async () => {
    const buf = writeXlsx({
      A1: { t: 's', v: 'code' },
      A2: { t: 's', v: 'R1' },
      '!ref': 'A1:D2',
    });
    const prod = productionMatrix(buf);
    const got = await readFirstSheetMatrix(buf, OPT_IN);
    assertExact(prod, got, 'trailing-cols');
    assert.equal(got[0].length, 4);
  });

  it('opt-in: partial final row, empty-between, header-only', async () => {
    const partial = writeXlsx({
      A1: { t: 's', v: 'a' },
      B1: { t: 's', v: 'b' },
      A2: { t: 's', v: 'x' },
      '!ref': 'A1:B2',
    });
    assertExact(productionMatrix(partial), await readFirstSheetMatrix(partial, OPT_IN), 'partial');

    const between = writeXlsx({
      A1: { t: 's', v: 'h' },
      A2: { t: 's', v: 'R1' },
      A4: { t: 's', v: 'R2' },
      '!ref': 'A1:A4',
    });
    assertExact(productionMatrix(between), await readFirstSheetMatrix(between, OPT_IN), 'between');

    const header = writeXlsx(XLSX.utils.aoa_to_sheet([['كود', 'اسم']]));
    assertExact(productionMatrix(header), await readFirstSheetMatrix(header, OPT_IN), 'header');
  });

  it('opt-in: formulas, dates/serials, formatted numbers, text/Arabic, merged', async () => {
    const ws: XLSX.WorkSheet = {
      A1: { t: 's', v: 'label' },
      B1: { t: 's', v: 'value' },
      A2: { t: 's', v: 'int' },
      B2: { t: 'n', v: 20 },
      A3: { t: 's', v: 'pct' },
      B3: { t: 'n', v: 0.85, z: '0%' },
      A4: { t: 's', v: 'fmt' },
      B4: { t: 'n', v: 1234.5, z: '#,##0.00' },
      A5: { t: 's', v: 'd44927' },
      B5: { t: 'n', v: 44927, z: 'm/d/yy' },
      A6: { t: 's', v: 's59' },
      B6: { t: 'n', v: 59, z: 'm/d/yy' },
      A7: { t: 's', v: 's60' },
      B7: { t: 'n', v: 60, z: 'm/d/yy' },
      A8: { t: 's', v: 's61' },
      B8: { t: 'n', v: 61, z: 'm/d/yy' },
      A9: { t: 's', v: 'frac' },
      B9: { t: 'n', v: 44927.5, z: 'm/d/yy h:mm' },
      A10: { t: 's', v: 'txt' },
      B10: { t: 's', v: 'hello' },
      A11: { t: 's', v: 'ar' },
      B11: { t: 's', v: 'مرحبا' },
      A12: { t: 's', v: 'empty' },
      B12: { t: 's', v: '' },
      '!ref': 'A1:B14',
    };
    const buf = writeXlsx(ws);
    const prod = productionMatrix(buf);
    const got = await readFirstSheetMatrix(buf, OPT_IN);
    assertExact(prod, got, 'golden-shape');
    assert.equal(typeof got[1][1], 'number');
    assert.equal(got[1][1], 20);
    assert.equal(got[2][1], 0.85);
    assert.equal(got[6][1], 60);
    assert.equal(got[10][1], 'مرحبا');
    assert.equal(got.length, 14);

    // formula via ExcelJS write
    const created = createWorkbook();
    created.addAoASheet('T', [['n'], [10], [null]]);
    created.sheet().getCell('A3').value = { formula: 'A2*2', result: 20 };
    const fbuf = await created.writeBuffer();
    const fprod = productionMatrix(fbuf);
    const fgot = await readFirstSheetMatrix(fbuf, OPT_IN);
    assertExact(fprod, fgot, 'formula');
    assert.equal(fgot[2][0], 20);
    assert.equal(typeof fgot[2][0], 'number');

    // merged
    const mws: XLSX.WorkSheet = {
      A1: { t: 's', v: 'تاريخ' },
      B1: { t: 's', v: 'كود' },
      A2: { t: 'n', v: 44927, z: 'm/d/yy' },
      B2: { t: 's', v: 'R1' },
      A3: { t: 's', v: '' },
      B3: { t: 's', v: 'R2' },
      '!merges': [{ s: { r: 1, c: 0 }, e: { r: 2, c: 0 } }],
      '!ref': 'A1:B3',
    };
    const mbuf = writeXlsx(mws);
    assertExact(productionMatrix(mbuf), await readFirstSheetMatrix(mbuf, OPT_IN), 'merged');
  });

  it('opt-in .xls fallback preserves !ref shape (no trim); ExcelJS still rejects', async () => {
    const ws = XLSX.utils.aoa_to_sheet([
      ['كود', 'ساعات'],
      ['Rxls', 8],
    ]);
    ws['!ref'] = 'A1:B4';
    const book = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(book, ws, 'T');
    const xls = Buffer.from(XLSX.write(book, { type: 'buffer', bookType: 'xls' }) as Buffer);
    assert.equal(xls[0], 0xd0);
    await assert.rejects(() => readWorkbook(xls, { filename: 't.xls' }), UnsupportedLegacyXlsError);

    const prod = productionMatrix(xls);
    const trimmed = await readFirstSheetMatrix(xls, { ...BASE, filename: 't.xls' });
    const preserved = await readFirstSheetMatrix(xls, { ...OPT_IN, filename: 't.xls' });
    assert.equal(trimmed.length, 2);
    assertExact(prod, preserved, 'xls-opt-in');
    assert.equal(preserved.length, 4);
  });
});
