import { NextRequest, NextResponse } from 'next/server';
import { verifyToken } from '@/lib/auth';
import { adminFeatureAllowed, parseLimitedFeatures } from '@/lib/adminFeatureAccess';
import { resetRecruitmentManagerData } from '@/lib/recruitment/recruitmentService';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  try {
    const token = request.headers.get('authorization')?.replace('Bearer ', '');
    if (!token) return NextResponse.json({ success: false, error: 'غير مصرح' }, { status: 401 });
    const decoded = verifyToken(token);
    if (decoded.role !== 'admin') {
      return NextResponse.json({ success: false, error: 'هذه العملية متاحة للأدمن فقط' }, { status: 403 });
    }
    const limited = parseLimitedFeatures(decoded.permissions);
    if (limited !== null && !adminFeatureAllowed(decoded.permissions, 'recruitment')) {
      return NextResponse.json({ success: false, error: 'لا تملك صلاحية التعيينات' }, { status: 403 });
    }

    const body = await request.json();
    const managerCode = String(body.managerCode ?? '').trim();
    if (!managerCode) {
      return NextResponse.json(
        { success: false, error: 'اكتب كود مسؤول التعيينات أولاً' },
        { status: 400 }
      );
    }

    const result = await resetRecruitmentManagerData(managerCode);
    return NextResponse.json({ success: true, data: result });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : 'حدث خطأ';
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}
