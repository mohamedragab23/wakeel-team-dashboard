import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { readWorkbook } from '@/lib/excelAdapter';
import { buildSupervisorTableExcelBuffer } from '@/lib/supervisorTableExcel';

describe('supervisorTableExcel', () => {
  it('writes JSON columns in first-row key order and clips sheet name to 31 chars', async () => {
    const rows = [
      { 'كود المشرف': 'S1', الاسم: 'مشرف تجريبي', الساعات: 12.5 },
    ];
    const longName = 'اسم شيت طويل جداً يتجاوز الحد الأقصى المسموح في إكسل123456';
    const loaded = await readWorkbook(await buildSupervisorTableExcelBuffer(rows, longName));
    assert.equal(loaded.sheetNames[0].length, 31);
    assert.equal(loaded.sheetNames[0], longName.slice(0, 31));
    const objects = loaded.sheetToObjects(loaded.sheetNames[0], { raw: true });
    assert.equal(objects.length, 1);
    assert.deepEqual(Object.keys(objects[0]), ['كود المشرف', 'الاسم', 'الساعات']);
    assert.equal(objects[0]['الاسم'], 'مشرف تجريبي');
    assert.equal(objects[0]['الساعات'], 12.5);
  });
});
