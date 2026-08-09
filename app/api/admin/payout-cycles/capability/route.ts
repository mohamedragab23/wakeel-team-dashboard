import { NextRequest, NextResponse } from 'next/server';
import { extractBearerToken } from '@/lib/requestAuth';
import { verifyToken } from '@/lib/auth';
import { assertAdminApiAccess } from '@/lib/adminFeatureAccess';
import { isPayoutCyclesEnabled } from '@/lib/srs014Flags';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const token = extractBearerToken(request);
  if (!token) {
    return NextResponse.json({ success: false, error: 'غير مصرح' }, { status: 401 });
  }
  const decoded = verifyToken(token) as { role?: string; permissions?: string } | null;
  const access = assertAdminApiAccess(decoded, 'payout_cycles');
  if (access) return access;

  return NextResponse.json({ success: true, enabled: isPayoutCyclesEnabled() });
}
