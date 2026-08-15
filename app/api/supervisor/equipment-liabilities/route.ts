import { NextRequest, NextResponse } from 'next/server';
import { extractBearerToken } from '@/lib/requestAuth';
import { verifyToken } from '@/lib/auth';
import { isEquipmentLedgerEnabled, SRS014_FLAG_OFF_BODY } from '@/lib/srs014Flags';
import { listLiabilitiesForSupervisor } from '@/lib/equipmentLiability/paymentProposals';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const token = extractBearerToken(request);
  if (!token) return NextResponse.json({ success: false, error: 'غير مصرح' }, { status: 401 });
  const decoded = verifyToken(token) as { role?: string; code?: string } | null;
  if (!decoded || decoded.role !== 'supervisor') {
    return NextResponse.json({ success: false, error: 'غير مصرح — للمشرفين فقط' }, { status: 401 });
  }
  if (!isEquipmentLedgerEnabled()) {
    return NextResponse.json(SRS014_FLAG_OFF_BODY, { status: 503 });
  }

  try {
    const { issues, rosterRiderCount } = await listLiabilitiesForSupervisor(
      decoded.code || ''
    );
    return NextResponse.json({
      success: true,
      issues,
      rosterRiderCount,
      liabilityCount: issues.length,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'حدث خطأ';
    console.error('[supervisor/equipment-liabilities GET]', error);
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
