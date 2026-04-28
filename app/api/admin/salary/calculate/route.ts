/**
 * Calculate Supervisor Salary API
 * Admin can calculate supervisor salaries for a date range
 */

import { NextRequest, NextResponse } from 'next/server';
import { verifyToken } from '@/lib/auth';
import { calculateSupervisorSalary } from '@/lib/salaryService';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    const token = request.headers.get('authorization')?.replace('Bearer ', '');

    if (!token) {
      return NextResponse.json({ success: false, error: 'غير مصرح' }, { status: 401 });
    }

    const decoded = verifyToken(token);
    if (!decoded || decoded.role !== 'admin') {
      return NextResponse.json({ success: false, error: 'غير مصرح - المدير فقط' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const supervisorCode = searchParams.get('supervisorCode');
    const startDate = searchParams.get('startDate');
    const endDate = searchParams.get('endDate');

    if (!supervisorCode || !startDate || !endDate) {
      return NextResponse.json(
        { success: false, error: 'كود المشرف وتواريخ البداية والنهاية مطلوبة' },
        { status: 400 }
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

