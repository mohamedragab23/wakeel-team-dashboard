import { NextRequest, NextResponse } from 'next/server';
import { extractBearerToken } from '@/lib/requestAuth';
import { verifyToken } from '@/lib/auth';
import { getAllSupervisors } from '@/lib/adminService';
import { isGrantingAdmin } from '@/lib/adminFeatureAccess';
import { auditSupervisorHierarchy } from '@/lib/orgHierarchy';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    const token = extractBearerToken(request);
    if (!token) return NextResponse.json({ success: false, error: 'غير مصرح' }, { status: 401 });

    const decoded = verifyToken(token);
    if (!decoded || decoded.role !== 'admin') {
      return NextResponse.json({ success: false, error: 'غير مصرح' }, { status: 401 });
    }
    if (!isGrantingAdmin(decoded)) {
      return NextResponse.json({ success: false, error: 'لا تملك صلاحية عرض تدقيق الهرمية' }, { status: 403 });
    }

    const sups = await getAllSupervisors(false);
    const issues = auditSupervisorHierarchy(sups);

    const byRole = {
      zone_managers: sups.filter((s) => s.orgRole === 'zone_manager').length,
      regional_managers: sups.filter((s) => s.orgRole === 'regional_manager').length,
      operational: sups.filter((s) => (s.orgRole ?? 'supervisor') === 'supervisor').length,
    };

    return NextResponse.json({
      success: true,
      data: {
        total: sups.length,
        byRole,
        issueCount: issues.length,
        issues,
      },
    });
  } catch (error: any) {
    console.error('[hierarchy-audit]', error);
    return NextResponse.json({ success: false, error: error?.message || 'حدث خطأ' }, { status: 500 });
  }
}
