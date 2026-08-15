/**
 * Server-only admin API authorization (NextResponse + session version).
 * Do NOT import this from Client Components — use `@/lib/adminFeatureAccess` for menus/features.
 */
import { NextResponse } from 'next/server';
import {
  adminFeatureAllowed,
  parseLimitedFeatures,
} from '@/lib/adminFeatureAccess';
import { assertSessionVersionValid } from '@/lib/sessionVersion';

const API_ACCESS_MAP: Record<string, import('@/lib/adminFeatureAccess').AdminFeatureKey> = {
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
  assignment_requests: 'assignment_requests',
  termination_requests: 'termination_requests',
  recruitment: 'recruitment',
  shifts: 'shifts',
  strategic_ops: 'strategic_ops',
  rider_strategic_profiles: 'rider_strategic_profiles',
  ticketing: 'ticketing',
  live_riders: 'live_riders',
  ghost_riders_export: 'ghost_riders_export',
  rider_comments: 'rider_comments',
  rider_comments_dashboard: 'rider_comments_dashboard',
  missing_data_audit: 'missing_data_audit',
  payroll_ledger: 'payroll_ledger',
  payout_cycles: 'payout_cycles',
  equipment_liability: 'equipment_liability',
  auto_equipment_deductions: 'auto_equipment_deductions',
  manual_deductions_v2: 'manual_deductions_v2',
  equipment_finance: 'equipment_finance',
};

export async function assertAdminApiAccess(
  decoded: { role?: string; permissions?: string; code?: string; sv?: number } | null,
  apiKey: string
): Promise<NextResponse | null> {
  if (!decoded || decoded.role !== 'admin') {
    return NextResponse.json({ success: false, error: 'غير مصرح' }, { status: 401 });
  }
  const svErr = await assertSessionVersionValid({
    role: decoded.role,
    code: decoded.code,
    sv: decoded.sv,
  });
  if (svErr) {
    return NextResponse.json({ success: false, error: svErr }, { status: 401 });
  }
  const feature = API_ACCESS_MAP[apiKey];
  if (!feature) {
    return NextResponse.json({ success: false, error: 'صلاحية غير معروفة' }, { status: 403 });
  }
  if (adminFeatureAllowed(decoded.permissions, feature)) return null;
  return NextResponse.json({ success: false, error: 'لا تملك صلاحية هذه العملية' }, { status: 403 });
}

/** قراءة أداء المناديب في صفحة إدارة المناديب — لا يتطلب صلاحية رفع الأداء. */
export async function assertAdminRidersPerformanceReadAccess(
  decoded: { role?: string; permissions?: string; code?: string; sv?: number } | null
): Promise<NextResponse | null> {
  if (!decoded || decoded.role !== 'admin') {
    return NextResponse.json({ success: false, error: 'غير مصرح' }, { status: 401 });
  }
  const svErr = await assertSessionVersionValid(decoded);
  if (svErr) {
    return NextResponse.json({ success: false, error: svErr }, { status: 401 });
  }
  if (parseLimitedFeatures(decoded.permissions) === null) return null;
  const limited = parseLimitedFeatures(decoded.permissions) || [];
  if (
    limited.includes('riders') ||
    limited.includes('performance_upload') ||
    limited.includes('supervisor_performance')
  ) {
    return null;
  }
  return NextResponse.json({ success: false, error: 'لا تملك صلاحية هذه العملية' }, { status: 403 });
}

export async function assertAdminSupervisorsReadAccess(decoded: {
  role?: string;
  permissions?: string;
  code?: string;
  sv?: number;
} | null): Promise<NextResponse | null> {
  if (!decoded || decoded.role !== 'admin') {
    return NextResponse.json({ success: false, error: 'غير مصرح' }, { status: 401 });
  }
  const svErr = await assertSessionVersionValid(decoded);
  if (svErr) {
    return NextResponse.json({ success: false, error: svErr }, { status: 401 });
  }
  if (parseLimitedFeatures(decoded.permissions) === null) return null;
  const limited = parseLimitedFeatures(decoded.permissions) || [];
  const ok =
    limited.includes('supervisors') ||
    limited.includes('supervisor_performance') ||
    limited.includes('shifts') ||
    limited.includes('riders') ||
    limited.includes('assignment_requests') ||
    limited.includes('termination_requests') ||
    limited.includes('salaries') ||
    limited.includes('salary_config');
  if (ok) return null;
  return NextResponse.json({ success: false, error: 'لا تملك صلاحية عرض المشرفين' }, { status: 403 });
}
