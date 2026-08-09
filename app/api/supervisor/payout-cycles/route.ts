import { NextRequest, NextResponse } from 'next/server';
import { extractBearerToken } from '@/lib/requestAuth';
import { verifyToken } from '@/lib/auth';
import {
  isManualDeductionsV2Enabled,
  isPayoutCyclesEnabled,
  SRS014_FLAG_OFF_BODY,
} from '@/lib/srs014Flags';
import { listPayoutCycles } from '@/lib/payoutCycles/store';

export const dynamic = 'force-dynamic';

/** Read-only cycle list for supervisors (manual deductions V2). */
export async function GET(request: NextRequest) {
  const token = extractBearerToken(request);
  if (!token) return NextResponse.json({ success: false, error: 'غير مصرح' }, { status: 401 });
  const decoded = verifyToken(token);
  if (!decoded || (decoded.role !== 'supervisor' && decoded.role !== 'admin')) {
    return NextResponse.json({ success: false, error: 'غير مصرح' }, { status: 401 });
  }

  if (!isPayoutCyclesEnabled() && !isManualDeductionsV2Enabled()) {
    return NextResponse.json(SRS014_FLAG_OFF_BODY, { status: 503 });
  }

  const { searchParams } = new URL(request.url);
  const year = searchParams.get('year');
  const month = searchParams.get('month');
  const cycles = await listPayoutCycles({
    year: year ? Number(year) : undefined,
    month: month ? Number(month) : undefined,
  });
  return NextResponse.json({
    success: true,
    cycles: cycles.map((c) => ({
      cycleId: c.cycleId,
      year: c.year,
      month: c.month,
      cycleNumber: c.cycleNumber,
      startDate: c.startDate,
      endDate: c.endDate,
      isClosing: c.isClosing,
      status: c.status,
    })),
  });
}
