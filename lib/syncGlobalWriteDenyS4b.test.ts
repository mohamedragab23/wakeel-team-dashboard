import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it } from 'node:test';
import { assertLimitedAdminGlobalWriteDenied } from '@/lib/adminZoneScope';

describe('S4b sync global-write deny for zone-limited admins', () => {
  it('denies limited admin with dataZone scope', () => {
    const res = assertLimitedAdminGlobalWriteDenied({
      role: 'admin',
      permissions: 'limited:performance_upload,riders',
      dataZone: 'Alexandria',
    });
    assert.ok(res);
    assert.equal(res!.status, 403);
  });

  it('allows full admin (no limited: permissions)', () => {
    const res = assertLimitedAdminGlobalWriteDenied({
      role: 'admin',
      permissions: '',
      dataZone: '',
    });
    assert.equal(res, null);
  });

  it('allows limited feature admin without zone/tree scope', () => {
    const res = assertLimitedAdminGlobalWriteDenied({
      role: 'admin',
      permissions: 'limited:performance_upload',
      dataZone: '',
    });
    assert.equal(res, null);
  });

  it('POST /api/sync wires assertLimitedAdminGlobalWriteDenied and does not invent a sync feature key', () => {
    const src = readFileSync(join(process.cwd(), 'app/api/sync/route.ts'), 'utf8');
    assert.ok(src.includes('assertLimitedAdminGlobalWriteDenied'));
    assert.ok(!src.includes("assertAdminApiAccess"));
    assert.ok(!src.includes('system_sync'));
  });
});
