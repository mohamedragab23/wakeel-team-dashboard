import { NextRequest, NextResponse } from 'next/server';
import { isCronAuthorized } from '@/lib/cronAuth';
import { isEquipmentLedgerEnabled } from '@/lib/srs014Flags';
import { reconcileUnresolvedEquipmentLiabilityPayments } from '@/lib/equipmentLiability/paymentReconcile';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 120;

/**
 * Automatic orphan recovery for Equipment Liability Desk cash payments.
 * Gated by FEATURE_EQUIPMENT_LEDGER_ENABLED only (not Auto Deduction).
 */
export async function GET(request: NextRequest) {
  if (!isCronAuthorized(request)) {
    return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
  }

  if (!isEquipmentLedgerEnabled()) {
    return NextResponse.json({
      success: true,
      skipped: true,
      reason: 'FEATURE_EQUIPMENT_LEDGER_ENABLED off',
    });
  }

  try {
    const result = await reconcileUnresolvedEquipmentLiabilityPayments({
      code: 'cron',
      name: 'equipment-liability-payment-reconcile',
    });

    if ('ok' in result && result.ok === false) {
      return NextResponse.json({
        success: true,
        skipped: true,
        reason: 'reconcile_job_lock_busy',
      });
    }

    return NextResponse.json({ success: true, reconcile: result });
  } catch (error: any) {
    console.error('[cron/equipment-liability-payment-reconcile]', error);
    // Fail closed — never claim empty/no orphans on Sheets failure.
    return NextResponse.json(
      {
        success: false,
        error: error?.message || 'reconcile_failed',
      },
      { status: 500 }
    );
  }
}
