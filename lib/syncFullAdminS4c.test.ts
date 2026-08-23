import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it } from 'node:test';
import {
  assertFullAdminOnlyOperationDenied,
  assertLimitedAdminGlobalWriteDenied,
} from '@/lib/adminZoneScope';

describe('S4c sync full-admin-only authorization', () => {
  it('denies limited feature-only admin (no zone scope)', () => {
    const res = assertFullAdminOnlyOperationDenied({
      role: 'admin',
      permissions: 'limited:performance_upload,debug',
      dataZone: '',
    });
    assert.ok(res);
    assert.equal(res!.status, 403);
  });

  it('denies limited zone admin', () => {
    const res = assertFullAdminOnlyOperationDenied({
      role: 'admin',
      permissions: 'limited:shifts',
      dataZone: 'Alexandria',
    });
    assert.ok(res);
    assert.equal(res!.status, 403);
  });

  it('allows full admin (empty permissions)', () => {
    const res = assertFullAdminOnlyOperationDenied({
      role: 'admin',
      permissions: '',
    });
    assert.equal(res, null);
  });

  it('allows full admin (all permissions marker)', () => {
    const res = assertFullAdminOnlyOperationDenied({
      role: 'admin',
      permissions: 'all',
    });
    assert.equal(res, null);
  });

  it('zone-limited admin still denied by assertLimitedAdminGlobalWriteDenied after full-admin gate', () => {
    const full = assertFullAdminOnlyOperationDenied({
      role: 'admin',
      permissions: 'limited:performance_upload',
      dataZone: 'Alexandria',
    });
    assert.ok(full);
    const zone = assertLimitedAdminGlobalWriteDenied({
      role: 'admin',
      permissions: 'limited:performance_upload',
      dataZone: 'Alexandria',
    });
    assert.ok(zone);
  });

  it('POST /api/sync wires assertFullAdminOnlyOperationDenied without inventing a sync feature key', () => {
    const src = readFileSync(join(process.cwd(), 'app/api/sync/route.ts'), 'utf8');
    assert.ok(src.includes('assertFullAdminOnlyOperationDenied'));
    assert.ok(src.includes('assertLimitedAdminGlobalWriteDenied'));
    assert.ok(!src.includes("assertAdminApiAccess"));
    assert.ok(!src.includes('system_sync'));
  });
});
