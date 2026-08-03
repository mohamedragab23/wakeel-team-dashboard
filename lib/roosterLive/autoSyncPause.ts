/**
 * Temporary, code-level kill switch for the *automatic* (cron-triggered)
 * Rooster pulls — requested live on 2026-08-03 to stop hammering Okta with
 * a fresh login + Gmail-OTP request every ~1-3 minutes (`rooster-live-sync`
 * runs every single minute per `vercel.json`) while the Gmail OAuth
 * refresh token (expired, see `gmailOtpReader.ts`) gets rotated by the
 * account owner.
 *
 * Deliberately a hardcoded, source-controlled flag rather than a Vercel
 * environment variable: an env var change alone would need a fresh
 * deployment to take effect anyway (Vercel serverless functions read
 * `process.env` from the deployment they were built with), so there's no
 * "toggle without a deploy" benefit to gain — and a single flag here is
 * one obvious place to flip back (git-blame-able, shows up in this PR/diff)
 * instead of a Vercel dashboard setting nobody remembers to unset.
 *
 * Only affects the three *proactive* cron routes below. Manual,
 * user-initiated actions (e.g. the dashboard's "استيراد تلقائي من Rooster"
 * button) are untouched — pausing those wasn't requested and they only run
 * when someone deliberately clicks them, not automatically in the
 * background.
 *
 * TODO(remove after re-enabling): set back to `false` once the Gmail OAuth
 * refresh token has been rotated and a manual test succeeds, or a new
 * business day starts, whichever the account owner decides.
 */
export const ROOSTER_AUTO_SYNC_PAUSED = true;

export const ROOSTER_AUTO_SYNC_PAUSE_REASON =
  'تم إيقاف السحب التلقائي من Rooster مؤقتًا يدويًا (2026-08-03) لحد ما يتم تجديد Gmail OAuth refresh token — ' +
  'راجع scripts/gmail-oauth-bootstrap.mjs. الاستيراد اليدوي من صفحة الشفتات لسه شغال عادي.';
