/**
 * Calculate Supervisor Salary API
 * Admin can calculate supervisor salaries for a date range
 */

import { NextRequest, NextResponse } from 'next/server';
import { extractBearerToken } from '@/lib/requestAuth';
import { verifyToken } from '@/lib/auth';
import { assertAdminApiAccess } from '@/lib/adminFeatureAccess';
import { assertLimitedAdminSupervisorZoneAccess } from '@/lib/adminZoneScope';
import { calculateSupervisorSalary } from '@/lib/salaryService';
import { getAllSupervisors } from '@/lib/adminService';
import { shouldRedactRegionalManagerSalary } from '@/lib/adminSalaryRedaction';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    const token = extractBearerToken(request);

    if (!token) {
      return NextResponse.json({ success: false, error: 'غير مصرح' }, { status: 401 });
    }

    const decoded = verifyToken(token);
    if (!decoded || decoded.role !== 'admin') {
      return NextResponse.json({ success: false, error: 'غير مصرح - المدير فقط' }, { status: 401 });
    }

    const sal = assertAdminApiAccess(decoded, 'salaries');
    if (sal) return sal;

    const { searchParams } = new URL(request.url);
    const supervisorCode = searchParams.get('supervisorCode')?.trim();
    const startDate = searchParams.get('startDate');
    const endDate = searchParams.get('endDate');

    if (!supervisorCode || !startDate || !endDate) {
      return NextResponse.json(
        { success: false, error: 'كود المشرف وتواريخ البداية والنهاية مطلوبة' },
        { status: 400 }
      );
    }

    const zoneDeny = await assertLimitedAdminSupervisorZoneAccess(decoded, supervisorCode);
    if (zoneDeny) return zoneDeny;

    const sups = await getAllSupervisors(false);
    const sub = sups.find((s) => String(s.code ?? '').trim() === supervisorCode);
    if (sub && shouldRedactRegionalManagerSalary(decoded, sub.orgRole)) {
      return NextResponse.json(
        { success: false, error: 'لا تملك صلاحية عرض تفاصيل راتب مدير المنطقة' },
        { status: 403 }
      );
    }

    // Calculate salary
    const salaryData = await calculateSupervisorSalary(supervisorCode, startDate, endDate);

    return NextResponse.json({
      success: true,
      data: salaryData,
    });
  } catch (error: any) {
    console.error('Calculate salary error:', error);
    return NextResponse.json(
      { success: false, error: error.message || 'حدث خطأ في حساب الراتب' },
      { status: 500 }
    );
  }
}

