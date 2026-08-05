import { NextRequest, NextResponse } from 'next/server';
import { isCronAuthorized } from '@/lib/cronAuth';
import { logStructured } from '@/lib/requestTrace';
import { getGmailClient, isGmailOAuthConfigured } from '@/lib/gmailOAuth';
import { describeGmailAuthError } from '@/lib/roosterLive/authRecovery/gmailOtpReader';
import { sendAdminTelegramNotificationSafe } from '@/lib/adminTelegramNotifier';

export const dynamic = 'force-dynamic';
export const maxDuration = 30;

/**
 * 2026-08-05 follow-up to the Layer-3 login-storm incident (see
 * `lib/roosterLive/authRecovery/recoveryLock.ts` and `gmailOtpReader.ts`).
 *
 * The Gmail OAuth refresh token that Layer 3 (full Okta login + email-OTP
 * recovery) depends on hard-expires every ~7 days while the Google Cloud
 * OAuth consent screen stays in "Testing" publishing status — regardless of
 * how often it's used. Before this cron existed, that expiry was only ever
 * discovered *reactively*, at the worst possible time: mid-outage, when
 * Layer 1+2 had already failed and Layer 3 needed Gmail and found it dead
 * too, sometimes triggering the very login-storm this incident is named
 * after.
 *
 * This is a cheap, read-only, once-daily proactive check completely
 * decoupled from the Rooster auth-recovery path (never touches Okta, never
 * triggers a login, never sends an OTP email) — it just calls Gmail's own
 * `getProfile` to see if the stored refresh token still works. On failure,
 * it sends ONE clear "rotate the Gmail token now, before it causes an
 * outage" alert per day, so rotation becomes a predictable ~7-day routine
 * task instead of a surprise firefight discovered by a live sync failure.
 */
export async function GET(req: NextRequest) {
  if (!isCronAuthorized(req)) {
    logStructured('warn', 'cron_unauthorized', { route: 'gmail-oauth-health-check' });
    return NextResponse.json({ success: false, error: 'Unauthorized cron' }, { status: 401 });
  }

  if (!isGmailOAuthConfigured()) {
    // Nothing to check -- Layer 3 is already skipped entirely in this state
    // (see engine.ts's isFullAuthRecoveryConfigured), so there's no
    // "recurring expiry" risk to warn about.
    return NextResponse.json({ success: true, skipped: true, reason: 'gmail_oauth_not_configured' });
  }

  try {
    const gmail = getGmailClient();
    const profile = await gmail.users.getProfile({ userId: 'me' });
    logStructured('info', 'gmail_oauth_health_check_ok', { emailAddress: profile.data.emailAddress });
    return NextResponse.json({ success: true, healthy: true, emailAddress: profile.data.emailAddress });
  } catch (err: any) {
    const reason = describeGmailAuthError(err);
    logStructured('error', 'gmail_oauth_health_check_failed', { reason });

    await sendAdminTelegramNotificationSafe({
      type: 'system_alert',
      alertTitle: '🔑 *تنبيه استباقي: صلاحية Gmail OAuth (الخاصة بقراءة أكواد Rooster) منتهية*',
      alertMessage:
        `الفحص اليومي الاستباقي لصلاحية قراءة Gmail (المستخدمة لقراءة أكواد OTP الخاصة بتسجيل دخول Rooster تلقائيًا) ` +
        `اكتشف إنها منتهية أو مسحوبة — قبل ما تسبب أي مشكلة فعلية في المزامنة.\n\n` +
        `*السبب:* ${reason}\n\n` +
        `*الإجراء المطلوب (خطوة واحدة، محليًا على جهازك):*\n` +
        `1) شغّل: node scripts/gmail-oauth-bootstrap.mjs\n` +
        `2) سجّل دخول في المتصفح اللي هيفتح تلقائي بحساب Gmail المستخدم\n` +
        `3) انسخ الـ GMAIL_OAUTH_REFRESH_TOKEN الجديد وحدّثه في Vercel (Production Environment Variables)\n` +
        `4) أعد نشر المشروع (Redeploy) عشان يقرأ القيمة الجديدة\n\n` +
        `ده هيتكرر كل حوالي 7 أيام لحد ما تُنشر شاشة موافقة Google OAuth كـ"Production" بدل "Testing" — راجع ` +
        `docs/ROOSTER_LIVE.md قسم SRS-012 للتفاصيل.`,
      priority: 'high',
      url: `${process.env.NEXT_PUBLIC_APP_URL || ''}/live-riders`,
    });

    return NextResponse.json({ success: false, error: reason }, { status: 502 });
  }
}
