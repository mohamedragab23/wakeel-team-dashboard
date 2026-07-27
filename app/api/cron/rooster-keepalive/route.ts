import { NextRequest, NextResponse } from 'next/server';
import { isCronAuthorized } from '@/lib/cronAuth';
import { getRoosterLiveHeaders, getRoosterServiceTokenHeaders } from '@/lib/roosterLive/tokenProvider';
import { smartRefreshRoosterAuth } from '@/lib/roosterLive/authRefresh';
import { logStructured } from '@/lib/requestTrace';
import { sendAdminTelegramNotificationSafe } from '@/lib/adminTelegramNotifier';

export const dynamic = 'force-dynamic';

/**
 * Proactive Rooster Live session keepalive.
 *
 * Runs every few hours to detect and recover a dead session (24h
 * CF_Authorization expiry, or an earlier session-collision invalidation)
 * within 3h of it happening, instead of waiting for the next live-sync
 * call to notice and react. Note: this does not *extend* a still-valid
 * CF_Authorization early — confirmed live that Cloudflare only reissues a
 * fresh token once the old one is actually gone, so the 24h clock runs
 * from the original login regardless of how often this runs.
 *
 * This is purely a proactive layer: `lib/roosterLive/client.ts` already
 * self-heals reactively on every sync (401 / HTML-instead-of-JSON), so a
 * missed or failed keepalive run does not by itself break anything — it
 * just means the reactive path has to do the work instead.
 */
export async function GET(req: NextRequest) {
  if (!isCronAuthorized(req)) {
    logStructured('warn', 'cron_unauthorized', { route: 'rooster-keepalive' });
    return NextResponse.json({ success: false, error: 'Unauthorized cron' }, { status: 401 });
  }

  if (getRoosterServiceTokenHeaders()) {
    // Service Token auth never expires — nothing to keep alive.
    return NextResponse.json({ success: true, skipped: true, reason: 'service_token_configured' });
  }

  try {
    const headers = await getRoosterLiveHeaders();
    const outcome = await smartRefreshRoosterAuth(headers);

    if (outcome.headers) {
      logStructured('info', 'rooster_keepalive_ok', {
        healedViaDeepSessionRefresh: outcome.healedViaDeepSessionRefresh,
        healedViaFullRecovery: outcome.healedViaFullRecovery,
      });
      return NextResponse.json({
        success: true,
        healedViaDeepSessionRefresh: outcome.healedViaDeepSessionRefresh,
        healedViaFullRecovery: outcome.healedViaFullRecovery,
      });
    }

    logStructured('error', 'rooster_keepalive_failed', { reason: outcome.failureReason });

    // Proactive warning — fires hours before the live-sync itself would
    // start failing. With SRS-012, `smartRefreshRoosterAuth` already tried
    // every layer including the full Okta login + Gmail-OTP recovery, so
    // reaching this point means that failed too (wrong credentials, Gmail
    // OAuth token expired, etc.) — genuinely needs a human this time.
    await sendAdminTelegramNotificationSafe({
      type: 'system_alert',
      alertTitle: '⚠️ *تنبيه استباقي: جلسة Rooster Live قربت تنتهي*',
      alertMessage:
        `محاولة التجديد الاستباقي للجلسة فشلت بكل الطرق التلقائية المتاحة (تجديد صامت + تسجيل دخول كامل بـ Gmail OTP لو متفعّل).\n\n` +
        `*السبب:* ${outcome.failureReason || 'غير معروف'}\n\n` +
        `المزامنة الحيّة (Rooster Live Sync) لسه شغالة دلوقتي لكنها هتبدأ تفشل قريب. ` +
        `سجّل دخول وحدّث الكوكي في Google Sheet (cron_config → ROOSTER_EXPORT_HEADERS_JSON) قبل ما ينقطع الاتصال فعليًا — ` +
        `راجع docs/ROOSTER_LIVE.md.`,
      priority: 'medium',
      url: `${process.env.NEXT_PUBLIC_APP_URL || ''}/live-riders`,
    });

    return NextResponse.json({ success: false, error: outcome.failureReason }, { status: 502 });
  } catch (error: any) {
    logStructured('error', 'rooster_keepalive_exception', { error: error?.message || String(error) });
    return NextResponse.json({ success: false, error: error?.message || 'Keepalive failed' }, { status: 500 });
  }
}
