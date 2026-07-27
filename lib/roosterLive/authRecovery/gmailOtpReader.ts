/**
 * SRS-012 Layer 3 — reads the Okta email-OTP code from Gmail automatically.
 *
 * Reuses the EXISTING forwarding the user already has set up
 * (Okta → eg.wakeel.ext@talabat.com → auto-forward → personal Gmail) and
 * the existing Apps Script/Telegram bot are completely untouched — this
 * reads the same inbox independently via the Gmail API (read-only scope).
 */
import { gmail_v1 } from 'googleapis';
import { getGmailClient, isGmailOAuthConfigured } from '@/lib/gmailOAuth';
import { logStructured } from '@/lib/requestTrace';

/**
 * Matches the forwarded Okta OTP email observed in production:
 *   From: no-reply@okta.deliveryhero.com
 *   Subject: Delivery Hero SE - Action Required: One-time verification code
 * Narrowed with `after:` (set by the caller to the exact moment the login
 * attempt started) so a stale/older OTP email is never picked up by
 * mistake.
 */
const GMAIL_SEARCH_QUERY = 'from:no-reply@okta.deliveryhero.com subject:"verification code"';

function decodeBase64Url(data: string): string {
  return Buffer.from(data.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8');
}

/** Recursively collects all text/plain + text/html body content from a MIME message. */
function collectTextParts(part: gmail_v1.Schema$MessagePart | undefined, out: string[]): void {
  if (!part) return;
  const mimeType = part.mimeType || '';
  if ((mimeType === 'text/plain' || mimeType === 'text/html') && part.body?.data) {
    out.push(decodeBase64Url(part.body.data));
  }
  for (const child of part.parts || []) {
    collectTextParts(child, out);
  }
}

function extractOtpCode(message: gmail_v1.Schema$Message): string | null {
  const parts: string[] = [];
  collectTextParts(message.payload, parts);
  if (message.snippet) parts.push(message.snippet);
  const text = parts.join('\n');

  // Prefer a 6-digit number appearing near "code" (case-insensitive),
  // fall back to any standalone 6-digit number in the message.
  const nearCode = text.match(/code[^\d]{0,40}(\d{6})\b/i);
  if (nearCode) return nearCode[1];

  const anyCode = text.match(/\b(\d{6})\b/);
  return anyCode ? anyCode[1] : null;
}

export type OtpWaitResult = { success: true; code: string } | { success: false; reason: string };

/**
 * Polls Gmail for the OTP email that should arrive shortly after
 * `oktaAuthnClient.triggerEmailFactorSend` is called. Bounded by
 * `timeoutMs` (default 90s) with `pollIntervalMs` between checks
 * (default 5s) — a normal SMTP-forward delay of a few seconds is expected;
 * this is generous but not unbounded.
 */
export async function waitForOktaOtpEmail(params: {
  /** epoch ms of when the login attempt started — narrows the Gmail search so an old OTP is never reused. */
  sinceEpochMs: number;
  timeoutMs?: number;
  pollIntervalMs?: number;
}): Promise<OtpWaitResult> {
  if (!isGmailOAuthConfigured()) {
    return { success: false, reason: 'gmail_oauth_not_configured' };
  }

  const gmail = getGmailClient();
  const timeoutMs = params.timeoutMs ?? 90_000;
  const pollIntervalMs = params.pollIntervalMs ?? 5_000;
  const deadline = Date.now() + timeoutMs;
  // Small buffer for clock skew between this process and Gmail's servers.
  const afterSeconds = Math.floor(params.sinceEpochMs / 1000) - 30;
  const seenMessageIds = new Set<string>();

  while (Date.now() < deadline) {
    try {
      const list = await gmail.users.messages.list({
        userId: 'me',
        q: `${GMAIL_SEARCH_QUERY} after:${afterSeconds}`,
        maxResults: 5,
      });

      for (const m of list.data.messages || []) {
        if (!m.id || seenMessageIds.has(m.id)) continue;
        seenMessageIds.add(m.id);

        const full = await gmail.users.messages.get({ userId: 'me', id: m.id, format: 'full' });
        const code = extractOtpCode(full.data);
        if (code) {
          logStructured('info', 'rooster_gmail_otp_found', { messageId: m.id });
          return { success: true, code };
        }
        logStructured('warn', 'rooster_gmail_otp_message_no_code', { messageId: m.id });
      }
    } catch (err: any) {
      logStructured('error', 'rooster_gmail_otp_poll_error', { error: err?.message || String(err) });
      return { success: false, reason: `gmail_api_error: ${err?.message || String(err)}` };
    }

    await new Promise((resolve) => setTimeout(resolve, pollIntervalMs));
  }

  logStructured('error', 'rooster_gmail_otp_timeout', { timeoutMs });
  return { success: false, reason: 'otp_email_timeout' };
}
