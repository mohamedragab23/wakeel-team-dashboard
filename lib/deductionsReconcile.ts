import {
  arabicMonthName,
  DEDUCTION_CYCLE_LABELS,
  DEDUCTION_IMPORT_HEADERS,
  type DeductionCycleKey,
} from '@/lib/equipmentSheetConstants';

const EPS = 0.02;

export function normalizeDeductionHeader(h: string): string {
  return h
    .toString()
    .trim()
    .replace(/\s+/g, ' ')
    .toLowerCase();
}

function parseMoney(v: unknown): number {
  if (v === undefined || v === null || v === '') return NaN;
  const s = String(v).replace(/,/g, '').replace(/[^\d.-]/g, '');
  if (s === '' || s === '-') return NaN;
  const n = Number(s);
  return Number.isFinite(n) ? n : NaN;
}

/** حقول شيت المدير (مطابقة مرنة لعناوين Excel) */
const ADMIN_FIELD_SPECS: { outKey: string; aliases: string[] }[] = [
  { outKey: 'Rider_ID', aliases: ['rider id', 'rider_id'] },
  { outKey: 'Rider_Name', aliases: ['rider name', 'rider_name'] },
  { outKey: '3PL', aliases: ['3pl'] },
  { outKey: 'City', aliases: ['city'] },
  { outKey: 'Starting_Point', aliases: ['starting point', 'starting_point'] },
  { outKey: 'Vehicle', aliases: ['vehicle'] },
  { outKey: 'Salaries', aliases: ['salaries'] },
  { outKey: 'Deduction', aliases: ['deduction'] },
  { outKey: 'Salaries_Compensation', aliases: ['salaries compensation', 'salaries_compensation'] },
  { outKey: 'Cancelled_orders', aliases: ['cancelled orders', 'cancelled_orders', 'canceled orders'] },
  {
    outKey: 'Cancelled_orders_Compensation',
    aliases: ['cancelled orders compensation', 'cancelled_orders_compensation'],
  },
  { outKey: 'Net_Salary', aliases: ['net salary', 'net_salary'] },
  { outKey: 'Type_of_Payment', aliases: ['type of payment', 'type_of_payment'] },
  {
    outKey: '3Pl_Internal_Deductions',
    aliases: ['3pl internal deductions', '3pl_internal_deductions'],
  },
  {
    outKey: 'Salaries_Tips_Applied_Wallet',
    aliases: [
      'salaries&tips applaied on wallet',
      'salaries tips applaied on wallet',
      'salaries&tips applied on wallet',
      'salaries tips applied on wallet',
    ],
  },
  {
    outKey: 'Applied_Deduction_on_Wallet',
    aliases: [
      'applaied deduction on wallet',
      'applied deduction on wallet',
      'applaied_deduction_on_wallet',
      'applied_deduction_on_wallet',
    ],
  },
  { outKey: 'Net_After_Deduction', aliases: ['net after deduction', 'net_after_deduction'] },
  { outKey: 'Transfer_Type', aliases: ['transfer type', 'transfer_type'] },
];

function buildNormToOriginal(obj: Record<string, unknown>): Record<string, string> {
  const m: Record<string, string> = {};
  for (const k of Object.keys(obj)) {
    m[normalizeDeductionHeader(k)] = k;
  }
  return m;
}

function pickAdminField(norm: Record<string, string>, obj: Record<string, unknown>, aliases: string[]): string {
  for (const a of aliases) {
    const nk = normalizeDeductionHeader(a);
    const orig = norm[nk];
    if (orig !== undefined) {
      const v = obj[orig];
      if (v !== undefined && v !== null) return String(v).trim();
    }
  }
  return '';
}

export type AdminParsedRow = {
  riderId: string;
  walletDeduction: number;
  /** كل الحقول كنص للعرض في الشيت */
  display: Record<string, string>;
};

export function parseAdminExcelRows(json: Record<string, unknown>[]): {
  rows: AdminParsedRow[];
  errors: string[];
} {
  const rows: AdminParsedRow[] = [];
  const errors: string[] = [];

  json.forEach((obj, idx) => {
    const norm = buildNormToOriginal(obj);
    const riderRaw = pickAdminField(norm, obj, ['rider id', 'rider_id']);
    const riderId = riderRaw.replace(/\s+/g, '').trim();
    if (!riderId) {
      errors.push(`صف ${idx + 2}: Rider ID فارغ`);
      return;
    }

    const display: Record<string, string> = {};
    for (const spec of ADMIN_FIELD_SPECS) {
      display[spec.outKey] = pickAdminField(norm, obj, spec.aliases);
    }

    const wStr = display['Applied_Deduction_on_Wallet'];
    const walletDeduction = parseMoney(wStr);
    if (Number.isNaN(walletDeduction)) {
      errors.push(`صف ${idx + 2}: قيمة Applaied Deduction on Wallet غير رقمية (${riderId})`);
      return;
    }

    rows.push({ riderId, walletDeduction, display });
  });

  return { rows, errors };
}

