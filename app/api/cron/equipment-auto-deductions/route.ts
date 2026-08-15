import { NextRequest, NextResponse } from 'next/server';
import { isCronAuthorized } from '@/lib/cronAuth';
import { isAutoEquipmentDeductionsEnabled } from '@/lib/srs014Flags';
import { runEquipmentAutoRequestsForDate } from '@/lib/equipmentDeductions/autoRequest';
import { sendAdminTelegramNotificationSafe } from '@/lib/adminTelegramNotifier';
import { writeCycleReconciliationSnapshot } from '@/lib/equipmentFinance/reconciliation';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 300;

/**
 * Phase 4C: Auto cron emits REQUEST obligations only (no wallet / ledger / Y-gate).
 * Legacy paid-on-cron (`runEquipmentAutoDeductionsForDate`) is intentionally not invoked.
 * Feature flag remains the enablement gate; production enablement is a separate Go.
 */
export async function GET(request: NextRequest) {
  if (!isCronAuthorized(request)) {
    return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
  }

  if (!isAutoEquipmentDeductionsEnabled()) {
    return NextResponse.json({
      success: true,
      skipped: true,
      reason: 'FEATURE_AUTO_EQUIPMENT_DEDUCTIONS_ENABLED off',
    });
  }

  const asOfDate =
    request.nextUrl.searchParams.get('date')?.trim() || new Date().toISOString().slice(0, 10);

  try {
    const result = await runEquipmentAutoRequestsForDate(asOfDate, {
      code: 'cron',
      name: 'equipment-auto-deductions',
    });

    if (result.cycleId) {
      try {
        // Snapshot shape is additive/compat; REQUEST run has no wallet deductions.
        await writeCycleReconciliationSnapshot(result.cycleId, {
          enabled: result.enabled,
          asOfDate: result.asOfDate,
          cycleId: result.cycleId,
          processed: result.processed,
          deducted: 0,
          skipped: result.skipped,
          errors: result.errors,
        });
      } catch (err) {
        console.error('[equipment-auto-deductions] reconciliation snapshot failed:', err);
      }
    }

    await sendAdminTelegramNotificationSafe({
      type: 'system_alert',
      alertTitle: '🔔 استقطاعات المعدات التلقائية (REQUEST)',
      alertMessage: [
        `التاريخ: ${asOfDate}`,
        `الدورة: ${result.cycleId || '—'}`,
        `معالجة: ${result.processed}`,
        `طلبات جديدة: ${result.requested}`,
        `مرحّل/queued: ${result.queued}`,
        `تخطّي: ${result.skipped}`,
        result.errors.length ? `أخطاء: ${result.errors.length}` : 'بدون أخطاء',
      ].join('\n'),
    });

    return NextResponse.json({ success: true, skipped: false, mode: 'request_only', result });
  } catch (error: any) {
    console.error('[equipment-auto-deductions]', error);
    await sendAdminTelegramNotificationSafe({
      type: 'system_alert',
      alertTitle: '⚠️ فشل استقطاعات المعدات التلقائية (REQUEST)',
      alertMessage: error?.message || String(error),
    });
    return NextResponse.json({ success: false, error: error.message || 'cron failed' }, { status: 500 });
  }
}
