/**
 * SPIKE ONLY — Production Tableau Excel matrix contract vs adapter candidate.
 *
 * Reference (exact production path — raw NOT passed to sheet_to_json):
 *   XLSX.read(buffer, { type: 'array', raw: false })
 *   + sheet_to_json(ws, { header: 1, defval: '' })
 *
 * Candidate:
 *   readFirstSheetMatrix(buffer, {
 *     raw: true,
 *     dateMode: 'excel-serial',
 *     merged: 'sheetjs-anchor-only',
 *     defval: '',
 *     legacyXlsFallback: true,
 *   })
 *
 * Do NOT treat this as authorization to migrate production callers.
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

/** Exact pre-migration Tableau Excel matrix reader. */
function productionSheetJsMatrix(buf: Buffer): unknown[][] {
  const wb = XLSX.read(buf, { type: 'array', raw: false });
  const ws = wb.Sheets[wb.SheetNames[0]];
  return XLSX.utils.sheet_to_json(ws, {
    header: 1,
    defval: '',
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

function writeXlsx(ws: XLSX.WorkSheet, name = 'Crosstab'): Buffer {
  const book = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(book, ws, name);
  return Buffer.from(XLSX.write(book, { type: 'buffer', bookType: 'xlsx' }) as Buffer);
}

function writeGoldenWorkbook(): { buf: Buffer; numFmtByA1: Record<string, string> } {
  const headers = [
    'label',
    'value',
    'Rider ID',
    'Actual Working Hours',
    'Completed Orders',
    'Acceptance Rate',
    'Contract Name',
    'ملاحظة',
  ];
  const ws = XLSX.utils.aoa_to_sheet([headers]);

  // Row 2: General integer 20
  ws['A2'] = { t: 's', v: 'general-int' };
  ws['B2'] = { t: 'n', v: 20 };

  // Row 3: General decimal 200.85
  ws['A3'] = { t: 's', v: 'general-dec' };
  ws['B3'] = { t: 'n', v: 200.85 };

  // Row 4: percentage 0.85 / 0%
  ws['A4'] = { t: 's', v: 'pct' };
  ws['B4'] = { t: 'n', v: 0.85, z: '0%' };

  // Row 5: formatted decimal
  ws['A5'] = { t: 's', v: 'fmt-num' };
  ws['B5'] = { t: 'n', v: 1234.5, z: '#,##0.00' };

  // Row 6: date 44927
  ws['A6'] = { t: 's', v: 'date-44927' };
  ws['B6'] = { t: 'n', v: 44927, z: 'm/d/yy' };

  // Row 7–9: serials 59/60/61
  ws['A7'] = { t: 's', v: 'serial-59' };
  ws['B7'] = { t: 'n', v: 59, z: 'm/d/yy' };
  ws['A8'] = { t: 's', v: 'serial-60' };
  ws['B8'] = { t: 'n', v: 60, z: 'm/d/yy' };
  ws['A9'] = { t: 's', v: 'serial-61' };
  ws['B9'] = { t: 'n', v: 61, z: 'm/d/yy' };

  // Row 10: datetime serial
  ws['A10'] = { t: 's', v: 'serial-44927.5' };
  ws['B10'] = { t: 'n', v: 44927.5, z: 'm/d/yy' };

  // Row 11: ISO text
  ws['A11'] = { t: 's', v: 'iso-text' };
  ws['B11'] = { t: 's', v: '2023-01-01' };

  // Row 12: normal text
  ws['A12'] = { t: 's', v: 'plain-text' };
  ws['B12'] = { t: 's', v: 'hello' };

  // Row 13: empty
  ws['A13'] = { t: 's', v: 'empty' };
  ws['B13'] = { t: 's', v: '' };

  // Row 14: UTF-8 / Arabic
  ws['A14'] = { t: 's', v: 'utf8' };
  ws['B14'] = { t: 's', v: 'مرحبا' };

  // Tableau-like columns on rows 2–4
  ws['C2'] = { t: 's', v: 'W123' };
  ws['D2'] = { t: 'n', v: 8.5 };
  ws['E2'] = { t: 'n', v: 12 };
  ws['F2'] = { t: 'n', v: 0.85, z: '0%' };
  ws['G2'] = { t: 's', v: 'wakeel' };
  ws['H2'] = { t: 's', v: 'تجريبي' };

  ws['C3'] = { t: 's', v: 'W124' };
  ws['D3'] = { t: 'n', v: 7 };
  ws['E3'] = { t: 'n', v: 3 };
  ws['F3'] = { t: 's', v: '85%' };
  ws['G3'] = { t: 's', v: 'wakeel' };
  ws['H3'] = { t: 's', v: '' };

  ws['C4'] = { t: 's', v: 'W125' };
  ws['D4'] = { t: 'n', v: 0 };
  ws['E4'] = { t: 'n', v: 1234.5, z: '#,##0.00' };
  ws['F4'] = { t: 'n', v: 0.85, z: '0%' };
  ws['G4'] = { t: 's', v: 'wakeel' };
  ws['H4'] = { t: 's', v: '' };

  ws['!ref'] = 'A1:H14';
  const numFmtByA1: Record<string, string> = {
    B4: '0%',
    B5: '#,##0.00',
    B6: 'm/d/yy',
    B7: 'm/d/yy',
    B8: 'm/d/yy',
    B9: 'm/d/yy',
    B10: 'm/d/yy',
    F2: '0%',
    E4: '#,##0.00',
    F4: '0%',
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
  const ws = XLSX.utils.aoa_to_sheet([['Rider ID', 'Contract Name']]);
  return writeXlsx(ws);
}

function writeOleXls(): Buffer {
  const ws = XLSX.utils.aoa_to_sheet([
    ['Rider ID', 'Actual Working Hours', 'Acceptance Rate', 'Contract Name'],
    ['Wxls', 8, 0.85, 'wakeel'],
  ]);
  ws['C2'] = { t: 'n', v: 0.85, z: '0%' };
  const book = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(book, ws, 'Crosstab');
  return Buffer.from(XLSX.write(book, { type: 'buffer', bookType: 'xls' }) as Buffer);
}

describe('SPIKE: production Tableau Excel matrix vs adapter candidate', () => {
  it('golden workbook: value+typeof match production SheetJS path', async () => {
    const { buf, numFmtByA1 } = writeGoldenWorkbook();
    const prod = productionSheetJsMatrix(buf);
    const adapter = await readFirstSheetMatrix(buf, ADAPTER_CANDIDATE);

    // Spot-check production contract expectations (numbers, not formatted strings)
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
    assert.equal(prod[10][1], '2023-01-01');
    assert.equal(prod[11][1], 'hello');
    assert.equal(prod[12][1], '');
    assert.equal(prod[13][1], 'مرحبا');

    const bad = collectMismatches('golden-workbook', prod, adapter, numFmtByA1);
    if (bad.length) {
      console.error('[SPIKE] mismatches', JSON.stringify(bad, null, 2));
    }
    assert.equal(bad.length, 0, `golden-workbook mismatches: ${bad.length}`);
  });

  it('formula cached General numeric result matches production', async () => {
    const created = createWorkbook();
    created.addAoASheet('Crosstab', [['n'], [10], [null]]);
    created.sheet().getCell('A3').value = { formula: 'A2*2', result: 20 };
    const buf = await created.writeBuffer();
    const prod = productionSheetJsMatrix(buf);
    const adapter = await readFirstSheetMatrix(buf, ADAPTER_CANDIDATE);
    assert.equal(prod[2][0], 20);
    assert.equal(typeof prod[2][0], 'number');
    const bad = collectMismatches('formula-general', prod, adapter, { A3: 'General' });
    if (bad.length) console.error('[SPIKE] formula-general', JSON.stringify(bad, null, 2));
    assert.equal(bad.length, 0);
  });

  it('formula cached percentage-formatted result matches production', async () => {
    const created = createWorkbook();
    created.addAoASheet('Crosstab', [['pct'], [null]]);
    const cell = created.sheet().getCell('A2');
    cell.value = { formula: '0.85', result: 0.85 };
    cell.numFmt = '0%';
    const buf = await created.writeBuffer();
    const prod = productionSheetJsMatrix(buf);
    const adapter = await readFirstSheetMatrix(buf, ADAPTER_CANDIDATE);
    console.log('[SPIKE] formula-pct production', prod[1][0], typeof prod[1][0]);
    console.log('[SPIKE] formula-pct adapter', adapter[1][0], typeof adapter[1][0]);
    const bad = collectMismatches('formula-pct', prod, adapter, { A2: '0%' });
    if (bad.length) console.error('[SPIKE] formula-pct', JSON.stringify(bad, null, 2));
    assert.equal(bad.length, 0);
  });

  it('merged cells: production empty children vs sheetjs-anchor-only', async () => {
    const buf = writeMerged();
    const prod = productionSheetJsMatrix(buf);
    const adapter = await readFirstSheetMatrix(buf, ADAPTER_CANDIDATE);
    assert.equal(prod[1][0], 44927);
    assert.equal(typeof prod[1][0], 'number');
    assert.equal(prod[2][0], '');
    const bad = collectMismatches('merged', prod, adapter, { A2: 'm/d/yy' });
    if (bad.length) console.error('[SPIKE] merged', JSON.stringify(bad, null, 2));
    assert.equal(bad.length, 0);
  });

  it('header-only workbook matches production', async () => {
    const buf = writeHeaderOnly();
    const prod = productionSheetJsMatrix(buf);
    const adapter = await readFirstSheetMatrix(buf, ADAPTER_CANDIDATE);
    assert.equal(prod.length, 1);
    const bad = collectMismatches('header-only', prod, adapter);
    if (bad.length) console.error('[SPIKE] header-only', JSON.stringify(bad, null, 2));
    assert.equal(bad.length, 0);
  });

  it('.xls/OLE: production SheetJS reads; ExcelJS rejects; adapter fallback matches production', async () => {
    const xls = writeOleXls();
    assert.equal(xls[0], 0xd0);
    const prod = productionSheetJsMatrix(xls);
    assert.equal(prod[1][0], 'Wxls');
    assert.equal(typeof prod[1][1], 'number');

    await assert.rejects(
      () => readWorkbook(xls, { filename: 'perf.xls' }),
      UnsupportedLegacyXlsError
    );

    const adapter = await readFirstSheetMatrix(xls, {
      ...ADAPTER_CANDIDATE,
      filename: 'perf.xls',
    });
    const bad = collectMismatches('xls-ole', prod, adapter, { C2: '0%' });
    if (bad.length) console.error('[SPIKE] xls-ole', JSON.stringify(bad, null, 2));
    assert.equal(bad.length, 0);
  });
});
