/**
 * تعيين أعمدة ورقة «المشرفين» من صف العناوين أو تخطيط افتراضي.
 * يدعم التخطيط الطويل (هدف في I، منصب في J، مدير في K) والتخطيط المختصر (منصب في I، مدير في J بدون عمود هدف منفصل).
 */

import {
  orgRoleToSheetLabel,
  parseSupervisorOrgRole,
  type SupervisorOrgRole,
} from '@/lib/orgHierarchy';

function normCell(v: unknown): string {
  return String(v ?? '').trim();
}

/** أرقام عربية / فارسية → أرقام غربية للتحليل */
function normalizeWesternDigits(s: string): string {
  return s
    .replace(/[\u0660-\u0669]/g, (ch) => String(ch.charCodeAt(0) - 0x0660))
    .replace(/[\u06F0-\u06F9]/g, (ch) => String(ch.charCodeAt(0) - 0x06f0));
}

/** قراءة رقم من خلية شيت (ساعات هدف، راتب، إلخ) */
export function parseNumericSheetCell(raw: unknown): number | undefined {
  const s = normalizeWesternDigits(normCell(raw).replace(/[%٪]/g, '').replace(/\s/g, '')).replace(/,/g, '.');
  if (!s) return undefined;
  const n = parseFloat(s);
  return Number.isFinite(n) ? n : undefined;
}

function rowCellsLower(row: any[] | undefined): string[] {
  if (!row?.length) return [];
  return row.map((c) => normCell(c).toLowerCase());
}

/** صف عناوين عربي/إنجليزي في أول الورقة */
export function isSupervisorsProbablyHeaderRow(row: any[] | undefined): boolean {
  if (!row?.length) return false;
  const cells = rowCellsLower(row).slice(0, 14);
  const joined = cells.filter(Boolean).join(' | ');
  if (!joined) return false;
  const hasCode = /كود.*مشرف|supervisor.*code|^code$/i.test(joined) || cells.some((c) => c.includes('كود') && c.includes('مشرف'));
  const hasName = /الاسم|^name$/i.test(joined) || cells.some((c) => c === 'الاسم' || c === 'name');
  if (hasCode && hasName) return true;
  return false;
}

function findCol(headerLower: string[], predicates: ((h: string) => boolean)[]): number {
  for (let j = 0; j < headerLower.length; j++) {
    const h = headerLower[j];
    if (!h) continue;
    if (predicates.some((p) => p(h))) return j;
  }
  return -1;
}

export type SupervisorsSheetColumnMap = {
  code: number;
  name: number;
  region: number;
  email: number;
  password: number;
  salaryType: number;
  salaryAmount: number;
  commissionFormula: number;
  /** null = لا يوجد عمود هدف منفصل (يُقرأ من صيغة أو يُترك فارغاً) */
  target: number | null;
  orgRole: number;
  parentCode: number;
};

