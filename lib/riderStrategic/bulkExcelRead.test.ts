import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import * as XLSX from 'xlsx';
import { createWorkbook, readFirstSheetMatrix } from '@/lib/excelAdapter';
import { parseBulkStrategicExcel, BULK_TEMPLATE_HEADERS } from '@/lib/riderStrategic/bulkImport';
import { readStrategicBulkMatrix } from '@/lib/riderStrategic/bulkExcelRead';

const HEADERS = [...BULK_TEMPLATE_HEADERS];

function sheetJsHeader1(buf: Buffer | Uint8Array): unknown[][] {
  const wb = XLSX.read(buf, { type: 'array' });
  return XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], {
    header: 1,
    raw: true,
    defval: '',
  }) as unknown[][];
}

function sheetJsExcelDateCellBuffer(): Buffer {
  const ws = XLSX.utils.aoa_to_sheet([
    HEADERS,
    ['R1', 44927, 'Full Time', 8, 'نشط', 'ملاحظة', 44941],
  ]);
  ws['B2'] = { t: 'n', v: 44927, z: 'm/d/yy' };
  ws['G2'] = { t: 'n', v: 44941, z: 'm/d/yy' };
  const book = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(book, ws, 'قالب');
  return Buffer.from(XLSX.write(book, { type: 'buffer', bookType: 'xlsx' }) as Buffer);
}

describe('riderStrategic bulk XLSX read', () => {
  it('parses normal rows and matches SheetJS header:1 raw values', async () => {
    const wb = createWorkbook();
    wb.addAoASheet('قالب', [
      HEADERS,
      ['R1', '2023-01-01', 'Full Time', 8, 'نشط', 'ملاحظة', '2023-01-15'],
    ]);
    const buf = await wb.writeBuffer();
    const adapter = await readStrategicBulkMatrix(buf, 'bulk.xlsx');
    const sheetjs = sheetJsHeader1(buf);
    assert.equal(adapter.length, sheetjs.length);
    assert.equal(adapter.length, 2);
    assert.deepEqual(adapter[0], HEADERS);
    assert.equal(adapter[1][0], 'R1');
    assert.equal(adapter[1][2], 'Full Time');
    assert.equal(adapter[1][3], 8);
    const parsed = parseBulkStrategicExcel(adapter);
    assert.equal(parsed.length, 1);
    assert.equal(parsed[0].fields.actualJoinDate, '2023-01-01');
    assert.equal(parsed[0].errors.length, 0);
  });

  it('header-only file yields no data rows', async () => {
    const wb = createWorkbook();
    wb.addAoASheet('قالب', [HEADERS]);
    const buf = await wb.writeBuffer();
    const adapter = await readStrategicBulkMatrix(buf, 'bulk.xlsx');
    assert.equal(adapter.length, 1);
    assert.deepEqual(parseBulkStrategicExcel(adapter), []);
  });

  it('empty cells stay empty and parseIsoDateCell treats them as missing', async () => {
    const wb = createWorkbook();
    wb.addAoASheet('قالب', [
      HEADERS,
      ['R2', '', 'Full Time', 8, 'نشط', '', ''],
    ]);
    const buf = await wb.writeBuffer();
    const adapter = await readStrategicBulkMatrix(buf, 'bulk.xlsx');
    assert.equal(adapter[1][1], '');
    assert.equal(adapter[1][5], '');
    const parsed = parseBulkStrategicExcel(adapter);
    assert.equal(parsed[0].fields.actualJoinDate, '');
    assert.ok(parsed[0].errors.includes('تاريخ الانضمام الفعلي إلزامي'));
  });

  it('keeps ISO date text as text (not converted)', async () => {
    const wb = createWorkbook();
    wb.addAoASheet('قالب', [HEADERS, ['R3', '2024-06-15', 'Part Time', 4, 'نشط', '', '']]);
    const buf = await wb.writeBuffer();
    const adapter = await readStrategicBulkMatrix(buf, 'bulk.xlsx');
    assert.equal(typeof adapter[1][1], 'string');
    assert.equal(adapter[1][1], '2024-06-15');
    assert.equal(parseBulkStrategicExcel(adapter)[0].fields.actualJoinDate, '2024-06-15');
  });

  it('Excel Date cells become numeric serials like SheetJS raw:true, not JS Date', async () => {
    const buf = sheetJsExcelDateCellBuffer();
    const adapter = await readStrategicBulkMatrix(buf, 'bulk.xlsx');
    const sheetjs = sheetJsHeader1(buf);
    assert.equal(typeof adapter[1][1], 'number');
    assert.equal(adapter[1][1] instanceof Date, false);
    assert.equal(sheetjs[1][1], 44927);
    assert.equal(adapter[1][1], 44927);
    const parsedAdapter = parseBulkStrategicExcel(adapter);
    const parsedSheet = parseBulkStrategicExcel(sheetjs);
    assert.equal(parsedAdapter[0].fields.actualJoinDate, '44927');
    assert.equal(parsedSheet[0].fields.actualJoinDate, '44927');
  });

  it('numeric Excel serial dates stay numbers and parser returns the serial string', async () => {
    const wb = createWorkbook();
    wb.addAoASheet('قالب', [HEADERS, ['R4', 44927, 'Full Time', 8, 'نشط', '', '']]);
    const buf = await wb.writeBuffer();
    const adapter = await readStrategicBulkMatrix(buf, 'bulk.xlsx');
    const sheetjs = sheetJsHeader1(buf);
    assert.equal(adapter[1][1], 44927);
    assert.equal(sheetjs[1][1], 44927);
    assert.equal(parseBulkStrategicExcel(adapter)[0].fields.actualJoinDate, '44927');
  });

  it('legacy .xls filename uses SheetJS fallback when bookType xls is available', async () => {
    const ws = XLSX.utils.aoa_to_sheet([HEADERS, ['R5', '2023-01-01', 'Full Time', 8, 'نشط', '', '']]);
    const book = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(book, ws, 'قالب');
    let xls: Buffer;
    try {
    xls = Buffer.from(XLSX.write(book, { type: 'buffer', bookType: 'xls' }) as Buffer);
    } catch (err) {
      assert.fail(`SheetJS could not write bookType=xls: ${err}`);
    }
    assert.equal(xls[0], 0xd0, 'expected OLE Compound File magic for legacy .xls fallback');
    const adapter = await readFirstSheetMatrix(xls, { filename: 'bulk.xls', dateMode: 'excel-serial' });
    assert.equal(adapter[1][0], 'R5');
    assert.equal(parseBulkStrategicExcel(adapter)[0].riderCode, 'R5');
  });
});
