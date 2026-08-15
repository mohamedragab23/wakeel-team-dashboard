import { parseAdminAllowedZonesList } from '@/lib/zones';
import { stripAccountDisabledMarker } from '@/lib/accountDisable';

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
  | 'shifts'
  | 'recruitment'
  | 'strategic_ops'
  | 'rider_strategic_profiles'
  | 'ticketing'
  | 'live_riders'
  | 'ghost_riders_export'
  | 'rider_comments'
  | 'rider_comments_dashboard'
  | 'missing_data_audit'
  | 'payroll_ledger'
  | 'payout_cycles'
  | 'equipment_liability'
  | 'auto_equipment_deductions'
  | 'manual_deductions_v2'
  | 'equipment_finance';

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
  recruitment: 'إدارة المرشحين (التعيين)',
  strategic_ops: 'مركز العمليات الاستراتيجي',
  rider_strategic_profiles: 'إدارة بيانات المناديب',
  ticketing: 'نظام التذاكر التشغيلية',
  live_riders: 'العمليات المباشرة',
  ghost_riders_export: 'تصدير المناديب الأشباح',
  rider_comments: 'التعليقات اليومية',
  rider_comments_dashboard: 'لوحة التعليقات اليومية',
  missing_data_audit: 'تدقيق البيانات الناقصة',
  payroll_ledger: 'سجل المعاملات المالية (Payroll Ledger)',
  payout_cycles: 'دورات القبض',
  equipment_liability: 'عهدة المعدات / الالتزام المالي',
  auto_equipment_deductions: 'استقطاعات المعدات التلقائية',
  manual_deductions_v2: 'خصومات يدوية (V2)',
  equipment_finance: 'تقارير مالية المعدات',
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
  'recruitment',
  'strategic_ops',
  'rider_strategic_profiles',
  'ticketing',
  'live_riders',
  'ghost_riders_export',
  'rider_comments',
  'rider_comments_dashboard',
  'missing_data_audit',
  'payroll_ledger',
  'payout_cycles',
  'equipment_liability',
  'auto_equipment_deductions',
  'manual_deductions_v2',
  'equipment_finance',
];

export type AdminMenuDef = { href: string; label: string; icon: string; feature: AdminFeatureKey };

export function getAdminMenuDefs(): AdminMenuDef[] {
  return [
    { href: '/admin/dashboard', label: 'لوحة التحكم', icon: '📊', feature: 'dashboard' },
    { href: '/live-riders', label: 'العمليات المباشرة', icon: '📡', feature: 'live_riders' },
    { href: '/admin/supervisors', label: 'إدارة المشرفين', icon: '👔', feature: 'supervisors' },
    { href: '/admin/riders', label: 'إدارة المناديب', icon: '👥', feature: 'riders' },
    { href: '/rider-search', label: 'بحث المناديب (روستر)', icon: '🔎', feature: 'riders' },
    { href: '/admin/termination-requests', label: 'طلبات الإقالة', icon: '🚫', feature: 'termination_requests' },
    { href: '/admin/assignment-requests', label: 'طلبات التعيين', icon: '➕', feature: 'assignment_requests' },
    { href: '/admin/reactivation-requests', label: 'طلبات إعادة التفعيل', icon: '🔄', feature: 'assignment_requests' },
    { href: '/admin/performance', label: 'رفع بيانات الأداء', icon: '📈', feature: 'performance_upload' },
    { href: '/admin/supervisor-performance', label: 'أداء المشرفين', icon: '📊', feature: 'supervisor_performance' },
    { href: '/admin/strategic-ops', label: 'مركز العمليات الاستراتيجي', icon: '🎯', feature: 'strategic_ops' },
    { href: '/admin/strategic-ops/integrity', label: 'System Integrity Center', icon: '🛡️', feature: 'strategic_ops' },
    { href: '/admin/strategic-ops/war-room', label: 'Executive War Room', icon: '♟️', feature: 'strategic_ops' },
    { href: '/admin/strategic-ops/validation-center', label: 'Ops Validation Center', icon: '🧪', feature: 'strategic_ops' },
    { href: '/admin/strategic-ops/certification', label: 'Production Certification', icon: '📜', feature: 'strategic_ops' },
    { href: '/admin/strategic-ops/kpi-explorer', label: 'KPI Explorer', icon: '🔎', feature: 'strategic_ops' },
    { href: '/admin/strategic-ops/trust-center', label: 'Trust Center', icon: '✅', feature: 'strategic_ops' },
    { href: '/admin/strategic-ops/enterprise-certification', label: 'Enterprise Certification', icon: '🏆', feature: 'strategic_ops' },
    { href: '/admin/ghost-riders-export', label: 'المناديب الأشباح', icon: '🚨', feature: 'ghost_riders_export' },
    { href: '/admin/missing-data-audit', label: 'تدقيق البيانات الناقصة', icon: '📋', feature: 'missing_data_audit' },
    { href: '/rider-comments', label: 'التعليقات اليومية', icon: '💬', feature: 'rider_comments' },
    { href: '/admin/rider-comments-dashboard', label: 'لوحة التعليقات (أدمن)', icon: '📊', feature: 'rider_comments_dashboard' },
    { href: '/admin/rider-strategic-profiles', label: 'إدارة بيانات المناديب', icon: '📋', feature: 'rider_strategic_profiles' },
    { href: '/admin/salary-config', label: 'إعدادات الرواتب', icon: '⚙️', feature: 'salary_config' },
    { href: '/admin/equipment-pricing', label: 'أسعار المعدات', icon: '🛠️', feature: 'equipment_pricing' },
    { href: '/admin/equipment-limits', label: 'حدود خصم المعدات', icon: '📦', feature: 'equipment_limits' },
    { href: '/admin/main-inventory', label: 'المخزون الرئيسي', icon: '🏭', feature: 'main_inventory' },
    { href: '/admin/equipment-requests', label: 'طلبات المعدات', icon: '📋', feature: 'equipment_requests' },
    { href: '/admin/salaries', label: 'حساب الرواتب', icon: '💰', feature: 'salaries' },
    { href: '/admin/deductions-reconcile', label: 'استقطاعات المدير (مقارنة)', icon: '🔎', feature: 'deductions_reconcile' },
    { href: '/admin/payout-cycles', label: 'دورات القبض', icon: '📅', feature: 'payout_cycles' },
    { href: '/admin/equipment-liability', label: 'مكتب عهدة المعدات', icon: '💳', feature: 'equipment_liability' },
    {
      href: '/admin/equipment-reconciliation',
      label: 'تسوية افتتاحية للمعدات',
      icon: '📒',
      feature: 'equipment_liability',
    },
    { href: '/admin/equipment-finance', label: 'مالية المعدات', icon: '🧾', feature: 'equipment_finance' },
    { href: '/admin/expected-equipment-deductions', label: 'متوقع خصم المعدات', icon: '🧮', feature: 'equipment_finance' },
    {
      href: '/admin/equipment-actual-reconcile',
      label: 'طلب/فعلي خصم المعدات',
      icon: '⚖️',
      feature: 'equipment_liability',
    },
    { href: '/admin/rider-360', label: 'ملف المندوب 360°', icon: '🧭', feature: 'equipment_liability' },
    { href: '/admin/debug', label: 'تهيئة النظام والتحقق', icon: '🧹', feature: 'debug' },
    { href: '/shifts', label: 'الشفتات', icon: '🕒', feature: 'shifts' },
    { href: '/recruitment', label: 'التعيينات', icon: '📋', feature: 'recruitment' },
    { href: '/ticketing/admin', label: 'التذاكر التشغيلية', icon: '🎫', feature: 'ticketing' },
  ];
}

