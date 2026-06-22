import { NextRequest, NextResponse } from 'next/server';
import { extractBearerToken } from '@/lib/requestAuth';
import { verifyToken } from '@/lib/auth';
import { wrapTicketingHandler } from '@/lib/ticketing/apiHelpers';
import {
  actorFromJwt,
  assertTicketingApiAccess,
  hasTicketingAdminAccess,
} from '@/lib/ticketing/ticketingAuth';
import {
  assertTicketAccess,
  getTicketById,
  updateTicket,
} from '@/lib/ticketing/services/ticketService';
import { listTicketAttachments } from '@/lib/ticketing/services/attachmentService';
import { listComments } from '@/lib/ticketing/services/ticketService';
import { listTicketAudit } from '@/lib/ticketing/services/auditService';
import { updateTicketSchema } from '@/lib/ticketing/validators';

export const dynamic = 'force-dynamic';

type Ctx = { params: { id: string } };

export const GET = wrapTicketingHandler(async (request: NextRequest, { params }: Ctx) => {
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

  const [comments, attachments, audit] = await Promise.all([
    listComments(params.id),
    listTicketAttachments(params.id),
    isAdmin ? listTicketAudit(params.id) : Promise.resolve([]),
  ]);

  return NextResponse.json({
    success: true,
    data: { ticket, comments, attachments, audit },
  });
});

export const PATCH = wrapTicketingHandler(async (request: NextRequest, { params }: Ctx) => {
  const token = extractBearerToken(request);
  if (!token) return NextResponse.json({ success: false, error: 'غير مصرح' }, { status: 401 });
  const decoded = verifyToken(token);
  const denied = assertTicketingApiAccess(decoded);
  if (denied) return denied;

  const isAdmin = hasTicketingAdminAccess(decoded);
  if (!isAdmin) {
    return NextResponse.json({ success: false, error: 'تحديث الحالة للأدمن فقط' }, { status: 403 });
  }

  const body = await request.json();
  const parsed = updateTicketSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ success: false, error: parsed.error.flatten() }, { status: 400 });
  }

  const actor = actorFromJwt(decoded!);
  const ticket = await updateTicket(params.id, parsed.data, actor, true);
  return NextResponse.json({ success: true, data: ticket });
});
