import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { NextRequest } from 'next/server';
import { GET } from '@/app/api/admin/equipment-wallet-import/route';

describe('equipment-wallet-import GET auth (S3)', () => {
  it('rejects unauthenticated GET with 401 and existing error shape', async () => {
    const req = new NextRequest('https://example.com/api/admin/equipment-wallet-import');
    const res = await GET(req);
    assert.equal(res.status, 401);
    const body = await res.json();
    assert.equal(body.success, false);
    assert.equal(body.error, 'غير مصرح');
  });
});
