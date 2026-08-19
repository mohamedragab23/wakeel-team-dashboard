import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { readWorkbook } from '@/lib/excelAdapter';
import {
  GHOST_RIDERS_COL_WIDTHS,
  GHOST_RIDERS_COLUMNS,
  GHOST_RIDERS_SHEET,
  GHOST_SUMMARY_COL_WIDTHS,
  GHOST_SUMMARY_COLUMNS,
  GHOST_SUMMARY_SHEET,
  buildGhostRidersExcelBuffer,
} from '@/lib/strategicOps/ghostRidersExcelExport';

describe('ghostRidersExcelExport', () => {
  it('writes Ghost Riders + ملخص with Arabic headers, rows, and column widths', async () => {
    const excelData = [
      {
        'كود المندوب (في ملف الأداء)': 'RAW-1',
        'الاسم (إن وُجد)': 'مندوب شبح',
        'عدد أيام العمل': 3,
        'إجمالي الساعات': '12.50',
        'إجمالي الأوردرات': 8,
        'متوسط يومي (ساعات)': '4.17',
        الفئة: 'missing_master',
        السبب: 'غير موجود في شيت المناديب',
        الحالة: 'غير موجود (شبح)',
        'كود في القائمة الرسمية': '-',
        ملاحظات: 'هذا المندوب غير موجود في قائمة المناديب - يجب إضافته أو تصحيح الكود',
      },
    ];
    const summaryData = [
      { المقياس: 'إجمالي المناديب الأشباح', القيمة: 1 },
      { المقياس: 'نسبة التسرب', القيمة: '4.2%' },
    ];

    const loaded = await readWorkbook(await buildGhostRidersExcelBuffer(excelData, summaryData));
    assert.deepEqual(loaded.sheetNames, [GHOST_RIDERS_SHEET, GHOST_SUMMARY_SHEET]);

    const riders = loaded.sheetToObjects(GHOST_RIDERS_SHEET, { raw: true });
    assert.equal(riders.length, 1);
    assert.deepEqual(Object.keys(riders[0]), [...GHOST_RIDERS_COLUMNS]);
    assert.equal(riders[0]['كود المندوب (في ملف الأداء)'], 'RAW-1');
    assert.equal(riders[0]['الاسم (إن وُجد)'], 'مندوب شبح');
    assert.equal(riders[0]['الحالة'], 'غير موجود (شبح)');
    assert.deepEqual(
      loaded.columnWidths(GHOST_RIDERS_SHEET).slice(0, GHOST_RIDERS_COL_WIDTHS.length),
      GHOST_RIDERS_COL_WIDTHS
    );

    const summary = loaded.sheetToObjects(GHOST_SUMMARY_SHEET, { raw: true });
    assert.equal(summary.length, 2);
    assert.deepEqual(Object.keys(summary[0]), [...GHOST_SUMMARY_COLUMNS]);
    assert.equal(summary[0]['المقياس'], 'إجمالي المناديب الأشباح');
    assert.equal(summary[0]['القيمة'], 1);
    assert.deepEqual(
      loaded.columnWidths(GHOST_SUMMARY_SHEET).slice(0, GHOST_SUMMARY_COL_WIDTHS.length),
      GHOST_SUMMARY_COL_WIDTHS
    );
  });
});
