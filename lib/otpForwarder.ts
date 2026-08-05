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
 * Detection strategy (important):
 *   We do NOT rely on the IMAP UNSEEN flag. Opening Gmail in a browser, or
 *   the old Apps Script's `markRead()`, both flip emails to Seen within
 *   seconds — faster than a 1-minute cron can catch them. Instead we search
 *   for Okta OTP emails arrived in the last LOOKBACK_MS window and dedupe
 *   by UID in Redis (`otp_forwarder:uid:{uid}`).
 */
import { createImapClient, getGmailImapConfig, isGmailImapConfigured } from '@/lib/gmailImap';
import { redisCacheGet, redisCacheSet } from '@/lib/redisCache.optional';
import { isUpstashConfigured, redisSetNx } from '@/lib/upstashRest';
import { logStructured } from '@/lib/requestTrace';

const OKTA_SENDER = 'no-reply@okta.deliveryhero.com';
const SUBJECT_KEYWORD = 'verification code';
/** How far back to look for new OTP emails each poll. */
const LOOKBACK_MS = 10 * 60 * 1000;
/** Redis TTL for a forwarded UID — longer than LOOKBACK so we never re-send. */
const UID_SENT_TTL_SECONDS = 30 * 60;

export type ForwardResult =
  | { forwarded: true; otp: string; uid: number }
  | { forwarded: false; reason: string; checked?: number };

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

async function alreadyForwardedUid(uid: number): Promise<boolean> {
  const existing = await redisCacheGet<string>(`otp_forwarder:uid:${uid}`);
  return existing === '1';
}

async function markUidForwarded(uid: number): Promise<boolean> {
  const key = `otp_forwarder:uid:${uid}`;
  if (isUpstashConfigured()) {
    // Atomic claim: only one concurrent cron instance may proceed to send.
    const claimed = await redisSetNx(key, '1', UID_SENT_TTL_SECONDS);
    return claimed;
  }
  // No Redis: best-effort local mark (single-instance / local only).
  await redisCacheSet(key, '1', UID_SENT_TTL_SECONDS * 1000);
  return true;
}

/**
 * Scans Gmail for Okta OTP emails arrived in the last LOOKBACK_MS window
 * (regardless of Seen/Unseen), extracts the newest un-forwarded code, and
 * posts it to جروب الأكواد.
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
  const sinceCutoff = Date.now() - LOOKBACK_MS;

  try {
    await client.connect();
    const lock = await client.getMailboxLock('INBOX');
    try {
      // IMAP SINCE is day-granular; we re-filter by exact internalDate below.
      const sinceDate = new Date(sinceCutoff);
      sinceDate.setHours(0, 0, 0, 0);

      const searchResult = await client.search(
        { from: OKTA_SENDER, subject: SUBJECT_KEYWORD, since: sinceDate },
        { uid: true }
      );
      const uids: number[] = searchResult === false ? [] : searchResult;
      if (uids.length === 0) {
        return { forwarded: false, reason: 'no_recent_otp' };
      }

      // Newest first — supervisors need the code they just requested.
      const sorted = [...uids].sort((a, b) => b - a);
      let checked = 0;

      for (const uid of sorted) {
        if (await alreadyForwardedUid(uid)) continue;

        const meta = await client.fetchOne(
          String(uid),
          { bodyStructure: true, envelope: true, internalDate: true },
          { uid: true }
        );
        if (!meta) continue;

        const arrivedAt =
          meta.internalDate instanceof Date
            ? meta.internalDate.getTime()
            : meta.internalDate
              ? new Date(meta.internalDate).getTime()
              : 0;

        // Skip emails older than the lookback window (IMAP SINCE is day-level).
        if (arrivedAt && arrivedAt < sinceCutoff) continue;

        checked++;

        const emailText = await downloadDecodedText(client, uid, meta.bodyStructure);
        const otp = extractOtp(emailText);
        if (!otp) {
          // Claim the UID anyway so we don't re-process a malformed email every minute.
          await markUidForwarded(uid);
          logStructured('warn', 'otp_forwarder_no_code', { uid });
          continue;
        }

        // Atomic claim before sending — prevents double-post if two cron
        // invocations overlap on the same UID.
        const claimed = await markUidForwarded(uid);
        if (!claimed) {
          return { forwarded: false, reason: 'already_claimed', checked };
        }

        try {
          await sendOtpToTelegram(otp);
        } catch (err) {
          // Release the claim on send failure so the next poll can retry.
          // (Best-effort: if Redis DEL fails the UID stays claimed for TTL.)
          const { redisDel } = await import('@/lib/upstashRest');
          await redisDel(`otp_forwarder:uid:${uid}`).catch(() => {});
          throw err;
        }

        logStructured('info', 'otp_forwarder_sent', { uid, otp });
        return { forwarded: true, otp, uid };
      }

      return { forwarded: false, reason: checked === 0 ? 'no_new_otp' : 'all_checked_no_send', checked };
    } finally {
      lock.release();
    }
  } finally {
    await client.logout().catch(() => {});
  }
}
