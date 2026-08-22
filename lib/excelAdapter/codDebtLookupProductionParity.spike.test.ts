/**
 * SPIKE ONLY — Candidate #3: codDebtLookup.parseCodWalletExcel
 *
 * Production oracle (lib/codDebtLookup.ts):
 *   XLSX.read(buffer, { type: 'array', raw: false })
 *   sheet_to_json(ws, { defval: '' })
 *   → header-keyed objects → Map<riderCode, debt>
 *
 * Proposed adapter candidates (NOT authorized to migrate):
 *   A) raw: 'ssf-display' — SheetJS raw:false SSF path (object typeof mismatch on General nums)
 *   B) raw: true, dateMode: 'excel-serial' — matches observed SheetJS object values
 *   → same Map extraction loop unchanged
 *
 * Do NOT normalize values to make tests pass.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import * as XLSX from 'xlsx';
import { readFirstSheetObjects, readWorkbook, UnsupportedLegacyXlsError } from '@/lib/excelAdapter';
import { normalizeRiderCodeForPerformance } from '@/lib/dataFilter';
import { parseCodWalletExcel } from '@/lib/codDebtLookup';

const ADAPTER_SSF = {
  raw: 'ssf-display' as const,
  defval: '',
  legacyXlsFallback: true,
};

const ADAPTER_RAW = {
  raw: true as const,
  dateMode: 'excel-serial' as const,
  defval: '',
  legacyXlsFallback: true,
};

type RowMismatch = {
  fixture: string;
  row: number;
  field: string;
  prod: unknown;
  prodType: string;
  adapter: unknown;
  adapterType: string;
};

function jsType(v: unknown): string {
  if (v === null) return 'null';
  if (v instanceof Date) return 'Date';
  return typeof v;
}

function normHeader(h: string): string {
  return String(h ?? '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ');
}

/** Exact SheetJS object read — production parse path. */
function productionCodObjects(buf: Buffer): Record<string, unknown>[] {
  const wb = XLSX.read(buf, { type: 'array', raw: false });
  const ws = wb.Sheets[wb.SheetNames[0]];
  return XLSX.utils.sheet_to_json<Record<string, unknown>>(ws, { defval: '' });
}

/** Map extraction loop copied verbatim from parseCodWalletExcel. */
function codMapFromObjects(json: Record<string, unknown>[]): Map<string, number> {
  const map = new Map<string, number>();
  for (const row of json) {
    const keys = Object.keys(row);
    const normMap = new Map(keys.map((k) => [normHeader(k), k]));
    const idKey =
      normMap.get('rider cod rider id') ||
      normMap.get('rider id') ||
      keys.find((k) => normHeader(k).includes('rider id'));
    const balKey =
      normMap.get('rider cod balance sum') ||
      normMap.get('balance sum') ||
      keys.find((k) => normHeader(k).includes('balance'));
    if (!idKey || !balKey) continue;
    const code = normalizeRiderCodeForPerformance(row[idKey]);
    if (!code) continue;
    const debt = parseFloat(String(row[balKey] ?? '0').replace(/,/g, '')) || 0;
    map.set(code, debt);
  }
  if (map.size === 0) {
    throw new Error(
      'لم يُعثر على أعمدة Rider COD Rider ID و Rider COD Balance Sum في ملف المديونية'
    );
  }
  return map;
}

async function candidateCodObjects(
  buf: Buffer,
  mode: 'ssf' | 'raw',
  filename?: string
): Promise<Record<string, unknown>[]> {
  const opts = mode === 'ssf' ? ADAPTER_SSF : ADAPTER_RAW;
  return readFirstSheetObjects(buf, { ...opts, filename });
}

async function candidateParseCodMap(
  buf: Buffer,
  mode: 'ssf' | 'raw',
  filename?: string
): Promise<Map<string, number>> {
  const json = await candidateCodObjects(buf, mode, filename);
  return codMapFromObjects(json);
}

function mapsEqual(a: Map<string, number>, b: Map<string, number>): boolean {
  if (a.size !== b.size) return false;
  for (const [k, v] of a) {
    if (!Object.is(b.get(k), v)) return false;
  }
  return true;
}

