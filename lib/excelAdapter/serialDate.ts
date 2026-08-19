/**
 * Excel 1900-date serial conversion matching SheetJS SSF.parse_date_code
 * (Lotus 1-2-3 / Excel 1900 leap-year bug).
 *
 * serial 60 → 1900-02-29 (Excel fiction; that day does not exist).
 * serial > 60 skips that fictitious day when mapping onto the real calendar.
 */

function pad2(n: number): string {
  return String(n).padStart(2, '0');
}

export function excelSerialToIsoDate(serial: number): string | null {
  if (!Number.isFinite(serial) || serial < 0 || serial > 2958465) return null;
  const date = Math.floor(serial);
  if (date === 60) return '1900-02-29';
  if (date === 0) return '1900-01-00';

  let offset = date;
  if (date > 60) offset -= 1;
  const d = new Date(1900, 0, 1);
  d.setDate(d.getDate() + offset - 1);
  const y = d.getFullYear();
  const m = d.getMonth() + 1;
  const day = d.getDate();
  if (!y || !m || !day) return null;
  return `${y}-${pad2(m)}-${pad2(day)}`;
}

/**
 * Inverse of excelSerialToIsoDate using local Y-M-D (and optional time-of-day).
 * For ExcelJS Date cells vs SheetJS file serials, use dateToExcelSerialUtc.
 */
export function dateToExcelSerial(d: Date): number {
  if (!(d instanceof Date) || Number.isNaN(d.getTime())) return Number.NaN;
  const y = d.getFullYear();
  const m = d.getMonth() + 1;
  const day = d.getDate();
  const frac =
    (d.getHours() * 3600 + d.getMinutes() * 60 + d.getSeconds() + d.getMilliseconds() / 1000) /
    86400;

  if (y === 1900 && m === 2 && day === 29) return 60 + frac;

  const utc = Date.UTC(y, m - 1, day);
  const origin = Date.UTC(1900, 0, 1);
  const daysSinceJan1 = Math.round((utc - origin) / 86400000);
  let serial = daysSinceJan1 + 1;
  if (serial >= 60) serial += 1;
  return serial + frac;
}

/**
 * Convert a JS Date to the Excel serial SheetJS emits for the same cell
 * (UTC calendar + time fraction, including the 1900 leap bug).
 * ExcelJS Date cells are timezone-shifted; local Y-M-D would be off by the UTC offset.
 */
export function dateToExcelSerialUtc(d: Date): number {
  if (!(d instanceof Date) || Number.isNaN(d.getTime())) return Number.NaN;
  const y = d.getUTCFullYear();
  const m = d.getUTCMonth() + 1;
  const day = d.getUTCDate();
  const frac =
    (d.getUTCHours() * 3600 +
      d.getUTCMinutes() * 60 +
      d.getUTCSeconds() +
      d.getUTCMilliseconds() / 1000) /
    86400;

  if (y === 1900 && m === 2 && day === 29) return 60 + frac;

  const utc = Date.UTC(y, m - 1, day);
  const origin = Date.UTC(1900, 0, 1);
  const daysSinceJan1 = Math.round((utc - origin) / 86400000);
  let serial = daysSinceJan1 + 1;
  if (serial >= 60) serial += 1;
  return serial + frac;
}

/** Excel time is a fraction of a 24h day. Values ≥ 1 use the fractional part only. */
export function excelFractionToHHMM(value: number): string | null {
  if (!Number.isFinite(value)) return null;
  const frac = value >= 1 ? value % 1 : value;
  if (frac < 0) return null;
  const totalSeconds = Math.floor(frac * 24 * 60 * 60);
  const hh = Math.floor(totalSeconds / 3600) % 24;
  const mm = Math.floor((totalSeconds % 3600) / 60);
  return `${pad2(hh)}:${pad2(mm)}`;
}
