import { NextRequest, NextResponse } from 'next/server';
import { isCronAuthorized } from '@/lib/cronAuth';
import { runRoosterLiveSync } from '@/lib/roosterLive/syncService';
import { logStructured } from '@/lib/requestTrace';
import { sendAdminTelegramNotificationSafe } from '@/lib/adminTelegramNotifier';

export const dynamic = 'force-dynamic';

/**
 * Triggered every ~60s.
 *
 * 2026-07-27 incident: this route used to be triggered ONLY by an external
 * third-party scheduler (cron-job.org). That scheduler silently stopped
 * calling this endpoint for >1h with zero error/alert on our side (nothing
 * in our app ever ran, so nothing could log or alert) — the dashboard just
 * showed stale/empty data with no warning. Root-caused via Vercel runtime
 * log route-counts (236 hits/6h → 0 hits/1h) and confirmed the app itself
 * was completely healthy the whole time (manual trigger during the
 * incident succeeded immediately, including a full Layer-3 recovery).
 *
 * Fix: this route is now ALSO registered as a native Vercel Cron
 * (`vercel.json`, every minute) so the primary trigger no longer depends on
 * a third-party website we don't control or monitor. cron-job.org may still
 * hit this endpoint too (that's harmless/idempotent), but Vercel Cron is now
 * the reliable source of truth.
 *
 * Auth: identical mechanism to the existing crons (`lib/cronAuth.ts`,
 * `CRON_SECRET`) — Vercel Cron sends `Authorization: Bearer <CRON_SECRET>`
 * automatically, no new auth logic introduced.
 */
export async function GET(req: NextRequest) {
  if (!isCronAuthorized(req)) {
    logStructured('warn', 'cron_unauthorized', { route: 'rooster-live-sync' });
    return NextResponse.json({ success: false, error: 'Unauthorized cron' }, { status: 401 });
  }

  const result = await runRoosterLiveSync();

  // Send Telegram alert on failure — the system already tried to self-heal
  // automatically through ALL THREE layers (dhh_token mint, then a silent
  // Cloudflare Access session replay, then — if configured — a full Okta
  // login with the OTP read automatically from Gmail). Reaching this alert
  // means every layer failed, i.e. something beyond auth expiry is wrong
  // (e.g. wrong Okta password, Gmail OAuth refresh token expired, IP block).
  // See docs/ROOSTER_LIVE.md → "Authentication Architecture".
  if (!result.success) {
    await sendAdminTelegramNotificationSafe({
      type: 'system_alert',
      alertTitle: '🚨 *تنبيه: فشل مزامنة العمليات المباشرة (كل محاولات الإصلاح التلقائي فشلت)*',
      alertMessage:
        `فشلت عملية مزامنة البيانات المباشرة من طلبات (Rooster Live Sync).\n\n` +
        `النظام حاول يصلّح المشكلة تلقائيًا بكل الطرق المتاحة (تجديد dhh_token، تجديد الجلسة بصمت، ` +
        `وتسجيل دخول Okta كامل بقراءة رمز OTP تلقائيًا من Gmail) ولم ينجح أي منها — ` +
        `المشكلة أعمق من انتهاء صلاحية الجلسة العادي (زي تغيير الباسورد، أو انتهاء صلاحية صلاحية Gmail).\n\n` +
        `*السبب:* ${result.error}\n\n` +
        `*الإجراء المطلوب:*\n` +
        `1) افتح eg.me.logisticsbackoffice.com وسجّل دخول\n` +
        `2) من DevTools → Network انسخ الـ Cookie header كاملاً (مش بس CF_Authorization/CF_AppSession — سيب أي كوكيز تانية زي "session" موجودة برضه، النظام هيحتفظ بيها عشان يحاول يجدد نفسه لوحده المرة الجاية)\n` +
        `3) حدّث Google Sheet تبويب cron_config المفتاح ROOSTER_EXPORT_HEADERS_JSON بالقيمة:\n` +
        `{"Cookie":"...الصق الكوكي هنا..."}\n` +
        `4) راجع docs/ROOSTER_LIVE.md قسم SRS-012 عشان تتأكد إن بيانات Okta و Gmail OAuth لسه صحيحة\n` +
        `5) انتظر دقيقة ثم افتح /live-riders`,
      priority: 'high',
      url: `${process.env.NEXT_PUBLIC_APP_URL || ''}/live-riders`,
    });
  } else if (result.healedAuthFull) {
    // Slightly more notable than healedAuthDeep: the silent replay itself
    // failed and the underlying Okta SSO session was genuinely dead — the
    // system recovered by doing a full login with the OTP read from Gmail
    // automatically. No action needed, but worth flagging since it's a
    // stronger signal that sessions are being invalidated unusually early.
    await sendAdminTelegramNotificationSafe({
      type: 'system_alert',
      alertTitle: '✅ *تم إصلاح جلسة Rooster Live تلقائيًا (تسجيل دخول كامل + Gmail OTP)*',
      alertMessage:
        `جلسة Okta الأساسية كانت منتهية فعليًا (مش بس CF_Authorization)، فالنظام سجّل دخول كامل تلقائيًا ` +
        `وقرأ رمز التحقق من Gmail بنفسه بدون أي تدخل، والمزامنة رجعت تشتغل عادي.\n\n` +
        `لا يوجد إجراء مطلوب منك — لكن لو تكرر ده كتير يستحق مراجعة سياسة انتهاء الجلسات.`,
      priority: 'low',
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
