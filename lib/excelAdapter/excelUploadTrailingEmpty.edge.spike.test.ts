/**
 * EDGE-CASE SPIKE ONLY — trailing empty rows/columns for Candidate #1.
 *
 * Production contract (ExcelUploadEnhanced) — exact:
 *   XLSX.read(data, { type: 'array', cellDates: false })
 *   sheet_to_json(ws, { header: 1, defval: '', raw: true })
 *
 * Adapter candidate:
 *   readFirstSheetMatrix(..., {
 *     raw: true,
 *     dateMode: 'excel-serial',
 *     merged: 'sheetjs-anchor-only',
 *     defval: '',
 *     legacyXlsFallback: true,
 *   })
 *
 * NO normalization. NO SheetJS trimming. NO adapter padding.
 * Existing excelUploadProductionParity.spike.test.ts is left unchanged.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import * as XLSX from 'xlsx';
import { readFirstSheetMatrix } from '@/lib/excelAdapter';

/** Opt-in shape mode required for trailing-empty parity (default adapter still trims). */
const ADAPTER_CANDIDATE = {
  raw: true as const,
  dateMode: 'excel-serial' as const,
  merged: 'sheetjs-anchor-only' as const,
  defval: '',
  legacyXlsFallback: true,
  preserveSheetJsRefShape: true,
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

type ShapeMismatch = {
  kind: 'matrix-length' | 'row-length' | 'value' | 'typeof';
  detail: string;
  sheetJs: unknown;
  adapter: unknown;
};

function collectShapeMismatches(prod: unknown[][], adapter: unknown[][]): ShapeMismatch[] {
  const out: ShapeMismatch[] = [];
  if (prod.length !== adapter.length) {
    out.push({
      kind: 'matrix-length',
      detail: `prod.length=${prod.length} adapter.length=${adapter.length}`,
      sheetJs: prod.length,
      adapter: adapter.length,
    });
  }
  const rows = Math.max(prod.length, adapter.length);
  for (let r = 0; r < rows; r++) {
    const pr = prod[r] ?? [];
    const ar = adapter[r] ?? [];
    if (pr.length !== ar.length) {
      out.push({
        kind: 'row-length',
        detail: `row ${r}: prod=${pr.length} adapter=${ar.length}`,
        sheetJs: pr.length,
        adapter: ar.length,
      });
    }
    const cols = Math.max(pr.length, ar.length);
    for (let c = 0; c < cols; c++) {
      const sv = pr[c];
      const av = ar[c];
      // Missing cell beyond row length is a shape issue already recorded;
      // still compare present cells strictly (no ?? '' normalization).
      const st = sv === undefined ? 'undefined' : jsType(sv);
      const at = av === undefined ? 'undefined' : jsType(av);
      const sameValue =
        sv instanceof Date && av instanceof Date
          ? sv.getTime() === av.getTime()
          : Object.is(sv, av);
      if (!sameValue) {
        out.push({
          kind: 'value',
          detail: `r${r}c${c}`,
          sheetJs: sv,
          adapter: av,
        });
      }
      if (st !== at) {
        out.push({
          kind: 'typeof',
          detail: `r${r}c${c} prod=${st} adapter=${at}`,
          sheetJs: st,
          adapter: at,
        });
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

/** 1–2: data then multiple completely empty trailing rows (forced via !ref). */
function trailingEmptyRows(): Buffer {
  const ws: XLSX.WorkSheet = {
    A1: { t: 's', v: 'code' },
    B1: { t: 's', v: 'name' },
    A2: { t: 's', v: 'R1' },
    B2: { t: 's', v: 'Ali' },
    // rows 3–5 intentionally absent → empty under defval when !ref includes them
    '!ref': 'A1:B5',
  };
  return writeXlsx(ws);
}

/** 3: data in column A only; trailing empty columns B–D in range. */
function trailingEmptyColumns(): Buffer {
  const ws: XLSX.WorkSheet = {
    A1: { t: 's', v: 'code' },
    A2: { t: 's', v: 'R1' },
    A3: { t: 's', v: 'R2' },
    '!ref': 'A1:D3',
  };
  return writeXlsx(ws);
}

/** 4: partially populated final row (A filled, B empty within range). */
function partialFinalRow(): Buffer {
  const ws: XLSX.WorkSheet = {
    A1: { t: 's', v: 'code' },
    B1: { t: 's', v: 'hours' },
    A2: { t: 's', v: 'R1' },
    B2: { t: 'n', v: 8 },
    A3: { t: 's', v: 'R2' },
    // B3 missing → defval ''
    '!ref': 'A1:B3',
  };
  return writeXlsx(ws);
}

/** 5: header-only. */
function headerOnly(): Buffer {
  const ws = XLSX.utils.aoa_to_sheet([['كود', 'اسم']]);
  return writeXlsx(ws);
}

/** 6: empty rows between populated rows. */
function emptyRowsBetween(): Buffer {
  const ws: XLSX.WorkSheet = {
    A1: { t: 's', v: 'code' },
    A2: { t: 's', v: 'R1' },
    // row 3 empty
    A4: { t: 's', v: 'R2' },
    '!ref': 'A1:A4',
  };
  return writeXlsx(ws);
}

/**
 * 7: trailing empties operationally meaningful —
 * upload matrix row count includes blank trailer rows (e.g. chunk boundaries /
 * "N physical rows including blanks" semantics). !ref forces 1 header + 1 data + 3 blanks.
 */
function operationalTrailingEmpties(): Buffer {
  const ws: XLSX.WorkSheet = {
    A1: { t: 's', v: 'كود المندوب' },
    B1: { t: 's', v: 'المنطقة' },
    A2: { t: 's', v: 'R99' },
    B2: { t: 's', v: 'إسكندرية' },
    '!ref': 'A1:B5',
  };
  return writeXlsx(ws);
}

describe('EDGE: ExcelUpload trailing empty shape vs adapter candidate', () => {
  async function assertExactShape(name: string, buf: Buffer) {
    const prod = productionExcelUploadMatrix(buf);
    const adapter = await readFirstSheetMatrix(buf, ADAPTER_CANDIDATE);
    const bad = collectShapeMismatches(prod, adapter);
    if (bad.length) {
      console.error(`[EDGE ${name}] production matrix`, JSON.stringify(prod));
      console.error(`[EDGE ${name}] adapter matrix`, JSON.stringify(adapter));
      console.error(`[EDGE ${name}] mismatches`, JSON.stringify(bad, null, 2));
    }
    assert.equal(bad.length, 0, `${name}: ${bad.length} shape/value/typeof mismatch(es)`);
  }

  it('1+2: data followed by multiple trailing empty rows', async () => {
    const buf = trailingEmptyRows();
    const prod = productionExcelUploadMatrix(buf);
    // Document production shape (no trimming on SheetJS side)
    console.log('[EDGE trailing-empty-rows] prod.length', prod.length, 'rows', JSON.stringify(prod));
    assert.ok(prod.length >= 2, 'production must keep at least header+data');
    await assertExactShape('trailing-empty-rows', buf);
  });

  it('3: column A data with trailing empty columns', async () => {
    const buf = trailingEmptyColumns();
    const prod = productionExcelUploadMatrix(buf);
    console.log('[EDGE trailing-empty-cols] prod', JSON.stringify(prod));
    await assertExactShape('trailing-empty-cols', buf);
  });

  it('4: partially populated final row', async () => {
    await assertExactShape('partial-final-row', partialFinalRow());
  });

  it('5: header-only workbook', async () => {
    await assertExactShape('header-only', headerOnly());
  });

  it('6: empty rows between populated rows', async () => {
    const buf = emptyRowsBetween();
    const prod = productionExcelUploadMatrix(buf);
    console.log('[EDGE empty-between] prod', JSON.stringify(prod));
    // Interior empties must not be dropped by either side for PASS
    await assertExactShape('empty-between', buf);
  });

  it('7: trailing empties operationally meaningful (row-count includes blanks)', async () => {
    const buf = operationalTrailingEmpties();
    const prod = productionExcelUploadMatrix(buf);
    console.log('[EDGE operational-trailing] prod.length', prod.length, JSON.stringify(prod));
    await assertExactShape('operational-trailing', buf);
  });
});
