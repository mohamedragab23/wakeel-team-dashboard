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

describe('S4a ghost_riders_export + missing_data_audit feature ACL', () => {
  beforeEach(() => __resetSessionVersionMemoryForTests());

  it('full admin allowed for both features', async () => {
    const u = jwt('admin', 'FULL', '');
    assert.equal(await statusOf(await assertAdminApiAccess(u, 'ghost_riders_export')), null);
    assert.equal(await statusOf(await assertAdminApiAccess(u, 'missing_data_audit')), null);
  });

  it('limited admin with matching feature allowed', async () => {
    const ghost = jwt('admin', 'L1', 'limited:ghost_riders_export,dashboard');
    const missing = jwt('admin', 'L2', 'limited:missing_data_audit');
    assert.equal(await statusOf(await assertAdminApiAccess(ghost, 'ghost_riders_export')), null);
    assert.equal(await statusOf(await assertAdminApiAccess(missing, 'missing_data_audit')), null);
  });

  it('limited admin without matching feature gets 403', async () => {
    const u = jwt('admin', 'L3', 'limited:dashboard,riders');
    assert.equal(await statusOf(await assertAdminApiAccess(u, 'ghost_riders_export')), 403);
    assert.equal(await statusOf(await assertAdminApiAccess(u, 'missing_data_audit')), 403);
  });

  it('non-admin denied', async () => {
    const s = jwt('supervisor', 'S1', '');
    const rm = jwt('recruitment_manager', 'RM1', '');
    assert.equal(await statusOf(await assertAdminApiAccess(s, 'ghost_riders_export')), 401);
    assert.equal(await statusOf(await assertAdminApiAccess(rm, 'missing_data_audit')), 401);
  });

  it('routes wire assertAdminApiAccess with correct feature keys', () => {
    const ghost = readFileSync(
      join(process.cwd(), 'app/api/admin/ghost-riders-export/route.ts'),
      'utf8'
    );
    const missing = readFileSync(
      join(process.cwd(), 'app/api/admin/missing-data-audit/route.ts'),
      'utf8'
    );
    assert.ok(ghost.includes("assertAdminApiAccess(decoded, 'ghost_riders_export')"));
    assert.ok(missing.includes("assertAdminApiAccess(decoded, 'missing_data_audit')"));
    assert.ok(ghost.includes('extractBearerToken'));
    assert.ok(missing.includes('extractBearerToken'));
  });
});
