import { NextRequest, NextResponse } from 'next/server';
import { extractBearerToken } from '@/lib/requestAuth';
import { verifyToken } from '@/lib/auth';
import { assertAdminApiAccess } from '@/lib/adminFeatureAccess';
import { isEquipmentLedgerEnabled, SRS014_FLAG_OFF_BODY } from '@/lib/srs014Flags';
import {
  listAllPayments,
  listUnresolvedPayments,
  toDeskIssueView,
} from '@/lib/equipmentLiability/payments';
import { getById } from '@/lib/equipmentLiability/store';

export const dynamic = 'force-dynamic';

/**
 * GET payment history across liabilities (desk ops view).
 * ?unresolved=1 → PENDING/CONFLICT/REQUIRES_REVIEW only
 */
export async function GET(request: NextRequest) {
  const token = extractBearerToken(request);
  if (!token) {
    return NextResponse.json({ success: false, error: 'غير مصرح' }, { status: 401 });
  }
  const decoded = verifyToken(token) as { role?: string; permissions?: string } | null;
  const access = await assertAdminApiAccess(decoded, 'equipment_liability');
  if (access) return access;

  if (!isEquipmentLedgerEnabled()) {
    return NextResponse.json(SRS014_FLAG_OFF_BODY, { status: 503 });
  }

  try {
    const unresolvedOnly = new URL(request.url).searchParams.get('unresolved') === '1';
    const payments = unresolvedOnly ? await listUnresolvedPayments() : await listAllPayments();

    const enriched = [];
    for (const p of payments.sort((a, b) =>
      String(b.createdAt).localeCompare(String(a.createdAt))
    )) {
      let outstandingMilli: number | null = null;
      let settlementPaidMilli: number | null = null;
      let riderName = '';
      try {
        const issue = await getById(p.equipmentIssueId);
        if (issue) {
          outstandingMilli = issue.outstandingMilli;
          settlementPaidMilli = issue.settlementPaidMilli || 0;
          riderName = issue.riderNameSnapshot;
          void toDeskIssueView(issue);
        }
      } catch {
        // Fail closed for this enrichment row — still return payment evidence.
      }
      enriched.push({
        ...p,
        riderNameSnapshot: riderName,
        currentOutstandingMilli: outstandingMilli,
        currentSettlementPaidMilli: settlementPaidMilli,
      });
    }

    const summary = {
      total: enriched.length,
      pending: enriched.filter((p) => p.aggregateStatus === 'PENDING').length,
      applied: enriched.filter((p) => p.aggregateStatus === 'APPLIED').length,
      conflict: enriched.filter((p) => p.aggregateStatus === 'CONFLICT').length,
      requiresReview: enriched.filter((p) => p.aggregateStatus === 'REQUIRES_REVIEW').length,
    };

    return NextResponse.json({ success: true, payments: enriched, summary });
  } catch (error: any) {
    console.error('[equipment-liability payments list]', error);
    return NextResponse.json(
      { success: false, error: error.message || 'فشل قراءة المدفوعات' },
      { status: 500 }
    );
  }
}
