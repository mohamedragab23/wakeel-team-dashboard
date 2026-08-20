/**
 * SPIKE ONLY — ExcelUploadEnhanced client Excel matrix vs adapter candidate.
 *
 * Production source of truth (components/ExcelUploadEnhanced.tsx):
 *   const data = new Uint8Array(arrayBuffer);
 *   XLSX.read(data, { type: 'array', cellDates: false });
 *   XLSX.utils.sheet_to_json(worksheet, {
 *     header: 1,
 *     defval: '',
 *     raw: true,
 *   });
 *
 * Downstream: JSON body `{ type, data: any[][] }` → `/api/admin/upload`
 *   → processRidersExcel / processPerformanceExcel (matrix consumers).
 * Legacy FormData path uses excelProcessorServer (OUT OF SCOPE for this spike).
 *
 * Candidate (NOT authorized to migrate):
 *   readFirstSheetMatrix(buffer, {
 *     raw: true,
 *     dateMode: 'excel-serial',
 *     merged: 'sheetjs-anchor-only',
 *     defval: '',
 *     legacyXlsFallback: true,
 *   })
 *
 * Do NOT compare against sheet_to_json({ raw:false }) or ssf-display.
 * Do NOT normalize values to make tests pass.
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

type Mismatch = {
  fixture: string;
  cell: string;
  sheetJsValue: unknown;
  sheetJsType: string;
  adapterValue: unknown;
  adapterType: string;
  numFmt?: string;
};

const ADAPTER_CANDIDATE = {
  raw: true as const,
  dateMode: 'excel-serial' as const,
  merged: 'sheetjs-anchor-only' as const,
  defval: '',
  legacyXlsFallback: true,
};

/**
 * Exact ExcelUploadEnhanced client parse — byte-for-byte option parity.
 * Uses Uint8Array like the browser File.arrayBuffer() → Uint8Array path.
 */
function productionExcelUploadMatrix(buf: Buffer): unknown[][] {
  const data = new Uint8Array(buf);
  const workbook = XLSX.read(data, { type: 'array', cellDates: false });
  if (workbook.SheetNames.length === 0) {
    throw new Error('الملف لا يحتوي على أوراق');
  }
  const worksheet = workbook.Sheets[workbook.SheetNames[0]];
  return XLSX.utils.sheet_to_json(worksheet, {
    header: 1,
    defval: '',
    raw: true,
  }) as unknown[][];
}

function jsType(v: unknown): string {
  if (v === null) return 'null';
  if (v instanceof Date) return 'Date';
  return typeof v;
}

function colLetter(c: number): string {
  let n = c + 1;
  let s = '';
  while (n > 0) {
    const rem = (n - 1) % 26;
    s = String.fromCharCode(65 + rem) + s;
    n = Math.floor((n - 1) / 26);
  }
  return s;
}

function collectMismatches(
  fixture: string,
  prod: unknown[][],
  adapter: unknown[][],
  numFmtByA1: Record<string, string> = {}
): Mismatch[] {
  const rows = Math.max(prod.length, adapter.length);
  const cols = Math.max(
    ...prod.map((r) => r.length),
    ...adapter.map((r) => r.length),
    0
  );
  const out: Mismatch[] = [];
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const sv = prod[r]?.[c] ?? '';
      const av = adapter[r]?.[c] ?? '';
      const st = jsType(sv);
      const at = jsType(av);
      const sameValue =
        sv instanceof Date && av instanceof Date
          ? sv.getTime() === av.getTime()
          : Object.is(sv, av) || (sv === av && st === at);
      if (!sameValue || st !== at) {
        const a1 = `${colLetter(c)}${r + 1}`;
        out.push({
          fixture,
          cell: a1,
          sheetJsValue: sv,
          sheetJsType: st,
          adapterValue: av,
          adapterType: at,
          numFmt: numFmtByA1[a1],
        });
      }
    }
  }
  return out;
}

function writeXlsx(ws: XLSX.WorkSheet, name = 'Upload'): Buffer {
  const book = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(book, ws, name);
  return Buffer.from(XLSX.write(book, { type: 'buffer', bookType: 'xlsx' }) as Buffer);
}

