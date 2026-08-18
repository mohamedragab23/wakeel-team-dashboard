import assert from 'node:assert/strict';
import { afterEach, describe, it } from 'node:test';
import { NextRequest } from 'next/server';
import { isCronAuthorized } from '@/lib/cronAuth';

const SECRET = 'test-cron-secret-value-32chars!!';

function req(url: string, headers?: Record<string, string>): NextRequest {
  return new NextRequest(url, { headers });
}

describe('cron auth', () => {
  afterEach(() => {
    delete process.env.CRON_SECRET;
  });

  it('accepts Bearer and x-cron-secret headers', () => {
    process.env.CRON_SECRET = SECRET;
    assert.equal(
      isCronAuthorized(req('https://example.com/api/cron/x', { authorization: `Bearer ${SECRET}` })),
      true
    );
    assert.equal(
      isCronAuthorized(req('https://example.com/api/cron/x', { 'x-cron-secret': SECRET })),
      true
    );
  });

  it('rejects query-string cron_secret', () => {
    process.env.CRON_SECRET = SECRET;
    assert.equal(
      isCronAuthorized(req(`https://example.com/api/cron/x?cron_secret=${encodeURIComponent(SECRET)}`)),
      false
    );
  });

  it('rejects missing or wrong secret', () => {
    process.env.CRON_SECRET = SECRET;
    assert.equal(isCronAuthorized(req('https://example.com/api/cron/x')), false);
    assert.equal(
      isCronAuthorized(req('https://example.com/api/cron/x', { authorization: 'Bearer wrong' })),
      false
    );
  });
});
