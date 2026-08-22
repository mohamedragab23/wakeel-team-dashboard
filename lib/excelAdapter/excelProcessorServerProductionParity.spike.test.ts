/**
 * SPIKE ONLY — Candidate #2: excelProcessorServer.readExcelFromBuffer
 *
 * Production oracle (lib/excelProcessorServer.ts):
 *   XLSX.read(data, { type: 'array', cellDates: false })
 *   sheet_to_json(ws, { header: 1, defval: '', raw: true })
 *   + column-0 post-process (rows i>=1): serial 40000–50000 → YYYY-MM-DD,
 *     Date objects → YYYY-MM-DD, M/D/YYYY strings → YYYY-MM-DD
 *
 * Proposed adapter candidate (NOT migrated):
 *   readFirstSheetMatrix(buffer, {
 *     raw: true,
 *     dateMode: 'excel-serial',
 *     merged: 'sheetjs-anchor-only',
 *     defval: '',
 *     legacyXlsFallback: true,
 *     preserveSheetJsRefShape: true,
 *   })
 *   + SAME column-0 post-process unchanged
 *
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

const ADAPTER_CANDIDATE = {
  raw: true as const,
  dateMode: 'excel-serial' as const,
  merged: 'sheetjs-anchor-only' as const,
  defval: '',
  legacyXlsFallback: true,
  preserveSheetJsRefShape: true,
};

type Mismatch = {
  fixture: string;
  cell: string;
  sheetJsValue: unknown;
  sheetJsType: string;
  adapterValue: unknown;
  adapterType: string;
};

/** Exact copy of excelProcessorServer excelSerialToDate (spike oracle). */
function excelSerialToDate(serial: number): string {
  const date = XLSX.SSF.parse_date_code(serial);
  if (date) {
    const year = date.y;
    const month = String(date.m).padStart(2, '0');
    const day = String(date.d).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }
  const baseDate = new Date(Date.UTC(1899, 11, 30));
  const resultDate = new Date(baseDate.getTime() + serial * 24 * 60 * 60 * 1000);
  const year = resultDate.getUTCFullYear();
  const month = String(resultDate.getUTCMonth() + 1).padStart(2, '0');
  const day = String(resultDate.getUTCDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/** Exact copy of excelProcessorServer column-0 post-process (spike oracle). */
function applyCol0DatePostProcess(jsonData: unknown[][]): unknown[][] {
  for (let i = 1; i < jsonData.length; i++) {
    const cell = jsonData[i][0];
    if (typeof cell === 'number' && cell > 40000 && cell < 50000) {
      jsonData[i][0] = excelSerialToDate(cell);
    } else if (cell instanceof Date) {
      const year = cell.getFullYear();
      const month = String(cell.getMonth() + 1).padStart(2, '0');
      const day = String(cell.getDate()).padStart(2, '0');
      jsonData[i][0] = `${year}-${month}-${day}`;
    } else if (typeof cell === 'string') {
      const dateStr = cell.trim();
      if (/^\d{1,2}\/\d{1,2}\/\d{4}$/.test(dateStr)) {
        const parts = dateStr.split('/');
        const month = parts[0].padStart(2, '0');
        const day = parts[1].padStart(2, '0');
        const year = parts[2];
        jsonData[i][0] = `${year}-${month}-${day}`;
      }
    }
  }
  return jsonData;
}

function productionSheetJsMatrix(buf: Buffer): unknown[][] {
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

function productionReadExcelFromBuffer(buf: Buffer): unknown[][] {
  const matrix = productionSheetJsMatrix(buf);
  return applyCol0DatePostProcess(structuredClone(matrix));
}

async function candidateReadExcelFromBuffer(buf: Buffer, filename?: string): Promise<unknown[][]> {
  const matrix = (await readFirstSheetMatrix(buf, {
    ...ADAPTER_CANDIDATE,
    filename,
  })) as unknown[][];
  return applyCol0DatePostProcess(structuredClone(matrix));
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
  adapter: unknown[][]
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
        out.push({
          fixture,
          cell: `${colLetter(c)}${r + 1}`,
          sheetJsValue: sv,
          sheetJsType: st,
          adapterValue: av,
          adapterType: at,
        });
      }
    }
  }
  if (prod.length !== adapter.length) {
    out.push({
      fixture,
      cell: 'shape',
      sheetJsValue: `rows=${prod.length}`,
      sheetJsType: 'shape',
      adapterValue: `rows=${adapter.length}`,
      adapterType: 'shape',
    });
  }
  return out;
}

