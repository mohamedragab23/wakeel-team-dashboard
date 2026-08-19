import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import * as XLSX from 'xlsx';
import { createWorkbook } from '@/lib/excelAdapter';
import { readRecruitmentExcelRows, sheetRowsToCandidates } from '@/lib/recruitment/bulkExcelImport';

function sheetJsObjects(buf: Buffer): Record<string, unknown>[] {
  const wb = XLSX.read(buf, { type: 'array' });
  return XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { defval: '' });
}

describe('recruitment bulk XLSX read', () => {
  it('preserves headers, row order, empty cells as "", and appliedDate', async () => {
    const wb = createWorkbook();
    wb.addAoASheet('المرشحين', [
      ['الاسم الكامل', 'رقم الهاتف', 'الإعلان', 'تاريخ التقديم'],
      ['مرشح تجريبي', '01000000000', 'إعلان 1', '2026-01-02'],
      ['ثانٍ', '', '', ''],
    ]);
    const buf = await wb.writeBuffer();
    const adapter = await readRecruitmentExcelRows(buf, 'candidates.xlsx');
    const sheetjs = sheetJsObjects(buf);

    assert.equal(adapter.length, 2);
    assert.equal(sheetjs.length, 2);
    assert.deepEqual(Object.keys(adapter[0]), Object.keys(sheetjs[0]));
    assert.equal(Object.keys(adapter[0]).length, 4);
    assert.equal(adapter[0]['الاسم الكامل'], 'مرشح تجريبي');
    assert.equal(adapter[1]['رقم الهاتف'], '');
    assert.equal(adapter[1]['تاريخ التقديم'], '');
    assert.equal(sheetjs[1]['رقم الهاتف'], '');

    const parsed = sheetRowsToCandidates(adapter);
    assert.equal(parsed[0].fullName, 'مرشح تجريبي');
    assert.equal(parsed[0].appliedDate, '2026-01-02');
    assert.equal(parsed[1].appliedDate, '');
    assert.equal(parsed[1].jobAd, 'غير محدد');
  });

  it('keeps numeric cells as numbers and stringifies them for appliedDate via String()', async () => {
    const wb = createWorkbook();
    wb.addAoASheet('المرشحين', [
      ['الاسم', 'الهاتف', 'تاريخ'],
      ['أ', '1', 44927],
    ]);
    const buf = await wb.writeBuffer();
    const adapter = await readRecruitmentExcelRows(buf, 'candidates.xlsx');
    const sheetjs = sheetJsObjects(buf);
    assert.equal(typeof adapter[0]['تاريخ'], 'number');
    assert.equal(adapter[0]['تاريخ'], 44927);
    assert.equal(sheetjs[0]['تاريخ'], 44927);
    assert.equal(sheetRowsToCandidates(adapter)[0].appliedDate, '44927');
  });

  it('converts Excel Date cells to serials like SheetJS, so appliedDate stays the serial string', async () => {
    const ws = XLSX.utils.aoa_to_sheet([
      ['الاسم', 'الهاتف', 'تاريخ'],
      ['أ', '010', 44927],
    ]);
    ws['C2'] = { t: 'n', v: 44927, z: 'm/d/yy' };
    const book = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(book, ws, 'المرشحين');
    const buf = Buffer.from(XLSX.write(book, { type: 'buffer', bookType: 'xlsx' }) as Buffer);
    const adapter = await readRecruitmentExcelRows(buf, 'candidates.xlsx');
    const sheetjs = sheetJsObjects(buf);
    assert.equal(adapter[0]['تاريخ'] instanceof Date, false);
    assert.equal(adapter[0]['تاريخ'], 44927);
    assert.equal(sheetjs[0]['تاريخ'], 44927);
    assert.equal(sheetRowsToCandidates(adapter)[0].appliedDate, '44927');
    assert.equal(sheetRowsToCandidates(sheetjs)[0].appliedDate, '44927');
  });

  it('preserves a normal string appliedDate', async () => {
    const wb = createWorkbook();
    wb.addAoASheet('المرشحين', [
      ['Name', 'Phone', 'Date'],
      ['Ali', '010', '2026-08-19'],
    ]);
    const buf = await wb.writeBuffer();
    const rows = await readRecruitmentExcelRows(buf, 'candidates.xlsx');
    assert.equal(sheetRowsToCandidates(rows)[0].appliedDate, '2026-08-19');
    assert.equal(sheetRowsToCandidates(rows)[0].fullName, 'Ali');
  });
});
