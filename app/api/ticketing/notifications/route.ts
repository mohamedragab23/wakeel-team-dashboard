import { NextRequest, NextResponse } from 'next/server';
import { extractBearerToken } from '@/lib/requestAuth';
import { verifyToken } from '@/lib/auth';
import { wrapTicketingHandler } from '@/lib/ticketing/apiHelpers';
import { assertTicketingApiAccess, actorFromJwt } from '@/lib/ticketing/ticketingAuth';
import {
  countUnreadNotifications,
  listNotifications,
  markAllNotificationsRead,
  markNotificationRead,
} from '@/lib/ticketing/services/notificationService';

export const dynamic = 'force-dynamic';

export const GET = wrapTicketingHandler(async (request: NextRequest) => {
  const token = extractBearerToken(request);
  if (!token) return NextResponse.json({ success: false, error: 'غير مصرح' }, { status: 401 });
  const decoded = verifyToken(token);
  const denied = assertTicketingApiAccess(decoded);
  if (denied) return denied;

  const actor = actorFromJwt(decoded!);
  const [data, unread] = await Promise.all([
    listNotifications(actor.role, actor.code),
    countUnreadNotifications(actor.role, actor.code),
  ]);

  return NextResponse.json({ success: true, data, unread });
});

export const PATCH = wrapTicketingHandler(async (request: NextRequest) => {
  const token = extractBearerToken(request);
  if (!token) return NextResponse.json({ success: false, error: 'غير مصرح' }, { status: 401 });
  const decoded = verifyToken(token);
  const denied = assertTicketingApiAccess(decoded);
  if (denied) return denied;

  const actor = actorFromJwt(decoded!);
  const body = await request.json();

  if (body?.all === true) {
    await markAllNotificationsRead(actor.role, actor.code);
    return NextResponse.json({ success: true });
  }

  const id = String(body?.id ?? '').trim();
  if (!id) {
    return NextResponse.json({ success: false, error: 'معرف الإشعار مطلوب' }, { status: 400 });
  }

  const ok = await markNotificationRead(id, actor.role, actor.code);
  return NextResponse.json({ success: ok });
});
