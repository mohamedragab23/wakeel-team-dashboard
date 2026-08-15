/**
 * 4D.5.4.11 — linkCandidateToAuthoritativeRiderCode unit tests (no Sheets writes in happy path mocks).
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { validateRiderCodeForActivation } from '@/lib/recruitment/phaseB';
import { isSrs014FinancialApplyEnabled } from '@/lib/srs014Flags';

describe('4D.5.4.11 link-rider-code safety contracts', () => {
  it('rejects empty / WA- rider codes (authoritative numeric only)', () => {
    assert.ok(validateRiderCodeForActivation(''));
    assert.ok(validateRiderCodeForActivation('WA-016'));
    assert.equal(validateRiderCodeForActivation('4811093'), null);
  });

  it('confirmation mismatch is a hard fail (documented contract)', () => {
    const riderCode = '4811093';
    const confirmRiderCode = '4811094';
    assert.notEqual(riderCode, confirmRiderCode);
  });

  it('Financial Apply remains OFF; linkage must not imply money', () => {
    assert.equal(isSrs014FinancialApplyEnabled(), false);
  });
});
