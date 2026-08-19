import * as XLSX from 'xlsx';

/**
 * ExcelJS rewrites some built-in date formats (e.g. m/d/yy → mm-dd-yy).
 * SheetJS raw:false uses the format stored in the file. Map the common rewrite
 * so SSF output matches SheetJS for the same cell.
 */
const NUMFMT_ALIASES: Record<string, string> = {
  'mm-dd-yy': 'm/d/yy',
  'mm-dd-yyyy': 'm/d/yyyy',
};

export function excelJsDateToSerial(d: Date): number {
  if (!(d instanceof Date) || Number.isNaN(d.getTime())) return Number.NaN;
  // Inverse of ExcelJS utils.excelToDate / dateToExcel (1900 date system).
  // Do not use calendar Y-M-D: serial 60 becomes a JS Date on 1900-02-28 UTC
  // and calendar conversion would emit 59.
  const serial = 25569 + d.getTime() / (24 * 3600 * 1000);
  const asInt = Math.round(serial);
  if (Math.abs(serial - asInt) < 1e-8) return asInt;
  const asHalf = Math.round(serial * 2) / 2;
  if (Math.abs(serial - asHalf) < 1e-8) return asHalf;
  return serial;
}

function normalizeNumFmt(numFmt: string | undefined): string {
  const raw = (numFmt || 'General').trim() || 'General';
  return NUMFMT_ALIASES[raw.toLowerCase()] ?? raw;
}

/** SheetJS-compatible formatted cell text. Do not use ExcelJS cell.text. */
export function formatSsfDisplay(value: number, numFmt: string | undefined): string {
  const fmt = normalizeNumFmt(numFmt);
  const formatted = XLSX.SSF.format(fmt, value);
  return formatted == null ? String(value) : String(formatted);
}
