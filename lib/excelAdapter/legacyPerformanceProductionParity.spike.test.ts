/**
 * SPIKE ONLY — Candidate #4: performanceFileImport.legacyToTableauRows
 *
 * Production oracle:
 *   XLSX.read(buffer, { type: 'array', raw: false })
 *   sheet_to_json(ws, { header: 1, defval: '' })
 *   processPerformanceExcel(matrix, { forcedDate })
 *
 * Adapter candidate:
 *   readFirstSheetMatrix(buffer, {
 *     raw: true,
 *     dateMode: 'excel-serial',
 *     defval: '',
 *     merged: 'sheetjs-anchor-only',
 *     legacyXlsFallback: true,
 *   })
 *   + same processPerformanceExcel
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import * as XLSX from 'xlsx';
import { readFirstSheetMatrix, readWorkbook, UnsupportedLegacyXlsError } from '@/lib/excelAdapter';
import { processPerformanceExcel } from '@/lib/excelProcessor';
import type { TableauPerformanceRow } from '@/lib/tableauPerformanceTransform';
import { parsePerformanceFileBuffer } from '@/lib/performanceFileImport';

const ADAPTER_CANDIDATE = {
  raw: true as const,
  dateMode: 'excel-serial' as const,
  defval: '',
  merged: 'sheetjs-anchor-only' as const,
  legacyXlsFallback: true,
};

function productionLegacyToTableauRows(
  buffer: ArrayBuffer,
  forcedDate: string
): { rows: TableauPerformanceRow[]; warnings: string[] } {
  const wb = XLSX.read(buffer, { type: 'array', raw: false });
  const ws = wb.Sheets[wb.SheetNames[0]];
  const matrix = XLSX.utils.sheet_to_json<any[]>(ws, { header: 1, defval: '' }) as any[][];
  const processed = processPerformanceExcel(matrix, { forcedDate });
  if (!processed.success || processed.data.length === 0) {
    return { rows: [], warnings: processed.errors.concat(processed.warnings) };
  }
  const rows: TableauPerformanceRow[] = processed.data.map((p) => ({
    riderCode: p.riderCode,
    hours: p.hours,
    break: p.break,
    delay: p.delay,
    absence: p.absence,
    orders: p.orders,
    acceptance: p.acceptance,
    debt: p.debt,
  }));
  return { rows, warnings: processed.warnings };
}

async function candidateLegacyToTableauRows(
  buffer: ArrayBuffer,
  forcedDate: string,
  filename?: string
): Promise<{ rows: TableauPerformanceRow[]; warnings: string[] }> {
  const matrix = (await readFirstSheetMatrix(buffer, {
    ...ADAPTER_CANDIDATE,
    filename,
  })) as unknown[][];
  const processed = processPerformanceExcel(matrix, { forcedDate });
  if (!processed.success || processed.data.length === 0) {
    return { rows: [], warnings: processed.errors.concat(processed.warnings) };
  }
  const rows: TableauPerformanceRow[] = processed.data.map((p) => ({
    riderCode: p.riderCode,
    hours: p.hours,
    break: p.break,
    delay: p.delay,
    absence: p.absence,
    orders: p.orders,
    acceptance: p.acceptance,
    debt: p.debt,
  }));
  return { rows, warnings: processed.warnings };
}

function rowsEqual(a: TableauPerformanceRow[], b: TableauPerformanceRow[]): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    const x = a[i];
    const y = b[i];
    if (
      x.riderCode !== y.riderCode ||
      x.hours !== y.hours ||
      x.break !== y.break ||
      x.delay !== y.delay ||
      x.absence !== y.absence ||
      x.orders !== y.orders ||
      x.acceptance !== y.acceptance ||
      x.debt !== y.debt
    ) {
      return false;
    }
  }
  return true;
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
  put('A4', '2023-01-01');
  put('B4', 'R-C');
  put('C4', 1);
  put('D4', 0);
  put('E4', 0);
  put('F4', 'لا');
  put('G4', 0);
  put('H4', '0%');
  put('I4', 0);
  put('A5', '1/15/2023');
  put('B5', 'R-D');
  put('C5', 2);
  put('D5', 0);
  put('E5', 0);
  put('F5', 'لا');
  put('G5', 0);
  put('H5', '0%');
  put('I5', 0);
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

function writeMergedDateColumn(): Buffer {
  const ws = XLSX.utils.aoa_to_sheet([
    ['تاريخ', 'كود المندوب', 'ساعات', 'بريك', 'تأخير', 'غياب', 'طلبات', 'قبول', 'محفظة'],
    [{ t: 'n', v: 44927, z: 'm/d/yy' }, 'R-M1', 8, 0, 0, 'لا', 10, { t: 'n', v: 0.85, z: '0%' }, 0],
    ['', 'R-M2', 7, 0, 0, 'لا', 5, '85%', 0],
  ]);
  ws['A2'] = { t: 'n', v: 44927, z: 'm/d/yy' };
  ws['!merges'] = [{ s: { r: 1, c: 0 }, e: { r: 2, c: 0 } }];
  ws['!ref'] = 'A1:I3';
  const book = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(book, ws, 'merge');
  return Buffer.from(XLSX.write(book, { type: 'buffer', bookType: 'xlsx' }) as Buffer);
}

function writeLegacyXls(): Buffer {
  const ws = XLSX.utils.aoa_to_sheet([
    ['تاريخ', 'كود المندوب', 'ساعات', 'بريك', 'تأخير', 'غياب', 'طلبات', 'قبول', 'محفظة'],
    ['2026-08-19', 'Rxls', 8, 0, 0, 'لا', 10, '85%', 0],
  ]);
  const book = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(book, ws, 'legacy');
  return Buffer.from(XLSX.write(book, { type: 'buffer', bookType: 'xls' }) as Buffer);
}

function toAb(buf: Buffer): ArrayBuffer {
  return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer;
}

describe('SPIKE: legacyToTableauRows SheetJS vs adapter raw:true excel-serial', () => {
  const forcedDate = '2026-08-19';

  it('golden 9-col legacy: row parity under forcedDate', async () => {
    const buf = writeLegacyNineCol();
    const prod = productionLegacyToTableauRows(toAb(buf), forcedDate);
    const cand = await candidateLegacyToTableauRows(toAb(buf), forcedDate);
    assert.ok(rowsEqual(prod.rows, cand.rows), JSON.stringify({ prod: prod.rows, cand: cand.rows }));
    assert.deepEqual(prod.warnings, cand.warnings);
    assert.equal(prod.rows.length, 5);
    assert.equal(prod.rows[0].riderCode, 'R-A');
    assert.equal(prod.rows[0].acceptance, '0.85');
    assert.equal(prod.rows[1].hours, 9.25);
  });

  it('merged date column: row parity', async () => {
    const buf = writeMergedDateColumn();
    const prod = productionLegacyToTableauRows(toAb(buf), forcedDate);
    const cand = await candidateLegacyToTableauRows(toAb(buf), forcedDate);
    assert.ok(rowsEqual(prod.rows, cand.rows));
  });

  it('.xls/OLE: adapter legacyXlsFallback matches SheetJS', async () => {
    const xls = writeLegacyXls();
    assert.equal(xls[0], 0xd0);
    await assert.rejects(
      () => readWorkbook(xls, { filename: 'legacy.xls' }),
      UnsupportedLegacyXlsError
    );
    const prod = productionLegacyToTableauRows(toAb(xls), forcedDate);
    const cand = await candidateLegacyToTableauRows(toAb(xls), forcedDate, 'legacy.xls');
    assert.ok(rowsEqual(prod.rows, cand.rows));
    assert.equal(prod.rows[0]?.riderCode, 'Rxls');
  });

  it('header-only: both return empty rows', async () => {
    const ws = XLSX.utils.aoa_to_sheet([
      ['تاريخ', 'كود المندوب', 'ساعات', 'بريك', 'تأخير', 'غياب', 'طلبات', 'قبول', 'محفظة'],
    ]);
    const book = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(book, ws, 'empty');
    const buf = Buffer.from(XLSX.write(book, { type: 'buffer', bookType: 'xlsx' }) as Buffer);
    const prod = productionLegacyToTableauRows(toAb(buf), forcedDate);
    const cand = await candidateLegacyToTableauRows(toAb(buf), forcedDate);
    assert.equal(prod.rows.length, 0);
    assert.equal(cand.rows.length, 0);
  });

  it('migrated parsePerformanceFileBuffer legacy source matches SheetJS oracle', async () => {
    const buf = writeLegacyNineCol();
    const prod = productionLegacyToTableauRows(toAb(buf), forcedDate);
    const parsed = await parsePerformanceFileBuffer(toAb(buf), forcedDate);
    assert.equal(parsed.source, 'legacy');
    assert.ok(rowsEqual(prod.rows, parsed.rows));
  });
});
