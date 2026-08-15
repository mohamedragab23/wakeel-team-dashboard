import { NextRequest, NextResponse } from 'next/server';
import { extractBearerToken } from '@/lib/requestAuth';
import { verifyToken } from '@/lib/auth';
import { assertRecruitmentApiAccess, actorFromJwt, assertRecruitmentLegacyAdminOnly } from '@/lib/recruitment/recruitmentAuth';
import { reactivateCandidate } from '@/lib/recruitment/recruitmentService';
import { resolveRouteId } from '@/lib/recruitment/routeParams';

export const dynamic = 'force-dynamic';

type RouteCtx = { params: Promise<{ id: string }> | { id: string } };

export async function POST(request: NextRequest, ctx: RouteCtx) {
  try {
    const token = extractBearerToken(request);
    if (!token) {
      return NextResponse.json({ success: false, error: 'غير مصرح' }, { status: 401 });
    }
    const decoded = verifyToken(token);
    const denied = await assertRecruitmentApiAccess(decoded);
    if (denied) return denied;
    const legacyDenied = assertRecruitmentLegacyAdminOnly(decoded);
    if (legacyDenied) return legacyDenied;

    const id = await resolveRouteId(ctx.params);
    const actor = actorFromJwt(decoded);
    const updated = await reactivateCandidate(id, actor);
    if (!updated) {
      return NextResponse.json({ success: false, error: 'المرشح غير موجود' }, { status: 404 });
    }
    return NextResponse.json({ success: true, data: updated });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : 'حدث خطأ';
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}
