import { getSheetData, updateSheetRow } from '@/lib/googleSheets';
import {
  orgRoleToSheetLabel,
  parseSupervisorOrgRole,
  type SupervisorOrgRole,
} from '@/lib/orgHierarchy';
import {
  isSupervisorsProbablyHeaderRow,
  resolveSupervisorsSheetLayout,
} from '@/lib/supervisorsSheetParser';

export { orgRoleToSheetLabel };

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

  if (!hasOrg) {
    while (row.length <= columns.orgRole) row.push('');
    if (!String(row[columns.orgRole] ?? '').trim()) {
      row[columns.orgRole] = 'المنصب التنظيمي';
      changed = true;
    }
  }
  if (!hasParent) {
    while (row.length <= columns.parentCode) row.push('');
    if (!String(row[columns.parentCode] ?? '').trim()) {
      row[columns.parentCode] = 'كود المدير المباشر';
      changed = true;
    }
  }

  if (changed) {
    await updateSheetRow('المشرفين', 1, row);
  }
}
