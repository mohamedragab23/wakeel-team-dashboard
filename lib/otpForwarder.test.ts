import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { describeTelegramSendError, describePollError } from './otpForwarder';

/**
 * 2026-08-29 incident: جروب الأكواد silently stopped receiving Okta OTP
 * codes with zero alert, because every failed Telegram send / IMAP error
 * was caught, logged, and discarded — the cron always reported
 * success:true regardless. These tests cover the new classification logic
 * that makes such a failure both diagnosable and alertable going forward.
 */
describe('describeTelegramSendError', () => {
  it('recognizes an invalid/revoked bot token (401)', () => {
    const reason = describeTelegramSendError(401, JSON.stringify({ ok: false, description: 'Unauthorized' }));
    assert.match(reason, /telegram_bot_token_invalid/);
    assert.match(reason, /BotFather/);
    assert.match(reason, /TELEGRAM_OTP_BOT_TOKEN/);
  });

  it('recognizes the bot being removed/kicked from the group (403)', () => {
    const reason = describeTelegramSendError(
      403,
      JSON.stringify({ ok: false, description: 'Forbidden: bot was kicked from the group chat' })
    );
    assert.match(reason, /telegram_bot_forbidden/);
    assert.match(reason, /جروب الأكواد/);
  });

  it('recognizes a wrong/deleted chat id (400 chat not found)', () => {
    const reason = describeTelegramSendError(400, JSON.stringify({ ok: false, description: 'Bad Request: chat not found' }));
    assert.match(reason, /telegram_chat_not_found/);
    assert.match(reason, /TELEGRAM_OTP_CODES_CHAT_ID/);
  });

  it('recognizes a group-to-supergroup migration and extracts the new chat_id', () => {
    const reason = describeTelegramSendError(
      400,
      JSON.stringify({
        ok: false,
        description: 'Bad Request: group chat was upgraded to a supergroup chat',
        parameters: { migrate_to_chat_id: -1009988776655 },
      })
    );
    assert.match(reason, /telegram_group_migrated_to_supergroup/);
    assert.match(reason, /-1009988776655/);
    assert.match(reason, /TELEGRAM_OTP_CODES_CHAT_ID/);
  });

  it('falls back to a generic labeled reason for an unrecognized status/body', () => {
    const reason = describeTelegramSendError(500, JSON.stringify({ ok: false, description: 'Internal Server Error' }));
    assert.match(reason, /telegram_send_failed_500/);
  });

  it('handles a non-JSON response body without crashing', () => {
    const reason = describeTelegramSendError(502, '<html>Bad Gateway</html>');
    assert.match(reason, /telegram_send_failed_502/);
  });
});

describe('describePollError', () => {
  it('passes an already-classified telegram_ reason straight through', () => {
    const err = new Error('telegram_bot_forbidden (Forbidden) — البوت غير موجود في جروب الأكواد');
    assert.equal(describePollError(err), err.message);
  });

  it('routes anything else through the IMAP classifier', () => {
    const reason = describePollError(new Error('AUTHENTICATIONFAILED'));
    assert.match(reason, /gmail_imap_auth_failed/);
  });
});
