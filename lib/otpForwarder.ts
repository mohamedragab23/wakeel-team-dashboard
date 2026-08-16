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
 *
 * Latency:
 *   Vercel cron fires once per minute; inside that minute we poll Gmail every
 *   ~5s (`forwardOktaOtpsForWindow`) so codes typically reach جروب الأكواد
 *   within a few seconds of the email landing — closer to جروب الإشعارات.
import { createImapClient, getGmailImapConfig, isGmailImapConfigured } from '@/lib/gmailImap';
import { redisCacheGet, redisCacheSet } from '@/lib/redisCache.optional';
import { isUpstashConfigured, redisDel, redisGet, redisSetNx } from '@/lib/upstashRest';
import { logStructured } from '@/lib/requestTrace';

const OKTA_SENDER = 'no-reply@okta.deliveryhero.com';
const SUBJECT_KEYWORD = 'verification code';
/** How far back to look for new OTP emails each poll. */
const LOOKBACK_MS = 10 * 60 * 1000;
/** Redis TTL for a forwarded UID — longer than LOOKBACK so we never re-send. */
const UID_SENT_TTL_SECONDS = 30 * 60;
/** IMAP user flag — survives Redis misses / cold starts (Gmail keeps it). */
const FORWARDED_IMAP_FLAG = '$WakeelOtpFwd';

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
  // 1) Durable envelope mark (survives SET NX quirks — root cause of the
  //    2026-08-05 re-forward loop where raw "1" was unreadable via redisCacheGet).
  const marked = await redisCacheGet<string>(`otp_forwarder:uid:${uid}:mark`);
  if (marked === '1') return true;
  // 2) Raw SET NX claim key (same store as markUidForwarded).
  if (!isUpstashConfigured()) return false;
  const r = await redisGet(`otp_forwarder:uid:${uid}`);
  return r === '1';
}

async function markUidForwarded(uid: number): Promise<boolean> {
  const key = `otp_forwarder:uid:${uid}`;
  const markKey = `${key}:mark`;
  if (!isUpstashConfigured()) {
    // No Redis: allow send and rely on IMAP $WakeelOtpFwd flag for dedupe.
    logStructured('warn', 'otp_forwarder_no_redis', { uid });
    return true;
  }
  // Atomic claim — only one concurrent cron may proceed to send.
  const claimed = await redisSetNx(key, '1', UID_SENT_TTL_SECONDS);
  // Always write the envelope mark when we believe this UID is handled.
  // If NX lost the race, still refresh the mark so alreadyForwardedUid skips.
  await redisCacheSet(markKey, '1', UID_SENT_TTL_SECONDS * 1000);
  return claimed;
}

