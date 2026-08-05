import { NextRequest, NextResponse } from 'next/server';
import { isCronAuthorized } from '@/lib/cronAuth';
import { logStructured } from '@/lib/requestTrace';
import { isGmailImapConfigured, testGmailImapConnection } from '@/lib/gmailImap';
import { sendAdminTelegramNotificationSafe } from '@/lib/adminTelegramNotifier';

export const dynamic = 'force-dynamic';
export const maxDuration = 30;

/**
 * Daily proactive IMAP connectivity check for the Gmail account used to
 * read Okta OTP emails during Layer 3 authentication recovery.
 *
 * Replaced the OAuth health-check on 2026-08-05 when the OTP reader
 * switched from Gmail API + OAuth to IMAP + App Password (eliminating
 * the recurring 7-day refresh-token expiry problem).
 *
 * An App Password can still be revoked manually or by a Google security
 * event — this check catches that proactively before a live-sync failure.
 */
export async function GET(req: NextRequest) {
  if (!isCronAuthorized(req)) {
    logStructured('warn', 'cron_unauthorized', { route: 'gmail-oauth-health-check' });
    return NextResponse.json({ success: false, error: 'Unauthorized cron' }, { status: 401 });
  }

  if (!isGmailImapConfigured()) {
    // Layer 3 is already skipped entirely when IMAP is not configured, so
    // there is nothing actionable to alert about.
    return NextResponse.json({ success: true, skipped: true, reason: 'gmail_imap_not_configured' });
  }

  const result = await testGmailImapConnection();

  if (result.ok) {
    logStructured('info', 'gmail_imap_health_check_ok', { user: result.user });
    return NextResponse.json({ success: true, healthy: true, user: result.user });
  }

  logStructured('error', 'gmail_imap_health_check_failed', { reason: result.reason });

  await sendAdminTelegramNotificationSafe({
    type: 'system_alert',
    alertTitle: '🔑 *تنبيه: App Password الخاص بـ Gmail (لقراءة أكواد OTP من Rooster) لا يعمل*',
    alertMessage:
      `الفحص اليومي لاتصال Gmail IMAP (المستخدم لقراءة أكواد OTP الخاصة بتسجيل دخول Rooster تلقائيًا) ` +
      `اكتشف مشكلة — قبل أن تسبب أي فشل فعلي في المزامنة.\n\n` +
      `*السبب:* ${result.reason}\n\n` +
      `*الإجراء المطلوب (خطوة واحدة):*\n` +
      `1) افتح: myaccount.google.com/apppasswords\n` +
      `2) احذف الـ App Password القديم "Wakeel Dashboard"\n` +
      `3) أنشئ App Password جديد واسمه "Wakeel Dashboard"\n` +
      `4) حدّث قيمة GMAIL_IMAP_PASSWORD في Vercel (Production Environment Variables)\n` +
      `5) أعد النشر (Redeploy) عشان يقرأ القيمة الجديدة`,
    priority: 'high',
    url: `${process.env.NEXT_PUBLIC_APP_URL || ''}/live-riders`,
  });

  return NextResponse.json({ success: false, error: result.reason }, { status: 502 });
}
