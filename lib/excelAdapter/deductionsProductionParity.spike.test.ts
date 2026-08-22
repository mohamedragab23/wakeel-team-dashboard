/**
 * SPIKE ONLY — Deductions trio (reconcile / manager-compare / supervisor-upload)
 *
 * Production oracle:
 *   XLSX.read(buf, { type: 'buffer', cellDates: true })
 *   sheet_to_json(sheet, { defval: '' })
 *   parseAdminExcelRows(json)  [reconcile path]
 *
 * Candidates tested — all must match object-level typeof + parseAdminExcelRows output.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import * as XLSX from 'xlsx';
import { readFirstSheetObjects } from '@/lib/excelAdapter';
import { parseAdminExcelRows } from '@/lib/deductionsReconcile';

function productionObjects(buf: Buffer): Record<string, unknown>[] {
  const workbook = XLSX.read(buf, { type: 'buffer', cellDates: true });
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  return XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: '' });
}

function writeWalletGolden(): Buffer {
  const ws: XLSX.WorkSheet = {
    A1: { t: 's', v: 'Rider ID' },
    B1: { t: 's', v: 'Applaied Deduction on Wallet' },
    C1: { t: 's', v: 'Deduction Date' },
    A2: { t: 'n', v: 4802535 },
    B2: { t: 'n', v: 150.5 },
    C2: { t: 'n', v: 44927, z: 'm/d/yyyy' },
    A3: { t: 's', v: '4801001' },
    B3: { t: 's', v: '1,234.50' },
    C3: { t: 'n', v: 44928, z: 'm/d/yyyy' },
    '!ref': 'A1:C3',
  };
  const book = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(book, ws, 'Wallet');
  return Buffer.from(XLSX.write(book, { type: 'buffer', bookType: 'xlsx' }) as Buffer);
}

function rowsFromParse(objects: Record<string, unknown>[]) {
  return parseAdminExcelRows(objects).rows.map((r) => ({
    riderId: r.riderId,
    walletDeduction: r.walletDeduction,
    date: r.display['Deduction_Date'] ?? r.display['Deduction Date'] ?? '',
  }));
}

async function tryCandidate(
  buf: Buffer,
  opts: Parameters<typeof readFirstSheetObjects>[1]
) {
  const objects = await readFirstSheetObjects(buf, opts);
  return { objects, rows: rowsFromParse(objects) };
}

describe('SPIKE: deductions cellDates:true production vs adapter', () => {
  it('documents production Date objects for date columns', () => {
    const buf = writeWalletGolden();
    const objs = productionObjects(buf);
    assert.equal(typeof objs[0]['Rider ID'], 'number');
    assert.ok(objs[0]['Deduction Date'] instanceof Date);
    assert.equal(typeof objs[1]['Applaied Deduction on Wallet'], 'string');
  });

  it('native dateMode: object + parseAdminExcelRows parity', async () => {
    const buf = writeWalletGolden();
    const prod = productionObjects(buf);
    const cand = await tryCandidate(buf, {
      raw: true,
      dateMode: 'native',
      defval: '',
      legacyXlsFallback: true,
    });
    const prodRows = rowsFromParse(prod);
    assert.deepEqual(cand.rows, prodRows);
  });

  it('excel-serial dateMode: documents date typeof mismatch (BLOCKED for date columns)', async () => {
    const buf = writeWalletGolden();
    const prod = productionObjects(buf);
    const cand = await tryCandidate(buf, {
      raw: true,
      dateMode: 'excel-serial',
      defval: '',
      legacyXlsFallback: true,
    });
    assert.ok(prod[0]['Deduction Date'] instanceof Date);
    assert.equal(typeof cand.objects[0]['Deduction Date'], 'number');
  });

  it('native dateMode: full parseAdminExcelRows parity on wallet-shaped row', async () => {
    const buf = writeWalletGolden();
    const prod = productionObjects(buf);
    const cand = await tryCandidate(buf, {
      raw: true,
      dateMode: 'native',
      defval: '',
      legacyXlsFallback: true,
    });
    assert.deepEqual(parseAdminExcelRows(cand.objects), parseAdminExcelRows(prod));
  });
});
