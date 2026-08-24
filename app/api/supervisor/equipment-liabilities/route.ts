import { NextRequest, NextResponse } from 'next/server';
import { extractBearerToken } from '@/lib/requestAuth';
import { verifyToken } from '@/lib/auth';
import { isEquipmentLedgerEnabled, SRS014_FLAG_OFF_BODY } from '@/lib/srs014Flags';
import { hydrateSupervisorDeclarationQueue } from '@/lib/equipmentDeductions/supervisorDeclarationHydration';
import {
  isSheetsQuotaError,
  toSafeSheetsUserError,
} from '@/lib/googleSheetsBatchRead';

export const dynamic = 'force-dynamic';

/**
 * Single hydration endpoint for supervisor declaration desk.
 * Uses one Sheets batchGet (or short TTL shared cache) — never per-rider reads.
 */
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
    const supervisorCode = decoded.code || '';
    const { searchParams } = new URL(request.url);
    const year = searchParams.get('year') ? Number(searchParams.get('year')) : 2026;
    const month = searchParams.get('month') ? Number(searchParams.get('month')) : 8;

    const hydrated = await hydrateSupervisorDeclarationQueue({
      supervisorCode,
      year,
      month,
    });

    return NextResponse.json({
      success: true,
      rows: hydrated.rows,
      cycles: hydrated.cycles,
      rosterRiderCount: hydrated.rosterRiderCount,
      liabilityCount: hydrated.liabilityCount,
      declarationQueueCount: hydrated.rows.length,
      metrics: hydrated.metrics,
      message:
        'الإفادة النهائية عن حالة سداد عهدة المندوب — ابدأ من الصفر. حفظ الإقرار لا يعدّل الرصيد تلقائياً.',
    });
  } catch (error: unknown) {
    const safe = toSafeSheetsUserError(error);
    console.error('[supervisor/equipment-liabilities GET]', {
      quota: isSheetsQuotaError(error),
      message: error instanceof Error ? error.message.slice(0, 200) : String(error).slice(0, 200),
    });
    return NextResponse.json(
      { success: false, error: safe },
      { status: isSheetsQuotaError(error) ? 503 : 500 }
    );
  }
}