function assertParity(fixture: string, prod: unknown[][], adapter: unknown[][]) {
  const bad = collectMismatches(fixture, prod, adapter);
  if (bad.length) {
    console.error(`[SPIKE excelProcessorServer] ${fixture}`, JSON.stringify(bad, null, 2));
  }
  assert.equal(bad.length, 0, `${fixture}: ${bad.length} mismatches`);
}

function writeXlsx(ws: XLSX.WorkSheet, name = 'Sheet1'): Buffer {
  const book = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(book, ws, name);
  return Buffer.from(XLSX.write(book, { type: 'buffer', bookType: 'xlsx' }) as Buffer);
}

/** Performance-like golden sheet: col0 = date column for post-process. */
function writePerformanceGolden(): Buffer {
  const ws = XLSX.utils.aoa_to_sheet([
    ['تاريخ', 'كود', 'ساعات', 'طلبات', 'قبول', 'ملاحظة'],
  ]);
  // Row 2: integer in col2
  ws['A2'] = { t: 'n', v: 44927, z: 'm/d/yy' };
  ws['B2'] = { t: 's', v: 'R1' };
  ws['C2'] = { t: 'n', v: 20 };
  ws['D2'] = { t: 'n', v: 12 };
  ws['E2'] = { t: 'n', v: 0.85, z: '0%' };
  ws['F2'] = { t: 's', v: 'int' };

  // Row 3: decimal
  ws['A3'] = { t: 'n', v: 44928, z: 'm/d/yy' };
  ws['B3'] = { t: 's', v: 'R2' };
  ws['C3'] = { t: 'n', v: 200.85 };

  // Row 4: percentage col
  ws['A4'] = { t: 'n', v: 44929, z: 'm/d/yy' };
  ws['B4'] = { t: 's', v: 'R3' };
  ws['E4'] = { t: 'n', v: 0.85, z: '0%' };

  // Row 5: currency formatted
  ws['A5'] = { t: 'n', v: 44930, z: 'm/d/yy' };
  ws['B5'] = { t: 's', v: 'R4' };
  ws['C5'] = { t: 'n', v: 1234.5, z: '#,##0.00' };

  // Row 6: serial 59 (col0 — NOT post-processed, outside 40000–50000)
  ws['A6'] = { t: 'n', v: 59, z: 'm/d/yy' };
  ws['B6'] = { t: 's', v: 'R5' };

  // Row 7: serial 60
  ws['A7'] = { t: 'n', v: 60, z: 'm/d/yy' };
  ws['B7'] = { t: 's', v: 'R6' };

  // Row 8: serial 61
  ws['A8'] = { t: 'n', v: 61, z: 'm/d/yy' };
  ws['B8'] = { t: 's', v: 'R7' };

  // Row 9: fractional serial col0
  ws['A9'] = { t: 'n', v: 44927.5, z: 'm/d/yy h:mm' };
  ws['B9'] = { t: 's', v: 'R8' };

  // Row 10: text col0 M/D/YYYY string
  ws['A10'] = { t: 's', v: '8/19/2026' };
  ws['B10'] = { t: 's', v: 'R9' };

  // Row 11: Arabic
  ws['A11'] = { t: 'n', v: 44931, z: 'm/d/yy' };
  ws['B11'] = { t: 's', v: 'R10' };
  ws['F11'] = { t: 's', v: 'مرحبا' };

  // Row 12: empty cell
  ws['A12'] = { t: 'n', v: 44932, z: 'm/d/yy' };
  ws['B12'] = { t: 's', v: 'R11' };
  ws['C12'] = { t: 's', v: '' };

  ws['!ref'] = 'A1:F12';
  return writeXlsx(ws, 'Performance');
}

function writeTrailingRows(): Buffer {
  const ws: XLSX.WorkSheet = {
    A1: { t: 's', v: 'تاريخ' },
    B1: { t: 's', v: 'كود' },
    A2: { t: 'n', v: 44927, z: 'm/d/yy' },
    B2: { t: 's', v: 'R1' },
    '!ref': 'A1:B5',
  };
  return writeXlsx(ws);
}

