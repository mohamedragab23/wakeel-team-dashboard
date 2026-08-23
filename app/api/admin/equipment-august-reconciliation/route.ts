import { NextRequest, NextResponse } from 'next/server';
import { extractBearerToken } from '@/lib/requestAuth';
import { verifyToken } from '@/lib/auth';
import { assertAdminApiAccess } from '@/lib/adminApiAccess';
import { loadAugustReconciliationFromSheets } from '@/lib/equipmentDeductions/augustReconciliation';
import { getSheetData } from '@/lib/googleSheets';
import { listIssues } from '@/lib/equipmentLiability/store';
import { listPayoutCycles } from '@/lib/payoutCycles/store';

export const dynamic = 'force-dynamic';

/** READ-ONLY August 2026 W1/W2 reconciliation for admins. */
export async function GET(request: NextRequest) {
  const token = extractBearerToken(request);
  if (!token) {
    return NextResponse.json({ success: false, error: 'غير مصرح' }, { status: 401 });
  }
  const decoded = verifyToken(token);
  const access = await assertAdminApiAccess(decoded, 'equipment_liability');
  if (access) return access;

  try {
    const report = await loadAugustReconciliationFromSheets({
      listPayoutCycles: () => listPayoutCycles({ year: 2026, month: 8 }),
      getSheetData: (name) => getSheetData(name, false),
      listIssues: () => listIssues({}),
    });
    return NextResponse.json({ success: true, report });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'حدث خطأ';
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
