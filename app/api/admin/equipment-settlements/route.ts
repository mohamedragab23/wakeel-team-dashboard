import { NextRequest, NextResponse } from 'next/server';
import { extractBearerToken } from '@/lib/requestAuth';
import { verifyToken } from '@/lib/auth';
import { assertAdminApiAccess } from '@/lib/adminFeatureAccess';
import { isEquipmentReturnsV2Enabled, SRS014_FLAG_OFF_BODY } from '@/lib/srs014Flags';
import { createSettlement, listSettlements } from '@/lib/equipmentReturns/settlement';

export const dynamic = 'force-dynamic';

type Decoded = { role?: string; permissions?: string; name?: string; code?: string };

export async function GET(request: NextRequest) {
  const token = extractBearerToken(request);
  if (!token) return NextResponse.json({ success: false, error: 'غير مصرح' }, { status: 401 });
  const decoded = verifyToken(token) as Decoded | null;
  const access = assertAdminApiAccess(decoded, 'equipment_liability');
  if (access) return access;

  if (!isEquipmentReturnsV2Enabled()) {
    return NextResponse.json({ success: true, enabled: false });
  }

  const { searchParams } = new URL(request.url);
  const settlements = await listSettlements({
    equipmentIssueId: searchParams.get('equipmentIssueId') || undefined,
    riderCode: searchParams.get('riderCode') || undefined,
    status: (searchParams.get('status') as any) || undefined,
  });
  return NextResponse.json({ success: true, enabled: true, settlements });
}

export async function POST(request: NextRequest) {
  const token = extractBearerToken(request);
  if (!token) return NextResponse.json({ success: false, error: 'غير مصرح' }, { status: 401 });
  const decoded = verifyToken(token) as Decoded | null;
  const access = assertAdminApiAccess(decoded, 'equipment_liability');
  if (access) return access;
  if (!isEquipmentReturnsV2Enabled()) return NextResponse.json(SRS014_FLAG_OFF_BODY, { status: 503 });

  try {
    const body = await request.json();
    const result = await createSettlement(
      {
        equipmentIssueId: String(body.equipmentIssueId || ''),
        riderCode: String(body.riderCode || ''),
        returnedMotorcyclePouch: Boolean(body.returnedMotorcyclePouch),
        returnedBicyclePouch: Boolean(body.returnedBicyclePouch),
        returnedTshirt: Boolean(body.returnedTshirt),
        returnedJacket: Boolean(body.returnedJacket),
        returnedHelmet: Boolean(body.returnedHelmet),
        settlementPaidMilli: body.settlementPaidMilli != null ? Number(body.settlementPaidMilli) : 0,
        waivedMilli: body.waivedMilli != null ? Number(body.waivedMilli) : 0,
        waiverReason: body.waiverReason ? String(body.waiverReason) : '',
        notes: body.notes ? String(body.notes) : '',
      },
      { code: decoded?.code || 'admin', name: decoded?.name || decoded?.code || 'admin' }
    );
    if (!result.ok) return NextResponse.json({ success: false, error: result.error }, { status: 400 });
    return NextResponse.json({ success: true, settlement: result.settlement });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message || 'حدث خطأ' }, { status: 500 });
  }
}