function collectObjectMismatches(
  fixture: string,
  prod: Record<string, unknown>[],
  adapter: Record<string, unknown>[]
): RowMismatch[] {
  const out: RowMismatch[] = [];
  const rows = Math.max(prod.length, adapter.length);
  for (let r = 0; r < rows; r++) {
    const pr = prod[r] ?? {};
    const ar = adapter[r] ?? {};
    const fields = new Set([...Object.keys(pr), ...Object.keys(ar)]);
    for (const field of fields) {
      const pv = pr[field] ?? '';
      const av = ar[field] ?? '';
      const pt = jsType(pv);
      const at = jsType(av);
      const same =
        pv instanceof Date && av instanceof Date
          ? pv.getTime() === av.getTime()
          : Object.is(pv, av) || (pv === av && pt === at);
      if (!same || pt !== at) {
        out.push({ fixture, row: r, field, prod: pv, prodType: pt, adapter: av, adapterType: at });
      }
    }
  }
  if (prod.length !== adapter.length) {
    out.push({
      fixture,
      row: -1,
      field: 'rowCount',
      prod: prod.length,
      prodType: 'number',
      adapter: adapter.length,
      adapterType: 'number',
    });
  }
  return out;
}

function writeXlsx(rows: unknown[][], sheetName = 'COD'): Buffer {
  const ws = XLSX.utils.aoa_to_sheet(rows);
  const book = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(book, ws, sheetName);
  return Buffer.from(XLSX.write(book, { type: 'buffer', bookType: 'xlsx' }) as Buffer);
}

function writeGoldenCod(): Buffer {
  const ws: XLSX.WorkSheet = {
    A1: { t: 's', v: 'Rider COD Rider ID' },
    B1: { t: 's', v: 'Rider COD Balance Sum' },
    A2: { t: 's', v: '4802535' },
    B2: { t: 'n', v: 1500.5 },
    A3: { t: 'n', v: 4801001 },
    B3: { t: 'n', v: 0 },
    A4: { t: 's', v: '4809999' },
    B4: { t: 'n', v: 1234567.89, z: '#,##0.00' },
    '!ref': 'A1:B4',
  };
  const book = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(book, ws, 'COD');
  return Buffer.from(XLSX.write(book, { type: 'buffer', bookType: 'xlsx' }) as Buffer);
}

function writeAlternateHeaders(): Buffer {
  return writeXlsx([
    ['Rider ID', 'Balance Sum', 'Extra'],
    ['R100', 99.25, 'ignore'],
    ['R200', '1,234.50', 'x'],
  ]);
}

function writeEmptyMiddleRow(): Buffer {
  return writeXlsx([
    ['Rider COD Rider ID', 'Rider COD Balance Sum'],
    ['R1', 10],
    ['', ''],
    ['R2', 20],
  ]);
}

function writeOleXls(): Buffer {
  const ws = XLSX.utils.aoa_to_sheet([
    ['Rider COD Rider ID', 'Rider COD Balance Sum'],
    ['Rxls', 42.5],
  ]);
  const book = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(book, ws, 'COD');
  return Buffer.from(XLSX.write(book, { type: 'buffer', bookType: 'xls' }) as Buffer);
}

function writeBadHeaders(): Buffer {
  return writeXlsx([
    ['Name', 'Amount'],
    ['Ali', 100],
  ]);
}

function productionParseCodMap(buf: Buffer): Map<string, number> {
  return codMapFromObjects(productionCodObjects(buf));
}

