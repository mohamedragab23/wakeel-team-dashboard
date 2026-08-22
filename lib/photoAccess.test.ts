import assert from 'node:assert/strict';
import { describe, it, before } from 'node:test';
import {
  appendPhotoSignatureToUrl,
  signPhotoId,
  verifyPhotoSignature,
} from '@/lib/photoAccess';

describe('photoAccess signature TTL (S2)', () => {
  before(() => {
    if (!process.env.JWT_SECRET?.trim()) {
      process.env.JWT_SECRET = 'test-jwt-secret-for-photo-access-s2';
    }
  });

  it('accepts a freshly signed valid signature', () => {
    const now = 1_700_000_000_000;
    const { sig, exp } = signPhotoId('eq-abc-123', { nowMs: now, ttlMs: 3600_000 });
    assert.equal(verifyPhotoSignature('eq-abc-123', sig, exp, now + 1000), true);
  });

  it('rejects expired signatures', () => {
    const now = 1_700_000_000_000;
    const { sig, exp } = signPhotoId('eq-abc-123', { nowMs: now, ttlMs: 3600_000 });
    const afterExpiryMs = (exp + 1) * 1000;
    assert.equal(verifyPhotoSignature('eq-abc-123', sig, exp, afterExpiryMs), false);
  });

  it('accepts at the exact expiry second (boundary)', () => {
    const now = 1_700_000_000_000;
    const { sig, exp } = signPhotoId('eq-abc-123', { nowMs: now, ttlMs: 3600_000 });
    assert.equal(verifyPhotoSignature('eq-abc-123', sig, exp, exp * 1000), true);
  });

  it('rejects one second after expiry (boundary)', () => {
    const now = 1_700_000_000_000;
    const { sig, exp } = signPhotoId('eq-abc-123', { nowMs: now, ttlMs: 3600_000 });
    assert.equal(verifyPhotoSignature('eq-abc-123', sig, exp, exp * 1000 + 1000), false);
  });

  it('rejects tampered signature', () => {
    const now = 1_700_000_000_000;
    const { sig, exp } = signPhotoId('eq-abc-123', { nowMs: now, ttlMs: 3600_000 });
    const tampered = sig.slice(0, -1) + (sig.endsWith('a') ? 'b' : 'a');
    assert.equal(verifyPhotoSignature('eq-abc-123', tampered, exp, now), false);
  });

  it('rejects tampered expiry (same sig, different exp)', () => {
    const now = 1_700_000_000_000;
    const { sig, exp } = signPhotoId('eq-abc-123', { nowMs: now, ttlMs: 3600_000 });
    assert.equal(verifyPhotoSignature('eq-abc-123', sig, exp + 10_000, now), false);
  });

  it('rejects missing exp (legacy sig-only URLs)', () => {
    const now = 1_700_000_000_000;
    const { sig } = signPhotoId('eq-abc-123', { nowMs: now, ttlMs: 3600_000 });
    assert.equal(verifyPhotoSignature('eq-abc-123', sig, null, now), false);
    assert.equal(verifyPhotoSignature('eq-abc-123', sig, undefined, now), false);
    assert.equal(verifyPhotoSignature('eq-abc-123', sig, '', now), false);
  });

  it('rejects wrong photo id', () => {
    const now = 1_700_000_000_000;
    const { sig, exp } = signPhotoId('eq-abc-123', { nowMs: now, ttlMs: 3600_000 });
    assert.equal(verifyPhotoSignature('eq-other', sig, exp, now), false);
  });

  it('appendPhotoSignatureToUrl includes sig and exp query params', () => {
    const url = appendPhotoSignatureToUrl(
      'https://example.com/api/equipment-photos/eq-1',
      'eq-1'
    );
    assert.match(url, /[?&]sig=[0-9a-f]{32}/);
    assert.match(url, /[?&]exp=\d+/);
  });
});