function inferFromHeader(headerRow: any[]): SupervisorsSheetColumnMap {
  const h = rowCellsLower(headerRow);
  const code = findCol(h, [
    (x) => x.includes('كود') && x.includes('مشرف'),
    (x) => x.includes('كود') && !x.includes('مدير'),
    (x) => x === 'code' && x.includes('supervisor'),
  ]);
  const name = findCol(h, [(x) => x === 'الاسم' || x === 'name', (x) => x.includes('اسم') && !x.includes('كود')]);
  const region = findCol(h, [(x) => x.includes('منطقة') || x.includes('زون') || x.includes('region')]);
  const email = findCol(h, [(x) => x.includes('بريد') || x.includes('email')]);
  const password = findCol(h, [(x) => x.includes('كلمة') || x.includes('مرور'), (x) => x.includes('password')]);
  const salaryType = findCol(h, [
    (x) => x.includes('نظام') && x.includes('راتب'),
    (x) => x.includes('نوع') && x.includes('راتب'),
    (x) => x.includes('salary') && x.includes('type'),
  ]);
  const salaryAmount = findCol(h, [
    (x) => x.includes('مبلغ'),
    (x) => x.includes('amount') && x.includes('salary'),
    (x) => x === 'الراتب' || x.includes('راتب ثابت'),
  ]);
  const commissionFormula = findCol(h, [
    (x) => x.includes('صيغة') || x.includes('عمولة') && x.includes('multi'),
    (x) => x.includes('commission') || x.includes('formula'),
  ]);
  const target = findCol(h, [
    (x) => x.includes('تارجت') || x.includes('target'),
    (x) => x.includes('يومي') && (x.includes('هدف') || x.includes('ساع') || x.includes('hour')),
    (x) => x.includes('هدف') && (x.includes('ساع') || x.includes('ساعة') || x.includes('hour')),
    (x) => x.includes('هدف') && !x.includes('مشرف'),
    (x) => x.includes('هدف'),
    (x) => x === 'target',
  ]);

  const orgRole = findCol(h, [
    (x) => x.includes('منصب') && (x.includes('تنفيذي') || x.includes('تنظيمي') || x.includes('تنظيم')),
    (x) => x.includes('منصب') && !x.includes('مشرف'),
    (x) => x.includes('org') && x.includes('role'),
  ]);
  const parentCode = findCol(h, [
    (x) => x.includes('مباشر') || x.includes('parent'),
    (x) => x.includes('كود') && x.includes('مدير'),
    (x) => x.includes('linked') && x.includes('manager'),
  ]);

  const safe = (n: number, fb: number) => (n >= 0 ? n : fb);
  const headerLen = headerRow.length;
  const wideByWidth = headerLen >= 11;

  let targetCol = target >= 0 ? target : null;
  let orgCol = orgRole >= 0 ? orgRole : -1;
  let parentCol = parentCode >= 0 ? parentCode : -1;

  /** تخطيط 11 عموداً: I هدف، J منصب، K مدير — عند غياب عناوين واضحة */
  if (orgCol < 0 && parentCol < 0 && wideByWidth) {
    targetCol = targetCol ?? 8;
    orgCol = 9;
    parentCol = 10;
  } else {
    if (orgCol < 0) orgCol = wideByWidth ? 9 : 8;
    if (parentCol < 0) parentCol = orgCol + 1;
    if (wideByWidth && orgCol === 8 && parentCol === 9) {
      targetCol = targetCol ?? 8;
      orgCol = 9;
      parentCol = 10;
    }
  }

  if (orgRole >= 0 && parentCode < 0) {
    parentCol = orgRole + 1;
    if (wideByWidth && orgRole === 8 && parentCol === 9) {
      targetCol = targetCol ?? 8;
      orgCol = 9;
      parentCol = 10;
    }
  }

  /** لا تخلط عمود الهدف مع عمود المنصب */
  if (targetCol !== null && targetCol === orgCol) targetCol = null;
  if (targetCol !== null && targetCol === parentCol) targetCol = null;

  /** شائع في الشيت: عمود I هدف، J منصب، K مدير — وعنوان الهدف لا يطابق الأنماط */
  if (targetCol === null && orgCol === 9 && parentCol === 10) {
    targetCol = 8;
  }
  if (targetCol !== null && targetCol === orgCol) targetCol = null;

  return {
    code: safe(code, 0),
    name: safe(name, 1),
    region: safe(region, 2),
    email: safe(email, 3),
    password: safe(password, 4),
    salaryType: safe(salaryType, 5),
    salaryAmount: safe(salaryAmount, 6),
    commissionFormula: safe(commissionFormula, 7),
    target: targetCol,
    orgRole: orgCol,
    parentCode: parentCol,
  };
}

/** تخطيط 10 أعمدة: … H صيغة، I منصب، J مدير (بدون عمود هدف منفصل) */
export function defaultSupervisorsCompactColumnMap(): SupervisorsSheetColumnMap {
  return {
    code: 0,
    name: 1,
    region: 2,
    email: 3,
    password: 4,
    salaryType: 5,
    salaryAmount: 6,
    commissionFormula: 7,
    target: null,
    orgRole: 8,
    parentCode: 9,
  };
}

/** تخطيط 11 عموداً: I هدف، J منصب، K مدير */
export function defaultSupervisorsWideColumnMap(): SupervisorsSheetColumnMap {
  return {
    code: 0,
    name: 1,
    region: 2,
    email: 3,
    password: 4,
    salaryType: 5,
    salaryAmount: 6,
    commissionFormula: 7,
    target: 8,
    orgRole: 9,
    parentCode: 10,
  };
}

/** أقصى فهرس عمود (1-based طول) يحتوي على قيمة في أي خلية ضمن العينة — لا يعتمد على «آخر عمود غير فارغ» فقط */
function maxRowUsedColumnInSample(rows: any[][], dataStart: number, maxRows: number): number {
  let m = 0;
  const end = Math.min(rows.length, dataStart + maxRows);
  for (let i = dataStart; i < end; i++) {
    const r = rows[i] || [];
    for (let j = 0; j < r.length; j++) {
      if (r[j] != null && String(r[j]).trim() !== '') m = Math.max(m, j + 1);
    }
  }
  return m;
}

/**
 * صفوف بدون عنوان وطول الصف يظهر كـ 10 أعمدة: إما wide (عمود K فارغ) أو compact (I منصب، J مدير).
 * الافتراضي **wide** حتى يُحفظ الهدف في العمود I حتى لو كان فارغاً لمعظم الصفوف.
 */
function inferWideVsCompactLen10(rows: any[][], dataStart: number, maxRows: number): SupervisorsSheetColumnMap {
  const end = Math.min(rows.length, dataStart + maxRows);
  let rowsWith8 = 0;
  let numericLike8 = 0;
  let orgTextHints = 0;
  for (let i = dataStart; i < end; i++) {
    const r = rows[i] || [];
    const s = normCell(r[8]);
    if (!s) continue;
    rowsWith8++;
    const n = parseNumericSheetCell(s);
    if (n !== undefined && n >= 0 && n <= 800) {
      numericLike8++;
      continue;
    }
    const low = s.toLowerCase();
    if (/زون|منطقة|مدير|مشرف|zone|region|تنفيذي|تنظيمي|supervisor/i.test(low) && !/^\s*\d+([.,]\d+)?\s*$/.test(s)) {
      orgTextHints++;
    }
  }
  if (rowsWith8 === 0) return defaultSupervisorsWideColumnMap();
  if (numericLike8 > 0) return defaultSupervisorsWideColumnMap();
  if (rowsWith8 >= 4 && orgTextHints / rowsWith8 >= 0.55) return defaultSupervisorsCompactColumnMap();
  return defaultSupervisorsWideColumnMap();
}

