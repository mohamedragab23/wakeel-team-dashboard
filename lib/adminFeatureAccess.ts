import { NextResponse } from 'next/server';
import { parseAdminAllowedZonesList } from '@/lib/zones';

export const LIMITED_PREFIX = 'limited:';

/** Keys after "limited:" — used for menu + assertAdminApiAccess. */
export type AdminFeatureKey =
  | 'dashboard'
  | 'supervisors'
  | 'riders'
  | 'termination_requests'
  | 'assignment_requests'
  | 'performance_upload'
  | 'supervisor_performance'
  | 'salary_config'
  | 'equipment_pricing'
  | 'equipment_limits'
  | 'main_inventory'
  | 'equipment_requests'
  | 'salaries'
  | 'deductions_reconcile'
  | 'debug'
  | 'debts'
  | 'shifts';

const API_ACCESS_MAP: Record<string, AdminFeatureKey> = {
  main_inventory: 'main_inventory',
  deductions_reconcile: 'deductions_reconcile',
  supervisors: 'supervisors',
  equipment_limits: 'equipment_limits',
  equipment_pricing: 'equipment_pricing',
  supervisor_performance: 'supervisor_performance',
  debug: 'debug',
  salaries: 'salaries',
  salary_config: 'salary_config',
  performance_upload: 'performance_upload',
  equipment_requests: 'equipment_requests',
  debts: 'debts',
  riders: 'riders',
};

export const ADMIN_FEATURE_LABELS_AR: Record<AdminFeatureKey, string> = {
  dashboard: 'لوحة التحكم',
  supervisors: 'إدارة المشرفين',
  riders: 'إدارة المناديب',
  termination_requests: 'طلبات الإقالة',
  assignment_requests: 'طلبات التعيين',
  performance_upload: 'رفع بيانات الأداء',
  supervisor_performance: 'أداء المشرفين',
  salary_config: 'إعدادات الرواتب',
  equipment_pricing: 'أسعار المعدات',
  equipment_limits: 'حدود خصم المعدات',
  main_inventory: 'المخزون الرئيسي',
  equipment_requests: 'طلبات المعدات',
  salaries: 'حساب الرواتب',
  deductions_reconcile: 'استقطاعات المدير (مقارنة)',
  debug: 'تهيئة النظام والتحقق',
  debts: 'المديونية / الديون',
  shifts: 'الشفتات',
};

export const ALL_ADMIN_FEATURE_KEYS: AdminFeatureKey[] = [
  'dashboard',
  'supervisors',
  'riders',
  'termination_requests',
  'assignment_requests',
  'performance_upload',
  'supervisor_performance',
  'salary_config',
  'equipment_pricing',
  'equipment_limits',
  'main_inventory',
  'equipment_requests',
  'salaries',
  'deductions_reconcile',
  'debug',
  'debts',
  'shifts',
];

export type AdminMenuDef = { href: string; label: string; icon: string; feature: AdminFeatureKey };

export function getAdminMenuDefs(): AdminMenuDef[] {
  return [
    { href: '/admin/dashboard', label: 'لوحة التحكم', icon: '📊', feature: 'dashboard' },
    { href: '/admin/supervisors', label: 'إدارة المشرفين', icon: '👔', feature: 'supervisors' },
    { href: '/admin/riders', label: 'إدارة المناديب', icon: '👥', feature: 'riders' },
    { href: '/admin/termination-requests', label: 'طلبات الإقالة', icon: '🚫', feature: 'termination_requests' },
    { href: '/admin/assignment-requests', label: 'طلبات التعيين', icon: '➕', feature: 'assignment_requests' },
    { href: '/admin/performance', label: 'رفع بيانات الأداء', icon: '📈', feature: 'performance_upload' },
    { href: '/admin/supervisor-performance', label: 'أداء المشرفين', icon: '📊', feature: 'supervisor_performance' },
    { href: '/admin/salary-config', label: 'إعدادات الرواتب', icon: '⚙️', feature: 'salary_config' },
    { href: '/admin/equipment-pricing', label: 'أسعار المعدات', icon: '🛠️', feature: 'equipment_pricing' },
    { href: '/admin/equipment-limits', label: 'حدود خصم المعدات', icon: '📦', feature: 'equipment_limits' },
    { href: '/admin/main-inventory', label: 'المخزون الرئيسي', icon: '🏭', feature: 'main_inventory' },
    { href: '/admin/equipment-requests', label: 'طلبات المعدات', icon: '📋', feature: 'equipment_requests' },
    { href: '/admin/salaries', label: 'حساب الرواتب', icon: '💰', feature: 'salaries' },
    { href: '/admin/deductions-reconcile', label: 'استقطاعات المدير (مقارنة)', icon: '🔎', feature: 'deductions_reconcile' },
    { href: '/admin/debug', label: 'تهيئة النظام والتحقق', icon: '🧹', feature: 'debug' },
    { href: '/shifts', label: 'الشفتات', icon: '🕒', feature: 'shifts' },
  ];
}

