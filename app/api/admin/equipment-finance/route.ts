import { NextRequest, NextResponse } from 'next/server';
import { extractBearerToken } from '@/lib/requestAuth';
import { verifyToken } from '@/lib/auth';
import { assertAdminApiAccess } from '@/lib/adminFeatureAccess';
import {
  isAutoEquipmentDeductionsEnabled,
  isEquipmentLedgerEnabled,
  isEquipmentReturnsV2Enabled,
} from '@/lib/srs014Flags';
import { getEquipmentFinanceSummary, listReconciliationSnapshots } from '@/lib/equipmentFinance/reconciliation';
import { formatMilliemesAsEgp } from '@/lib/money';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const token = extractBearerToken(request);
  if (!token) return NextResponse.json({ success: false, error: 'غير مصرح' }, { status: 401 });
  const decoded = verifyToken(token) as { role?: string; permissions?: string } | null;
  const access = await assertAdminApiAccess(decoded, 'equipment_finance');
  if (access) return access;

  const enabled =
    isEquipmentLedgerEnabled() || isAutoEquipmentDeductionsEnabled() || isEquipmentReturnsV2Enabled();

  const { searchParams } = new URL(request.url);
  if (searchParams.get('capability') === '1' || (!enabled && !searchParams.get('cycleId'))) {
    return NextResponse.json({ success: true, enabled });
  }

  if (!enabled) {
    return NextResponse.json({ success: false, enabled: false, error: 'غير مفعّل' }, { status: 503 });
  }

  try {
    const summary = await getEquipmentFinanceSummary();
    const cycleId = searchParams.get('cycleId') || undefined;
    const snapshots = cycleId ? await listReconciliationSnapshots(cycleId) : summary.recentSnapshots;
    return NextResponse.json({
      success: true,
      enabled: true,
      summary: {
        ...summary,
        outstandingEgp: formatMilliemesAsEgp(summary.outstandingMilliTotal),
        deductedEgp: formatMilliemesAsEgp(summary.deductedMilliTotal),
      },
      snapshots,
    });
  } catch (error: any) {
    console.error('[equipment-finance GET]', error);
    return NextResponse.json({ success: false, error: error.message || 'حدث خطأ' }, { status: 500 });
  }
}
