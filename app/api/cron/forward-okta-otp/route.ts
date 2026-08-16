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

export const dynamic = 'force-dynamic';
/** Must cover the ~50s in-process Gmail poll window. */
export const maxDuration = 60;

export async function GET(req: NextRequest) {
  if (!isCronAuthorized(req)) {
    logStructured('warn', 'cron_unauthorized', { route: 'forward-okta-otp' });
    return NextResponse.json({ success: false, error: 'Unauthorized cron' }, { status: 401 });
  }

  try {
    const burst = await forwardOktaOtpsForWindow({ windowMs: 50_000, intervalMs: 5_000 });
    logStructured('info', 'otp_forwarder_cron_done', burst as Record<string, unknown>);
    return NextResponse.json({
      success: true,
      forwardedCount: burst.forwardedCount,
      polls: burst.polls,
      last: burst.last ?? null,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    logStructured('error', 'otp_forwarder_cron_failed', { error: message });
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
