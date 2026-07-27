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

  // Send Telegram alert on failure — the system already tried to self-heal
  // automatically (dhh_token mint, then a silent Cloudflare Access session
  // replay). Reaching this alert means BOTH layers failed, i.e. the
  // underlying Okta SSO session itself is fully gone — a human really does
  // need to log in fresh. See docs/ROOSTER_LIVE.md → "Authentication Architecture".
  if (!result.success) {
    await sendAdminTelegramNotificationSafe({
      type: 'system_alert',
      alertTitle: '🚨 *تنبيه: فشل مزامنة العمليات المباشرة (الإصلاح التلقائي فشل أيضًا)*',
      alertMessage:
        `فشلت عملية مزامنة البيانات المباشرة من طلبات (Rooster Live Sync).\n\n` +
        `النظام حاول يصلّح المشكلة تلقائيًا (تجديد dhh_token ثم محاولة تجديد الجلسة بصمت) ولم ينجح — ` +
        `يعني جلسة Okta الأساسية انتهت فعليًا ومحتاجة تسجيل دخول حقيقي.\n\n` +
        `*السبب:* ${result.error}\n\n` +
        `*الإجراء المطلوب:*\n` +
        `1) افتح eg.me.logisticsbackoffice.com وسجّل دخول\n` +
        `2) من DevTools → Network انسخ الـ Cookie header كاملاً (مش بس CF_Authorization/CF_AppSession — سيب أي كوكيز تانية زي "session" موجودة برضه، النظام هيحتفظ بيها عشان يحاول يجدد نفسه لوحده المرة الجاية)\n` +
        `3) حدّث Google Sheet تبويب cron_config المفتاح ROOSTER_EXPORT_HEADERS_JSON بالقيمة:\n` +
        `{"Cookie":"...الصق الكوكي هنا..."}\n` +
        `4) (اختياري لتقليل تكرار هذا التنبيه مستقبلاً) لو حابب تفعّل التجديد الصامت الكامل، ضيف كمان صف` +
        ` ROOSTER_OKTA_COOKIE بكوكي دومين Okta نفسه (مش دومين eg.me.logisticsbackoffice.com) — راجع docs/ROOSTER_LIVE.md\n` +
        `5) انتظر دقيقة ثم افتح /live-riders`,
      priority: 'high',
      url: `${process.env.NEXT_PUBLIC_APP_URL || ''}/live-riders`,
    });
  } else if (result.healedAuthDeep) {
    // Low-noise visibility note: the 24h session had expired (or was
    // invalidated early) and the system recovered on its own — no action
    // needed, but worth knowing it happened.
    await sendAdminTelegramNotificationSafe({
      type: 'system_alert',
      alertTitle: '✅ *تم إصلاح جلسة Rooster Live تلقائيًا*',
      alertMessage:
        `جلسة Cloudflare Access كانت منتهية وتم تجديدها تلقائيًا (بدون أي تدخل)، والمزامنة رجعت تشتغل عادي.\n\n` +
        `لا يوجد إجراء مطلوب منك.`,
      priority: 'low',
      url: `${process.env.NEXT_PUBLIC_APP_URL || ''}/live-riders`,
    });
  }

  return NextResponse.json(result, { status: result.success ? 200 : 502 });
}
