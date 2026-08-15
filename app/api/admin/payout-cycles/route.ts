import { NextRequest, NextResponse } from 'next/server';
import { extractBearerToken } from '@/lib/requestAuth';
import { verifyToken } from '@/lib/auth';
import { assertAdminApiAccess } from '@/lib/adminFeatureAccess';
import { isPayoutCyclesEnabled, SRS014_FLAG_OFF_BODY } from '@/lib/srs014Flags';
import { createPayoutCycle, listPayoutCycles } from '@/lib/payoutCycles/store';
import type { PayoutCycleStatus } from '@/lib/payoutCycles/types';

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

export async function GET(request: NextRequest) {
  const auth = authenticate(request);
  if (!auth.ok) return auth.response;
  const access = await assertAdminApiAccess(auth.decoded, 'payout_cycles');
  if (access) return access;

  if (!isPayoutCyclesEnabled()) {
    return NextResponse.json(SRS014_FLAG_OFF_BODY, { status: 503 });
  }

  const { searchParams } = new URL(request.url);
  const year = searchParams.get('year');
  const month = searchParams.get('month');
  const status = searchParams.get('status') as PayoutCycleStatus | null;

  try {
    const cycles = await listPayoutCycles({
      year: year ? Number(year) : undefined,
      month: month ? Number(month) : undefined,
      status: status || undefined,
    });
    return NextResponse.json({ success: true, cycles });
  } catch (error: any) {
    console.error('[payout-cycles GET]', error);
    return NextResponse.json({ success: false, error: error.message || 'حدث خطأ' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const auth = authenticate(request);
  if (!auth.ok) return auth.response;
  const access = await assertAdminApiAccess(auth.decoded, 'payout_cycles');
  if (access) return access;

  if (!isPayoutCyclesEnabled()) {
    return NextResponse.json(SRS014_FLAG_OFF_BODY, { status: 503 });
  }

  try {
    const body = await request.json();
    const result = await createPayoutCycle(
      {
        year: Number(body.year),
        month: Number(body.month),
        cycleNumber: Number(body.cycleNumber),
        startDate: String(body.startDate || ''),
        endDate: String(body.endDate || ''),
        payoutDate: String(body.payoutDate || ''),
        deductionGenerationDate: String(body.deductionGenerationDate || ''),
        isClosing: Boolean(body.isClosing),
        equipmentDeductionEnabled: body.equipmentDeductionEnabled !== false,
        status: body.status,
        notes: body.notes ? String(body.notes) : '',
      },
      {
        code: auth.decoded.code || 'admin',
        name: auth.decoded.name || auth.decoded.code || 'admin',
      }
    );
    if (!result.ok) {
      return NextResponse.json({ success: false, errors: result.errors }, { status: 400 });
    }
    return NextResponse.json({ success: true, cycle: result.cycle });
  } catch (error: any) {
    console.error('[payout-cycles POST]', error);
    return NextResponse.json({ success: false, error: error.message || 'حدث خطأ' }, { status: 500 });
  }
}
