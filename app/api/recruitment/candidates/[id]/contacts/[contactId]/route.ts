/**
 * SRS-014 Phase B — update / soft-delete candidate contact
 */
import { NextRequest, NextResponse } from 'next/server';
import { extractBearerToken } from '@/lib/requestAuth';
import { verifyToken } from '@/lib/auth';
import { assertRecruitmentApiAccess, actorFromJwt } from '@/lib/recruitment/recruitmentAuth';
import { deleteContact, updateContact } from '@/lib/recruitment/contactsStore';
import { getCandidateById } from '@/lib/recruitment/recruitmentService';
import { isRecruitmentV2Enabled, SRS014_FLAG_OFF_BODY } from '@/lib/srs014Flags';
import { appendAuditLog } from '@/lib/auditLog';

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

    const { id, contactId } = await resolveContactParams(ctx.params);
    const candidate = await getCandidateById(id);
    if (!candidate) {
      return NextResponse.json({ success: false, error: 'المرشح غير موجود' }, { status: 404 });
    }

    const body = await request.json();
    const actor = actorFromJwt(decoded);
    const updated = await updateContact(id, contactId, {
      name: body.name != null ? String(body.name) : undefined,
      relationship: body.relationship != null ? String(body.relationship) : undefined,
      relationshipOther:
        body.relationshipOther != null ? String(body.relationshipOther) : undefined,
      phone: body.phone != null ? String(body.phone) : undefined,
    });
    if (!updated) {
      return NextResponse.json({ success: false, error: 'جهة الاتصال غير موجودة' }, { status: 404 });
    }

    void appendAuditLog({
      domain: 'recruitment',
      action: 'family_contact_updated',
      entityType: 'candidate_contact',
      entityCode: contactId,
      actorCode: actor.code,
      actorName: actor.name,
      after: { candidateId: id, relationship: updated.relationship },
    }).catch(() => undefined);

    return NextResponse.json({ success: true, data: updated });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : 'حدث خطأ';
    const status =
      msg.includes('مطلوب') ||
      msg.includes('صالحة') ||
      msg.includes('توضيح') ||
      msg.includes('أخرى')
        ? 400
        : 500;
    return NextResponse.json({ success: false, error: msg }, { status });
  }
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

    const actor = actorFromJwt(decoded);
    void appendAuditLog({
      domain: 'recruitment',
      action: 'family_contact_removed',
      entityType: 'candidate_contact',
      entityCode: contactId,
      actorCode: actor.code,
      actorName: actor.name,
      after: { candidateId: id, active: false },
    }).catch(() => undefined);

    return NextResponse.json({ success: true });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : 'حدث خطأ';
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}
