/**
 * Okta OTP → Telegram forwarder ("جروب الأكواد").
 *
 * Replaces the slow Google Apps Script that used to poll Gmail, extract the
 * 6-digit Okta OTP, and post it to a dedicated Telegram group for supervisors.
 *
 * Naming convention for the two Telegram groups used by this project:
 *   • "جروب الإشعارات"  — TELEGRAM_ADMIN_GROUP_CHAT_ID
 *                         (system alerts / admin ops notifications)
 *   • "جروب الأكواد"    — TELEGRAM_OTP_CODES_CHAT_ID
 *                         (Okta OTP codes for supervisors — THIS module)
 *
 * Env vars required:
 *   GMAIL_IMAP_USER / GMAIL_IMAP_PASSWORD   — same App Password as Layer 3
 *   TELEGRAM_OTP_BOT_TOKEN                  — bot that is a member of جروب الأكواد
 *   TELEGRAM_OTP_CODES_CHAT_ID              — chat id of جروب الأكواد
 *
 * Dedup: Redis key `otp_forwarder:last_sent` stores the last OTP that was
 * successfully posted so a repeated poll of the same unread email (or a
 * re-delivery) never double-posts.
 */
import { createImapClient, getGmailImapConfig, isGmailImapConfigured } from '@/lib/gmailImap';
import { redisCacheGet, redisCacheSet } from '@/lib/redisCache.optional';
import { logStructured } from '@/lib/requestTrace';

const OKTA_SENDER = 'no-reply@okta.deliveryhero.com';
const SUBJECT_KEYWORD = 'verification code';
const LAST_SENT_KEY = 'otp_forwarder:last_sent';
const LAST_SENT_TTL_MS = 10 * 60 * 1000; // 10 minutes — OTPs expire well before this

export type ForwardResult =
  | { forwarded: true; otp: string; uid: number }
  | { forwarded: false; reason: string };

function extractOtp(text: string): string | null {
  const nearCode = text.match(/code[^\d]{0,40}(\d{6})\b/i);
  if (nearCode) return nearCode[1];
  const anyCode = text.match(/\b(\d{6})\b/);
  return anyCode ? anyCode[1] : null;
}

function findTextPlainPart(node: any): string | null {
  if (!node) return null;
  if ((node.type || '').toLowerCase() === 'text/plain') return node.part || null;
  for (const child of node.childNodes ?? []) {
    const found = findTextPlainPart(child);
    if (found) return found;
  }
  return null;
}

async function downloadDecodedText(client: any, uid: number, bodyStructure: any): Promise<string> {
  const textPath = findTextPlainPart(bodyStructure);
  const candidates = textPath ? [textPath, '1', '1.1'] : ['1', '1.1'];
  for (const part of candidates) {
    try {
      const dl = await client.download(String(uid), part, { uid: true });
      const chunks: Buffer[] = [];
      for await (const chunk of dl.content as AsyncIterable<Buffer>) {
        chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk as any));
      }
      const text = Buffer.concat(chunks).toString('utf8');
      if (text.trim()) return text;
    } catch {
      // try next candidate
    }
  }
  return '';
}

async function sendOtpToTelegram(otp: string): Promise<void> {
  const token = process.env.TELEGRAM_OTP_BOT_TOKEN?.trim();
  const chatId = process.env.TELEGRAM_OTP_CODES_CHAT_ID?.trim();
  if (!token || !chatId) {
    throw new Error('TELEGRAM_OTP_BOT_TOKEN or TELEGRAM_OTP_CODES_CHAT_ID not configured');
  }
  const url = `https://api.telegram.org/bot${token}/sendMessage`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      chat_id: chatId,
      text: `🔑 <b>رمز التحقق الجديد:</b> <code>${otp}</code>`,
      parse_mode: 'HTML',
    }),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`Telegram send failed (${res.status}): ${body}`);
  }
}

/**
 * Scans Gmail for the newest unread Okta OTP email, extracts the 6-digit
 * code, posts it to جروب الأكواد, and marks the email as read.
 *
 * Safe to call every minute — returns `{ forwarded: false }` when there is
 * nothing new to send (no unread mail, or the OTP was already forwarded).
 */
export async function forwardLatestOktaOtp(): Promise<ForwardResult> {
  if (!isGmailImapConfigured()) {
    return { forwarded: false, reason: 'gmail_imap_not_configured' };
  }
  if (!process.env.TELEGRAM_OTP_BOT_TOKEN?.trim() || !process.env.TELEGRAM_OTP_CODES_CHAT_ID?.trim()) {
    return { forwarded: false, reason: 'telegram_otp_not_configured' };
  }

  const config = getGmailImapConfig();
  const client = createImapClient(config);

  try {
    await client.connect();
    const lock = await client.getMailboxLock('INBOX');
    try {
      // Only unread Okta OTP emails — once we mark them read they won't reappear.
      const searchResult = await client.search(
        { from: OKTA_SENDER, subject: SUBJECT_KEYWORD, seen: false },
        { uid: true }
      );
      const uids: number[] = searchResult === false ? [] : searchResult;
      if (uids.length === 0) {
        return { forwarded: false, reason: 'no_unread_otp' };
      }

      // Process the newest unread message only (highest UID).
      const uid = Math.max(...uids);
      const meta = await client.fetchOne(
        String(uid),
        { bodyStructure: true, envelope: true },
        { uid: true }
      );
      if (!meta) {
        return { forwarded: false, reason: 'fetch_failed' };
      }

      const emailText = await downloadDecodedText(client, uid, meta.bodyStructure);
      const otp = extractOtp(emailText);
      if (!otp) {
        // Mark as read anyway so we don't keep re-processing a malformed email.
        await client.messageFlagsAdd(String(uid), ['\\Seen'], { uid: true });
        logStructured('warn', 'otp_forwarder_no_code', { uid });
        return { forwarded: false, reason: 'otp_not_found_in_email' };
      }

      // Dedup: skip if we already successfully posted this exact OTP.
      const lastSent = await redisCacheGet<string>(LAST_SENT_KEY);
      if (lastSent === otp) {
        await client.messageFlagsAdd(String(uid), ['\\Seen'], { uid: true });
        return { forwarded: false, reason: 'duplicate_otp' };
      }

      await sendOtpToTelegram(otp);
      await redisCacheSet(LAST_SENT_KEY, otp, LAST_SENT_TTL_MS);
      await client.messageFlagsAdd(String(uid), ['\\Seen'], { uid: true });

      logStructured('info', 'otp_forwarder_sent', { uid, otp });
      return { forwarded: true, otp, uid };
    } finally {
      lock.release();
    }
  } finally {
    await client.logout().catch(() => {});
  }
}