describe('SPIKE: parseCodWalletExcel migrated vs historical SheetJS', () => {
  it('documents production contract spot-checks', async () => {
    const buf = writeGoldenCod();
    const objs = productionCodObjects(buf);
    assert.equal(objs.length, 3);
    assert.equal(typeof objs[0]['Rider COD Rider ID'], 'string');
    assert.equal(objs[0]['Rider COD Rider ID'], '4802535');
    assert.equal(typeof objs[1]['Rider COD Rider ID'], 'number');
    assert.equal(objs[1]['Rider COD Rider ID'], 4801001);
    assert.equal(typeof objs[2]['Rider COD Balance Sum'], 'number');
    const prodMap = productionParseCodMap(buf);
    const migrated = await parseCodWalletExcel(buf, '2026-08-22');
    assert.ok(mapsEqual(prodMap, migrated));
    assert.equal(migrated.get('4802535'), 1500.5);
    assert.equal(migrated.get('4801001'), 0);
    assert.equal(migrated.get('4809999'), 1234567.89);
  });

  it('ssf-display: documents object typeof mismatch vs SheetJS raw:false', async () => {
    const buf = writeGoldenCod();
    const prodObjs = productionCodObjects(buf);
    const adapterObjs = await candidateCodObjects(buf, 'ssf');
    const objBad = collectObjectMismatches('golden-ssf', prodObjs, adapterObjs);
    assert.ok(objBad.length > 0, 'ssf-display should differ at object level');
  });

  it('raw:true — golden COD export: objects + Map parity', async () => {
    const buf = writeGoldenCod();
    const prodObjs = productionCodObjects(buf);
    const adapterObjs = await candidateCodObjects(buf, 'raw');
    const objBad = collectObjectMismatches('golden-raw', prodObjs, adapterObjs);
    if (objBad.length) console.error('[SPIKE COD raw] object mismatches', JSON.stringify(objBad, null, 2));
    assert.equal(objBad.length, 0);

    const prodMap = productionParseCodMap(buf);
    const migrated = await parseCodWalletExcel(buf, '2026-08-22');
    assert.ok(mapsEqual(prodMap, migrated));
  });

  it('raw:true — alternate header aliases Rider ID / Balance Sum', async () => {
    const buf = writeAlternateHeaders();
    const prodMap = productionParseCodMap(buf);
    const migrated = await parseCodWalletExcel(buf, '2026-08-22');
    assert.ok(mapsEqual(prodMap, migrated));
    assert.equal(prodMap.get('R100'), 99.25);
    assert.equal(prodMap.get('R200'), 1234.5);
  });

  it('raw:true — empty middle row: Map parity (adapter skips blank object rows)', async () => {
    const buf = writeEmptyMiddleRow();
    const prodMap = productionParseCodMap(buf);
    const migrated = await parseCodWalletExcel(buf, '2026-08-22');
    assert.ok(mapsEqual(prodMap, migrated));
    // Object-level: SheetJS retains empty row; adapter sheetToObjects drops it — documented gap.
    const prodObjs = productionCodObjects(buf);
    const adapterObjs = await candidateCodObjects(buf, 'raw');
    assert.equal(prodObjs.length, 3);
    assert.equal(adapterObjs.length, 2);
  });

  it('raw:true — integer / decimal / currency balance values', async () => {
    const buf = writeGoldenCod();
    const prodMap = productionParseCodMap(buf);
    const migrated = await parseCodWalletExcel(buf, '2026-08-22');
    assert.ok(mapsEqual(prodMap, migrated));
  });

  it('raw:true — text rider id + Arabic extra column ignored', async () => {
    const ws: XLSX.WorkSheet = {
      A1: { t: 's', v: 'Rider COD Rider ID' },
      B1: { t: 's', v: 'Rider COD Balance Sum' },
      C1: { t: 's', v: 'ملاحظة' },
      A2: { t: 's', v: '4802535' },
      B2: { t: 'n', v: 100 },
      C2: { t: 's', v: 'مرحبا' },
      '!ref': 'A1:C2',
    };
    const book = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(book, ws, 'COD');
    const buf = Buffer.from(XLSX.write(book, { type: 'buffer', bookType: 'xlsx' }) as Buffer);
    const prodMap = productionParseCodMap(buf);
    const migrated = await parseCodWalletExcel(buf, '2026-08-22');
    assert.ok(mapsEqual(prodMap, migrated));
  });

  it('raw:true — missing required columns: same error', async () => {
    const buf = writeBadHeaders();
    assert.throws(() => productionParseCodMap(buf), /Rider COD Rider ID/);
    await assert.rejects(
      () => parseCodWalletExcel(buf, '2026-08-22'),
      /Rider COD Rider ID/
    );
  });

  it('raw:true — .xls/OLE parity', async () => {
    const xls = writeOleXls();
    assert.equal(xls[0], 0xd0);
    await assert.rejects(
      () => readWorkbook(xls, { filename: 'cod.xls' }),
      UnsupportedLegacyXlsError
    );
    const prodMap = productionParseCodMap(xls);
    const migrated = await parseCodWalletExcel(xls, '2026-08-22');
    assert.ok(mapsEqual(prodMap, migrated));
    assert.equal(migrated.get('Rxls'), 42.5);
  });
});