export type AdminAggregate = {
  walletSum: number;
  rowCount: number;
  /** أول صف لعرض الحقول؛ يُحدَّث Applied_Deduction_on_Wallet بالمجموع */
  mergedDisplay: Record<string, string>;
};

export function aggregateAdminByRider(rows: AdminParsedRow[]): Map<string, AdminAggregate> {
  const map = new Map<string, AdminAggregate>();

  for (const r of rows) {
    const cur = map.get(r.riderId);
    if (!cur) {
      const mergedDisplay = { ...r.display };
      map.set(r.riderId, {
        walletSum: r.walletDeduction,
        rowCount: 1,
        mergedDisplay,
      });
    } else {
      cur.walletSum += r.walletDeduction;
      cur.rowCount += 1;
      cur.mergedDisplay = { ...cur.mergedDisplay, ...r.display };
    }
  }

  for (const agg of map.values()) {
    agg.mergedDisplay['Applied_Deduction_on_Wallet'] =
      Math.abs(agg.walletSum - Math.round(agg.walletSum)) < EPS
        ? String(Math.round(agg.walletSum * 100) / 100)
        : String(agg.walletSum);
  }

  return map;
}

export type SupervisorAgg = {
  sum: number;
  rowCount: number;
  riderNames: Set<string>;
  reasons: Set<string>;
  zones: Set<string>;
  supCodes: Set<string>;
  supNames: Set<string>;
};

const IDX = {
  supCode: DEDUCTION_IMPORT_HEADERS.indexOf('كود_المشرف'),
  supName: DEDUCTION_IMPORT_HEADERS.indexOf('اسم_المشرف'),
  riderCode: DEDUCTION_IMPORT_HEADERS.indexOf('كود_المندوب'),
  riderName: DEDUCTION_IMPORT_HEADERS.indexOf('اسم_المندوب'),
  amount: DEDUCTION_IMPORT_HEADERS.indexOf('قيمة_الاستقطاع'),
  reason: DEDUCTION_IMPORT_HEADERS.indexOf('السبب'),
  zone: DEDUCTION_IMPORT_HEADERS.indexOf('الزون'),
  cycle: DEDUCTION_IMPORT_HEADERS.indexOf('دورة_الاستقطاع'),
  month: DEDUCTION_IMPORT_HEADERS.indexOf('شهر'),
  year: DEDUCTION_IMPORT_HEADERS.indexOf('سنة'),
};

function sheetYearMatches(cell: unknown, yearNum: number): boolean {
  const a = String(cell ?? '').trim();
  const b = String(yearNum);
  if (a === b) return true;
  const n = Number(a.replace(/,/g, ''));
  if (Number.isFinite(n) && Math.round(n) === yearNum) return true;
  return false;
}

export function aggregateSupervisorDeductionsForPeriod(
  sheetRows: any[][],
  cycleLabel: string,
  monthLabel: string,
  yearNum: number
): Map<string, SupervisorAgg> {
  const map = new Map<string, SupervisorAgg>();

  for (let i = 1; i < sheetRows.length; i++) {
    const row = sheetRows[i];
    if (!row || row.length < 11) continue;

    const c = String(row[IDX.cycle] ?? '').trim();
    const m = String(row[IDX.month] ?? '').trim();
    if (c !== cycleLabel || m !== monthLabel) continue;
    if (!sheetYearMatches(row[IDX.year], yearNum)) continue;

    const riderId = String(row[IDX.riderCode] ?? '').replace(/\s+/g, '').trim();
    if (!riderId) continue;

    const amt = parseMoney(row[IDX.amount]);
    if (Number.isNaN(amt)) continue;

    let agg = map.get(riderId);
    if (!agg) {
      agg = {
        sum: 0,
        rowCount: 0,
        riderNames: new Set(),
        reasons: new Set(),
        zones: new Set(),
        supCodes: new Set(),
        supNames: new Set(),
      };
      map.set(riderId, agg);
    }

    agg.sum += amt;
    agg.rowCount += 1;
    const rn = String(row[IDX.riderName] ?? '').trim();
    if (rn) agg.riderNames.add(rn);
    const rs = String(row[IDX.reason] ?? '').trim();
    if (rs) agg.reasons.add(rs);
    const z = String(row[IDX.zone] ?? '').trim();
    if (z) agg.zones.add(z);
    const sc = String(row[IDX.supCode] ?? '').trim();
    if (sc) agg.supCodes.add(sc);
    const sn = String(row[IDX.supName] ?? '').trim();
    if (sn) agg.supNames.add(sn);
  }

  return map;
}

