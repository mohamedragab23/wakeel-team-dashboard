import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { beforeEach, describe, it } from 'node:test';
import { assertAdminApiAccess } from '@/lib/adminApiAccess';
import { __resetSessionVersionMemoryForTests } from '@/lib/sessionVersion';

async function statusOf(res: Response | null): Promise<number | null> {
  return res ? res.status : null;
}

function jwt(role: string, code: string, permissions: string, sv = 0) {
  return { role, code, permissions, sv, name: code };
}

describe('S4d supervisor-zone-map shifts feature ACL', () => {
  beforeEach(() => __resetSessionVersionMemoryForTests());

  it('allows full admin', async () => {
    assert.equal(await statusOf(await assertAdminApiAccess(jwt('admin', 'FULL', ''), 'shifts')), null);
  });

  it('allows limited admin with shifts feature', async () => {
    assert.equal(
      await statusOf(await assertAdminApiAccess(jwt('admin', 'L1', 'limited:shifts'), 'shifts')),
      null
    );
  });

  it('denies limited admin without shifts feature', async () => {
    assert.equal(
      await statusOf(await assertAdminApiAccess(jwt('admin', 'L2', 'limited:debug'), 'shifts')),
      403
    );
  });

  it('denies non-admin roles', async () => {
    assert.equal(await statusOf(await assertAdminApiAccess(jwt('supervisor', 'S1', ''), 'shifts')), 401);
    assert.equal(
      await statusOf(await assertAdminApiAccess(jwt('recruitment_manager', 'RM1', ''), 'shifts')),
      401
    );
  });

  it('route wires assertAdminApiAccess with shifts feature key and keeps zone filter', () => {
    const src = readFileSync(join(process.cwd(), 'app/api/admin/supervisor-zone-map/route.ts'), 'utf8');
    assert.ok(src.includes("assertAdminApiAccess(decoded, 'shifts')"));
    assert.ok(src.includes('filterSupervisorsForAdminDataScope'));
  });
});
