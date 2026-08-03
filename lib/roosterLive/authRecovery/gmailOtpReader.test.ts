import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { describeGmailAuthError } from './gmailOtpReader';

describe('describeGmailAuthError (2026-08-03 live incident: 7-day Testing-mode token expiry)', () => {
  it('recognizes invalid_grant as the Testing-mode 7-day refresh-token expiry and points at the fix', () => {
    const reason = describeGmailAuthError(new Error('invalid_grant'));
    assert.match(reason, /gmail_oauth_token_expired_or_revoked/);
    assert.match(reason, /gmail-oauth-bootstrap\.mjs/);
    assert.match(reason, /GMAIL_OAUTH_REFRESH_TOKEN/);
  });

  it('recognizes the googleapis "Token has been expired or revoked" message shape too', () => {
    const reason = describeGmailAuthError(new Error('Token has been expired or revoked.'));
    assert.match(reason, /gmail_oauth_token_expired_or_revoked/);
  });

  it('falls back to a plain gmail_api_error label for unrelated failures (e.g. a network blip)', () => {
    const reason = describeGmailAuthError(new Error('fetch failed: ECONNRESET'));
    assert.equal(reason, 'gmail_api_error: fetch failed: ECONNRESET');
    assert.doesNotMatch(reason, /gmail_oauth_token_expired_or_revoked/);
  });

  it('handles non-Error thrown values without crashing', () => {
    const reason = describeGmailAuthError('invalid_client');
    assert.match(reason, /gmail_oauth_token_expired_or_revoked/);
  });
});
