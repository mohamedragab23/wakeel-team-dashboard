import { NextRequest, NextResponse } from 'next/server';
import { extractBearerToken } from '@/lib/requestAuth';
import { verifyToken } from '@/lib/auth';
import {
  createSupervisorEquipmentDeclaration,
  mapUiStatusToSupervisor,
} from '@/lib/equipmentDeductions/supervisorDeclarations';
import { listPayoutCycles } from '@/lib/payoutCycles/store';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  const token = extractBearerToken(request);
  if (!token) {
    return NextResponse.json({ success: false, error: 'غير مصرح' }, { status: 401 });
  }
  const decoded = verifyToken(token) as {
    role?: string;
    code?: string;
    name?: string;
  } | null;
  if (!decoded || decoded.role !== 'supervisor') {
    return NextResponse.json({ success: false, error: 'المشرفون فقط' }, { status: 401 });
  }

  try {
    const body = await request.json();
    const cycleId = String(body.cycleId || '').trim();
    if (!cycleId) {
      return NextResponse.json({ success: false, error: 'حدد دورة القبض' }, { status: 400 });
    }

    const cycles = await listPayoutCycles({});
    const cycle = cycles.find((c) => c.cycleId === cycleId);
    if (!cycle) {
      return NextResponse.json({ success: false, error: 'دورة القبض غير موجودة' }, { status: 404 });
    }

    const uiStatus = String(body.paymentStatus || 'UNPAID').trim() as
      | 'UNPAID'
      | 'PARTIALLY_PAID'
      | 'PAID';

    const result = await createSupervisorEquipmentDeclaration({
      riderCode: String(body.riderCode || '').trim(),
      riderName: String(body.riderName || '').trim(),
      supervisorCode: decoded.code || '',
      supervisorName: decoded.name || decoded.code || '',
      cycle,
      paymentStatus: mapUiStatusToSupervisor(uiStatus),
      declaredPaidEgp:
        body.declaredPaidEgp == null || body.declaredPaidEgp === ''
          ? null
          : Number(body.declaredPaidEgp),
      notes: String(body.notes || '').trim(),
      equipmentIssueId: String(body.equipmentIssueId || '').trim() || undefined,
      applyToLiability: body.applyToLiability !== false,
    });

    if (!result.ok) {
      return NextResponse.json({ success: false, error: result.error }, { status: 400 });
    }

    return NextResponse.json({ success: true, declaration: result.declaration });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'حدث خطأ';
    console.error('[supervisor/equipment-declarations POST]', error);
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
