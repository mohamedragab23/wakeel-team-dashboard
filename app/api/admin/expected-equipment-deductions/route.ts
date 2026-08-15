/**
 * Expected equipment deduction snapshot — CALCULATION ONLY.
 * Never enables financial apply / wallet / ledger mutations.
 */

import { NextRequest, NextResponse } from 'next/server';
import { extractBearerToken } from '@/lib/requestAuth';
import { verifyToken } from '@/lib/auth';
import { assertAdminApiAccess } from '@/lib/adminApiAccess';
import { isPayoutCyclesEnabled, SRS014_FLAG_OFF_BODY } from '@/lib/srs014Flags';
import { listPayoutCycles } from '@/lib/payoutCycles/store';
import { resolveCycleForDeductionDate } from '@/lib/payoutCycles/eligibility';
import { listOpenIssues } from '@/lib/equipmentLiability/store';
import { buildExpectedDeductionSnapshot } from '@/lib/equipmentDeductions/expectedSnapshot';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET(request: NextRequest) {
  try {
    const token = extractBearerToken(request);
    if (!token) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }
    const decoded = verifyToken(token);
    if (!decoded) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }
    const denied = await assertAdminApiAccess(decoded, 'equipment_finance');
    if (denied) return denied;

    if (!isPayoutCyclesEnabled()) {
      return NextResponse.json(
        { ...SRS014_FLAG_OFF_BODY, path: 'expected-equipment-deductions' },
        { status: 403 }
      );
    }

    const asOfDate =
      request.nextUrl.searchParams.get('asOfDate') ||
      new Date().toISOString().slice(0, 10);

    const cycles = await listPayoutCycles();
    const cycle = resolveCycleForDeductionDate(cycles, asOfDate);
    if (!cycle) {
      return NextResponse.json({
        success: true,
        financialMutation: false,
        snapshot: null,
        message: 'no_cycle_for_date',
        asOfDate,
      });
    }

    const open = await listOpenIssues();
    const snapshot = buildExpectedDeductionSnapshot({
      asOfDate,
      cycle,
      allCycles: cycles,
      openIssues: open.map((i) => ({
        equipmentIssueId: i.equipmentIssueId,
        riderCode: i.riderCode,
        riderNameSnapshot: i.riderNameSnapshot,
        activationDate: i.activationDate,
        originalLiabilityMilli: i.originalLiabilityMilli,
        outstandingMilli: i.outstandingMilli,
        amountDeductedMilli: i.amountDeductedMilli,
        installmentsCompleted: i.installmentsCompleted,
        securityPaidUpfront: i.securityPaidUpfront,
        status: i.status,
        bagCostMilli: i.bagCostMilli,
        shirtCostMilli: i.shirtCostMilli,
        securityFeeMilli: i.securityFeeMilli,
      })),
    });

    return NextResponse.json({
      success: true,
      financialMutation: false,
      financialApplyEnabled: false,
      snapshot,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    console.error('[expected-equipment-deductions]', message);
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