/** Comma-separated feature keys after "limited:" */
export function parseLimitedFeatures(permissions: string | undefined | null): string[] | null {
  const p = String(permissions ?? '').trim();
  if (!p.toLowerCase().startsWith(LIMITED_PREFIX)) return null;
  const rest = p.slice(LIMITED_PREFIX.length).trim();
  if (!rest) return [];
  return rest
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

/** Normalize admin scope: one or many zones → pipe-separated allowed list (invalid tokens dropped). */
export function normalizeAdminDataZone(v: unknown): string {
  return parseAdminAllowedZonesList(v).join('|');
}

export { parseAdminAllowedZonesList };

export function adminFeatureAllowed(permissions: string | undefined | null, feature: AdminFeatureKey): boolean {
  const limited = parseLimitedFeatures(permissions);
  if (limited === null) return true;
  return limited.includes(feature);
}

export function filterAdminMenuForPermissions(permissions: string | undefined | null): AdminMenuDef[] {
  return getAdminMenuDefs().filter((d) => adminFeatureAllowed(permissions, d.feature));
}

export function getDefaultAdminHome(permissions: string | undefined | null): string {
  for (const d of getAdminMenuDefs()) {
    if (adminFeatureAllowed(permissions, d.feature)) return d.href;
  }
  return '/admin/dashboard';
}

/**
 * من يستطيع تعديل صلاحيات أدمن آخر: أدمن بصلاحيات فارغة أو all/* فقط (ليس limited:).
 */
export function isGrantingAdmin(decoded: { role?: string; permissions?: string } | null): boolean {
  if (!decoded || decoded.role !== 'admin') return false;
  const p = String(decoded.permissions ?? '').trim();
  if (p === '') return true;
  const low = p.toLowerCase();
  if (low.includes('all') || low.includes('*')) return true;
  if (low.startsWith(LIMITED_PREFIX)) return false;
  return false;
}

export function assertAdminApiAccess(
  decoded: { role?: string; permissions?: string } | null,
  apiKey: string
): NextResponse | null {
  if (!decoded || decoded.role !== 'admin') {
    return NextResponse.json({ success: false, error: 'غير مصرح' }, { status: 401 });
  }
  const feature = API_ACCESS_MAP[apiKey];
  if (!feature) {
    return NextResponse.json({ success: false, error: 'صلاحية غير معروفة' }, { status: 403 });
  }
  if (adminFeatureAllowed(decoded.permissions, feature)) return null;
  return NextResponse.json({ success: false, error: 'لا تملك صلاحية هذه العملية' }, { status: 403 });
}

export function assertAdminSupervisorsReadAccess(decoded: { role?: string; permissions?: string } | null): NextResponse | null {
  if (!decoded || decoded.role !== 'admin') {
    return NextResponse.json({ success: false, error: 'غير مصرح' }, { status: 401 });
  }
  if (parseLimitedFeatures(decoded.permissions) === null) return null;
  const limited = parseLimitedFeatures(decoded.permissions) || [];
  const ok =
    limited.includes('supervisors') ||
    limited.includes('supervisor_performance') ||
    limited.includes('shifts') ||
    limited.includes('riders') ||
    limited.includes('assignment_requests') ||
    limited.includes('termination_requests');
  if (ok) return null;
  return NextResponse.json({ success: false, error: 'لا تملك صلاحية عرض المشرفين' }, { status: 403 });
}