export type CompareStatus =
  | 'متطابقة'
  | 'المحفظة_أعلى_من_المشرف'
  | 'المشرف_أعلى_من_المحفظة'
  | 'لا_يوجد_في_شيت_المدير'
  | 'لا_يوجد_في_رفع_المشرف';

function classify(supSum: number, walletSum: number, hasSup: boolean, hasAdm: boolean): CompareStatus {
  if (hasSup && !hasAdm) return 'لا_يوجد_في_شيت_المدير';
  if (!hasSup && hasAdm) return 'لا_يوجد_في_رفع_المشرف';
  const d = walletSum - supSum;
  if (Math.abs(d) < EPS) return 'متطابقة';
  if (d > EPS) return 'المحفظة_أعلى_من_المشرف';
  return 'المشرف_أعلى_من_المحفظة';
}

function joinSet(s: Set<string>, max = 6): string {
  const a = [...s].filter(Boolean);
  if (a.length <= max) return a.join(' | ');
  return a.slice(0, max).join(' | ') + ` (+${a.length - max})`;
}

/** صف واحد لكل مندوب حسب ترتيب DEDUCTIONS_ACTUAL_HEADERS */
export function buildActualDeductionRows(
  supMap: Map<string, SupervisorAgg>,
  admMap: Map<string, AdminAggregate>,
  cycleLabel: string,
  monthLabel: string,
  yearNum: number,
  compareIsoDate: string
): { rows: any[][]; stats: Record<string, number> } {
  const riders = new Set<string>([...supMap.keys(), ...admMap.keys()]);
  const rows: any[][] = [];
  const stats: Record<string, number> = {
    total: 0,
    متطابقة: 0,
    المحفظة_أعلى_من_المشرف: 0,
    المشرف_أعلى_من_المحفظة: 0,
    لا_يوجد_في_شيت_المدير: 0,
    لا_يوجد_في_رفع_المشرف: 0,
  };

  for (const riderId of riders) {
    const sup = supMap.get(riderId);
    const adm = admMap.get(riderId);
    const supSum = sup ? sup.sum : 0;
    const walletSum = adm ? adm.walletSum : 0;
    const hasSup = !!sup && sup.rowCount > 0 && supSum !== 0;
    const hasAdm = !!adm && adm.rowCount > 0;

    if (!hasSup && !hasAdm) continue;
    if (!hasSup && hasAdm && Math.abs(walletSum) < EPS) continue;

    const hasSupStrict = !!sup && sup.rowCount > 0;
    const hasAdmStrict = !!adm && adm.rowCount > 0;
    const status = classify(supSum, walletSum, hasSupStrict, hasAdmStrict);
    stats.total += 1;
    stats[status] = (stats[status] || 0) + 1;

    const diff = walletSum - supSum;

    const d = adm?.mergedDisplay ?? {};
    const adminCols = [
      d['Rider_Name'] ?? '',
      d['3PL'] ?? '',
      d['City'] ?? '',
      d['Starting_Point'] ?? '',
      d['Vehicle'] ?? '',
      d['Salaries'] ?? '',
      d['Deduction'] ?? '',
      d['Salaries_Compensation'] ?? '',
      d['Cancelled_orders'] ?? '',
      d['Cancelled_orders_Compensation'] ?? '',
      d['Net_Salary'] ?? '',
      d['Type_of_Payment'] ?? '',
      d['3Pl_Internal_Deductions'] ?? '',
      d['Salaries_Tips_Applied_Wallet'] ?? '',
      d['Applied_Deduction_on_Wallet'] ?? '',
      d['Net_After_Deduction'] ?? '',
      d['Transfer_Type'] ?? '',
    ];

    rows.push([
      compareIsoDate,
      cycleLabel,
      monthLabel,
      yearNum,
      riderId,
      Math.round(supSum * 100) / 100,
      Math.round(walletSum * 100) / 100,
      Math.round(diff * 100) / 100,
      status,
      sup?.rowCount ?? 0,
      adm?.rowCount ?? 0,
      ...adminCols,
      sup ? joinSet(sup.riderNames) : '',
      sup ? joinSet(sup.reasons) : '',
      sup ? joinSet(sup.zones) : '',
      sup ? `${joinSet(sup.supCodes)} — ${joinSet(sup.supNames)}` : '',
    ]);
  }

  return { rows, stats };
}

export function periodFromForm(cycleKey: DeductionCycleKey, month1to12: number, yearNum: number) {
  return {
    cycleLabel: DEDUCTION_CYCLE_LABELS[cycleKey],
    monthLabel: arabicMonthName(month1to12),
    yearNum,
  };
}
