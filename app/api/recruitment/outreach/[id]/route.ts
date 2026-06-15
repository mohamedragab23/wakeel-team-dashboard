import { NextRequest, NextResponse } from 'next/server';
import { extractBearerToken } from '@/lib/requestAuth';
import { verifyToken } from '@/lib/auth';
import { assertRecruitmentApiAccess } from '@/lib/recruitment/recruitmentAuth';
import { resolveRouteId } from '@/lib/recruitment/routeParams';
import { updateOutreachLead } from '@/lib/recruitment/recruitmentService';

export const dynamic = 'force-dynamic';

type RouteCtx = { params: Promise<{ id: string }> | { id: string } };

export async function PUT(request: NextRequest, ctx: RouteCtx) {
  try {
    const token = extractBearerToken(request);
    if (!token) return NextResponse.json({ success: false, error: 'غير مصرح' }, { status: 401 });
    const decoded = verifyToken(token);
    const denied = assertRecruitmentApiAccess(decoded);
    if (denied) return denied;

    const id = await resolveRouteId(ctx.params);
    const body = await request.json();
    const updated = await updateOutreachLead(id, body);
    if (!updated) return NextResponse.json({ success: false, error: 'السجل غير موجود' }, { status: 404 });
    return NextResponse.json({ success: true, data: updated });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : 'حدث خطأ';
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}

