import { NextRequest, NextResponse } from 'next/server';
import { isCronAuthorized } from '@/lib/cronAuth';
import { isAutoEquipmentDeductionsEnabled } from '@/lib/srs014Flags';
import { runEquipmentAutoDeductionsForDate } from '@/lib/equipmentDeductions/engine';
import { sendAdminTelegramNotificationSafe } from '@/lib/adminTelegramNotifier';
import { writeCycleReconciliationSnapshot } from '@/lib/equipmentFinance/reconciliation';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 300;

export async function GET(request: NextRequest) {
  if (!isCronAuthorized(request)) {
    return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
  }

  if (!isAutoEquipmentDeductionsEnabled()) {
    return NextResponse.json({ success: true, skipped: true, reason: 'FEATURE_AUTO_EQUIPMENT_DEDUCTIONS_ENABLED off' });
  }

  const asOfDate =
    request.nextUrl.searchParams.get('date')?.trim() || new Date().toISOString().slice(0, 10);

  try {
    const result = await runEquipmentAutoDeductionsForDate(asOfDate, {
      code: 'cron',
      name: 'equipment-auto-deductions',
    });

    if (result.cycleId) {
      try {
        await writeCycleReconciliationSnapshot(result.cycleId, result);
      } catch (err) {
        console.error('[equipment-auto-deductions] reconciliation snapshot failed:', err);
      }
    }

    await sendAdminTelegramNotificationSafe({
      type: 'system_alert',
      alertTitle: '🔔 استقطاعات المعدات التلقائية',
      alertMessage: [
        `التاريخ: ${asOfDate}`,
        `الدورة: ${result.cycleId || '—'}`,
        `معالجة: ${result.processed}`,
        `مخصوم: ${result.deducted}`,
        `تخطّي: ${result.skipped}`,
        result.errors.length ? `أخطاء: ${result.errors.length}` : 'بدون أخطاء',
      ].join('\n'),
    });

    return NextResponse.json({ success: true, skipped: false, result });
  } catch (error: any) {
    console.error('[equipment-auto-deductions]', error);
    await sendAdminTelegramNotificationSafe({
      type: 'system_alert',
      alertTitle: '⚠️ فشل استقطاعات المعدات التلقائية',
      alertMessage: error?.message || String(error),
    });
    return NextResponse.json({ success: false, error: error.message || 'cron failed' }, { status: 500 });
  }
}
