/**
 * Gmail IMAP helper using an App Password.
 *
 * Replaces the Gmail OAuth approach (`lib/gmailOAuth.ts`) that was
 * broken by Google's hard 7-day refresh-token expiry while the consent
 * screen stayed in "Testing" mode (2026-08-03 login-storm incident).
 *
 * An App Password is permanently valid until the account owner explicitly
 * revokes it — no recurring rotation needed.
 *
 * Env vars required:
 *   GMAIL_IMAP_USER     — Gmail address  (e.g. mohamed.ragab2398@gmail.com)
 *   GMAIL_IMAP_PASSWORD — 16-char App Password WITHOUT spaces
 *                         (myaccount.google.com/apppasswords → "Wakeel Dashboard")
 *
 * IMAP settings (fixed, no env var needed):
 *   host: imap.gmail.com  port: 993  secure: true (TLS)
 */
import { ImapFlow } from 'imapflow';

export function isGmailImapConfigured(): boolean {
  return !!(process.env.GMAIL_IMAP_USER?.trim() && process.env.GMAIL_IMAP_PASSWORD?.trim());
}

export function getGmailImapConfig(): { user: string; password: string } {
  const user = process.env.GMAIL_IMAP_USER?.trim();
  const password = process.env.GMAIL_IMAP_PASSWORD?.trim();
  if (!user || !password) {
    throw new Error(
      'Gmail IMAP not configured. Set GMAIL_IMAP_USER and GMAIL_IMAP_PASSWORD ' +
        '(App Password from myaccount.google.com/apppasswords).'
    );
  }
  return { user, password };
}

export function createImapClient(config: { user: string; password: string }): ImapFlow {
  return new ImapFlow({
    host: 'imap.gmail.com',
    port: 993,
    secure: true,
    auth: { user: config.user, pass: config.password },
    logger: false,
    tls: { rejectUnauthorized: true },
  });
}

/**
 * Lightweight connectivity check — connects, authenticates, then immediately
 * logs out. Used by the daily health-check cron to verify the App Password
 * is still valid before it causes a live-sync failure.
 */
export async function testGmailImapConnection(): Promise<{ ok: true; user: string } | { ok: false; reason: string }> {
  if (!isGmailImapConfigured()) {
    return { ok: false, reason: 'gmail_imap_not_configured' };
  }
  const config = getGmailImapConfig();
  const client = createImapClient(config);
  try {
    await client.connect();
    await client.logout();
    return { ok: true, user: config.user };
  } catch (err: any) {
    return { ok: false, reason: describeImapError(err) };
  }
}

export function describeImapError(err: any): string {
  const raw = String(err?.message || err || '');
  if (/AUTHENTICATIONFAILED|authentication failed|Invalid credentials|LOGIN failed/i.test(raw)) {
    return (
      `gmail_imap_auth_failed — the App Password was revoked or is incorrect. ` +
      'Fix: generate a new App Password at myaccount.google.com/apppasswords and update GMAIL_IMAP_PASSWORD in Vercel.'
    );
  }
  if (/ECONNREFUSED|ETIMEDOUT|ENOTFOUND/i.test(raw)) {
    return `gmail_imap_network_error: ${raw}`;
  }
  return `gmail_imap_error: ${raw}`;
}
