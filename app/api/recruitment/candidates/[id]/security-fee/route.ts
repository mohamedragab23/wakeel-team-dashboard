/**
 * SRS-014 Phase B — security inquiry payment (frozen after first set for recruitment_manager).
 */
import { NextRequest, NextResponse } from 'next/server';
import { extractBearerToken } from '@/lib/requestAuth';
import { verifyToken } from '@/lib/auth';
import { assertRecruitmentApiAccess, actorFromJwt } from '@/lib/recruitment/recruitmentAuth';
import { getCandidateById } from '@/lib/recruitment/recruitmentService';
import { updateSecurityInquiryPayment } from '@/lib/recruitment/recruitmentV2';
import { resolveRouteId } from '@/lib/recruitment/routeParams';
import { isRecruitmentV2Enabled, SRS014_FLAG_OFF_BODY } from '@/lib/srs014Flags';

export const dynamic = 'force-dynamic';

type RouteCtx = { params: Promise<{ id: string }> | { id: string } };

export async function PATCH(request: NextRequest, ctx: RouteCtx) {
  if (!isRecruitmentV2Enabled()) {
    return NextResponse.json(SRS014_FLAG_OFF_BODY, { status: 503 });
  }

  try {
    const token = extractBearerToken(request);
    if (!token) {
      return NextResponse.json({ success: false, error: 'غير مصرح' }, { status: 401 });
    }
    const decoded = verifyToken(token);
    const denied = assertRecruitmentApiAccess(decoded);
    if (denied) return denied;

    const role = decoded.role ?? '';
    if (role !== 'admin' && role !== 'recruitment_manager') {
      return NextResponse.json(
        { success: false, error: 'لا تملك صلاحية تعديل رسوم الاستعلام الأمني' },
        { status: 403 }
      );
    }

    const id = await resolveRouteId(ctx.params);
    const candidate = await getCandidateById(id);
    if (!candidate) {
      return NextResponse.json({ success: false, error: 'المرشح غير موجود' }, { status: 404 });
    }

    const body = await request.json();
    const actor = actorFromJwt(decoded);
    // Accepts PAID | NOT_PAID | UNPAID (UNPAID normalized to NOT_PAID in storage).
    const updated = await updateSecurityInquiryPayment(id, body.securityInquiryPayment, {
      ...actor,
      role,
    });
    return NextResponse.json({ success: true, data: updated });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : 'حدث خطأ';
    const status =
      msg.includes('لا يمكن') ||
      msg.includes('غير موجود') ||
      msg.includes('يجب أن تكون')
        ? 400
        : 500;
    return NextResponse.json({ success: false, error: msg }, { status });
  }
}