function writeGoldenWorkbook(): { buf: Buffer; numFmtByA1: Record<string, string> } {
  const headers = [
    'label',
    'value',
    'كود المندوب',
    'ساعات',
    'طلبات',
    'قبول',
    'عقد',
    'ملاحظة',
  ];
  const ws = XLSX.utils.aoa_to_sheet([headers]);

  // Row 2: General integer
  ws['A2'] = { t: 's', v: 'general-int' };
  ws['B2'] = { t: 'n', v: 20 };

  // Row 3: General decimal
  ws['A3'] = { t: 's', v: 'general-dec' };
  ws['B3'] = { t: 'n', v: 200.85 };

  // Row 4: percentage-formatted number
  ws['A4'] = { t: 's', v: 'pct' };
  ws['B4'] = { t: 'n', v: 0.85, z: '0%' };

  // Row 5: currency/number formatted
  ws['A5'] = { t: 's', v: 'fmt-num' };
  ws['B5'] = { t: 'n', v: 1234.5, z: '#,##0.00' };

  // Row 6: Excel date serial
  ws['A6'] = { t: 's', v: 'date-44927' };
  ws['B6'] = { t: 'n', v: 44927, z: 'm/d/yy' };

  // Rows 7–9: serial 59 / 60 / 61
  ws['A7'] = { t: 's', v: 'serial-59' };
  ws['B7'] = { t: 'n', v: 59, z: 'm/d/yy' };
  ws['A8'] = { t: 's', v: 'serial-60' };
  ws['B8'] = { t: 'n', v: 60, z: 'm/d/yy' };
  ws['A9'] = { t: 's', v: 'serial-61' };
  ws['B9'] = { t: 'n', v: 61, z: 'm/d/yy' };

  // Row 10: fractional serial
  ws['A10'] = { t: 's', v: 'serial-44927.5' };
  ws['B10'] = { t: 'n', v: 44927.5, z: 'm/d/yy h:mm' };

  // Row 11: text
  ws['A11'] = { t: 's', v: 'plain-text' };
  ws['B11'] = { t: 's', v: 'hello' };

  // Row 12: UTF-8 / Arabic
  ws['A12'] = { t: 's', v: 'utf8' };
  ws['B12'] = { t: 's', v: 'مرحبا' };

  // Row 13: empty cell (defval '')
  ws['A13'] = { t: 's', v: 'empty' };
  ws['B13'] = { t: 's', v: '' };

  // Multi-column rider-like row
  ws['C2'] = { t: 's', v: 'R100' };
  ws['D2'] = { t: 'n', v: 8.5 };
  ws['E2'] = { t: 'n', v: 12 };
  ws['F2'] = { t: 'n', v: 0.85, z: '0%' };
  ws['G2'] = { t: 's', v: 'wakeel' };
  ws['H2'] = { t: 's', v: 'تجريبي' };

  ws['C3'] = { t: 's', v: 'R101' };
  ws['D3'] = { t: 'n', v: 7 };
  ws['E3'] = { t: 'n', v: 3 };
  ws['F3'] = { t: 'n', v: 0.9, z: '0%' };
  ws['G3'] = { t: 's', v: 'wakeel' };
  ws['H3'] = { t: 's', v: '' };

  ws['!ref'] = 'A1:H13';
  const numFmtByA1: Record<string, string> = {
    B4: '0%',
    B5: '#,##0.00',
    B6: 'm/d/yy',
    B7: 'm/d/yy',
    B8: 'm/d/yy',
    B9: 'm/d/yy',
    B10: 'm/d/yy h:mm',
    F2: '0%',
    F3: '0%',
  };
  return { buf: writeXlsx(ws), numFmtByA1 };
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

function writeHeaderOnly(): Buffer {
  const ws = XLSX.utils.aoa_to_sheet([['كود المندوب', 'الاسم', 'المنطقة']]);
  return writeXlsx(ws);
}

function writeOleXls(): Buffer {
  const ws = XLSX.utils.aoa_to_sheet([
    ['كود المندوب', 'ساعات', 'قبول'],
    ['Rxls', 8, 0.85],
  ]);
  ws['C2'] = { t: 'n', v: 0.85, z: '0%' };
  const book = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(book, ws, 'Upload');
  return Buffer.from(XLSX.write(book, { type: 'buffer', bookType: 'xls' }) as Buffer);
}

describe('SPIKE: ExcelUploadEnhanced production SheetJS vs adapter candidate', () => {
  it('documents production contract spot-checks (value + typeof)', () => {
    const { buf } = writeGoldenWorkbook();
    const prod = productionExcelUploadMatrix(buf);

    // cellDates:false + raw:true ⇒ numeric cells remain numbers (including dated/pct/fmt)
    assert.equal(prod[1][1], 20);
    assert.equal(typeof prod[1][1], 'number');
    assert.equal(prod[2][1], 200.85);
    assert.equal(typeof prod[2][1], 'number');
    assert.equal(prod[3][1], 0.85);
    assert.equal(typeof prod[3][1], 'number');
    assert.equal(prod[4][1], 1234.5);
    assert.equal(typeof prod[4][1], 'number');
    assert.equal(prod[5][1], 44927);
    assert.equal(typeof prod[5][1], 'number');
    assert.equal(prod[6][1], 59);
    assert.equal(prod[7][1], 60);
    assert.equal(prod[8][1], 61);
    assert.equal(prod[9][1], 44927.5);
    assert.equal(typeof prod[9][1], 'number');
    assert.equal(prod[10][1], 'hello');
    assert.equal(typeof prod[10][1], 'string');
    assert.equal(prod[11][1], 'مرحبا');
    assert.equal(prod[12][1], '');
    assert.equal(typeof prod[12][1], 'string');
    // No Date objects under this client contract
    for (const row of prod) {
      for (const cell of row) {
        assert.notEqual(jsType(cell), 'Date');
      }
    }
  });

  it('golden workbook: value+typeof match adapter candidate', async () => {
    const { buf, numFmtByA1 } = writeGoldenWorkbook();
    const prod = productionExcelUploadMatrix(buf);
    const adapter = await readFirstSheetMatrix(buf, ADAPTER_CANDIDATE);
    const bad = collectMismatches('golden-workbook', prod, adapter, numFmtByA1);
    if (bad.length) {
      console.error('[SPIKE ExcelUpload] mismatches', JSON.stringify(bad, null, 2));
    }
    assert.equal(bad.length, 0, `golden-workbook mismatches: ${bad.length}`);
  });

  it('formula cached General numeric result matches production', async () => {
    const created = createWorkbook();
    created.addAoASheet('Upload', [['n'], [10], [null]]);
    created.sheet().getCell('A3').value = { formula: 'A2*2', result: 20 };
    const buf = await created.writeBuffer();
    const prod = productionExcelUploadMatrix(buf);
    const adapter = await readFirstSheetMatrix(buf, ADAPTER_CANDIDATE);
    assert.equal(prod[2][0], 20);
    assert.equal(typeof prod[2][0], 'number');
    const bad = collectMismatches('formula-general', prod, adapter, { A3: 'General' });
    if (bad.length) console.error('[SPIKE ExcelUpload] formula-general', JSON.stringify(bad, null, 2));
    assert.equal(bad.length, 0);
  });

  it('formula cached percentage-formatted result matches production', async () => {
    const created = createWorkbook();
    created.addAoASheet('Upload', [['pct'], [null]]);
    const cell = created.sheet().getCell('A2');
    cell.value = { formula: '0.85', result: 0.85 };
    cell.numFmt = '0%';
    const buf = await created.writeBuffer();
    const prod = productionExcelUploadMatrix(buf);
    const adapter = await readFirstSheetMatrix(buf, ADAPTER_CANDIDATE);
    console.log('[SPIKE ExcelUpload] formula-pct production', prod[1][0], typeof prod[1][0]);
    console.log('[SPIKE ExcelUpload] formula-pct adapter', adapter[1][0], typeof adapter[1][0]);
    const bad = collectMismatches('formula-pct', prod, adapter, { A2: '0%' });
    if (bad.length) console.error('[SPIKE ExcelUpload] formula-pct', JSON.stringify(bad, null, 2));
    assert.equal(bad.length, 0);
  });

  it('merged cells: production empty children vs sheetjs-anchor-only', async () => {
    const buf = writeMerged();
    const prod = productionExcelUploadMatrix(buf);
    const adapter = await readFirstSheetMatrix(buf, ADAPTER_CANDIDATE);
    assert.equal(prod[1][0], 44927);
    assert.equal(typeof prod[1][0], 'number');
    assert.equal(prod[2][0], '');
    const bad = collectMismatches('merged', prod, adapter, { A2: 'm/d/yy' });
    if (bad.length) console.error('[SPIKE ExcelUpload] merged', JSON.stringify(bad, null, 2));
    assert.equal(bad.length, 0);
  });

  it('header-only workbook matches production', async () => {
    const buf = writeHeaderOnly();
    const prod = productionExcelUploadMatrix(buf);
    const adapter = await readFirstSheetMatrix(buf, ADAPTER_CANDIDATE);
    assert.equal(prod.length, 1);
    const bad = collectMismatches('header-only', prod, adapter);
    if (bad.length) console.error('[SPIKE ExcelUpload] header-only', JSON.stringify(bad, null, 2));
    assert.equal(bad.length, 0);
  });

  it('.xls/OLE: client accepts .xls; SheetJS reads; ExcelJS rejects; fallback vs production', async () => {
    // UI accept=".xlsx,.xls" — SheetJS in browser can read OLE the same as Node here.
    // ExcelJS cannot parse BIFF; adapter relies on legacyXlsFallback → SheetJS.
    const xls = writeOleXls();
    assert.equal(xls[0], 0xd0);
    const prod = productionExcelUploadMatrix(xls);
    assert.equal(prod[1][0], 'Rxls');
    assert.equal(typeof prod[1][1], 'number');

    await assert.rejects(
      () => readWorkbook(xls, { filename: 'upload.xls' }),
      UnsupportedLegacyXlsError
    );

    const adapter = await readFirstSheetMatrix(xls, {
      ...ADAPTER_CANDIDATE,
      filename: 'upload.xls',
    });
    const bad = collectMismatches('xls-ole', prod, adapter, { C2: '0%' });
    if (bad.length) console.error('[SPIKE ExcelUpload] xls-ole', JSON.stringify(bad, null, 2));
    assert.equal(bad.length, 0);
  });
});
