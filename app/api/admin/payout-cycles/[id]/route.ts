import { NextRequest, NextResponse } from 'next/server';
import { extractBearerToken } from '@/lib/requestAuth';
import { verifyToken } from '@/lib/auth';
import { assertAdminApiAccess } from '@/lib/adminFeatureAccess';
import { isPayoutCyclesEnabled, SRS014_FLAG_OFF_BODY } from '@/lib/srs014Flags';
import { getPayoutCycleById, updatePayoutCycle } from '@/lib/payoutCycles/store';

export const dynamic = 'force-dynamic';

type Decoded = { role?: string; permissions?: string; name?: string; code?: string };

function authenticate(request: NextRequest): { ok: true; decoded: Decoded } | { ok: false; response: NextResponse } {
  const token = extractBearerToken(request);
  if (!token) {
    return { ok: false, response: NextResponse.json({ success: false, error: 'غير مصرح' }, { status: 401 }) };
  }
  const decoded = verifyToken(token) as Decoded | null;
  if (!decoded || decoded.role !== 'admin') {
    return { ok: false, response: NextResponse.json({ success: false, error: 'غير مصرح' }, { status: 401 }) };
  }
  return { ok: true, decoded };
}

export async function GET(request: NextRequest, context: { params: { id: string } }) {
  const auth = authenticate(request);
  if (!auth.ok) return auth.response;
  const access = await assertAdminApiAccess(auth.decoded, 'payout_cycles');
  if (access) return access;
  if (!isPayoutCyclesEnabled()) return NextResponse.json(SRS014_FLAG_OFF_BODY, { status: 503 });

  const cycle = await getPayoutCycleById(context.params.id);
  if (!cycle) return NextResponse.json({ success: false, error: 'غير موجود' }, { status: 404 });
  return NextResponse.json({ success: true, cycle });
}

export async function PATCH(request: NextRequest, context: { params: { id: string } }) {
  const auth = authenticate(request);
  if (!auth.ok) return auth.response;
  const access = await assertAdminApiAccess(auth.decoded, 'payout_cycles');
  if (access) return access;
  if (!isPayoutCyclesEnabled()) return NextResponse.json(SRS014_FLAG_OFF_BODY, { status: 503 });

  try {
    const body = await request.json();
    const result = await updatePayoutCycle(
      context.params.id,
      {
        year: body.year != null ? Number(body.year) : undefined,
        month: body.month != null ? Number(body.month) : undefined,
        cycleNumber: body.cycleNumber != null ? Number(body.cycleNumber) : undefined,
        startDate: body.startDate != null ? String(body.startDate) : undefined,
        endDate: body.endDate != null ? String(body.endDate) : undefined,
        payoutDate: body.payoutDate != null ? String(body.payoutDate) : undefined,
        deductionGenerationDate:
          body.deductionGenerationDate != null ? String(body.deductionGenerationDate) : undefined,
        isClosing: body.isClosing != null ? Boolean(body.isClosing) : undefined,
        equipmentDeductionEnabled:
          body.equipmentDeductionEnabled != null ? Boolean(body.equipmentDeductionEnabled) : undefined,
        status: body.status,
        notes: body.notes != null ? String(body.notes) : undefined,
      },
      {
        code: auth.decoded.code || 'admin',
        name: auth.decoded.name || auth.decoded.code || 'admin',
      },
      {
        allowFinalizedCorrection: Boolean(body.allowFinalizedCorrection),
        correctionNote: body.correctionNote ? String(body.correctionNote) : undefined,
      }
    );
    if (!result.ok) {
      return NextResponse.json(
        { success: false, errors: result.errors },
        { status: result.status || 400 }
      );
    }
    return NextResponse.json({ success: true, cycle: result.cycle });
  } catch (error: any) {
    console.error('[payout-cycles PATCH]', error);
    return NextResponse.json({ success: false, error: error.message || 'حدث خطأ' }, { status: 500 });
  }
}
