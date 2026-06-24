import { NextRequest, NextResponse } from 'next/server';
import { extractBearerToken } from '@/lib/requestAuth';
import { verifyToken } from '@/lib/auth';
import { getAllRiders } from '@/lib/adminService';
import { buildRiderMetadataNotificationPayload } from '@/lib/riderMetadataNotifications';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    const token = extractBearerToken(request);
    if (!token) {
      return NextResponse.json({ success: false, error: 'غير مصرح' }, { status: 401 });
    }

    const decoded = verifyToken(token) as { role?: string; code?: string } | null;
    if (!decoded || decoded.role !== 'supervisor') {
      return NextResponse.json({ success: false, error: 'غير مصرح' }, { status: 401 });
    }

    const supCode = String(decoded.code ?? '').trim();
    const allRiders = await getAllRiders(false);
    const riders = allRiders.filter((r) => String(r.supervisorCode ?? '').trim() === supCode);
    const payload = buildRiderMetadataNotificationPayload(riders);

    return NextResponse.json({
      success: true,
      data: payload,
      unread: payload.missingJoinDateCount,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'حدث خطأ';
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
