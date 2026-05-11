import type { SupervisorOrgRole } from '@/lib/orgHierarchy';
import type { Supervisor } from '@/lib/adminService';

export type AdminOrgRoleJwt = 'full' | 'regional' | 'zone';

export type SalaryRedactionViewer = {
  role?: string;
  adminOrgRole?: AdminOrgRoleJwt | string;
};

/** مدير الزون لا يرى تفاصيل راتب صف «مدير منطقة» في شيت المشرفين. */
export function shouldRedactRegionalManagerSalary(
  viewer: SalaryRedactionViewer,
  subjectOrgRole: SupervisorOrgRole | undefined
): boolean {
  if (viewer.role !== 'admin') return false;
  if (viewer.adminOrgRole !== 'zone') return false;
  return subjectOrgRole === 'regional_manager';
}

export function redactSupervisorRowForViewer<T extends Partial<Supervisor>>(
  viewer: SalaryRedactionViewer,
  sup: T
): T {
  if (!shouldRedactRegionalManagerSalary(viewer, sup.orgRole)) return sup;
  return {
    ...sup,
    salaryType: undefined,
    salaryAmount: undefined,
    commissionFormula: undefined,
  };
}
