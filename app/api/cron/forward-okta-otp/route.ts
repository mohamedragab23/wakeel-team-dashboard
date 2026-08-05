/**
 * Cron: forward Okta OTP emails to "جروب الأكواد" on Telegram.
 *
 * Runs every minute. Replaces the slow Google Apps Script that used to do
 * the same job (Gmail → Telegram). Latency is typically < 5 seconds from
 * email arrival, vs. the Apps Script's trigger interval of 1–5 minutes.
 *
 * Group naming:
 *   جروب الإشعارات  = TELEGRAM_ADMIN_GROUP_CHAT_ID  (admin system alerts)
 *   جروب الأكواد    = TELEGRAM_OTP_CODES_CHAT_ID    (supervisor OTP codes — this cron)
 */
import { NextRequest, NextResponse } from 'next/server';
import { isCronAuthorized } from '@/lib/cronAuth';
import { logStructured } from '@/lib/requestTrace';
import { forwardLatestOktaOtp } from '@/lib/otpForwarder';

export const dynamic = 'force-dynamic';
export const maxDuration = 30;

export async function GET(req: NextRequest) {
  if (!isCronAuthorized(req)) {
    logStructured('warn', 'cron_unauthorized', { route: 'forward-okta-otp' });
    return NextResponse.json({ success: false, error: 'Unauthorized cron' }, { status: 401 });
  }

  try {
    const result = await forwardLatestOktaOtp();
    logStructured('info', 'otp_forwarder_cron_done', result as any);
    return NextResponse.json({ success: true, ...result });
  } catch (err: any) {
    logStructured('error', 'otp_forwarder_cron_failed', { error: err?.message || String(err) });
    return NextResponse.json({ success: false, error: err?.message || String(err) }, { status: 500 });
  }
}
