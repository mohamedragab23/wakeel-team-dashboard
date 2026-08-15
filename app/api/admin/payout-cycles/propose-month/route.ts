/**
 * Propose payout cycles for a month — does NOT write Sheets.
 */

import { NextRequest, NextResponse } from 'next/server';
import { extractBearerToken } from '@/lib/requestAuth';
import { verifyToken } from '@/lib/auth';
import { assertAdminApiAccess } from '@/lib/adminApiAccess';
import { isPayoutCyclesEnabled, SRS014_FLAG_OFF_BODY } from '@/lib/srs014Flags';
import { proposePayoutCyclesForMonth } from '@/lib/payoutCycles/monthProposal';

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
    const denied = await assertAdminApiAccess(decoded, 'payout_cycles');
    if (denied) return denied;

    if (!isPayoutCyclesEnabled()) {
      return NextResponse.json(
        { ...SRS014_FLAG_OFF_BODY, path: 'payout-cycles/propose-month' },
        { status: 403 }
      );
    }

    const year = Number(request.nextUrl.searchParams.get('year'));
    const month = Number(request.nextUrl.searchParams.get('month'));
    if (!Number.isFinite(year) || month < 1 || month > 12) {
      return NextResponse.json(
        { success: false, error: 'year and month (1-12) required' },
        { status: 400 }
      );
    }

    const proposed = proposePayoutCyclesForMonth(year, month);
    return NextResponse.json({
      success: true,
      written: false,
      financialMutation: false,
      year,
      month,
      proposed,
      note: 'Proposal only — use existing payout-cycles POST to persist after Admin sets payday dates.',
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
