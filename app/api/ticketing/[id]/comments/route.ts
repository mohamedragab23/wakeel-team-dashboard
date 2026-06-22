import { NextRequest, NextResponse } from 'next/server';
import { extractBearerToken } from '@/lib/requestAuth';
import { verifyToken } from '@/lib/auth';
import { wrapTicketingHandler } from '@/lib/ticketing/apiHelpers';
import {
  actorFromJwt,
  assertTicketingApiAccess,
  hasTicketingAdminAccess,
} from '@/lib/ticketing/ticketingAuth';
import { addComment, assertTicketAccess, getTicketById } from '@/lib/ticketing/services/ticketService';
import { commentSchema } from '@/lib/ticketing/validators';

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

  const body = await request.json();
  const parsed = commentSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ success: false, error: parsed.error.message }, { status: 400 });
  }

  const comment = await addComment(params.id, parsed.data.body, actor);
  return NextResponse.json({ success: true, data: comment }, { status: 201 });
});
