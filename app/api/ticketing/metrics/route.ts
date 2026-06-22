import { NextRequest, NextResponse } from 'next/server';
import { extractBearerToken } from '@/lib/requestAuth';
import { verifyToken } from '@/lib/auth';
import { wrapTicketingHandler } from '@/lib/ticketing/apiHelpers';
import { assertTicketingAdminApiAccess } from '@/lib/ticketing/ticketingAuth';
import { getTicketMetrics } from '@/lib/ticketing/services/ticketService';

export const dynamic = 'force-dynamic';

export const GET = wrapTicketingHandler(async (request: NextRequest) => {
  const token = extractBearerToken(request);
  if (!token) return NextResponse.json({ success: false, error: 'غير مصرح' }, { status: 401 });
  const decoded = verifyToken(token);
  const denied = assertTicketingAdminApiAccess(decoded);
  if (denied) return denied;

  const metrics = await getTicketMetrics();
  return NextResponse.json({ success: true, data: metrics });
});
