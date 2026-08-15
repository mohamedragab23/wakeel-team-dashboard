import { NextRequest, NextResponse } from 'next/server';
import { extractBearerToken } from '@/lib/requestAuth';
import { verifyToken } from '@/lib/auth';
import { assertAdminApiAccess } from '@/lib/adminFeatureAccess';
import { isEquipmentLedgerEnabled, SRS014_FLAG_OFF_BODY } from '@/lib/srs014Flags';
import { listIssues } from '@/lib/equipmentLiability/store';
import type { EquipmentLiabilityStatus } from '@/lib/equipmentLiability/constants';
import {
  ensureEquipmentLiabilityPaymentsSheet,
  toDeskIssueView,
  type DeskIssueView,
  SHEET_EQUIPMENT_LIABILITY_PAYMENTS,
} from '@/lib/equipmentLiability/payments';
import { getSheetDataOrThrow } from '@/lib/googleSheets';
import type { EquipmentPaymentStatus } from '@/lib/equipmentLiability/paymentStatus';

export const dynamic = 'force-dynamic';

function matchesSearch(issue: DeskIssueView, q: string): boolean {
  if (!q) return true;
  const hay = [
    issue.riderCode,
    issue.riderNameSnapshot,
    issue.supervisorCodeSnapshot,
    issue.supervisorNameSnapshot,
    issue.zoneSnapshot,
    issue.equipmentIssueId,
  ]
    .join(' ')
    .toLowerCase();
  return hay.includes(q.toLowerCase());
}

async function loadLastPaymentAtByIssue(): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  try {
    await ensureEquipmentLiabilityPaymentsSheet();
    const data = await getSheetDataOrThrow(SHEET_EQUIPMENT_LIABILITY_PAYMENTS, false);
    for (let i = 1; i < data.length; i++) {
      const row = data[i];
      const equipmentIssueId = String(row[1] ?? '').trim();
      const createdAt = String(row[13] ?? row[4] ?? '').trim();
      if (!equipmentIssueId || !createdAt) continue;
      const prev = map.get(equipmentIssueId);
      if (!prev || createdAt > prev) map.set(equipmentIssueId, createdAt);
    }
  } catch (err) {
    console.error('[equipment-liability] payment history read failed (list continues):', err);
  }
  return map;
}

export async function GET(request: NextRequest) {
  const token = extractBearerToken(request);
  if (!token) {
    return NextResponse.json({ success: false, error: 'غير مصرح' }, { status: 401 });
  }
  const decoded = verifyToken(token) as { role?: string; permissions?: string } | null;
  const access = await assertAdminApiAccess(decoded, 'equipment_liability');
  if (access) return access;

  const { searchParams } = new URL(request.url);
  const listRequested =
    searchParams.get('list') === '1' ||
    searchParams.get('list') === 'all' ||
    Boolean(searchParams.get('status')) ||
    Boolean(searchParams.get('riderCode')) ||
    Boolean(searchParams.get('supervisorCode')) ||
    Boolean(searchParams.get('riderName')) ||
    Boolean(searchParams.get('zone')) ||
    Boolean(searchParams.get('paymentStatus')) ||
    Boolean(searchParams.get('q'));

  if (!listRequested) {
    return NextResponse.json({ success: true, enabled: isEquipmentLedgerEnabled() });
  }

  if (!isEquipmentLedgerEnabled()) {
    return NextResponse.json(SRS014_FLAG_OFF_BODY, { status: 503 });
  }

  try {
    const issues = await listIssues({
      status: (searchParams.get('status') as EquipmentLiabilityStatus) || undefined,
      riderCode: searchParams.get('riderCode') || undefined,
      supervisorCode: searchParams.get('supervisorCode') || undefined,
    });

    const riderName = (searchParams.get('riderName') || '').trim().toLowerCase();
    const zone = (searchParams.get('zone') || '').trim().toLowerCase();
    const paymentStatusFilter = (searchParams.get('paymentStatus') || '')
      .trim()
      .toUpperCase() as EquipmentPaymentStatus | '';
    const q = (searchParams.get('q') || '').trim();

    const lastByIssue = await loadLastPaymentAtByIssue();

    const views: DeskIssueView[] = [];
    for (const issue of issues) {
      if (riderName && !issue.riderNameSnapshot.toLowerCase().includes(riderName)) continue;
      if (zone && !issue.zoneSnapshot.toLowerCase().includes(zone)) continue;

      const view = toDeskIssueView(issue, lastByIssue.get(issue.equipmentIssueId));
      if (paymentStatusFilter && view.paymentStatus !== paymentStatusFilter) continue;
      if (!matchesSearch(view, q)) continue;
      views.push(view);
    }

    const summary = {
      totalLiabilities: views.length,
      totalOutstandingMilli: views.reduce((s, v) => s + Math.max(0, v.outstandingMilli), 0),
      unpaidCount: views.filter((v) => v.paymentStatus === 'UNPAID').length,
      partiallyPaidCount: views.filter((v) => v.paymentStatus === 'PARTIALLY_PAID').length,
      paidCount: views.filter((v) => v.paymentStatus === 'PAID').length,
    };

    return NextResponse.json({
      success: true,
      enabled: true,
      issues: views,
      summary,
    });
  } catch (error: any) {
    console.error('[equipment-liability GET]', error);
    // Fail closed — never report empty list as success when Sheets failed.
    return NextResponse.json(
      { success: false, error: error.message || 'فشل قراءة العهد — لم يتم إرجاع بيانات فارغة' },
      { status: 500 }
    );
  }
}
