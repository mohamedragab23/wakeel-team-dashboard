import { NextRequest, NextResponse } from 'next/server';
import { extractBearerToken } from '@/lib/requestAuth';
import { verifyToken } from '@/lib/auth';
import { wrapTicketingHandler } from '@/lib/ticketing/apiHelpers';
import {
  actorFromJwt,
  assertTicketingApiAccess,
  hasTicketingAdminAccess,
  isSupervisor,
} from '@/lib/ticketing/ticketingAuth';
import { createTicket, listTickets } from '@/lib/ticketing/services/ticketService';
import { createTicketSchema, listTicketsQuerySchema } from '@/lib/ticketing/validators';
import { saveTicketAttachment } from '@/lib/ticketing/services/attachmentService';

export const dynamic = 'force-dynamic';

export const GET = wrapTicketingHandler(async (request: NextRequest) => {
  const token = extractBearerToken(request);
  if (!token) return NextResponse.json({ success: false, error: 'غير مصرح' }, { status: 401 });
  const decoded = verifyToken(token);
  const denied = assertTicketingApiAccess(decoded);
  if (denied) return denied;

  const params = Object.fromEntries(new URL(request.url).searchParams);
  const parsed = listTicketsQuerySchema.safeParse(params);
  if (!parsed.success) {
    return NextResponse.json({ success: false, error: parsed.error.message }, { status: 400 });
  }

  const isAdmin = hasTicketingAdminAccess(decoded);
  const scope = isSupervisor(decoded!) ? decoded!.code : undefined;
  const result = await listTickets(parsed.data, scope);

  return NextResponse.json({ success: true, ...result });
});

export const POST = wrapTicketingHandler(async (request: NextRequest) => {
  const token = extractBearerToken(request);
  if (!token) return NextResponse.json({ success: false, error: 'غير مصرح' }, { status: 401 });
  const decoded = verifyToken(token);
  const denied = assertTicketingApiAccess(decoded);
  if (denied) return denied;

  if (!isSupervisor(decoded!) && !hasTicketingAdminAccess(decoded)) {
    return NextResponse.json({ success: false, error: 'إنشاء الطلبات للمشرفين فقط' }, { status: 403 });
  }

  const contentType = request.headers.get('content-type') || '';
  let body: unknown;
  let files: File[] = [];

  if (contentType.includes('multipart/form-data')) {
    const form = await request.formData();
    const jsonPart = form.get('data');
    body = jsonPart ? JSON.parse(String(jsonPart)) : {};
    files = form.getAll('files').filter((f): f is File => f instanceof File);
  } else {
    body = await request.json();
  }

  const parsed = createTicketSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ success: false, error: parsed.error.flatten() }, { status: 400 });
  }

  const actor = actorFromJwt(decoded!);
  const ticket = await createTicket(parsed.data, actor);

  for (const file of files) {
    const buffer = Buffer.from(await file.arrayBuffer());
    await saveTicketAttachment({
      ticketId: ticket.id,
      file: { name: file.name, type: file.type, size: file.size, buffer },
      uploadedByCode: actor.code,
    });
  }

  return NextResponse.json({ success: true, data: ticket }, { status: 201 });
});