export function resolveSupervisorsSheetLayout(rows: any[][]): {
  dataStartIndex: number;
  columns: SupervisorsSheetColumnMap;
} {
  if (!rows?.length) {
    return { dataStartIndex: 0, columns: defaultSupervisorsCompactColumnMap() };
  }
  if (isSupervisorsProbablyHeaderRow(rows[0])) {
    return { dataStartIndex: 1, columns: inferFromHeader(rows[0]) };
  }
  const dataStart = 0;
  const maxLen = maxRowUsedColumnInSample(rows, dataStart, 40);
  if (maxLen >= 11) return { dataStartIndex: dataStart, columns: defaultSupervisorsWideColumnMap() };
  if (maxLen === 10) return { dataStartIndex: dataStart, columns: inferWideVsCompactLen10(rows, dataStart, 40) };
  return { dataStartIndex: dataStart, columns: defaultSupervisorsCompactColumnMap() };
}

function cell(row: any[] | undefined, idx: number | null): string {
  if (idx == null || idx < 0 || !row) return '';
  return row[idx] != null ? row[idx].toString().trim() : '';
}

export function maxSupervisorColumnIndex(map: SupervisorsSheetColumnMap): number {
  return Math.max(
    map.code,
    map.name,
    map.region,
    map.email,
    map.password,
    map.salaryType,
    map.salaryAmount,
    map.commissionFormula,
    map.target ?? -1,
    map.orgRole,
    map.parentCode
  );
}

export function supervisorToRowCells(
  existing: any[] | undefined,
  map: SupervisorsSheetColumnMap,
  sup: SupervisorParsedFromSheet
): any[] {
  const maxIdx = maxSupervisorColumnIndex(map);
  const row = [...(existing || [])];
  while (row.length <= maxIdx) row.push('');

  const set = (idx: number, v: unknown) => {
    if (v === undefined || v === null || v === '') row[idx] = '';
    else row[idx] = String(v).trim();
  };

  set(map.code, sup.code);
  set(map.name, sup.name);
  set(map.region, sup.region ?? '');
  set(map.email, sup.email ?? '');
  set(map.password, sup.password ?? '');
  set(map.salaryType, sup.salaryType ?? '');
  set(
    map.salaryAmount,
    sup.salaryAmount != null && sup.salaryAmount !== '' ? String(sup.salaryAmount) : ''
  );
  set(map.commissionFormula, sup.commissionFormula ?? '');
  if (map.target != null) set(map.target, sup.target != null ? String(sup.target) : '');
  set(map.orgRole, orgRoleToSheetLabel(sup.orgRole));
  set(map.parentCode, sup.parentCode ?? '');
  return row;
}

export function sheetRangeForSupervisorDataRow(rowIndex1Based: number, map: SupervisorsSheetColumnMap): string {
  const last = maxSupervisorColumnIndex(map);
  const end = String.fromCharCode('A'.charCodeAt(0) + last);
  return `A${rowIndex1Based}:${end}${rowIndex1Based}`;
}

export type SupervisorParsedFromSheet = {
  code: string;
  name: string;
  region: string;
  email: string;
  password: string;
  salaryType?: 'fixed' | 'commission_type1' | 'commission_type2';
  salaryAmount?: number | string | null;
  commissionFormula?: string | null;
  target?: number;
  orgRole?: SupervisorOrgRole;
  parentCode?: string;
};

export function parseSupervisorRowFromSheet(row: any[], map: SupervisorsSheetColumnMap): SupervisorParsedFromSheet | null {
  const code = cell(row, map.code);
  if (!code) return null;

  const orgRaw = cell(row, map.orgRole);
  const parentRaw = cell(row, map.parentCode);
  const targetRaw = map.target != null ? cell(row, map.target) : '';

  const stRaw = cell(row, map.salaryType);
  const salaryType =
    stRaw && ['fixed', 'commission_type1', 'commission_type2'].includes(stRaw)
      ? (stRaw as SupervisorParsedFromSheet['salaryType'])
      : undefined;

  return {
    code,
    name: cell(row, map.name),
    region: cell(row, map.region),
    email: cell(row, map.email),
    password: cell(row, map.password),
    salaryType,
    salaryAmount: cell(row, map.salaryAmount) ? parseFloat(cell(row, map.salaryAmount)) : undefined,
    commissionFormula: cell(row, map.commissionFormula) || undefined,
    target: parseNumericSheetCell(targetRaw),
    orgRole: parseSupervisorOrgRole(orgRaw),
    parentCode: parentRaw || undefined,
  };
}
