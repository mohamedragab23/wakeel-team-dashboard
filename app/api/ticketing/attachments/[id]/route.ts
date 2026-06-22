import { NextRequest, NextResponse } from 'next/server';
import { extractBearerToken } from '@/lib/requestAuth';
import { verifyToken } from '@/lib/auth';
import { wrapTicketingHandler } from '@/lib/ticketing/apiHelpers';
import {
  assertTicketingApiAccess,
  hasTicketingAdminAccess,
  actorFromJwt,
} from '@/lib/ticketing/ticketingAuth';
import { readAttachmentBytes } from '@/lib/ticketing/services/attachmentService';
import { assertTicketAccess, getTicketById } from '@/lib/ticketing/services/ticketService';

export const dynamic = 'force-dynamic';

type Ctx = { params: { id: string } };

export const GET = wrapTicketingHandler(async (request: NextRequest, { params }: Ctx) => {
  const token = extractBearerToken(request);
  if (!token) return NextResponse.json({ success: false, error: 'غير مصرح' }, { status: 401 });
  const decoded = verifyToken(token);
  const denied = assertTicketingApiAccess(decoded);
  if (denied) return denied;

  const result = await readAttachmentBytes(params.id);
  if (!result) return NextResponse.json({ success: false, error: 'غير موجود' }, { status: 404 });

  const ticket = await getTicketById(result.meta.ticketId);
  if (!ticket) return NextResponse.json({ success: false, error: 'غير موجود' }, { status: 404 });

  const isAdmin = hasTicketingAdminAccess(decoded);
  const actor = actorFromJwt(decoded!);
  try {
    assertTicketAccess(ticket, actor, isAdmin);
  } catch {
    return NextResponse.json({ success: false, error: 'غير مصرح' }, { status: 403 });
  }

  const url = new URL(request.url);
  const download = url.searchParams.get('download') === '1';
  const filename = result.meta.originalName.replace(/[^\w.\-()\s]/g, '_');

  return new NextResponse(new Uint8Array(result.buffer), {
    status: 200,
    headers: {
      'Content-Type': result.meta.mimeType,
      'Content-Length': String(result.buffer.length),
      'Cache-Control': 'private, no-store',
      'X-Content-Type-Options': 'nosniff',
      'Content-Disposition': download
        ? `attachment; filename="${filename}"`
        : `inline; filename="${filename}"`,
    },
  });
});
