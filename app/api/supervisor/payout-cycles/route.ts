import { NextRequest, NextResponse } from 'next/server';
import { extractBearerToken } from '@/lib/requestAuth';
import { verifyToken } from '@/lib/auth';
import {
  isManualDeductionsV2Enabled,
  isPayoutCyclesEnabled,
  SRS014_FLAG_OFF_BODY,
} from '@/lib/srs014Flags';
import { listPayoutCycles } from '@/lib/payoutCycles/store';
import {
  getCachedPayoutCyclesShort,
  loadSupervisorDeclarationSheetsBundle,
} from '@/lib/equipmentDeductions/supervisorDeclarationHydration';
import { toSafeSheetsUserError, isSheetsQuotaError } from '@/lib/googleSheetsBatchRead';

export const dynamic = 'force-dynamic';

/** Read-only cycle list for supervisors. Prefers short shared cache / batch bundle. */
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

  try {
    const { searchParams } = new URL(request.url);
    const year = searchParams.get('year');
    const month = searchParams.get('month');
    const yearN = year ? Number(year) : undefined;
    const monthN = month ? Number(month) : undefined;

    let cycles = getCachedPayoutCyclesShort();
    if (!cycles) {
      try {
        await loadSupervisorDeclarationSheetsBundle();
        cycles = getCachedPayoutCyclesShort();
      } catch {
        cycles = null;
      }
    }
    if (!cycles) {
      cycles = await listPayoutCycles({
        year: yearN,
        month: monthN,
      });
    } else {
      cycles = cycles.filter((c) => {
        if (yearN != null && c.year !== yearN) return false;
        if (monthN != null && c.month !== monthN) return false;
        return true;
      });
    }

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
        payoutDate: c.payoutDate,
      })),
    });
  } catch (error: unknown) {
    return NextResponse.json(
      { success: false, error: toSafeSheetsUserError(error) },
      { status: isSheetsQuotaError(error) ? 503 : 500 }
    );
  }
}
