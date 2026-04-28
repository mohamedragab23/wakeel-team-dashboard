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
    if (!decoded || decoded.role !== 'supervisor') {
      return NextResponse.json({ success: false, error: 'غير مصرح' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const month = parseInt(searchParams.get('month') || '0');
    const year = parseInt(searchParams.get('year') || '0');

    if (!month || !year) {
      const now = new Date();
      const salaryData = await calculateSupervisorSalary(decoded.code, now.getMonth() + 1, now.getFullYear());
      return NextResponse.json({ success: true, data: salaryData });
    }

    const salaryData = await calculateSupervisorSalary(decoded.code, month, year);

    return NextResponse.json({ success: true, data: salaryData });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: 'حدث خطأ: ' + error.message },
      { status: 500 }
    );
  }
}