function writeTrailingCols(): Buffer {
  const ws: XLSX.WorkSheet = {
    A1: { t: 's', v: 'تاريخ' },
    A2: { t: 'n', v: 44927, z: 'm/d/yy' },
    A3: { t: 'n', v: 44928, z: 'm/d/yy' },
    '!ref': 'A1:D3',
  };
  return writeXlsx(ws);
}

function writePartialFinalRow(): Buffer {
  const ws = XLSX.utils.aoa_to_sheet([
    ['تاريخ', 'كود', 'ساعات'],
    [44927, 'R1', 8],
    [44928],
  ]);
  ws['A2'] = { t: 'n', v: 44927, z: 'm/d/yy' };
  ws['A3'] = { t: 'n', v: 44928, z: 'm/d/yy' };
  ws['!ref'] = 'A1:C3';
  return writeXlsx(ws);
}

function writeIntermediateEmptyRows(): Buffer {
  const ws = XLSX.utils.aoa_to_sheet([
    ['تاريخ', 'كود'],
    [44927, 'R1'],
    ['', ''],
    [44929, 'R2'],
  ]);
  ws['A2'] = { t: 'n', v: 44927, z: 'm/d/yy' };
  ws['A4'] = { t: 'n', v: 44929, z: 'm/d/yy' };
  ws['!ref'] = 'A1:B4';
  return writeXlsx(ws);
}

function writeMergedCol0(): Buffer {
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
  return writeXlsx(ws);
}

function writeHeaderOnly(): Buffer {
  return writeXlsx(XLSX.utils.aoa_to_sheet([['تاريخ', 'كود', 'ساعات']]));
}

function writeOleXls(): Buffer {
  const ws = XLSX.utils.aoa_to_sheet([
    ['تاريخ', 'كود', 'ساعات'],
    [44927, 'Rxls', 8],
  ]);
  ws['A2'] = { t: 'n', v: 44927, z: 'm/d/yy' };
  ws['C2'] = { t: 'n', v: 0.85, z: '0%' };
  const book = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(book, ws, 'Upload');
  return Buffer.from(XLSX.write(book, { type: 'buffer', bookType: 'xls' }) as Buffer);
}

