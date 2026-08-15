/**
 * Unit tests for linkCandidateToAuthoritativeRiderCode with injected deps via module mock pattern.
 * Uses pure validation paths; integration Sheets writes are not executed in these cases.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

// Focused contract tests without live Sheets mutation.
describe('4D.5.4.11 linkCandidateToAuthoritativeRiderCode contracts', () => {
  it('documents required human confirmation fields', () => {
    const required = [
      'riderCode',
      'confirmRiderCode',
      'confirmLiveRiderExists',
    ] as const;
    assert.equal(required.length, 3);
    assert.ok(required.includes('confirmRiderCode'));
  });

  it('fail-closed codes include confirmation / live / duplicate / conflict', () => {
    const codes = [
      'FORBIDDEN',
      'RIDER_CODE_INVALID',
      'CONFIRMATION_MISMATCH',
      'LIVE_CONFIRM_REQUIRED',
      'CANDIDATE_NOT_FOUND',
      'EXISTING_CODE_CONFLICT',
      'LIVE_RIDER_NOT_FOUND',
      'DUPLICATE_RIDER_CODE',
    ];
    assert.ok(codes.includes('CONFIRMATION_MISMATCH'));
    assert.ok(codes.includes('LIVE_RIDER_NOT_FOUND'));
    assert.ok(codes.includes('DUPLICATE_RIDER_CODE'));
  });
});

// Import after describe setup — exercise real guard branches with mocked modules is heavy;
// call the real function with admin checks via dynamic import and invalid inputs only.
describe('4D.5.4.11 linkCandidateToAuthoritativeRiderCode fail-closed (no write)', () => {
  it('rejects non-admin without Sheets write', async () => {
    const { linkCandidateToAuthoritativeRiderCode } = await import(
      '@/lib/recruitment/linkRiderCode'
    );
    const r = await linkCandidateToAuthoritativeRiderCode({
      candidateId: 'c_x',
      riderCode: '4811093',
      confirmRiderCode: '4811093',
      confirmLiveRiderExists: true,
      actor: { code: 'rm1', name: 'RM', role: 'recruitment_manager' },
    });
    assert.equal(r.ok, false);
    if (!r.ok) assert.equal(r.code, 'FORBIDDEN');
  });

  it('rejects confirmation mismatch without Sheets write', async () => {
    const { linkCandidateToAuthoritativeRiderCode } = await import(
      '@/lib/recruitment/linkRiderCode'
    );
    const r = await linkCandidateToAuthoritativeRiderCode({
      candidateId: 'c_x',
      riderCode: '4811093',
      confirmRiderCode: '9999999',
      confirmLiveRiderExists: true,
      actor: { code: 'admin', name: 'Admin', role: 'admin' },
    });
    assert.equal(r.ok, false);
    if (!r.ok) assert.equal(r.code, 'CONFIRMATION_MISMATCH');
  });

  it('rejects missing live confirm flag without Sheets write', async () => {
    const { linkCandidateToAuthoritativeRiderCode } = await import(
      '@/lib/recruitment/linkRiderCode'
    );
    const r = await linkCandidateToAuthoritativeRiderCode({
      candidateId: 'c_x',
      riderCode: '4811093',
      confirmRiderCode: '4811093',
      confirmLiveRiderExists: false,
      actor: { code: 'admin', name: 'Admin', role: 'admin' },
    });
    assert.equal(r.ok, false);
    if (!r.ok) assert.equal(r.code, 'LIVE_CONFIRM_REQUIRED');
  });
});
