import { NextRequest, NextResponse } from 'next/server';
import { extractBearerToken } from '@/lib/requestAuth';
import { verifyToken } from '@/lib/auth';
import { wrapTicketingHandler } from '@/lib/ticketing/apiHelpers';
import {
  actorFromJwt,
  assertTicketingApiAccess,
  hasTicketingAdminAccess,
} from '@/lib/ticketing/ticketingAuth';
import { assertTicketAccess, getTicketById } from '@/lib/ticketing/services/ticketService';
import { saveTicketAttachment } from '@/lib/ticketing/services/attachmentService';

export const dynamic = 'force-dynamic';

type Ctx = { params: { id: string } };

export const POST = wrapTicketingHandler(async (request: NextRequest, { params }: Ctx) => {
  const token = extractBearerToken(request);
  if (!token) return NextResponse.json({ success: false, error: 'غير مصرح' }, { status: 401 });
  const decoded = verifyToken(token);
  const denied = assertTicketingApiAccess(decoded);
  if (denied) return denied;

  const ticket = await getTicketById(params.id);
  if (!ticket) return NextResponse.json({ success: false, error: 'غير موجود' }, { status: 404 });

  const isAdmin = hasTicketingAdminAccess(decoded);
  const actor = actorFromJwt(decoded!);
  try {
    assertTicketAccess(ticket, actor, isAdmin);
  } catch (e) {
    return NextResponse.json({ success: false, error: (e as Error).message }, { status: 403 });
  }

  if (!isAdmin && ['closed', 'rejected', 'approved'].includes(ticket.status)) {
    return NextResponse.json({ success: false, error: 'لا يمكن إرفاق ملفات لطلب مغلق' }, { status: 403 });
  }

  const form = await request.formData();
  const file = form.get('file');
  if (!(file instanceof File)) {
    return NextResponse.json({ success: false, error: 'ملف مطلوب' }, { status: 400 });
  }

  const commentId = form.get('commentId')?.toString() || null;
  const buffer = Buffer.from(await file.arrayBuffer());
  const meta = await saveTicketAttachment({
    ticketId: params.id,
    commentId,
    file: { name: file.name, type: file.type, size: file.size, buffer },
    uploadedByCode: actor.code,
  });

  return NextResponse.json({ success: true, data: meta }, { status: 201 });
});
