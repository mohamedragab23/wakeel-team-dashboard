/**
 * First-sheet readers with SheetJS-compatible serial dates.
 *
 * .xls / OLE Compound File: ExcelJS cannot parse BIFF. When `legacyXlsFallback`
 * is true (default), this module uses a narrowly scoped `xlsx` read for those
 * inputs only. OOXML (.xlsx) always goes through ExcelJS. Do not use this as a
 * second general Excel abstraction — callers should keep using these helpers.
 */
import * as XLSX from 'xlsx';
import { isLegacyXlsInput } from './legacyXls';
import { readWorkbook, type MatrixExtractOptions } from './workbook';

export type ReadFirstSheetOptions = MatrixExtractOptions & {
  filename?: string;
  /** When true (default), OLE / .xls filenames use SheetJS. ExcelJS cannot read BIFF. */
  legacyXlsFallback?: boolean;
};

function toUint8Array(input: ArrayBuffer | Buffer | Uint8Array): Uint8Array {
  if (input instanceof Uint8Array) return input;
  return new Uint8Array(input);
}

function isEmptyRow(row: unknown[]): boolean {
  return row.every((cell) => cell == null || cell === '');
}

function trimTrailingEmptyRows(matrix: unknown[][]): unknown[][] {
  let end = matrix.length;
  while (end > 1 && isEmptyRow(matrix[end - 1] as unknown[])) end -= 1;
  return matrix.slice(0, end);
}

function sheetJsFirstSheet(bytes: Uint8Array) {
  const wb = XLSX.read(bytes, { type: 'array' });
  const name = wb.SheetNames[0];
  if (!name) throw new Error('Workbook has no sheets');
  return wb.Sheets[name];
}

export async function readFirstSheetMatrix(
  input: ArrayBuffer | Buffer | Uint8Array,
  opts: ReadFirstSheetOptions = {}
): Promise<unknown[][]> {
  const bytes = toUint8Array(input);
  const fallback = opts.legacyXlsFallback !== false;
  if (fallback && isLegacyXlsInput(bytes, opts.filename)) {
    const ws = sheetJsFirstSheet(bytes);
    const matrix = XLSX.utils.sheet_to_json(ws, {
      header: 1,
      raw: opts.raw === 'ssf-display' ? false : opts.raw !== false,
      defval: opts.defval ?? '',
    }) as unknown[][];
    return trimTrailingEmptyRows(matrix);
  }

  const wb = await readWorkbook(bytes, { filename: opts.filename });
  const matrix = wb.sheetToMatrix(undefined, {
    defval: opts.defval ?? '',
    raw: opts.raw,
    dateMode: opts.dateMode ?? 'excel-serial',
    merged: opts.merged,
  });
  return trimTrailingEmptyRows(matrix);
}

export async function readFirstSheetObjects(
  input: ArrayBuffer | Buffer | Uint8Array,
  opts: ReadFirstSheetOptions = {}
): Promise<Record<string, unknown>[]> {
  const bytes = toUint8Array(input);
  const fallback = opts.legacyXlsFallback !== false;
  if (fallback && isLegacyXlsInput(bytes, opts.filename)) {
    const ws = sheetJsFirstSheet(bytes);
    return XLSX.utils.sheet_to_json<Record<string, unknown>>(ws, {
      defval: opts.defval ?? '',
      raw: opts.raw === 'ssf-display' ? false : opts.raw !== false,
    });
  }

  const wb = await readWorkbook(bytes, { filename: opts.filename });
  return wb.sheetToObjects(undefined, {
    defval: opts.defval ?? '',
    raw: opts.raw,
    dateMode: opts.dateMode ?? 'excel-serial',
    merged: opts.merged,
  });
}
