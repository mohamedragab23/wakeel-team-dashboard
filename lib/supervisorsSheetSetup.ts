import { getSheetData, updateSheetRow } from '@/lib/googleSheets';
import { parseSupervisorOrgRole, type SupervisorOrgRole } from '@/lib/orgHierarchy';
import {
  isSupervisorsProbablyHeaderRow,
  resolveSupervisorsSheetLayout,
} from '@/lib/supervisorsSheetParser';

export function orgRoleToSheetLabel(role: SupervisorOrgRole | undefined): string {
  if (role === 'zone_manager') return 'مدير زون';
  if (role === 'regional_manager') return 'مدير منطقة';
  return '';
}

export function sheetLabelToOrgRole(raw: string): SupervisorOrgRole {
  return parseSupervisorOrgRole(raw);
}

/** يضيف عناوين «المنصب» و«كود المدير المباشر» في صف 1 إن لم تكن موجودة */
export async function ensureSupervisorsOrgColumns(): Promise<void> {
  const data = await getSheetData('المشرفين', false);
  if (!data.length) return;

  const hasHeader = isSupervisorsProbablyHeaderRow(data[0]);
  if (!hasHeader) return;

  const { columns } = resolveSupervisorsSheetLayout(data);
  const row = [...(data[0] || [])];
  let changed = false;

  const h = row.map((c) => String(c ?? '').trim().toLowerCase());
  const hasOrg = h.some((x) => x.includes('منصب'));
  const hasParent = h.some((x) => x.includes('مباشر') || (x.includes('كود') && x.includes('مدير')));

  if (!hasOrg && columns.orgRole >= row.length) {
    while (row.length < columns.orgRole) row.push('');
    if (!row[columns.orgRole]) {
      row[columns.orgRole] = 'المنصب التنظيمي';
      changed = true;
    }
  }
  if (!hasParent && columns.parentCode >= row.length) {
    while (row.length < columns.parentCode) row.push('');
    if (!row[columns.parentCode]) {
      row[columns.parentCode] = 'كود المدير المباشر';
      changed = true;
    }
  }

  if (!hasOrg) {
    row.push('المنصب التنظيمي');
    changed = true;
  }
  if (!hasParent) {
    row.push('كود المدير المباشر');
    changed = true;
  }

  if (changed) {
    await updateSheetRow('المشرفين', 1, row);
  }
}
