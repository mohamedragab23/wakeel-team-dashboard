import ExcelJS from 'exceljs';
import { assertNotLegacyXls } from './legacyXls';
import { excelSerialToIsoDate } from './serialDate';
import { excelJsDateToSerial, formatSsfDisplay } from './ssfDisplay';

export type MatrixExtractOptions = {
  defval?: unknown;
  /**
   * true: native/raw values (default).
   * false: stringify numbers; dates become local YYYY-MM-DD unless dateMode is excel-serial.
   * 'ssf-display': SheetJS raw:false — format via Excel numFmt + SSF (not cell.text).
   */
  raw?: boolean | 'ssf-display';
  /**
   * SheetJS raw:true + cellDates:false returns Excel date cells as serial numbers.
   * ExcelJS returns Date objects. `excel-serial` recovers the file serial
   * (including serial 60) without JS calendar arithmetic.
   */
  dateMode?: 'native' | 'excel-serial';
  /**
   * exceljs-fill (default): merged children expose the anchor value (ExcelJS).
   * sheetjs-anchor-only: children are empty like SheetJS header:1.
   */
  merged?: 'exceljs-fill' | 'sheetjs-anchor-only';
};

export type JsonSheetOptions = {
  columns?: string[];
  colWidths?: number[];
};

export type AoASheetOptions = {
  colWidths?: number[];
};

type CellObject = {
  formula?: unknown;
  result?: unknown;
  richText?: Array<{ text?: string }>;
  text?: unknown;
  hyperlink?: unknown;
};

function toUint8Array(input: ArrayBuffer | Buffer | Uint8Array): Uint8Array {
  if (input instanceof Uint8Array) return input;
  return new Uint8Array(input);
}

function clipSheetName(name: string): string {
  const trimmed = name.trim() || 'Sheet1';
  return trimmed.slice(0, 31);
}

function applyColWidths(ws: ExcelJS.Worksheet, colWidths?: number[]): void {
  if (!colWidths?.length) return;
  colWidths.forEach((w, i) => {
    const col = ws.getColumn(i + 1);
    col.width = w;
  });
}

function unwrapCellValue(value: unknown): unknown {
  if (value == null) return null;
  if (typeof value !== 'object') return value;
  if (value instanceof Date) return value;
  const obj = value as CellObject;
  if (Array.isArray(obj.richText)) {
    return obj.richText.map((p) => p.text ?? '').join('');
  }
  if (obj.result != null) return unwrapCellValue(obj.result);
  if (obj.text != null) return obj.text;
  if (obj.formula != null) return obj.formula;
  return value;
}

function isEmptyCell(value: unknown): boolean {
  return value == null || value === '';
}

function colLettersToNumber(letters: string): number {
  let n = 0;
  const up = letters.toUpperCase();
  for (let i = 0; i < up.length; i++) {
    n = n * 26 + (up.charCodeAt(i) - 64);
  }
  return n;
}

function decodeA1(addr: string): { row: number; col: number } | null {
  const m = addr.trim().match(/^([A-Z]+)(\d+)$/i);
  if (!m) return null;
  return { col: colLettersToNumber(m[1]), row: parseInt(m[2], 10) };
}

function mergeChildSet(ws: ExcelJS.Worksheet): Set<string> {
  const set = new Set<string>();
  const merges = ((ws.model as { merges?: string[] } | undefined)?.merges ?? []) as string[];
  for (const range of merges) {
    const [tl, br] = String(range).split(':');
    const a = decodeA1(tl);
    const b = decodeA1(br || tl);
    if (!a || !b) continue;
    const top = Math.min(a.row, b.row);
    const left = Math.min(a.col, b.col);
    const bottom = Math.max(a.row, b.row);
    const right = Math.max(a.col, b.col);
    for (let r = top; r <= bottom; r++) {
      for (let c = left; c <= right; c++) {
        if (r === top && c === left) continue;
        set.add(`${r},${c}`);
      }
    }
  }
  return set;
}

function numericFromUnwrapped(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (value instanceof Date) {
    const serial = excelJsDateToSerial(value);
    return Number.isFinite(serial) ? serial : null;
  }
  return null;
}

