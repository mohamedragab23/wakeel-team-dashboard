/**
 * Session version unit tests (in-memory path; no Redis required).
 */
import assert from 'node:assert/strict';
import { beforeEach, describe, it } from 'node:test';
import {
  __resetSessionVersionMemoryForTests,
  assertSessionVersionValid,
  bumpSessionVersion,
  getSessionVersion,
  revokeAllSessionsForLoginCode,
  sessionVersionKey,
} from '@/lib/sessionVersion';

describe('sessionVersion', () => {
  beforeEach(() => {
    __resetSessionVersionMemoryForTests();
  });

  it('keys are role-scoped', () => {
    assert.notEqual(
      sessionVersionKey('admin', 'X1'),
      sessionVersionKey('recruitment_manager', 'X1')
    );
  });

  it('starts at 0 and increments', async () => {
    assert.equal(await getSessionVersion('admin', 'u1'), 0);
    assert.equal(await bumpSessionVersion('admin', 'u1'), 1);
    assert.equal(await bumpSessionVersion('admin', 'u1'), 2);
    assert.equal(await getSessionVersion('admin', 'u1'), 2);
  });

  it('revokeAllSessions bumps all principal roles', async () => {
    const r = await revokeAllSessionsForLoginCode('u2');
    assert.equal(r.admin, 1);
    assert.equal(r.recruitment_manager, 1);
    assert.equal(r.supervisor, 1);
  });

  it('missing sv treated as 0', async () => {
    assert.equal(
      await assertSessionVersionValid({ role: 'admin', code: 'u3' }),
      null
    );
    await bumpSessionVersion('admin', 'u3');
    assert.match(
      String(await assertSessionVersionValid({ role: 'admin', code: 'u3' })),
      /انتهت صلاحية الجلسة/
    );
  });
});
