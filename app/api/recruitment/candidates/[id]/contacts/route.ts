/**
 * SRS-014 Phase B — candidate contacts list / add
 */
import { NextRequest, NextResponse } from 'next/server';
import { extractBearerToken } from '@/lib/requestAuth';
import { verifyToken } from '@/lib/auth';
import { assertRecruitmentApiAccess, actorFromJwt } from '@/lib/recruitment/recruitmentAuth';
import { addContact, listByCandidate } from '@/lib/recruitment/contactsStore';
import { getCandidateById } from '@/lib/recruitment/recruitmentService';
import { resolveRouteId } from '@/lib/recruitment/routeParams';
import { isRecruitmentV2Enabled, SRS014_FLAG_OFF_BODY } from '@/lib/srs014Flags';
import { appendAuditLog } from '@/lib/auditLog';

export const dynamic = 'force-dynamic';

type RouteCtx = { params: Promise<{ id: string }> | { id: string } };

export async function GET(request: NextRequest, ctx: RouteCtx) {
  if (!isRecruitmentV2Enabled()) {
    return NextResponse.json(SRS014_FLAG_OFF_BODY, { status: 503 });
  }

  try {
    const token = extractBearerToken(request);
    if (!token) {
      return NextResponse.json({ success: false, error: 'غير مصرح' }, { status: 401 });
    }
    const decoded = verifyToken(token);
    const denied = await assertRecruitmentApiAccess(decoded);
    if (denied) return denied;

    const id = await resolveRouteId(ctx.params);
    const candidate = await getCandidateById(id);
    if (!candidate) {
      return NextResponse.json({ success: false, error: 'المرشح غير موجود' }, { status: 404 });
    }

    const contacts = await listByCandidate(id);
    return NextResponse.json({ success: true, data: contacts });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : 'حدث خطأ';
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}

export async function POST(request: NextRequest, ctx: RouteCtx) {
  if (!isRecruitmentV2Enabled()) {
    return NextResponse.json(SRS014_FLAG_OFF_BODY, { status: 503 });
  }

  try {
    const token = extractBearerToken(request);
    if (!token) {
      return NextResponse.json({ success: false, error: 'غير مصرح' }, { status: 401 });
    }
    const decoded = verifyToken(token);
    const denied = await assertRecruitmentApiAccess(decoded);
    if (denied) return denied;

    const id = await resolveRouteId(ctx.params);
    const candidate = await getCandidateById(id);
    if (!candidate) {
      return NextResponse.json({ success: false, error: 'المرشح غير موجود' }, { status: 404 });
    }

    const body = await request.json();
    const actor = actorFromJwt(decoded);
    const contact = await addContact(
      id,
      {
        name: String(body.name ?? ''),
        relationship: String(body.relationship ?? ''),
        relationshipOther: body.relationshipOther ? String(body.relationshipOther) : '',
        phone: String(body.phone ?? ''),
      },
      actor
    );

    void appendAuditLog({
      domain: 'recruitment',
      action: 'family_contact_added',
      entityType: 'candidate_contact',
      entityCode: contact.contactId,
      actorCode: actor.code,
      actorName: actor.name,
      after: {
        candidateId: id,
        relationship: contact.relationship,
        // phone omitted from audit payload (sensitive)
      },
    }).catch(() => undefined);

    return NextResponse.json({ success: true, data: contact }, { status: 201 });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : 'حدث خطأ';
    const status =
      msg.includes('مطلوب') ||
      msg.includes('صالحة') ||
      msg.includes('أكثر') ||
      msg.includes('توضيح') ||
      msg.includes('أخرى')
        ? 400
        : 500;
    return NextResponse.json({ success: false, error: msg }, { status });
  }
}
