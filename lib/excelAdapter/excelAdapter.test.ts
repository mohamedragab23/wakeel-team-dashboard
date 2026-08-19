import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import * as XLSX from 'xlsx';
import {
  createWorkbook,
  readWorkbook,
  parseCsvToMatrix,
  downloadBuffer,
  excelSerialToIsoDate,
  excelFractionToHHMM,
  assertNotLegacyXls,
  UnsupportedLegacyXlsError,
} from '@/lib/excelAdapter';

function ssfIso(serial: number): string | null {
  const parsed = XLSX.SSF.parse_date_code(serial) as { y?: number; m?: number; d?: number } | null;
  if (!parsed?.y || !parsed?.m || !parsed?.d) {
    if (parsed?.y === 1900 && parsed?.m === 1 && parsed?.d === 0) return '1900-01-00';
    if (parsed?.y === 1900 && parsed?.m === 2 && parsed?.d === 29) return '1900-02-29';
    return parsed?.y && parsed?.m
      ? `${parsed.y}-${String(parsed.m).padStart(2, '0')}-${String(parsed.d ?? 0).padStart(2, '0')}`
      : null;
  }
  return `${parsed.y}-${String(parsed.m).padStart(2, '0')}-${String(parsed.d).padStart(2, '0')}`;
}

describe('excelAdapter serial dates', () => {
  it('matches SheetJS SSF for ordinary serials including 2023-01-01', () => {
    for (const serial of [1, 2, 59, 61, 62, 44927, 45000]) {
      assert.equal(excelSerialToIsoDate(serial), ssfIso(serial), `serial ${serial}`);
    }
  });

  it('preserves Excel 1900 fictitious leap day (serial 60)', () => {
    assert.equal(excelSerialToIsoDate(60), '1900-02-29');
    assert.equal(ssfIso(60), '1900-02-29');
    assert.equal(excelSerialToIsoDate(59), '1900-02-28');
    assert.equal(excelSerialToIsoDate(61), '1900-03-01');
  });

  it('rejects non-finite serials', () => {
    assert.equal(excelSerialToIsoDate(Number.NaN), null);
    assert.equal(excelSerialToIsoDate(-1), null);
  });
});

describe('excelAdapter fractional time', () => {
  it('maps day fractions to HH:MM like shiftAutomationLegacy', () => {
    assert.equal(excelFractionToHHMM(0), '00:00');
    assert.equal(excelFractionToHHMM(0.25), '06:00');
    assert.equal(excelFractionToHHMM(0.5), '12:00');
    assert.equal(excelFractionToHHMM(0.75), '18:00');
  });

  it('uses only the time part of a date-serial with fraction', () => {
    assert.equal(excelFractionToHHMM(44927.5), '12:00');
  });
});

describe('excelAdapter .xls guard', () => {
  it('rejects OLE Compound File bytes (legacy .xls)', async () => {
    const ole = Uint8Array.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1, 0x00, 0x00]);
    assert.throws(() => assertNotLegacyXls(ole), UnsupportedLegacyXlsError);
    await assert.rejects(() => readWorkbook(ole), UnsupportedLegacyXlsError);
  });

  it('rejects .xls filenames even if bytes are not OLE', () => {
    const pk = Uint8Array.from([0x50, 0x4b, 0x03, 0x04]);
    assert.throws(() => assertNotLegacyXls(pk, 'performance.xls'), UnsupportedLegacyXlsError);
    assert.doesNotThrow(() => assertNotLegacyXls(pk, 'performance.xlsx'));
  });
});

describe('excelAdapter workbook round trip', () => {
  it('writes AOA + JSON sheets with Arabic headers and reads them back', async () => {
    const wb = createWorkbook();
    wb.addAoASheet('الاستقطاعات', [
      ['كود المندوب', 'اسم المندوب', 'المبلغ'],
      ['TEST001', 'مندوب تجريبي', 125.5],
      ['TEST002', '', 0],
    ]);
    wb.addJsonSheet(
      'ملخص',
      [
        { المقياس: 'عدد الصفوف', القيمة: 2 },
        { المقياس: 'الحالة', القيمة: 'تجريبي' },
      ],
      { columns: ['المقياس', 'القيمة'] }
    );

    const buffer = await wb.writeBuffer();
    const loaded = await readWorkbook(buffer, { filename: 'fixture.xlsx' });

    assert.deepEqual(loaded.sheetNames, ['الاستقطاعات', 'ملخص']);

    const matrixRaw = loaded.sheetToMatrix('الاستقطاعات', { defval: '', raw: true });
    assert.equal(matrixRaw[0][0], 'كود المندوب');
    assert.equal(matrixRaw[1][0], 'TEST001');
    assert.equal(matrixRaw[1][2], 125.5);
    assert.equal(matrixRaw[2][1], '');

    const matrixDefval = loaded.sheetToMatrix('الاستقطاعات', { defval: 'MISSING', raw: true });
    assert.equal(matrixDefval[2][1], 'MISSING');

    const objects = loaded.sheetToObjects('الاستقطاعات', { defval: '', raw: true });
    assert.equal(objects.length, 2);
    assert.equal(objects[0]['كود المندوب'], 'TEST001');
    assert.equal(objects[0]['اسم المندوب'], 'مندوب تجريبي');
    assert.equal(objects[0]['المبلغ'], 125.5);

    const summary = loaded.sheetToObjects('ملخص', { defval: '', raw: true });
    assert.equal(summary[0]['المقياس'], 'عدد الصفوف');
    assert.equal(summary[0]['القيمة'], 2);
  });

  it('stores explicit column widths', async () => {
    const wb = createWorkbook();
    wb.addJsonSheet(
      'عرض',
      [{ أ: 1, ب: 2 }],
      { columns: ['أ', 'ب'], colWidths: [30, 50] }
    );
    const loaded = await readWorkbook(await wb.writeBuffer());
    assert.deepEqual(loaded.columnWidths('عرض').slice(0, 2), [30, 50]);
  });

  it('stringifies numbers when raw is false', async () => {
    const wb = createWorkbook();
    wb.addAoASheet('nums', [
      ['value'],
      [42],
    ]);
    const loaded = await readWorkbook(await wb.writeBuffer());
    const raw = loaded.sheetToMatrix('nums', { raw: true });
    const formatted = loaded.sheetToMatrix('nums', { raw: false });
    assert.equal(raw[1][0], 42);
    assert.equal(formatted[1][0], '42');
  });
});

describe('excelAdapter CSV (papaparse, isolated from ExcelJS)', () => {
  it('parses Arabic headers and applies defval to empty cells', () => {
    const text = 'كود المندوب,اسم المندوب,المديونية\nTEST001,مندوب تجريبي,10\nTEST002,,\n';
    const matrix = parseCsvToMatrix(text, { defval: 'MISSING' });
    assert.equal(matrix[0][0], 'كود المندوب');
    assert.equal(matrix[1][2], '10');
    assert.equal(matrix[2][1], 'MISSING');
    assert.equal(matrix[2][2], 'MISSING');
  });
});

describe('excelAdapter download helper', () => {
  it('is browser-only', () => {
    assert.throws(
      () => downloadBuffer(Buffer.from('pk'), 'out.xlsx'),
      /browser-only/
    );
  });
});
