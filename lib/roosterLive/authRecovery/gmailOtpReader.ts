/**
 * SRS-012 Layer 3 — reads the Okta email-OTP code from Gmail via IMAP.
 *
 * Switched from Gmail API + OAuth to Gmail IMAP + App Password on
 * 2026-08-05 after the 2026-08-03 incident where Google's hard 7-day
 * refresh-token expiry (Testing-mode consent screen) killed Layer 3
 * mid-outage. An App Password never expires automatically.
 *
 * Flow (unchanged from the caller's perspective):
 *   Okta → sends OTP email → no-reply@okta.deliveryhero.com
 *   → forwarded to personal Gmail (mohamed.ragab2398@gmail.com)
 *   → this module polls that inbox via IMAP until the email lands.
 */
import { createImapClient, describeImapError, getGmailImapConfig, isGmailImapConfigured } from '@/lib/gmailImap';
import { logStructured } from '@/lib/requestTrace';

const OKTA_SENDER = 'no-reply@okta.deliveryhero.com';
const SUBJECT_KEYWORD = 'verification code';

function extractOtpFromText(text: string): string | null {
  // Prefer a 6-digit number appearing near "code" (case-insensitive),
  // fall back to any standalone 6-digit number in the message.
  const nearCode = text.match(/code[^\d]{0,40}(\d{6})\b/i);
  if (nearCode) return nearCode[1];
  const anyCode = text.match(/\b(\d{6})\b/);
  return anyCode ? anyCode[1] : null;
}

export type OtpWaitResult = { success: true; code: string } | { success: false; reason: string };

/**
 * Describes an IMAP auth failure in actionable terms.
 * Kept here (instead of lib/gmailImap.ts) because the health-check cron
 * and gmailOtpReader both import it from this path.
 */
export function describeGmailAuthError(err: any): string {
  return describeImapError(err);
}

/**
 * Tries one IMAP poll cycle: connects, searches for Okta OTP emails
 * arrived after `sinceEpochMs`, extracts the 6-digit code from any new
 * unseen message. Returns the code on success, null if nothing found yet,
 * or throws on a fatal auth error (no point retrying).
 */
async function pollImapOnce(sinceEpochMs: number, seenUids: Set<number>): Promise<string | null> {
  const config = getGmailImapConfig();
  const client = createImapClient(config);

  try {
    await client.connect();
    const lock = await client.getMailboxLock('INBOX');
    try {
      // IMAP SINCE is day-granular — use start-of-day so we don't miss
      // emails sent just before midnight. We re-check exact internalDate below.
      const sinceDate = new Date(sinceEpochMs - 30_000); // 30s clock-skew buffer
      sinceDate.setHours(0, 0, 0, 0);

      // search() returns false on error, or number[] of UIDs.
      const searchResult = await client.search(
        { from: OKTA_SENDER, since: sinceDate, subject: SUBJECT_KEYWORD },
        { uid: true }
      );
      const uids: number[] = searchResult === false ? [] : searchResult;

      for (const uid of uids) {
        if (seenUids.has(uid)) continue;

        // Fetch metadata first to filter by exact arrival time cheaply.
        const meta = await client.fetchOne(String(uid), { internalDate: true, envelope: true }, { uid: true });
        if (!meta) { seenUids.add(uid); continue; }

        // internalDate can be Date or string — normalise to ms.
        const arrivedAt =
          meta.internalDate instanceof Date
            ? meta.internalDate.getTime()
            : meta.internalDate
              ? new Date(meta.internalDate).getTime()
              : 0;

        // Discard emails that arrived before this login attempt started
        // (e.g. a leftover OTP from a previous failed attempt earlier today).
        if (arrivedAt && arrivedAt < sinceEpochMs - 30_000) {
          seenUids.add(uid);
          continue;
        }

        seenUids.add(uid);

        // Fetch full message source for OTP extraction.
        const full = await client.fetchOne(String(uid), { source: true }, { uid: true });
        if (!full || !full.source) continue;

        const code = extractOtpFromText(full.source.toString());
        if (code) {
          logStructured('info', 'rooster_gmail_otp_found', { uid });
          return code;
        }
        logStructured('warn', 'rooster_gmail_otp_message_no_code', { uid });
      }

      return null;
    } finally {
      lock.release();
    }
  } finally {
    await client.logout().catch(() => {});
  }
}

/**
 * Polls Gmail via IMAP for the OTP email that should arrive shortly after
 * `oktaAuthnClient.triggerEmailFactorSend` is called. Bounded by
 * `timeoutMs` (default 90s) with `pollIntervalMs` between checks
 * (default 5s).
 */
export async function waitForOktaOtpEmail(params: {
  /** epoch ms of when the login attempt started — filters out stale OTPs. */
  sinceEpochMs: number;
  timeoutMs?: number;
  pollIntervalMs?: number;
}): Promise<OtpWaitResult> {
  if (!isGmailImapConfigured()) {
    return { success: false, reason: 'gmail_imap_not_configured' };
  }

  const timeoutMs = params.timeoutMs ?? 90_000;
  const pollIntervalMs = params.pollIntervalMs ?? 5_000;
  const deadline = Date.now() + timeoutMs;
  const seenUids = new Set<number>();

  while (Date.now() < deadline) {
    try {
      const code = await pollImapOnce(params.sinceEpochMs, seenUids);
      if (code) return { success: true, code };
    } catch (err: any) {
      const reason = describeImapError(err);
      logStructured('error', 'rooster_gmail_otp_poll_error', {
        error: err?.message || String(err),
        reason,
      });
      // Auth errors are fatal — retrying won't help.
      if (/AUTHENTICATIONFAILED|authentication failed|Invalid credentials|LOGIN failed/i.test(
        String(err?.message || err || '')
      )) {
        return { success: false, reason };
      }
      // Transient network errors: log and continue polling.
    }

    await new Promise((resolve) => setTimeout(resolve, pollIntervalMs));
  }

  logStructured('error', 'rooster_gmail_otp_timeout', { timeoutMs });
  return { success: false, reason: 'otp_email_timeout' };
}
