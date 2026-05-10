import { normalizeAdminDataZone } from '@/lib/adminFeatureAccess';

export const ADMIN_SHEET_TAB_CANDIDATES = [
  'Admins',
  'Admin',
  'admins',
  'admin',
  'الأدمن',
  'الادمن',
];

export type AdminColumnMap = {
  codeCol: number;
  nameCol: number;
  passCol: number;
  permCol: number;
  zoneCol: number;
  /** عمود «منصب الأدمن» (مدير منطقة / مدير زون)؛ ‎-1 = غير موجود */
  positionCol: number;
  /** عمود ربط حساب الأدمن بكود صف في شيت المشرفين؛ ‎-1 = غير موجود */
  linkedSupervisorCol: number;
};

export type ParsedAdminRow = {
  /** 1-based row index in the Google Sheet (for values.update) */
  sheetRow1Based: number;
  code: string;
  name: string;
  password: string;
  permissions: string;
  dataZone: string;
  /** نص خام من الشيت لعمود المنصب */
  adminPositionRaw: string;
  /** كود الصف المقابل في شيت المشرفين (للهرمية ونطاق البيانات) */
  linkedSupervisorCode: string;
};

function normCell(v: unknown): string {
  return String(v ?? '').trim();
}

function rowCellsLower(row: any[] | undefined): string[] {
  if (!row?.length) return [];
  return row.map((c) => normCell(c).toLowerCase());
}

/** True if first row looks like Arabic/English column titles, not a login row. */
export function isProbablyHeaderRow(row: any[] | undefined): boolean {
  if (!row?.length) return false;
  const cells = rowCellsLower(row).slice(0, 12);
  const joined = cells.filter(Boolean).join(' | ');
  if (!joined) return false;
  const hasCodeHdr =
    /كود|code|username|user\s*id|^id$|login|المستخدم|الكود/.test(joined) ||
    cells.some((c) => c === 'كود' || c.startsWith('كود '));
  const hasNameHdr =
    /اسم|name|الاسم|full\s*name/.test(joined) || cells.some((c) => c === 'الاسم' || c === 'name');
  const hasPassHdr = /كلمة|password|pass|مرور|pwd/.test(joined);
  if (hasCodeHdr && (hasNameHdr || hasPassHdr)) return true;
  if (hasPassHdr && hasNameHdr && !hasCodeHdr) return true;
  return false;
}

function findHeaderColumn(headerLower: string[], predicates: ((h: string) => boolean)[]): number {
  for (let j = 0; j < headerLower.length; j++) {
    const h = headerLower[j];
    if (!h) continue;
    if (predicates.some((p) => p(h))) return j;
  }
  return -1;
}

function inferColumnsFromHeader(headerRow: any[] | undefined): AdminColumnMap | null {
  if (!headerRow?.length) return null;
  const h = rowCellsLower(headerRow);

  const codeCol = findHeaderColumn(h, [
    (x) => x.includes('كود') && !x.includes('مشرف'),
    (x) => x === 'code' || x.includes('code') || x.includes('username') || x.includes('login'),
    (x) => x.includes('user') && x.includes('id'),
  ]);
  const nameCol = findHeaderColumn(h, [
    (x) => (x.includes('اسم') || x.includes('name')) && !x.includes('كود'),
    (x) => x === 'name' || x === 'الاسم',
  ]);
  const passCol = findHeaderColumn(h, [
    (x) => x.includes('كلمة') || x.includes('مرور'),
    (x) => x.includes('password') || x === 'pass' || x === 'pwd',
  ]);
  const permCol = findHeaderColumn(h, [
    (x) => x.includes('صلاح') || x.includes('perm'),
    (x) => x.includes('access') || x === 'role',
  ]);
  const zoneCol = findHeaderColumn(h, [
    (x) => x.includes('زون') || x.includes('zone') || x.includes('منطقة') || x.includes('region'),
    (x) => x.includes('نطاق') || x.includes('scope'),
  ]);

  if (codeCol < 0) return null;

  const nextFree = (avoid: Set<number>, start: number) => {
    let k = start;
    while (avoid.has(k)) k++;
    return k;
  };
  const used = new Set([codeCol]);
  const n =
    nameCol >= 0 && !used.has(nameCol)
      ? nameCol
      : nextFree(used, codeCol === 0 ? 1 : 0);
  used.add(n);
  const p =
    passCol >= 0 && !used.has(passCol)
      ? passCol
      : nextFree(used, n + 1);
  used.add(p);
  const pr =
    permCol >= 0 && !used.has(permCol)
      ? permCol
      : nextFree(used, p + 1);
  used.add(pr);
  const z =
    zoneCol >= 0 && !used.has(zoneCol)
      ? zoneCol
      : nextFree(used, pr + 1);
  used.add(z);

  const tryPick = (predicates: ((h: string) => boolean)[]) => {
    const idx = findHeaderColumn(h, predicates);
    if (idx < 0 || used.has(idx)) return -1;
    used.add(idx);
    return idx;
  };

  const positionCol = tryPick([
    (x) => x.includes('منصب') && !x.includes('مشرف'),
    (x) => x === 'position' || x.includes('admin_org') || x.includes('admin_position'),
  ]);

  const linkedSupervisorCol = tryPick([
    (x) => x.includes('ربط') && (x.includes('مشرف') || x.includes('شيت')),
    (x) => x.includes('linked') && x.includes('supervisor'),
    (x) => x.includes('كود') && x.includes('شيت') && x.includes('مشرف'),
  ]);

  return { codeCol, nameCol: n, passCol: p, permCol: pr, zoneCol: z, positionCol, linkedSupervisorCol };
}

