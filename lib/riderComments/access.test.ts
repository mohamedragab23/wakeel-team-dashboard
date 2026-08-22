import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { canAccessRiderCommentsByRiderCode } from '@/lib/riderComments/access';

describe('rider-comments access (S1 IDOR)', () => {
  it('admin may read any riderCode', () => {
    assert.equal(
      canAccessRiderCommentsByRiderCode({ role: 'admin', code: 'A1' }, 'R999', []),
      true
    );
  });

  it('supervisor may read riders in their owned scope', () => {
    assert.equal(
      canAccessRiderCommentsByRiderCode(
        { role: 'supervisor', code: 'S1' },
        '4802535',
        ['4802535', '4801001']
      ),
      true
    );
  });

  it('supervisor may read when codes normalize equally', () => {
    assert.equal(
      canAccessRiderCommentsByRiderCode(
        { role: 'supervisor', code: 'S1' },
        '4802535',
        [' 4802535 ']
      ),
      true
    );
  });

  it('supervisor is denied for riderCode outside scope (cross-rider IDOR)', () => {
    assert.equal(
      canAccessRiderCommentsByRiderCode(
        { role: 'supervisor', code: 'S1' },
        'R-OTHER',
        ['4802535', '4801001']
      ),
      false
    );
  });

  it('supervisor with empty roster is denied', () => {
    assert.equal(
      canAccessRiderCommentsByRiderCode({ role: 'supervisor', code: 'S1' }, '4802535', []),
      false
    );
  });

  it('non-admin non-supervisor roles are denied', () => {
    assert.equal(
      canAccessRiderCommentsByRiderCode(
        { role: 'recruitment_manager', code: 'RM1' },
        '4802535',
        ['4802535']
      ),
      false
    );
  });

  it('empty riderCode cannot authorize', () => {
    assert.equal(
      canAccessRiderCommentsByRiderCode({ role: 'supervisor', code: 'S1' }, '', ['4802535']),
      false
    );
  });
});
