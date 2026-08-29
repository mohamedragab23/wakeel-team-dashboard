/**
 * Cron: forward Okta OTP emails to "جروب الأكواد" on Telegram.
 *
 * Vercel cron fires at most once per minute. Inside that minute we poll Gmail
 * every ~5s so codes reach the group close to email arrival — comparable to
 * جروب الإشعارات which is event-driven push.
 *
 * Group naming:
 *   جروب الإشعارات  = TELEGRAM_ADMIN_GROUP_CHAT_ID  (admin system alerts)
 *   جروب الأكواد    = TELEGRAM_OTP_CODES_CHAT_ID    (supervisor OTP codes — this cron)
 */
import { NextRequest, NextResponse } from 'next/server';
import { isCronAuthorized } from '@/lib/cronAuth';
import { logStructured } from '@/lib/requestTrace';
import { forwardOktaOtpsForWindow } from '@/lib/otpForwarder';
import { redisIncr, redisDel, redisExpire, redisSetNx, isUpstashConfigured } from '@/lib/upstashRest';
import { sendAdminTelegramNotificationSafe } from '@/lib/adminTelegramNotifier';

export const dynamic = 'force-dynamic';
/** Must cover the ~50s in-process Gmail poll window. */
export const maxDuration = 60;

/**
 * 2026-08-29 incident: جروب الأكواد had silently stopped receiving codes.
 * Root cause of *why nobody was told*: `forwardOktaOtpsForWindow` used to
 * catch every poll error, log it, and discard it — this route then always
 * returned `success:true` regardless, so a persistently broken bot
 * token/chat id/App Password looked completely healthy from the outside,
 * forever, with zero alert.
 *
 * This tracks consecutive *fully failed* cron runs (every single poll in
 * the window errored — never counts a normal "no new OTP this minute"
 * run) in Redis, and fires one deduplicated admin alert (to جروب
 * الإشعارات — a separate bot/group from جروب الأكواد, so the alert isn't
 * itself silenced by whatever broke the codes group) once the run of
 * failures is long enough to be a real outage rather than a network blip.
 */
const CONSECUTIVE_FAILURE_KEY = 'otp_forwarder:consecutive_failed_runs';
const CONSECUTIVE_FAILURE_WINDOW_SECONDS = 60 * 60;
const ALERT_THRESHOLD = 5; // ~5 consecutive minutes of every-poll-failing
const ALERT_DEDUPE_KEY = 'otp_forwarder:alert_sent';
const ALERT_DEDUPE_SECONDS = 30 * 60; // one alert per 30 min, not one per minute

async function maybeAlertOnPersistentFailure(lastError: string, consecutiveFailedRuns: number): Promise<void> {
  if (consecutiveFailedRuns < ALERT_THRESHOLD) return;
  if (isUpstashConfigured()) {
    const shouldAlert = await redisSetNx(ALERT_DEDUPE_KEY, String(Date.now()), ALERT_DEDUPE_SECONDS);
    if (!shouldAlert) return;
  }
  logStructured('error', 'otp_forwarder_persistent_failure_alert', { lastError, consecutiveFailedRuns });
  await sendAdminTelegramNotificationSafe({
    type: 'system_alert',
    alertTitle: '🚨 *تنبيه: جروب الأكواد وقف عن استقبال أكواد Rooster*',
    alertMessage:
      `فشل إرسال كود Okta لـ جروب الأكواد ${consecutiveFailedRuns} مرة متتالية (كل دقيقة تقريبًا) — ` +
      `يعني على الأرجح متوقف تمامًا دلوقتي، مش مجرد مشكلة عابرة.\n\n` +
      `*السبب:* ${lastError}`,
    priority: 'high',
    url: `${process.env.NEXT_PUBLIC_APP_URL || ''}/shifts`,
  });
}

export async function GET(req: NextRequest) {
  if (!isCronAuthorized(req)) {
    logStructured('warn', 'cron_unauthorized', { route: 'forward-okta-otp' });
    return NextResponse.json({ success: false, error: 'Unauthorized cron' }, { status: 401 });
  }

  try {
    const burst = await forwardOktaOtpsForWindow({ windowMs: 25_000, intervalMs: 8_000 });
    logStructured('info', 'otp_forwarder_cron_done', burst as Record<string, unknown>);

    let consecutiveFailedRuns = 0;
    if (burst.allPollsErrored) {
      consecutiveFailedRuns = (await redisIncr(CONSECUTIVE_FAILURE_KEY)) ?? 0;
      void redisExpire(CONSECUTIVE_FAILURE_KEY, CONSECUTIVE_FAILURE_WINDOW_SECONDS);
      if (burst.lastError) await maybeAlertOnPersistentFailure(burst.lastError, consecutiveFailedRuns);
    } else if (burst.polls > 0) {
      // Any clean poll (success or a normal "nothing to do") resets the streak.
      await redisDel(CONSECUTIVE_FAILURE_KEY);
    }

    return NextResponse.json({
      success: true,
      forwardedCount: burst.forwardedCount,
      polls: burst.polls,
      last: burst.last ?? null,
      lastError: burst.lastError ?? null,
      consecutiveFailedRuns,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    logStructured('error', 'otp_forwarder_cron_failed', { error: message });
    const consecutiveFailedRuns = (await redisIncr(CONSECUTIVE_FAILURE_KEY)) ?? 0;
    void redisExpire(CONSECUTIVE_FAILURE_KEY, CONSECUTIVE_FAILURE_WINDOW_SECONDS);
    await maybeAlertOnPersistentFailure(message, consecutiveFailedRuns);
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
