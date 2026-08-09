/**
 * SRS-014 Phase B — soft-delete candidate contact
 */
import { NextRequest, NextResponse } from 'next/server';
import { extractBearerToken } from '@/lib/requestAuth';
import { verifyToken } from '@/lib/auth';
import { assertRecruitmentApiAccess } from '@/lib/recruitment/recruitmentAuth';
import { deleteContact } from '@/lib/recruitment/contactsStore';
import { getCandidateById } from '@/lib/recruitment/recruitmentService';
import { resolveRouteId } from '@/lib/recruitment/routeParams';
import { isRecruitmentV2Enabled, SRS014_FLAG_OFF_BODY } from '@/lib/srs014Flags';

export const dynamic = 'force-dynamic';

type RouteCtx = {
  params: Promise<{ id: string; contactId: string }> | { id: string; contactId: string };
};

async function resolveContactParams(
  params: RouteCtx['params']
): Promise<{ id: string; contactId: string }> {
  const p = await Promise.resolve(params);
  return { id: p.id, contactId: p.contactId };
}

export async function DELETE(request: NextRequest, ctx: RouteCtx) {
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

    const { id, contactId } = await resolveContactParams(ctx.params);
    const candidate = await getCandidateById(id);
    if (!candidate) {
      return NextResponse.json({ success: false, error: 'المرشح غير موجود' }, { status: 404 });
    }

    const ok = await deleteContact(id, contactId);
    if (!ok) {
      return NextResponse.json({ success: false, error: 'جهة الاتصال غير موجودة' }, { status: 404 });
    }
    return NextResponse.json({ success: true });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : 'حدث خطأ';
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}
