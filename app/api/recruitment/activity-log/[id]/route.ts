import { NextRequest, NextResponse } from 'next/server';
import { verifyToken } from '@/lib/auth';
import { assertAdminActivityLogAccess } from '@/lib/recruitment/recruitmentAuth';
import { getActivityLogForCandidate } from '@/lib/recruitment/recruitmentActivityLog';
import { resolveRouteId } from '@/lib/recruitment/routeParams';

export const dynamic = 'force-dynamic';

type RouteCtx = { params: Promise<{ id: string }> | { id: string } };

export async function GET(request: NextRequest, ctx: RouteCtx) {
  try {
    const token = request.headers.get('authorization')?.replace('Bearer ', '');
    if (!token) {
      return NextResponse.json({ success: false, error: 'غير مصرح' }, { status: 401 });
    }
    const decoded = verifyToken(token);
    const denied = assertAdminActivityLogAccess(decoded);
    if (denied) return denied;

    const id = await resolveRouteId(ctx.params);
    const data = await getActivityLogForCandidate(id);
    return NextResponse.json({ success: true, data });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : 'حدث خطأ';
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}
