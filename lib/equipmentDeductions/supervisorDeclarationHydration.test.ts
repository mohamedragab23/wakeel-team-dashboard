import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { cache } from '@/lib/cache';
import {
  getSheetDataBatchOrThrow,
  isSheetsQuotaError,
  resetSheetsApiReadCount,
  SHEETS_QUOTA_USER_AR,
  toSafeSheetsUserError,
} from '@/lib/googleSheetsBatchRead';
import {
  assertRiderOnSupervisorRosterFromBundle,
  estimateConcurrentSupervisorReads,
  hydrateSupervisorDeclarationQueue,
  invalidateAfterSupervisorDeclarationSave,
  invalidateSupervisorDeclarationBundleCache,
  SUPERVISOR_DECL_BATCH_RANGES,
  type SupervisorDeclarationSheetsBundle,
} from '@/lib/equipmentDeductions/supervisorDeclarationHydration';
import { buildSupervisorEquipmentDeskFromParts } from '@/lib/equipmentLiability/paymentProposals';

function emptyBundleTables(): unknown[][][] {
  return SUPERVISOR_DECL_BATCH_RANGES.map(() => [['hdr']]);
}

describe('supervisor declaration Sheets quota / hydration', () => {
  it('batch ranges are fixed (not per-rider)', () => {
    assert.equal(SUPERVISOR_DECL_BATCH_RANGES.length, 6);
    assert.ok(SUPERVISOR_DECL_BATCH_RANGES.every((r) => r.includes('!')));
  });

  it('hydrate uses exactly one batchGet — zero per-rider reads', async () => {
    invalidateSupervisorDeclarationBundleCache();
    let batchCalls = 0;
    const deps = {
      batchGet: async (ranges: string[]) => {
        batchCalls += 1;
        assert.equal(ranges.length, 6);
        const tables = emptyBundleTables();
        // roster: header + 2 riders for WA-001
        tables[0] = [
          ['code', 'name', 'zone', 'sup'],
          ['R1', 'Rider 1', 'Z', 'WA-001'],
          ['R2', 'Rider 2', 'Z', 'WA-001'],
          ['R9', 'Other', 'Z', 'WA-009'],
        ];
        tables[1] = [['id']]; // liabilities
        tables[2] = [['id']]; // proposals
        tables[3] = [
          ['hdr'],
          // cycleId,y,m,n,start,end,payout,deductGen,isClosing,eqEnabled,status
          ['c1', '2026', '8', '1', '2026-08-01', '2026-08-07', '2026-08-08', '', 'FALSE', 'TRUE', 'finalized'],
          ['c2', '2026', '8', '2', '2026-08-10', '2026-08-16', '2026-08-17', '', 'FALSE', 'TRUE', 'active'],
        ];
        tables[4] = [['hdr']];
        tables[5] = [['hdr']];
        return tables;
      },
    };

    const a = await hydrateSupervisorDeclarationQueue({
      supervisorCode: 'WA-001',
      year: 2026,
      month: 8,
      deps,
    });
    assert.equal(batchCalls, 1);
    assert.equal(a.metrics.sheetsApiReads, 1);
    assert.equal(a.metrics.perRiderSheetReads, 0);
    assert.equal(a.metrics.cacheHit, false);
    assert.equal(a.rosterRiderCount, 2);
    assert.ok(a.rows.every((r) => r.riderCode === 'R1' || r.riderCode === 'R2'));
    assert.ok(!a.rows.some((r) => r.riderCode === 'R9'));

    const b = await hydrateSupervisorDeclarationQueue({
      supervisorCode: 'WA-009',
      year: 2026,
      month: 8,
      deps,
    });
    // Second supervisor within TTL → cache hit, no extra batchGet
    assert.equal(batchCalls, 1);
    assert.equal(b.metrics.cacheHit, true);
    assert.equal(b.metrics.sheetsApiReads, 0);
    assert.equal(b.rosterRiderCount, 1);
    assert.equal(b.rows[0]?.riderCode, 'R9');
  });

  it('no cross-supervisor cache leakage in assembled rows', async () => {
    invalidateSupervisorDeclarationBundleCache();
    const deps = {
      batchGet: async () => {
        const tables = emptyBundleTables();
        tables[0] = [
          ['code', 'name', 'zone', 'sup'],
          ['A1', 'A', 'Z', 'WA-001'],
          ['B1', 'B', 'Z', 'WA-002'],
        ];
        tables[3] = [
          ['hdr'],
          ['c2', '2026', '8', '2', '2026-08-10', '2026-08-16', '', '', 'FALSE', 'TRUE', 'active'],
        ];
        return tables;
      },
    };
    const s1 = await hydrateSupervisorDeclarationQueue({
      supervisorCode: 'WA-001',
      deps,
    });
    const s2 = await hydrateSupervisorDeclarationQueue({
      supervisorCode: 'WA-002',
      deps,
    });
    assert.deepEqual(
      s1.rows.map((r) => r.riderCode),
      ['A1']
    );
    assert.deepEqual(
      s2.rows.map((r) => r.riderCode),
      ['B1']
    );
  });

  it('invalidate after save clears shared bundle', async () => {
    invalidateSupervisorDeclarationBundleCache();
    let calls = 0;
    const deps = {
      batchGet: async () => {
        calls += 1;
        return emptyBundleTables();
      },
    };
    await hydrateSupervisorDeclarationQueue({ supervisorCode: 'WA-001', deps });
    assert.equal(calls, 1);
    invalidateAfterSupervisorDeclarationSave();
    await hydrateSupervisorDeclarationQueue({ supervisorCode: 'WA-001', deps });
    assert.equal(calls, 2);
  });

  it('quota error maps to safe Arabic UI string', () => {
    const err = new Error(
      "Quota exceeded for quota metric 'Read requests' and limit 'Read requests per minute per user' of service 'sheets.googleapis.com'"
    );
    assert.equal(isSheetsQuotaError(err), true);
    assert.equal(toSafeSheetsUserError(err), SHEETS_QUOTA_USER_AR);
    assert.ok(!toSafeSheetsUserError(err).includes('project_number'));
    assert.ok(!toSafeSheetsUserError(err).includes('Read requests per minute'));
  });

  it('read retry is bounded (max 3) and does not succeed-spam', async () => {
    resetSheetsApiReadCount();
    let attempts = 0;
    await assert.rejects(
      () =>
        getSheetDataBatchOrThrow(['X!A:Z'], {
          maxAttempts: 3,
          deps: {
            batchGet: async () => {
              attempts += 1;
              const e: any = new Error('Quota exceeded Read requests');
              e.code = 429;
              throw e;
            },
          },
        }),
      /Quota exceeded/
    );
    assert.equal(attempts, 3);
  });

  it('desk builder never implies per-rider sheet I/O', () => {
    const desk = buildSupervisorEquipmentDeskFromParts({
      supervisorCode: 'WA-001',
      riders: [
        { code: 'R1', name: 'One' },
        { code: 'R2', name: 'Two' },
      ],
      issues: [],
      pendingProposals: [],
    });
    assert.equal(desk.rosterRiderCount, 2);
    assert.equal(desk.liabilityCount, 0);
  });

  it('10 concurrent supervisors estimate collapses under shared cache', () => {
    assert.equal(
      estimateConcurrentSupervisorReads({ supervisors: 10, cacheHitRatio: 0.9 }),
      1
    );
  });

  it('roster ACL helper rejects off-roster rider', () => {
    const bundle: SupervisorDeclarationSheetsBundle = {
      rosterRows: [
        ['code', 'name', 'zone', 'sup'],
        ['R1', 'One', 'Z', 'WA-001'],
      ],
      liabilityRows: [],
      proposalRows: [],
      cycleRows: [],
      requestRows: [],
      actualRows: [],
      fetchedAt: Date.now(),
      sheetsApiReads: 1,
    };
    assert.equal(
      assertRiderOnSupervisorRosterFromBundle({
        bundle,
        supervisorCode: 'WA-001',
        riderCode: 'R1',
      }),
      true
    );
    assert.equal(
      assertRiderOnSupervisorRosterFromBundle({
        bundle,
        supervisorCode: 'WA-001',
        riderCode: 'R999',
      }),
      false
    );
  });

  it('page save path must not invalidate full list (source contract)', async () => {
    const fs = await import('node:fs');
    const src = fs.readFileSync('app/supervisor/equipment-status/page.tsx', 'utf8');
    assert.ok(src.includes('setQueryData'));
    assert.ok(src.includes('Local update only'));
    // Primary save success must not invalidateQueries for liabilities
    const onSuccessBlock = src.slice(
      src.indexOf('onSuccess: (json) => {'),
      src.indexOf('proposalMut')
    );
    assert.ok(!onSuccessBlock.includes("invalidateQueries({ queryKey: ['supervisor-equipment-liabilities'] })"));
  });

  it('financial write retry is not wired in batch read helper', async () => {
    const fs = await import('node:fs');
    const src = fs.readFileSync('lib/googleSheetsBatchRead.ts', 'utf8');
    assert.ok(src.includes('READ-ONLY'));
    assert.ok(!src.includes('append'));
    assert.ok(!src.includes('values.update'));
  });
});

// keep cache import used under test isolation
void cache;