async function claimOtpValue(otp: string): Promise<boolean> {
  const markKey = `otp_forwarder:otp:${otp}:mark`;
  if ((await redisCacheGet<string>(markKey)) === '1') return false;
  if (!isUpstashConfigured()) return true;
  const claimed = await redisSetNx(`otp_forwarder:otp:${otp}`, '1', UID_SENT_TTL_SECONDS);
  if (!claimed) return false;
  await redisCacheSet(markKey, '1', UID_SENT_TTL_SECONDS * 1000);
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

  // Safety: never post OTP codes into جروب الإشعارات by misconfiguration.
  const codesChat = process.env.TELEGRAM_OTP_CODES_CHAT_ID.trim();
  const notifChat =
    process.env.TELEGRAM_ADMIN_GROUP_CHAT_ID?.trim() ||
    process.env.TELEGRAM_DEFAULT_CHAT_ID?.trim() ||
    '';
  if (notifChat && codesChat === notifChat) {
    logStructured('error', 'otp_forwarder_chat_collision', {
      message: 'TELEGRAM_OTP_CODES_CHAT_ID equals notifications group — refusing to send',
    });
    return { forwarded: false, reason: 'chat_collision' };
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
          { bodyStructure: true, envelope: true, internalDate: true, flags: true },
          { uid: true }
        );
        if (!meta) continue;

        const flags: Set<string> =
          meta.flags instanceof Set ? meta.flags : new Set(meta.flags ?? []);
        if (flags.has(FORWARDED_IMAP_FLAG)) {
          // Heal Redis claim if IMAP already marked this mail.
          await markUidForwarded(uid);
          continue;
        }

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
          await client
            .messageFlagsAdd(String(uid), [FORWARDED_IMAP_FLAG], { uid: true })
            .catch(() => {});
          logStructured('warn', 'otp_forwarder_no_code', { uid });
          continue;
        }

        // Atomic claim before sending — UID + OTP value (guards re-send if
        // the same code lands under a new UID, or UID claim was lost).
        const claimed = await markUidForwarded(uid);
        if (!claimed) {
          continue;
        }
        const otpClaimed = await claimOtpValue(otp);
        if (!otpClaimed) {
          await client
            .messageFlagsAdd(String(uid), [FORWARDED_IMAP_FLAG], { uid: true })
            .catch(() => {});
          logStructured('info', 'otp_forwarder_otp_already_sent', { uid, otp });
          continue;
        }

        try {
          await sendOtpToTelegram(otp);
          await client
            .messageFlagsAdd(String(uid), [FORWARDED_IMAP_FLAG], { uid: true })
            .catch((e) => {
              logStructured('warn', 'otp_forwarder_imap_flag_failed', {
                uid,
                error: e instanceof Error ? e.message : String(e),
              });
            });
        } catch (err) {
          // Release claims on send failure so the next poll can retry.
          await Promise.all([
            redisDel(`otp_forwarder:uid:${uid}`),
            redisDel(`otp_forwarder:otp:${otp}`),
          ]).catch(() => {});
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

/**
 * Near-real-time poll: keep scanning Gmail for most of one cron minute
 * (default every 5s) so جروب الأكواد gets codes close to email arrival —
 * same idea as notifications (push), but Gmail has no webhook so we poll tightly.
 *
 * Vercel cron min schedule is 1 minute; this burst fills the gap inside that minute.
 */
export async function forwardOktaOtpsForWindow(opts?: {
  windowMs?: number;
  intervalMs?: number;
}): Promise<{
  forwardedCount: number;
  last?: ForwardResult;
  polls: number;
}> {
  const windowMs = Math.max(5_000, opts?.windowMs ?? 50_000);
  const intervalMs = Math.max(3_000, opts?.intervalMs ?? 5_000);
  const deadline = Date.now() + windowMs;
  let forwardedCount = 0;
  let polls = 0;
  let last: ForwardResult | undefined;

  while (Date.now() < deadline) {
    polls += 1;
    try {
      const result = await forwardLatestOktaOtp();
      last = result;
      if (result.forwarded) {
        forwardedCount += 1;
        // After a successful send, immediately scan again for any backlog
        // without waiting the full interval.
        continue;
      }
      // Config errors — no point retrying this window.
      if (
        !result.forwarded &&
        (result.reason === 'gmail_imap_not_configured' ||
          result.reason === 'telegram_otp_not_configured' ||
          result.reason === 'chat_collision')
      ) {
        break;
      }
    } catch (err) {
      logStructured('error', 'otp_forwarder_burst_poll_failed', {
        error: err instanceof Error ? err.message : String(err),
        polls,
      });
    }

    const remaining = deadline - Date.now();
    if (remaining <= 0) break;
    await new Promise((r) => setTimeout(r, Math.min(intervalMs, remaining)));
  }

  logStructured('info', 'otp_forwarder_burst_done', { forwardedCount, polls, windowMs });
  return { forwardedCount, last, polls };
}

/**
 * When Layer-3 auth already read an OTP from Gmail, also push it to جروب الأكواد
 * immediately (deduped) so supervisors get it without waiting for the next cron tick.
 */
export async function forwardKnownOktaOtpToCodesGroup(otp: string): Promise<boolean> {
  const code = String(otp || '').trim();
  if (!/^\d{6}$/.test(code)) return false;
  if (!process.env.TELEGRAM_OTP_BOT_TOKEN?.trim() || !process.env.TELEGRAM_OTP_CODES_CHAT_ID?.trim()) {
    return false;
  }
  const codesChat = process.env.TELEGRAM_OTP_CODES_CHAT_ID.trim();
  const notifChat =
    process.env.TELEGRAM_ADMIN_GROUP_CHAT_ID?.trim() ||
    process.env.TELEGRAM_DEFAULT_CHAT_ID?.trim() ||
    '';
  if (notifChat && codesChat === notifChat) return false;

  const claimed = await claimOtpValue(code);
  if (!claimed) return false;
  try {
    await sendOtpToTelegram(code);
    logStructured('info', 'otp_forwarder_known_sent', { otp: code });
    return true;
  } catch (err) {
    await redisDel(`otp_forwarder:otp:${code}`).catch(() => {});
    logStructured('error', 'otp_forwarder_known_send_failed', {
      error: err instanceof Error ? err.message : String(err),
    });
    return false;
  }
}
