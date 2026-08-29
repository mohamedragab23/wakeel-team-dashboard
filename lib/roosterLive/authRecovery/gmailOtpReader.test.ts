import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { describeGmailAuthError } from './gmailOtpReader';

/**
 * `describeGmailAuthError` now just delegates to `lib/gmailImap.ts`'s
 * `describeImapError` (switched from Gmail API + OAuth to IMAP + App
 * Password on 2026-08-05 — see that module's own doc comment for why).
 * Kept as a thin re-export here since the health-check cron and
 * `gmailOtpReader` both import it from this path.
 */
describe('describeGmailAuthError (IMAP + App Password, post-2026-08-05)', () => {
  it('recognizes an invalid/revoked App Password and points at the fix', () => {
    const reason = describeGmailAuthError(new Error('Invalid credentials (Failure)'));
    assert.match(reason, /gmail_imap_auth_failed/);
    assert.match(reason, /myaccount\.google\.com\/apppasswords/);
    assert.match(reason, /GMAIL_IMAP_PASSWORD/);
  });

  it('recognizes an IMAP AUTHENTICATIONFAILED response the same way', () => {
    const reason = describeGmailAuthError(new Error('AUTHENTICATIONFAILED'));
    assert.match(reason, /gmail_imap_auth_failed/);
  });

  it('labels a network-level failure distinctly from an auth failure', () => {
    const reason = describeGmailAuthError(new Error('connect ETIMEDOUT 142.250.1.1:993'));
    assert.match(reason, /gmail_imap_network_error/);
    assert.doesNotMatch(reason, /gmail_imap_auth_failed/);
  });

  it('falls back to a plain gmail_imap_error label for anything else', () => {
    const reason = describeGmailAuthError(new Error('unexpected server response'));
    assert.equal(reason, 'gmail_imap_error: unexpected server response');
  });

  it('handles non-Error thrown values without crashing', () => {
    const reason = describeGmailAuthError('AUTHENTICATIONFAILED');
    assert.match(reason, /gmail_imap_auth_failed/);
  });
});
