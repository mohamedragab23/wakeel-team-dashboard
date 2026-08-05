/**
 * Kill switch for the *automatic* (cron-triggered) Rooster pulls.
 *
 * Set to `true` on 2026-08-03 during the login-storm incident caused by
 * the Gmail OAuth refresh-token expiry. Restored to `false` on 2026-08-05
 * after switching Layer 3 OTP reading from Gmail API + OAuth to
 * Gmail IMAP + App Password (env vars: GMAIL_IMAP_USER / GMAIL_IMAP_PASSWORD),
 * which is permanently valid and has no recurring expiry.
 *
 * Only affects the three *proactive* cron routes. Manual, user-initiated
 * actions (e.g. the dashboard "استيراد تلقائي من Rooster" button) are always
 * active regardless of this flag.
 */
export const ROOSTER_AUTO_SYNC_PAUSED = false;

export const ROOSTER_AUTO_SYNC_PAUSE_REASON =
  'تم إيقاف السحب التلقائي من Rooster مؤقتًا — راجع lib/roosterLive/autoSyncPause.ts للتفاصيل.';