/** If column A is empty on most data rows but B is filled, code is likely in B (or sheet has index in A). */
function inferCodeColHeuristic(rows: any[][], dataStart: number): number {
  let a = 0;
  let b = 0;
  const end = Math.min(rows.length, dataStart + 30);
  for (let i = dataStart; i < end; i++) {
    const r = rows[i] || [];
    if (normCell(r[0])) a++;
    if (normCell(r[1])) b++;
  }
  if (a === 0 && b > 0) return 1;
  return 0;
}

export function parseAdminsSheetDataMatrix(rows: any[][]): {
  admins: ParsedAdminRow[];
  columns: AdminColumnMap;
  dataStartIndex: number;
} {
  if (!rows?.length) {
    return {
      admins: [],
      columns: {
        codeCol: 0,
        nameCol: 1,
        passCol: 2,
        permCol: 3,
        zoneCol: 4,
        positionCol: -1,
        linkedSupervisorCol: -1,
      },
      dataStartIndex: 0,
    };
  }

  const hasHeader = isProbablyHeaderRow(rows[0]);
  const dataStart = hasHeader ? 1 : 0;

  let columns: AdminColumnMap;
  const absentPos = { positionCol: -1 as number, linkedSupervisorCol: -1 as number };
  if (hasHeader) {
    const fromHeader = inferColumnsFromHeader(rows[0]);
    columns = fromHeader ?? { codeCol: 0, nameCol: 1, passCol: 2, permCol: 3, zoneCol: 4, ...absentPos };
  } else {
    const cc = inferCodeColHeuristic(rows, dataStart);
    columns =
      cc === 1
        ? { codeCol: 1, nameCol: 2, passCol: 3, permCol: 4, zoneCol: 5, ...absentPos }
        : { codeCol: 0, nameCol: 1, passCol: 2, permCol: 3, zoneCol: 4, ...absentPos };
  }

  const admins: ParsedAdminRow[] = [];
  for (let i = dataStart; i < rows.length; i++) {
    const row = rows[i] || [];
    const code = normCell(row[columns.codeCol]);
    if (!code) continue;

    admins.push({
      sheetRow1Based: i + 1,
      code,
      name: normCell(row[columns.nameCol]),
      password: normCell(row[columns.passCol]),
      permissions: normCell(row[columns.permCol]),
      dataZone: normalizeAdminDataZone(row[columns.zoneCol]),
      adminPositionRaw:
        columns.positionCol >= 0 ? normCell(row[columns.positionCol]) : '',
      linkedSupervisorCode:
        columns.linkedSupervisorCol >= 0 ? normCell(row[columns.linkedSupervisorCol]) : '',
    });
  }

  return { admins, columns, dataStartIndex: dataStart };
}
