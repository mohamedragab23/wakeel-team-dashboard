import { NextRequest, NextResponse } from 'next/server';
import { extractBearerToken } from '@/lib/requestAuth';
import { verifyToken } from '@/lib/auth';
import { assertRecruitmentApiAccess, actorFromJwt } from '@/lib/recruitment/recruitmentAuth';
import { logContact } from '@/lib/recruitment/recruitmentService';
import { CONTACT_STATUS_VALUES } from '@/lib/recruitment/types';
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
    const denied = assertRecruitmentApiAccess(decoded);
    if (denied) return denied;

    const id = await resolveRouteId(ctx.params);
    const body = await request.json();
    const status = body.contactStatus;
    if (!status || !CONTACT_STATUS_VALUES.includes(status)) {
      return NextResponse.json({ success: false, error: 'حالة التواصل غير صالحة' }, { status: 400 });
    }
    if ((status === 'تم التواصل' || status === 'تم الرد') && !String(body.contactReply ?? '').trim()) {
      return NextResponse.json({ success: false, error: 'رد المرشح بعد التواصل مطلوب' }, { status: 400 });
    }
    if ((status === 'تم التواصل' || status === 'تم الرد') && body.hiringDecision === 'قيد المراجعة') {
      return NextResponse.json(
        { success: false, error: 'حدد هل المرشح هيشتغل أو لن يشتغل' },
        { status: 400 }
      );
    }
    if (body.hiringDecision === 'لن يشتغل' && !String(body.notHiredReason ?? '').trim()) {
      return NextResponse.json({ success: false, error: 'سبب عدم التشغيل مطلوب' }, { status: 400 });
    }
    if (body.hiringDecision === 'هيشتغل' && !String(body.lecturePlannedDate ?? '').trim()) {
      return NextResponse.json({ success: false, error: 'تاريخ المحاضرة مطلوب' }, { status: 400 });
    }

    const actor = actorFromJwt(decoded);
    const updated = await logContact(
      id,
      {
        contactStatus: status,
        contactDate: body.contactDate,
        assignedManager: body.assignedManager || actor.name,
        contactReply: body.contactReply,
        hiringDecision: body.hiringDecision,
        notHiredReason: body.notHiredReason,
        lecturePlannedDate: body.lecturePlannedDate,
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
