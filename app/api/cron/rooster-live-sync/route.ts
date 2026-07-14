import { NextRequest, NextResponse } from 'next/server';
import { isCronAuthorized } from '@/lib/cronAuth';
import { runRoosterLiveSync } from '@/lib/roosterLive/syncService';
import { logStructured } from '@/lib/requestTrace';
import { sendAdminTelegramNotificationSafe } from '@/lib/adminTelegramNotifier';

export const dynamic = 'force-dynamic';

/**
 * Triggered every ~60s by an EXTERNAL scheduler (cron-job.org / GitHub
 * Actions / QStash) — Vercel Cron cannot reliably guarantee 60s resolution,
 * so this route is intentionally not (only) wired into vercel.json.
 *
 * Auth: identical mechanism to the existing crons (`lib/cronAuth.ts`,
 * `CRON_SECRET`) — no new auth logic introduced.
 */
export async function GET(req: NextRequest) {
  if (!isCronAuthorized(req)) {
    logStructured('warn', 'cron_unauthorized', { route: 'rooster-live-sync' });
    return NextResponse.json({ success: false, error: 'Unauthorized cron' }, { status: 401 });
  }

  const result = await runRoosterLiveSync();
  
  // Send Telegram alert on failure
  if (!result.success) {
    await sendAdminTelegramNotificationSafe({
      title: '🚨 تنبيه: فشل مزامنة العمليات المباشرة',
      message: `فشلت عملية مزامنة البيانات المباشرة من طلبات (Rooster Live Sync).\n\n**السبب:** ${result.error}\n\n**الإجراء المطلوب:** تحديث cookies في Google Sheet (cron_config → ROOSTER_EXPORT_HEADERS_JSON)`,
      priority: 'high',
      url: `${process.env.NEXT_PUBLIC_APP_URL || ''}/live-riders`,
    });
  }

  return NextResponse.json(result, { status: result.success ? 200 : 502 });
}
