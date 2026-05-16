import * as XLSX from 'xlsx';
import { normalizeRiderCodeForPerformance } from '@/lib/dataFilter';

export type TableauPerformanceRow = {
  riderCode: string;
  hours: number;
  break: number;
  delay: number;
  absence: string;
  orders: number;
  acceptance: string;
  debt: number;
};

function normHeader(h: string): string {
  return String(h ?? '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .replace(/[_-]+/g, ' ');
}

function safeNum(v: unknown): number {
  const n = typeof v === 'number' ? v : parseFloat(String(v ?? '').replace(/[,٪%]/g, '').trim());
  return Number.isFinite(n) ? n : 0;
}

function parseAcceptance(v: unknown): string {
  const s = String(v ?? '').trim();
  if (!s) return '0%';
  if (s.includes('%')) return s;
  const n = safeNum(s);
  if (n > 0 && n <= 1) return `${Math.round(n * 10000) / 100}%`;
  return `${n}%`;
}

function absenceFromNoShow(noShow: number, excused: number): string {
  const n = safeNum(noShow) + safeNum(excused);
  return n > 0 ? '1' : '0';
}

type ColMap = {
  riderId: number;
  hours: number;
  break: number;
  delay: number;
  noShow: number;
  noShowExcused: number;
  orders: number;
  acceptance: number;
  contract: number;
};

function detectColumns(headers: string[]): ColMap | null {
  const h = headers.map(normHeader);
  const find = (...names: string[]) => {
    for (const n of names) {
      const i = h.findIndex((x) => x === n || x.includes(n));
      if (i >= 0) return i;
    }
    return -1;
  };

  const riderId = find('rider id', 'rider_id', 'riderid');
  const hours = find('actual working hours', 'actual work');
  const brk = find('break hours');
  const delay = find('late login', 'late_login');
  const noShow = find('no show shifts', 'no_show_shifts');
  const noShowExcused = find('no show execused', 'no_show_execused', 'excused');
  const orders = find('completed orders');
  const acceptance = find('acceptance rate', 'acceptance');
  const contract = find('contract name', 'contract_name');

  if (riderId < 0) return null;

  return {
    riderId,
    hours: hours >= 0 ? hours : -1,
    break: brk >= 0 ? brk : -1,
    delay: delay >= 0 ? delay : -1,
    noShow: noShow >= 0 ? noShow : -1,
    noShowExcused: noShowExcused >= 0 ? noShowExcused : -1,
    orders: orders >= 0 ? orders : -1,
    acceptance: acceptance >= 0 ? acceptance : -1,
    contract: contract >= 0 ? contract : -1,
  };
}

function matrixFromBuffer(buffer: ArrayBuffer, format: 'excel' | 'csv'): any[][] {
  if (format === 'csv') {
    const text = new TextDecoder('utf-8').decode(new Uint8Array(buffer));
    const wb = XLSX.read(text, { type: 'string', raw: false });
    const ws = wb.Sheets[wb.SheetNames[0]];
    return XLSX.utils.sheet_to_json<any[]>(ws, { header: 1, defval: '' }) as any[][];
  }
  const wb = XLSX.read(buffer, { type: 'array', raw: false });
  const ws = wb.Sheets[wb.SheetNames[0]];
  return XLSX.utils.sheet_to_json<any[]>(ws, { header: 1, defval: '' }) as any[][];
}

/**
 * Parse Tableau Rider Performance crosstab → rows ready for sheet merge (debt filled later).
 */
export function parseTableauPerformanceExport(
  buffer: ArrayBuffer,
  format: 'excel' | 'csv'
): { rows: TableauPerformanceRow[]; warnings: string[] } {
  const warnings: string[] = [];
  const matrix = matrixFromBuffer(buffer, format);
  if (!matrix.length) {
    return { rows: [], warnings: ['ملف Tableau فارغ'] };
  }

  let headerRowIdx = 0;
  let cols = detectColumns(matrix[0].map((c) => String(c ?? '')));
  if (!cols) {
    for (let i = 0; i < Math.min(5, matrix.length); i++) {
      cols = detectColumns(matrix[i].map((c) => String(c ?? '')));
      if (cols) {
        headerRowIdx = i;
        break;
      }
    }
  }
  if (!cols) {
    return { rows: [], warnings: ['لم يُعثر على عمود rider_id في تصدير Tableau'] };
  }

  const out: TableauPerformanceRow[] = [];
  const seen = new Set<string>();

  for (let i = headerRowIdx + 1; i < matrix.length; i++) {
    const row = matrix[i] || [];
    const riderRaw = row[cols.riderId];
    const riderCode = normalizeRiderCodeForPerformance(riderRaw);
    if (!riderCode) continue;

    if (cols.contract >= 0) {
      const contract = String(row[cols.contract] ?? '')
        .trim()
        .toLowerCase();
      if (contract && !contract.includes('wakeel')) continue;
    }

    const hours = cols.hours >= 0 ? safeNum(row[cols.hours]) : 0;
    const orders = cols.orders >= 0 ? Math.round(safeNum(row[cols.orders])) : 0;
    const noShow = cols.noShow >= 0 ? safeNum(row[cols.noShow]) : 0;
    const noShowExc = cols.noShowExcused >= 0 ? safeNum(row[cols.noShowExcused]) : 0;

    const key = riderCode;
    if (seen.has(key)) continue;
    seen.add(key);

    out.push({
      riderCode,
      hours,
      break: cols.break >= 0 ? safeNum(row[cols.break]) : 0,
      delay: cols.delay >= 0 ? safeNum(row[cols.delay]) : 0,
      absence: absenceFromNoShow(noShow, noShowExc),
      orders,
      acceptance: cols.acceptance >= 0 ? parseAcceptance(row[cols.acceptance]) : '0%',
      debt: 0,
    });
  }

  if (out.length === 0) warnings.push('لا توجد صفوف wakeel بعد التصفية');
  return { rows: out, warnings };
}

export type PerformanceQualityReport = {
  totalRows: number;
  wakeelRows: number;
  zeroRows: number;
  zeroRatio: number;
  isSuspiciousEmpty: boolean;
  message: string;
};

export function assessTableauPerformanceQuality(rows: TableauPerformanceRow[]): PerformanceQualityReport {
  const wakeelRows = rows.length;
  if (wakeelRows === 0) {
    return {
      totalRows: 0,
      wakeelRows: 0,
      zeroRows: 0,
      zeroRatio: 1,
      isSuspiciousEmpty: true,
      message: 'لا توجد بيانات مناديب wakeel في التصدير — غالباً Tableau لم يُحدَّث بعد.',
    };
  }

  let zeroRows = 0;
  for (const r of rows) {
    if ((r.hours || 0) <= 0 && (r.orders || 0) <= 0) zeroRows++;
  }
  const zeroRatio = zeroRows / wakeelRows;
  const threshold = Number(process.env.PERFORMANCE_SYNC_ZERO_RATIO_THRESHOLD || '0.9');
  const minRows = Number(process.env.PERFORMANCE_SYNC_MIN_ROWS || '5');
  const isSuspiciousEmpty = wakeelRows >= minRows && zeroRatio >= threshold;

  return {
    totalRows: wakeelRows,
    wakeelRows,
    zeroRows,
    zeroRatio: Math.round(zeroRatio * 1000) / 1000,
    isSuspiciousEmpty,
    message: isSuspiciousEmpty
      ? `${zeroRows} من ${wakeelRows} مندوباً بدون ساعات أو طلبات (${Math.round(zeroRatio * 100)}%) — يحتاج مراجعة الأدمن.`
      : 'جودة البيانات مقبولة',
  };
}

export function mergeCodDebt(
  rows: TableauPerformanceRow[],
  debtByRider: Map<string, number>
): TableauPerformanceRow[] {
  return rows.map((r) => {
    const norm = normalizeRiderCodeForPerformance(r.riderCode);
    const debt = debtByRider.get(norm) ?? debtByRider.get(r.riderCode) ?? 0;
    return { ...r, debt };
  });
}

/** Sheet rows: [date, riderCode, hours, break, delay, absence, orders, acceptance, debt] */
export function toDailySheetRows(dateIso: string, rows: TableauPerformanceRow[]): any[][] {
  return rows.map((r) => [
    dateIso,
    r.riderCode,
    r.hours,
    r.break,
    r.delay,
    r.absence,
    r.orders,
    r.acceptance,
    r.debt,
  ]);
}
