import { NextRequest, NextResponse } from 'next/server';
import { extractBearerToken } from '@/lib/requestAuth';
import { verifyToken } from '@/lib/auth';
import { assertAdminApiAccess } from '@/lib/adminFeatureAccess';
import { isEquipmentReturnsV2Enabled, SRS014_FLAG_OFF_BODY } from '@/lib/srs014Flags';
import { approveSettlement, patchSettlementAmounts } from '@/lib/equipmentReturns/settlement';
import { egpToMilliemes } from '@/lib/money';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest, context: { params: { id: string } }) {
  const token = extractBearerToken(request);
  if (!token) return NextResponse.json({ success: false, error: 'غير مصرح' }, { status: 401 });
  const decoded = verifyToken(token) as { role?: string; permissions?: string; name?: string; code?: string } | null;
  const access = await assertAdminApiAccess(decoded, 'equipment_liability');
  if (access) return access;
  if (!isEquipmentReturnsV2Enabled()) return NextResponse.json(SRS014_FLAG_OFF_BODY, { status: 503 });

  let body: Record<string, unknown> = {};
  try {
    body = await request.json();
  } catch {
    body = {};
  }

  const paidMilli =
    body.settlementPaidMilli != null
      ? Number(body.settlementPaidMilli)
      : body.settlementPaidEgp != null
        ? egpToMilliemes(Number(body.settlementPaidEgp))
        : undefined;
  const waivedMilli =
    body.waivedMilli != null
      ? Number(body.waivedMilli)
      : body.waivedEgp != null
        ? egpToMilliemes(Number(body.waivedEgp))
        : undefined;

  if (paidMilli != null || waivedMilli != null || body.waiverReason != null) {
    const patched = await patchSettlementAmounts(context.params.id, {
      settlementPaidMilli: paidMilli,
      waivedMilli,
      waiverReason: body.waiverReason != null ? String(body.waiverReason) : undefined,
    });
    if (!patched.ok) {
      return NextResponse.json({ success: false, error: patched.error }, { status: 400 });
    }
  }

  const result = await approveSettlement(context.params.id, {
    code: decoded?.code || 'admin',
    name: decoded?.name || decoded?.code || 'admin',
  });
  if (!result.ok) {
    return NextResponse.json({ success: false, error: result.error }, { status: 400 });
  }
  return NextResponse.json({
    success: true,
    settlement: result.settlement,
    issueUpdated: result.issueUpdated,
    mode: result.mode,
  });
}
