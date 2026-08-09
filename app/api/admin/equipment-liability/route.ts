import { NextRequest, NextResponse } from 'next/server';
import { extractBearerToken } from '@/lib/requestAuth';
import { verifyToken } from '@/lib/auth';
import { assertAdminApiAccess } from '@/lib/adminFeatureAccess';
import { isEquipmentLedgerEnabled, SRS014_FLAG_OFF_BODY } from '@/lib/srs014Flags';
import { listIssues } from '@/lib/equipmentLiability/store';
import type { EquipmentLiabilityStatus } from '@/lib/equipmentLiability/constants';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const token = extractBearerToken(request);
  if (!token) {
    return NextResponse.json({ success: false, error: 'غير مصرح' }, { status: 401 });
  }
  const decoded = verifyToken(token) as { role?: string; permissions?: string } | null;
  const access = assertAdminApiAccess(decoded, 'equipment_liability');
  if (access) return access;

  const { searchParams } = new URL(request.url);
  if (!searchParams.get('status') && !searchParams.get('riderCode') && !searchParams.get('supervisorCode')) {
    return NextResponse.json({ success: true, enabled: isEquipmentLedgerEnabled() });
  }

  if (!isEquipmentLedgerEnabled()) {
    return NextResponse.json(SRS014_FLAG_OFF_BODY, { status: 503 });
  }

  try {
    const issues = await listIssues({
      status: (searchParams.get('status') as EquipmentLiabilityStatus) || undefined,
      riderCode: searchParams.get('riderCode') || undefined,
      supervisorCode: searchParams.get('supervisorCode') || undefined,
    });
    return NextResponse.json({ success: true, issues });
  } catch (error: any) {
    console.error('[equipment-liability GET]', error);
    return NextResponse.json({ success: false, error: error.message || 'حدث خطأ' }, { status: 500 });
  }
}
