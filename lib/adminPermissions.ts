/**
 * Admin sub-permissions (column in Admins sheet, comma-separated).
 * Empty / missing = full access for inventory & equipment (backward compatible).
 * مقارنة الاستقطاعات (deductions_verify): لا تُمنح تلقائياً — يجب إضافتها صراحة أو all.
 * Examples: "inventory", "equipment", "deductions_verify", "inventory,equipment,deductions_verify", "all"
 *
 * When permissions start with "limited:" (see adminFeatureAccess), sub-permissions follow menu feature keys.
 */

import { parseLimitedFeatures } from '@/lib/adminFeatureAccess';

export type AdminPermissionFlag = 'inventory' | 'equipment' | 'deductions_verify';

/** Server: admin role + JWT permissions */
export function adminHasPermission(
  decoded: { role?: string; permissions?: string } | null,
  flag: AdminPermissionFlag
): boolean {
  if (!decoded || decoded.role !== 'admin') return false;
  return adminPermissionAllowed(decoded.permissions, flag);
}

/** Client: same rules, without role check (menu visibility) */
export function adminPermissionAllowed(
  permissions: string | undefined | null,
  flag: AdminPermissionFlag
): boolean {
  const limited = parseLimitedFeatures(permissions);
  if (limited !== null) {
    if (flag === 'inventory') {
      return limited.includes('main_inventory') || limited.includes('inventory');
    }
    if (flag === 'equipment') {
      return (
        limited.includes('equipment_requests') ||
        limited.includes('equipment') ||
        limited.includes('equipment_limits') ||
        limited.includes('equipment_pricing')
      );
    }
    if (flag === 'deductions_verify') {
      return limited.includes('deductions_reconcile') || limited.includes('deductions_verify');
    }
    return false;
  }

  const empty = permissions === undefined || permissions === null || String(permissions).trim() === '';
  if (empty) {
    if (flag === 'deductions_verify') return false;
    return true;
  }
  const p = String(permissions).toLowerCase();
  if (p.includes('all') || p.includes('*')) return true;
  if (flag === 'inventory') {
    return p.includes('inventory') || p.includes('مخزون');
  }
  if (flag === 'equipment') {
    return (
      p.includes('equipment') ||
      p.includes('معدات') ||
      p.includes('تسليم') ||
      p.includes('استرجاع')
    );
  }
  if (flag === 'deductions_verify') {
    return (
      p.includes('deductions_verify') ||
      p.includes('deductions_reconcile') ||
      p.includes('استقطاعات_ادمن') ||
      p.includes('استقطاعات_المدير') ||
      p.includes('مقارنة_استقطاع') ||
      p.includes('مقارنة استقطاع')
    );
  }
  return false;
}
