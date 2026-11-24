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
import { validateUpload } from '@/lib/ticketing/storage/sanitize';
import * as Sentry from '@sentry/nextjs';

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
  const result = await Sentry.startSpan({ name: 'ticketing.listTickets', op: 'db.query' }, () =>
    listTickets(parsed.data, scope)
  );

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

  for (const file of files) {
    const error = validateUpload(file);
    if (error) return NextResponse.json({ success: false, error }, { status: 400 });
  }

  const uploads = await Promise.all(files.map(async (file) => ({
    name: file.name,
    type: file.type,
    size: file.size,
    buffer: Buffer.from(await file.arrayBuffer()),
  })));
  const ticket = await createTicket(parsed.data, actorFromJwt(decoded!), uploads);

  return NextResponse.json({ success: true, data: ticket }, { status: 201 });
});
