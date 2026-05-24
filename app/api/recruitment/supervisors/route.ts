import { NextRequest, NextResponse } from 'next/server';
import { verifyToken } from '@/lib/auth';
import { assertRecruitmentApiAccess } from '@/lib/recruitment/recruitmentAuth';
import { getAllSupervisors } from '@/lib/adminService';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    const token = request.headers.get('authorization')?.replace('Bearer ', '');
    if (!token) return NextResponse.json({ success: false, error: 'غير مصرح' }, { status: 401 });
    const decoded = verifyToken(token);
    const denied = assertRecruitmentApiAccess(decoded);
    if (denied) return denied;

    const supervisors = await getAllSupervisors(false);
    const operational = supervisors
      .filter((s) => (s.orgRole ?? 'supervisor') === 'supervisor')
      .map((s) => ({
        code: s.code,
        name: s.name,
        region: s.region,
      }));

    return NextResponse.json({ success: true, data: operational });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : 'حدث خطأ';
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}