function formatCell(
  cell: ExcelJS.Cell,
  unwrapped: unknown,
  opts: MatrixExtractOptions
): unknown {
  const dateMode = opts.dateMode ?? 'native';
  const isSsf = opts.raw === 'ssf-display';
  const raw = opts.raw !== false && !isSsf;

  if (isSsf) {
    if (typeof unwrapped === 'string') return unwrapped;
    const numeric = numericFromUnwrapped(unwrapped);
    if (numeric != null) return formatSsfDisplay(numeric, cell.numFmt);
    if (unwrapped instanceof Date) {
      const y = unwrapped.getFullYear();
      const m = String(unwrapped.getMonth() + 1).padStart(2, '0');
      const d = String(unwrapped.getDate()).padStart(2, '0');
      return `${y}-${m}-${d}`;
    }
    return unwrapped;
  }

  if (unwrapped instanceof Date) {
    if (dateMode === 'excel-serial') {
      const serial = excelJsDateToSerial(unwrapped);
      return Number.isFinite(serial) ? serial : unwrapped;
    }
    if (raw) return unwrapped;
    const y = unwrapped.getFullYear();
    const m = String(unwrapped.getMonth() + 1).padStart(2, '0');
    const d = String(unwrapped.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }
  if (typeof unwrapped === 'number' && !raw) {
    return String(unwrapped);
  }
  return unwrapped;
}

function rowFromWorksheet(
  ws: ExcelJS.Worksheet,
  rowNumber: number,
  columnCount: number,
  opts: MatrixExtractOptions,
  childMerges: Set<string>
): unknown[] {
  const defval = opts.defval ?? '';
  const hideChildren = opts.merged === 'sheetjs-anchor-only';
  const row = ws.getRow(rowNumber);
  const out: unknown[] = [];
  for (let c = 1; c <= columnCount; c++) {
    if (hideChildren && childMerges.has(`${rowNumber},${c}`)) {
      out.push(defval);
      continue;
    }
    const cell = row.getCell(c);
    const unwrapped = unwrapCellValue(cell.value);
    if (isEmptyCell(unwrapped)) {
      out.push(defval);
    } else {
      out.push(formatCell(cell, unwrapped, opts));
    }
  }
  return out;
}

export class AdapterWorkbook {
  constructor(private readonly wb: ExcelJS.Workbook) {}

  get sheetNames(): string[] {
    return this.wb.worksheets.map((s) => s.name);
  }

  sheet(name?: string): ExcelJS.Worksheet {
    const ws = name ? this.wb.getWorksheet(name) : this.wb.worksheets[0];
    if (!ws) throw new Error(name ? `Sheet not found: ${name}` : 'Workbook has no sheets');
    return ws;
  }

  sheetToMatrix(name?: string, opts: MatrixExtractOptions = {}): unknown[][] {
    const ws = this.sheet(name);
    const columnCount = Math.max(ws.actualColumnCount || 0, ws.columnCount || 0);
    const rowCount = Math.max(ws.actualRowCount || 0, ws.rowCount || 0);
    if (!rowCount) return [];
    const cols = Math.max(columnCount, 1);
    const childMerges =
      opts.merged === 'sheetjs-anchor-only' ? mergeChildSet(ws) : new Set<string>();
    const matrix: unknown[][] = [];
    for (let r = 1; r <= rowCount; r++) {
      matrix.push(rowFromWorksheet(ws, r, cols, opts, childMerges));
    }
    return matrix;
  }

  sheetToObjects(
    name?: string,
    opts: MatrixExtractOptions = {}
  ): Record<string, unknown>[] {
    const matrix = this.sheetToMatrix(name, opts);
    if (matrix.length === 0) return [];
    const defval = opts.defval ?? '';
    const headerRow = matrix[0].map((h) => String(h ?? '').trim());
    const objects: Record<string, unknown>[] = [];
    for (let i = 1; i < matrix.length; i++) {
      const row = matrix[i];
      const obj: Record<string, unknown> = {};
      let empty = true;
      headerRow.forEach((header, idx) => {
        if (!header) return;
        const value = idx < row.length ? row[idx] : defval;
        obj[header] = value;
        if (!isEmptyCell(value) && value !== defval) empty = false;
      });
      if (!empty) objects.push(obj);
    }
    return objects;
  }

  addAoASheet(name: string, rows: unknown[][], opts: AoASheetOptions = {}): void {
    const ws = this.wb.addWorksheet(clipSheetName(name));
    rows.forEach((row) => {
      if (!row.length) {
        ws.addRow([null]);
        return;
      }
      ws.addRow(row.map((cell) => (cell == null ? null : cell)));
    });
    applyColWidths(ws, opts.colWidths);
  }

  addJsonSheet(
    name: string,
    rows: Record<string, unknown>[],
    opts: JsonSheetOptions = {}
  ): void {
    const columns =
      opts.columns && opts.columns.length
        ? opts.columns
        : rows.length
          ? Object.keys(rows[0])
          : [];
    if (!columns.length && !rows.length) {
      this.addAoASheet(name, [], { colWidths: opts.colWidths });
      return;
    }
    const aoa: unknown[][] = [columns];
    for (const row of rows) {
      aoa.push(columns.map((col) => (row[col] == null ? null : row[col])));
    }
    this.addAoASheet(name, aoa, { colWidths: opts.colWidths });
  }

  columnWidths(name?: string): number[] {
    const ws = this.sheet(name);
    const columnCount = Math.max(ws.actualColumnCount || 0, ws.columnCount || 0);
    const widths: number[] = [];
    for (let c = 1; c <= columnCount; c++) {
      const width = ws.getColumn(c).width;
      widths.push(typeof width === 'number' ? width : 0);
    }
    return widths;
  }

  async writeBuffer(): Promise<Buffer> {
    const buf = await this.wb.xlsx.writeBuffer();
    return Buffer.from(buf);
  }
}

export function createWorkbook(): AdapterWorkbook {
  return new AdapterWorkbook(new ExcelJS.Workbook());
}

export async function readWorkbook(
  input: ArrayBuffer | Buffer | Uint8Array,
  opts?: { filename?: string }
): Promise<AdapterWorkbook> {
  const bytes = toUint8Array(input);
  assertNotLegacyXls(bytes, opts?.filename);
  const copy = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(copy).set(bytes);
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(copy);
  return new AdapterWorkbook(wb);
}

export { excelSerialToIsoDate };
