import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { readWorkbook } from '@/lib/excelAdapter';
import {
  RIDERS_PERFORMANCE_COL_WIDTHS,
  RIDERS_PERFORMANCE_COLUMNS,
  RIDERS_PERFORMANCE_SHEET,
  buildRidersPerformanceExcelBuffer,
  ridersPerformanceFileName,
} from '@/lib/ridersPerformanceExcel';

describe('ridersPerformanceExcel', () => {
  it('writes أداء المناديب with Arabic headers, rows, and column widths', async () => {
    const rows = [
      {
        'كود المندوب': 'R1',
        'اسم المندوب': 'مندوب تجريبي',
        'الحالة التشغيلية': 'نشط',
        'انتهاء العقد': '2026-12-31',
        'التاريخ/الفترة': '2026-08-01',
        'عدد أيام العمل': 5,
        'ساعات العمل': 40,
        البريك: 1,
        التأخير: 0,
        الغياب: 'لا',
        الطلبات: 20,
        'نسبة القبول %': 98,
        المديونية: 15.5,
      },
    ];
    const loaded = await readWorkbook(await buildRidersPerformanceExcelBuffer(rows));
    assert.deepEqual(loaded.sheetNames, [RIDERS_PERFORMANCE_SHEET]);
    const objects = loaded.sheetToObjects(RIDERS_PERFORMANCE_SHEET, { raw: true });
    assert.equal(objects.length, 1);
    assert.deepEqual(Object.keys(objects[0]), [...RIDERS_PERFORMANCE_COLUMNS]);
    assert.equal(objects[0]['اسم المندوب'], 'مندوب تجريبي');
    assert.equal(objects[0]['المديونية'], 15.5);
    assert.deepEqual(
      loaded.columnWidths(RIDERS_PERFORMANCE_SHEET).slice(0, RIDERS_PERFORMANCE_COL_WIDTHS.length),
      RIDERS_PERFORMANCE_COL_WIDTHS
    );
  });

  it('preserves filename suffix from start/end dates', () => {
    assert.equal(
      ridersPerformanceFileName('2026-08-01', '2026-08-07'),
      'riders_performance_2026-08-01_to_2026-08-07.xlsx'
    );
  });
});