describe('SPIKE: excelProcessorServer.readExcelFromBuffer vs adapter candidate', () => {
  it('documents production contract spot-checks on raw matrix + col0 post-process', () => {
    const buf = writePerformanceGolden();
    const raw = productionSheetJsMatrix(buf);
    const final = productionReadExcelFromBuffer(buf);

    // Raw: col0 serials remain numbers before post-process
    assert.equal(raw[1][0], 44927);
    assert.equal(typeof raw[1][0], 'number');
    assert.equal(raw[2][2], 200.85);
    assert.equal(raw[3][4], 0.85);
    assert.equal(raw[4][2], 1234.5);
    assert.equal(raw[5][0], 59);
    assert.equal(raw[8][0], 44927.5);

    // Final: col0 serial 40000–50000 → YYYY-MM-DD
    assert.equal(final[1][0], '2023-01-01');
    assert.equal(typeof final[1][0], 'string');
    assert.equal(final[5][0], 59); // outside range — unchanged
    assert.equal(final[8][0], '2023-01-01'); // fractional serial → date (time dropped)
    assert.equal(final[9][0], '2026-08-19'); // M/D/YYYY string
    assert.equal(final[10][5], 'مرحبا');
    assert.equal(final[11][2], '');

    // Other columns unchanged (still numbers)
    assert.equal(typeof final[1][2], 'number');
    assert.equal(final[1][2], 20);
  });

  it('01–12 golden performance sheet: full parity after col0 post-process', async () => {
    const buf = writePerformanceGolden();
    const prod = productionReadExcelFromBuffer(buf);
    const adapter = await candidateReadExcelFromBuffer(buf);
    assertParity('golden-performance', prod, adapter);
  });

  it('13 trailing empty rows', async () => {
    const buf = writeTrailingRows();
    const prod = productionReadExcelFromBuffer(buf);
    const adapter = await candidateReadExcelFromBuffer(buf);
    assert.equal(prod.length, 5);
    assertParity('trailing-rows', prod, adapter);
  });

  it('14 trailing empty columns', async () => {
    const buf = writeTrailingCols();
    const prod = productionReadExcelFromBuffer(buf);
    const adapter = await candidateReadExcelFromBuffer(buf);
    assert.equal(prod[0].length, 4);
    assertParity('trailing-cols', prod, adapter);
  });

  it('15 partial final row', async () => {
    const buf = writePartialFinalRow();
    const prod = productionReadExcelFromBuffer(buf);
    const adapter = await candidateReadExcelFromBuffer(buf);
    assertParity('partial-final-row', prod, adapter);
  });

  it('16 header-only', async () => {
    const buf = writeHeaderOnly();
    const prod = productionReadExcelFromBuffer(buf);
    const adapter = await candidateReadExcelFromBuffer(buf);
    assert.equal(prod.length, 1);
    assertParity('header-only', prod, adapter);
  });

  it('17 empty/intermediate rows', async () => {
    const buf = writeIntermediateEmptyRows();
    const prod = productionReadExcelFromBuffer(buf);
    const adapter = await candidateReadExcelFromBuffer(buf);
    assertParity('intermediate-empty', prod, adapter);
  });

  it('18 merged cells col0', async () => {
    const buf = writeMergedCol0();
    const prod = productionReadExcelFromBuffer(buf);
    const adapter = await candidateReadExcelFromBuffer(buf);
    assertParity('merged-col0', prod, adapter);
  });

  it('19 formula cached General numeric', async () => {
    const created = createWorkbook();
    created.addAoASheet('Perf', [['تاريخ', 'val'], [44927, 10], [null, null]]);
    created.sheet().getCell('A2').numFmt = 'm/d/yy';
    created.sheet().getCell('B3').value = { formula: 'B2*2', result: 20 };
    const buf = await created.writeBuffer();
    const prod = productionReadExcelFromBuffer(buf);
    const adapter = await candidateReadExcelFromBuffer(buf);
    assertParity('formula-general', prod, adapter);
  });

  it('20 formula cached percentage', async () => {
    const created = createWorkbook();
    created.addAoASheet('Perf', [['تاريخ', 'pct'], [44927, null]]);
    created.sheet().getCell('A2').numFmt = 'm/d/yy';
    const cell = created.sheet().getCell('B2');
    cell.value = { formula: '0.85', result: 0.85 };
    cell.numFmt = '0%';
    const buf = await created.writeBuffer();
    const prod = productionReadExcelFromBuffer(buf);
    const adapter = await candidateReadExcelFromBuffer(buf);
    assertParity('formula-pct', prod, adapter);
  });

  it('21 .xls/OLE parity with col0 post-process', async () => {
    const xls = writeOleXls();
    assert.equal(xls[0], 0xd0);
    await assert.rejects(
      () => readWorkbook(xls, { filename: 'upload.xls' }),
      UnsupportedLegacyXlsError
    );
    const prod = productionReadExcelFromBuffer(xls);
    const adapter = await candidateReadExcelFromBuffer(xls, 'upload.xls');
    assert.equal(typeof prod[1][0], 'string'); // col0 serial post-processed
    assertParity('xls-ole', prod, adapter);
  });

  it('raw matrix parity BEFORE col0 post-process (adapter vs SheetJS)', async () => {
    const fixtures: Array<{ name: string; buf: Buffer; filename?: string }> = [
      { name: 'golden', buf: writePerformanceGolden() },
      { name: 'trailing-rows', buf: writeTrailingRows() },
      { name: 'trailing-cols', buf: writeTrailingCols() },
      { name: 'merged', buf: writeMergedCol0() },
      { name: 'xls', buf: writeOleXls(), filename: 'upload.xls' },
    ];
    for (const { name, buf, filename } of fixtures) {
      const prodRaw = productionSheetJsMatrix(buf);
      const adapterRaw = (await readFirstSheetMatrix(buf, {
        ...ADAPTER_CANDIDATE,
        filename,
      })) as unknown[][];
      assertParity(`raw-${name}`, prodRaw, adapterRaw);
    }
  });
});
