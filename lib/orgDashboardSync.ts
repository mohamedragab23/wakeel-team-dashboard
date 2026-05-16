import type { AdminColumnMap } from '@/lib/adminsSheetParser';
import { parseAdminsSheetDataMatrix } from '@/lib/adminsSheetParser';
import { addSupervisor, getAllSupervisors, updateSupervisor, type Supervisor } from '@/lib/adminService';
import { updateSheetRow } from '@/lib/googleSheets';
import { parseLinkedSupervisorRootCodes, type SupervisorOrgRole } from '@/lib/orgHierarchy';
import {
  ensureSupervisorsOrgColumns,
  orgRoleToSheetLabel,
  sheetLabelToOrgRole,
} from '@/lib/supervisorsSheetSetup';

export { ensureSupervisorsOrgColumns, orgRoleToSheetLabel, sheetLabelToOrgRole };

/** منصب الأدمن في الداشبورد → دور في شيت المشرفين */
export function adminPositionToOrgRole(adminPosition: string): SupervisorOrgRole | null {
  const s = String(adminPosition ?? '').trim();
  if (s.includes('منطقة')) return 'regional_manager';
  if (s.includes('زون')) return 'zone_manager';
  return null;
}

/** يضيف أعمدة «منصب الأدمن» و«ربط شيت المشرفين» في صف العناوين إن لم تكن موجودة */
export async function ensureAdminsOrgColumns(
  sheetName: string,
  rows: any[][]
): Promise<AdminColumnMap> {
  const { columns, dataStartIndex } = parseAdminsSheetDataMatrix(rows);
  if (dataStartIndex !== 1) return columns;

  const headerIdx = 0;
  const row = [...(rows[headerIdx] || [])];
  let changed = false;

  if (columns.positionCol < 0) {
    columns.positionCol = row.length;
    row.push('منصب الأدمن');
    changed = true;
  }
  if (columns.linkedSupervisorCol < 0) {
    columns.linkedSupervisorCol = row.length;
    row.push('ربط شيت المشرفين');
    changed = true;
  }

  if (changed) {
    await updateSheetRow(sheetName, 1, row);
    rows[headerIdx] = row;
  }
  return columns;
}

export type SyncLinkedSupervisorsInput = {
  linkedSupervisorCode: string;
  adminPosition: string;
  /** اسم يُنسخ لصف جديد في المشرفين إن وُجد إنشاء */
  displayName?: string;
  /** كلمة مرور صف المشرفين عند الإنشاء التلقائي */
  supervisorPassword?: string;
  email?: string;
  /** إن وُجدت أكواد غير موجودة — إنشاء صفوف */
  autoCreateMissing?: boolean;
};

/**
 * بعد حفظ صلاحيات الأدمن: التأكد أن أكواد الربط موجودة في «المشرفين» بالمنصب الصحيح.
 */
export async function syncLinkedSupervisorRowsFromAdmin(
  input: SyncLinkedSupervisorsInput
): Promise<{ created: string[]; updated: string[]; skipped: string[] }> {
  const created: string[] = [];
  const updated: string[] = [];
  const skipped: string[] = [];

  const codes = parseLinkedSupervisorRootCodes(input.linkedSupervisorCode);
  if (!codes.length) return { created, updated, skipped };

  const orgRole = adminPositionToOrgRole(input.adminPosition);
  await ensureSupervisorsOrgColumns();
  const existing = await getAllSupervisors(false);
  const byCode = new Map(existing.map((s) => [String(s.code ?? '').trim(), s]));

  for (const code of codes) {
    const cur = byCode.get(code);
    if (cur) {
      if (orgRole && cur.orgRole !== orgRole) {
        const res = await updateSupervisor(code, { orgRole });
        if (res.success) updated.push(code);
        else skipped.push(code);
      } else {
        skipped.push(code);
      }
      continue;
    }

    if (!input.autoCreateMissing) {
      skipped.push(code);
      continue;
    }

    const name = (input.displayName || code).trim();
    const email = (input.email || `${code}@dashboard.local`).trim();
    const password = (input.supervisorPassword || code).trim();
    const stub: Supervisor = {
      code,
      name,
      region: '',
      email,
      password,
      orgRole: orgRole ?? 'supervisor',
    };
    const res = await addSupervisor(stub);
    if (res.success) created.push(code);
    else skipped.push(code);
  }

  return { created, updated, skipped };
}
