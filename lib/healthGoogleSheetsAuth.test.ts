import assert from 'node:assert/strict';
import { afterEach, before, describe, it } from 'node:test';
import { NextRequest } from 'next/server';
import jwt from 'jsonwebtoken';
import { isGoogleSheetsHealthAuthorized } from '@/lib/healthGoogleSheetsAuth';
import { getJwtSecret } from '@/lib/jwtConfig';

const CRON = 'test-cron-secret-google-sheets-s6!!';

function req(headers?: Record<string, string>): NextRequest {
  return new NextRequest('https://example.com/api/health/google-sheets', { headers });
}

describe('S6 google-sheets health authorization', () => {
  before(() => {
    if (!process.env.JWT_SECRET?.trim()) {
      process.env.JWT_SECRET = 'test-jwt-secret-for-google-sheets-s6';
    }
  });

  afterEach(() => {
    delete process.env.CRON_SECRET;
  });

  it('rejects unauthenticated requests even when NODE_ENV is not production', () => {
    const prev = process.env.NODE_ENV;
    process.env.NODE_ENV = 'development';
    try {
      assert.equal(isGoogleSheetsHealthAuthorized(req()), false);
    } finally {
      process.env.NODE_ENV = prev;
    }
  });

  it('allows valid cron Authorization Bearer', () => {
    process.env.CRON_SECRET = CRON;
    assert.equal(
      isGoogleSheetsHealthAuthorized(req({ authorization: `Bearer ${CRON}` })),
      true
    );
  });

  it('allows valid admin JWT', () => {
    const token = jwt.sign({ role: 'admin', code: 'A1', name: 'Admin' }, getJwtSecret(), {
      expiresIn: '1h',
    });
    assert.equal(
      isGoogleSheetsHealthAuthorized(req({ authorization: `Bearer ${token}` })),
      true
    );
  });

  it('rejects supervisor JWT', () => {
    const token = jwt.sign({ role: 'supervisor', code: 'S1' }, getJwtSecret(), {
      expiresIn: '1h',
    });
    assert.equal(
      isGoogleSheetsHealthAuthorized(req({ authorization: `Bearer ${token}` })),
      false
    );
  });
});
