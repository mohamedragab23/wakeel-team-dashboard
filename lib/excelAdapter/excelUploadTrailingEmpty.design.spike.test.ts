/**
 * DESIGN SPIKE — trailing-empty parity against the real adapter opt-in.
 * (Replaces the earlier inline prototype; exercises preserveSheetJsRefShape.)
 *
 * Production contract:
 *   XLSX.read(..., { type:'array', cellDates:false })
 *   sheet_to_json(..., { header:1, defval:'', raw:true })
 *
 * Adapter opt-in:
 *   readFirstSheetMatrix(..., {
 *     raw: true,
 *     dateMode: 'excel-serial',
 *     merged: 'sheetjs-anchor-only',
 *     defval: '',
 *     legacyXlsFallback: true,
 *     preserveSheetJsRefShape: true,
 *   })
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import * as XLSX from 'xlsx';
import ExcelJS from 'exceljs';
import {
  readFirstSheetMatrix,
  readWorkbook,
  UnsupportedLegacyXlsError,
} from '@/lib/excelAdapter';

const OPT_IN = {
  raw: true as const,
  dateMode: 'excel-serial' as const,
  merged: 'sheetjs-anchor-only' as const,
  defval: '',
  legacyXlsFallback: true,
  preserveSheetJsRefShape: true,
};

const DEFAULT_MODE = {
  raw: true as const,
  dateMode: 'excel-serial' as const,
  merged: 'sheetjs-anchor-only' as const,
  defval: '',
  legacyXlsFallback: true,
};

function productionExcelUploadMatrix(buf: Buffer): unknown[][] {
  const data = new Uint8Array(buf);
  const workbook = XLSX.read(data, { type: 'array', cellDates: false });
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

function collectMismatches(prod: unknown[][], got: unknown[][]) {
  const out: Array<Record<string, unknown>> = [];
  if (prod.length !== got.length) {
    out.push({ kind: 'matrix-length', prod: prod.length, got: got.length });
  }
  const rows = Math.max(prod.length, got.length);
  for (let r = 0; r < rows; r++) {
    const pr = prod[r] ?? [];
    const gr = got[r] ?? [];
    if (pr.length !== gr.length) {
      out.push({ kind: 'row-length', row: r, prod: pr.length, got: gr.length });
    }
    const cols = Math.max(pr.length, gr.length);
    for (let c = 0; c < cols; c++) {
      const sv = pr[c];
      const av = gr[c];
      const st = sv === undefined ? 'undefined' : jsType(sv);
      const at = av === undefined ? 'undefined' : jsType(av);
      if (!Object.is(sv, av) || st !== at) {
        out.push({ kind: 'cell', r, c, sv, st, av, at });
      }
    }
  }
  return out;
}

function writeXlsx(ws: XLSX.WorkSheet, name = 'Edge'): Buffer {
  const book = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(book, ws, name);
  return Buffer.from(XLSX.write(book, { type: 'buffer', bookType: 'xlsx' }) as Buffer);
}

function trailingEmptyRows(): Buffer {
  return writeXlsx({
    A1: { t: 's', v: 'code' },
    B1: { t: 's', v: 'name' },
    A2: { t: 's', v: 'R1' },
    B2: { t: 's', v: 'Ali' },
    '!ref': 'A1:B5',
  });
}

function trailingEmptyColumns(): Buffer {
  return writeXlsx({
    A1: { t: 's', v: 'code' },
    A2: { t: 's', v: 'R1' },
    A3: { t: 's', v: 'R2' },
    '!ref': 'A1:D3',
  });
}

function partialFinalRow(): Buffer {
  return writeXlsx({
    A1: { t: 's', v: 'code' },
    B1: { t: 's', v: 'hours' },
    A2: { t: 's', v: 'R1' },
    B2: { t: 'n', v: 8 },
    A3: { t: 's', v: 'R2' },
    '!ref': 'A1:B3',
  });
}

function headerOnly(): Buffer {
  return writeXlsx(XLSX.utils.aoa_to_sheet([['كود', 'اسم']]));
}

function emptyRowsBetween(): Buffer {
  return writeXlsx({
    A1: { t: 's', v: 'code' },
    A2: { t: 's', v: 'R1' },
    A4: { t: 's', v: 'R2' },
    '!ref': 'A1:A4',
  });
}

function operationalTrailing(): Buffer {
  return writeXlsx({
    A1: { t: 's', v: 'كود المندوب' },
    B1: { t: 's', v: 'المنطقة' },
    A2: { t: 's', v: 'R99' },
    B2: { t: 's', v: 'إسكندرية' },
    '!ref': 'A1:B5',
  });
}

function writeOleXls(): Buffer {
  const ws = XLSX.utils.aoa_to_sheet([
    ['كود', 'ساعات'],
    ['Rxls', 8],
  ]);
  ws['!ref'] = 'A1:B4';
  const book = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(book, ws, 'Upload');
  return Buffer.from(XLSX.write(book, { type: 'buffer', bookType: 'xls' }) as Buffer);
}

describe('DESIGN SPIKE: preserveSheetJsRefShape opt-in (real adapter)', () => {
  it('documents: ExcelJS still shrinks used range; opt-in restores OOXML dimension', async () => {
    const buf = trailingEmptyRows();
    const sj = XLSX.read(new Uint8Array(buf), { type: 'array', cellDates: false });
    const ref = sj.Sheets[sj.SheetNames[0]]['!ref'];
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(buf);
    const xws = wb.worksheets[0];
    assert.equal(ref, 'A1:B5');
    const excelRows = Math.max(xws.actualRowCount || 0, xws.rowCount || 0);
    assert.ok(excelRows < 5);
    const optIn = await readFirstSheetMatrix(buf, OPT_IN);
    assert.equal(optIn.length, 5);
  });

  it('default mode still trims trailing empty rows', async () => {
    const buf = trailingEmptyRows();
    const cur = await readFirstSheetMatrix(buf, DEFAULT_MODE);
    assert.equal(cur.length, 2);
  });

  async function assertOptIn(name: string, buf: Buffer, filename?: string) {
    const prod = productionExcelUploadMatrix(buf);
    const got = await readFirstSheetMatrix(buf, { ...OPT_IN, filename });
    const bad = collectMismatches(prod, got);
    if (bad.length) {
      console.error(`[DESIGN ${name}] prod`, JSON.stringify(prod));
      console.error(`[DESIGN ${name}] adapter`, JSON.stringify(got));
      console.error(`[DESIGN ${name}] mismatches`, JSON.stringify(bad, null, 2));
    }
    assert.equal(bad.length, 0, `${name}: ${bad.length} mismatch(es)`);
  }

  it('opt-in: trailing empty rows', async () => {
    await assertOptIn('trailing-rows', trailingEmptyRows());
  });

  it('opt-in: trailing empty columns', async () => {
    await assertOptIn('trailing-cols', trailingEmptyColumns());
  });

  it('opt-in: partial final row', async () => {
    await assertOptIn('partial-final', partialFinalRow());
  });

  it('opt-in: header-only', async () => {
    await assertOptIn('header-only', headerOnly());
  });

  it('opt-in: empty rows between data', async () => {
    await assertOptIn('empty-between', emptyRowsBetween());
  });

  it('opt-in: operational trailing blanks', async () => {
    await assertOptIn('operational-trailing', operationalTrailing());
  });

  it('opt-in: .xls OLE no-trim matches production', async () => {
    const xls = writeOleXls();
    assert.equal(xls[0], 0xd0);
    await assert.rejects(() => readWorkbook(xls, { filename: 'upload.xls' }), UnsupportedLegacyXlsError);
    await assertOptIn('xls-ole-trailing', xls, 'upload.xls');
  });
});
