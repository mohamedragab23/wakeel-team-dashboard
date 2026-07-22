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
      type: 'system_alert',
      alertTitle: '🚨 *تنبيه: فشل مزامنة العمليات المباشرة*',
      alertMessage:
        `فشلت عملية مزامنة البيانات المباشرة من طلبات (Rooster Live Sync).\n\n` +
        `*السبب:* ${result.error}\n\n` +
        `*الإجراء المطلوب:*\n` +
        `1) افتح eg.me.logisticsbackoffice.com وسجّل دخول\n` +
        `2) من DevTools → Network انسخ Cookie (لازم يحتوي CF_Authorization و CF_AppSession)\n` +
        `3) حدّث Google Sheet تبويب cron_config المفتاح ROOSTER_EXPORT_HEADERS_JSON بالقيمة:\n` +
        `{"Cookie":"...الصق الكوكي هنا..."}\n` +
        `4) انتظر دقيقة ثم افتح /live-riders`,
      priority: 'high',
      url: `${process.env.NEXT_PUBLIC_APP_URL || ''}/live-riders`,
    });
  }

  return NextResponse.json(result, { status: result.success ? 200 : 502 });
}