/** هل يظهر قسم التعيين في القائمة؟ */
export function adminCanAccessRecruitment(permissions: string | undefined | null): boolean {
  return adminFeatureAllowed(permissions, 'recruitment');
}

/** Comma-separated feature keys after "limited:" (role: markers stripped first). */
export function parseLimitedFeatures(permissions: string | undefined | null): string[] | null {
  const raw = stripAccountDisabledMarker(permissions);
  // role:EQUIPMENT_MANAGER|limited:a,b → limited:a,b
  const p = raw.replace(/^\s*role:[A-Z0-9_]+\|/i, '').trim();
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
 * من يستطيع تعديل صلاحيات أدمن آخر: أدمن بصلاحيات فارغة أو all/* فقط (ليس limited: / role packs).
 */
export function isGrantingAdmin(decoded: { role?: string; permissions?: string } | null): boolean {
  if (!decoded || decoded.role !== 'admin') return false;
  const p = String(decoded.permissions ?? '').trim();
  if (p === '') return true;
  const low = p.toLowerCase();
  if (low.includes('all') || low.includes('*')) return true;
  if (/^\s*role:/i.test(p)) return false;
  if (low.includes(LIMITED_PREFIX) || low.startsWith(LIMITED_PREFIX)) return false;
  return false;
}

/** أدمن محدود + عمود الزونات في JWT غير فارغ (زونات معتمدة). */
export function isLimitedAdminZoneScopeActive(
  decoded: { role?: string; permissions?: string; dataZone?: string } | null
): boolean {
  if (!decoded || decoded.role !== 'admin') return false;
  if (parseLimitedFeatures(decoded.permissions) === null) return false;
  return parseAdminAllowedZonesList(decoded.dataZone).length > 0;
}

/** أدمن محدود + (زونات و/أو ربط بصف في شيت المشرفين) — نطاق بيانات يُطبَّق على الـ API. */
export function isLimitedAdminDataScopeActive(
  decoded: {
    role?: string;
    permissions?: string;
    dataZone?: string;
    linkedSupervisorCode?: string;
  } | null
): boolean {
  if (!decoded || decoded.role !== 'admin') return false;
  if (parseLimitedFeatures(decoded.permissions) === null) return false;
  if (String(decoded.linkedSupervisorCode ?? '').trim() !== '') return true;
  return parseAdminAllowedZonesList(decoded.dataZone).length > 0;
}

/** من عمود «منصب الأدمن» في شيت Admins + نمط الصلاحيات (للـ JWT). */
export function jwtAdminOrgRoleFromSheet(
  positionRaw: string | undefined | null,
  permissions: string | undefined | null
): 'full' | 'regional' | 'zone' {
  if (parseLimitedFeatures(permissions) === null) return 'full';
  const s = String(positionRaw ?? '')
    .replace(/^\uFEFF/, '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '_');
  if (!s) return 'zone';
  if (s.includes('منطقة') || s.includes('regional')) return 'regional';
  if (s.includes('زون') || s.includes('zone')) return 'zone';
  return 'zone';
}
