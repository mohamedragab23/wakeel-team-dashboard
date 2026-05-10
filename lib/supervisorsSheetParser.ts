/**
 * تعيين أعمدة ورقة «المشرفين» من صف العناوين أو تخطيط افتراضي.
 * يدعم التخطيط الطويل (هدف في I، منصب في J، مدير في K) والتخطيط المختصر (منصب في I، مدير في J بدون عمود هدف منفصل).
 */

import { parseSupervisorOrgRole, type SupervisorOrgRole } from '@/lib/orgHierarchy';

function normCell(v: unknown): string {
  return String(v ?? '').trim();
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
  const target = findCol(h, [(x) => x.includes('هدف') && !x.includes('مشرف'), (x) => x === 'target']);

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

  return {
    code: safe(code, 0),
    name: safe(name, 1),
    region: safe(region, 2),
    email: safe(email, 3),
    password: safe(password, 4),
    salaryType: safe(salaryType, 5),
    salaryAmount: safe(salaryAmount, 6),
    commissionFormula: safe(commissionFormula, 7),
    target: target >= 0 ? target : null,
    orgRole: safe(orgRole, 8),
    parentCode: safe(parentCode, 9),
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
  const sample = rows[0] || [];
  const len = sample.length || 0;
  if (len >= 11) return { dataStartIndex: 0, columns: defaultSupervisorsWideColumnMap() };
  return { dataStartIndex: 0, columns: defaultSupervisorsCompactColumnMap() };
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
  set(map.orgRole, sup.orgRole && sup.orgRole !== 'supervisor' ? String(sup.orgRole) : '');
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
  const targetStr = map.target != null ? cell(row, map.target) : '';

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
    target: targetStr ? parseInt(targetStr, 10) : undefined,
    orgRole: parseSupervisorOrgRole(orgRaw),
    parentCode: parentRaw || undefined,
  };
}
