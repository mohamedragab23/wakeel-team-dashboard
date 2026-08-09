import { NextRequest, NextResponse } from 'next/server';
import { extractBearerToken } from '@/lib/requestAuth';
import { verifyToken } from '@/lib/auth';
import { assertAdminApiAccess } from '@/lib/adminFeatureAccess';
import { isPayoutCyclesEnabled, SRS014_FLAG_OFF_BODY } from '@/lib/srs014Flags';
import { finalizePayoutCycle } from '@/lib/payoutCycles/store';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest, context: { params: { id: string } }) {
  const token = extractBearerToken(request);
  if (!token) {
    return NextResponse.json({ success: false, error: 'غير مصرح' }, { status: 401 });
  }
  const decoded = verifyToken(token) as { role?: string; permissions?: string; name?: string; code?: string } | null;
  const access = assertAdminApiAccess(decoded, 'payout_cycles');
  if (access) return access;
  if (!isPayoutCyclesEnabled()) return NextResponse.json(SRS014_FLAG_OFF_BODY, { status: 503 });

  const result = await finalizePayoutCycle(context.params.id, {
    code: decoded?.code || 'admin',
    name: decoded?.name || decoded?.code || 'admin',
  });
  if (!result.ok) {
    return NextResponse.json({ success: false, errors: result.errors }, { status: result.status || 400 });
  }
  return NextResponse.json({ success: true, cycle: result.cycle });
}
