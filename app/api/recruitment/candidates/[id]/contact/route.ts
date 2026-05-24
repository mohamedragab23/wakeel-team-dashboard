import { NextRequest, NextResponse } from 'next/server';
import { verifyToken } from '@/lib/auth';
import { assertRecruitmentApiAccess, actorFromJwt } from '@/lib/recruitment/recruitmentAuth';
import { logContact } from '@/lib/recruitment/recruitmentService';
import { CONTACT_STATUS_VALUES } from '@/lib/recruitment/types';
import { resolveRouteId } from '@/lib/recruitment/routeParams';

export const dynamic = 'force-dynamic';

type RouteCtx = { params: Promise<{ id: string }> | { id: string } };

export async function POST(request: NextRequest, ctx: RouteCtx) {
  try {
    const token = request.headers.get('authorization')?.replace('Bearer ', '');
    if (!token) {
      return NextResponse.json({ success: false, error: 'غير مصرح' }, { status: 401 });
    }
    const decoded = verifyToken(token);
    const denied = assertRecruitmentApiAccess(decoded);
    if (denied) return denied;

    const id = await resolveRouteId(ctx.params);
    const body = await request.json();
    const status = body.contactStatus;
    if (!status || !CONTACT_STATUS_VALUES.includes(status)) {
      return NextResponse.json({ success: false, error: 'حالة التواصل غير صالحة' }, { status: 400 });
    }

    const actor = actorFromJwt(decoded);
    const updated = await logContact(
      id,
      {
        contactStatus: status,
        contactDate: body.contactDate,
        assignedManager: body.assignedManager || actor.name,
        notes: body.notes,
      },
      actor
    );
    if (!updated) {
      return NextResponse.json({ success: false, error: 'المرشح غير موجود' }, { status: 404 });
    }
    return NextResponse.json({ success: true, data: updated });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : 'حدث خطأ';
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}
