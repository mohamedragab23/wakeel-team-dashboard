/**
 * 4D.5.4.15 — Controlled Opening Balance pilot tests.
 * Uses in-memory persist only — no Production Sheets writes in this suite.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { adminFeatureAllowed } from '@/lib/adminFeatureAccess';
import {
  buildOpeningLiabilityIssue,
  createOpeningLiability,
  defaultOpeningCatalogFromApprovedDefaults,
  type OpeningReconciliationInput,
} from '@/lib/equipmentLiability/openingBalance';
import {
  expectedDryRunForOpeningIssue,
  openingEntersOpenExpectedPopulation,
  parseOpeningPilotAllowlist,
  runControlledOpeningPilotPersist,
  verifyOpeningLiabilityReadOnly,
  OPENING_PILOT_BLOCKED_DIAGNOSTIC_RIDER,
} from '@/lib/equipmentLiability/openingPilot';
import {
  assertOpeningPilotPersistAllowed,
  isRiderOnOpeningPilotAllowlist,
  parseOpeningPilotAllowlist,
  validateOpeningPilotAllowlistConfig,
} from '@/lib/equipmentLiability/openingPilotAllowlist';
import type { EquipmentLiabilityIssue } from '@/lib/equipmentLiability/store';
import {
  isAutoEquipmentDeductionsEnabled,
  isSrs014FinancialApplyEnabled,
  isSrs014OpeningBalanceWriteEnabled,
} from '@/lib/srs014Flags';

const catalog = defaultOpeningCatalogFromApprovedDefaults();

function withPilotEnv(allowlist: string, fn: () => Promise<void> | void) {
  const prevW = process.env.FEATURE_SRS014_OPENING_BALANCE_WRITE_ENABLED;
  const prevA = process.env.FEATURE_SRS014_OPENING_PILOT_ALLOWLIST;
  process.env.FEATURE_SRS014_OPENING_BALANCE_WRITE_ENABLED = 'true';
  process.env.FEATURE_SRS014_OPENING_PILOT_ALLOWLIST = allowlist;
  const run = async () => {
    try {
      await fn();
    } finally {
      if (prevW === undefined) delete process.env.FEATURE_SRS014_OPENING_BALANCE_WRITE_ENABLED;
      else process.env.FEATURE_SRS014_OPENING_BALANCE_WRITE_ENABLED = prevW;
      if (prevA === undefined) delete process.env.FEATURE_SRS014_OPENING_PILOT_ALLOWLIST;
      else process.env.FEATURE_SRS014_OPENING_PILOT_ALLOWLIST = prevA;
    }
  };
  return run();
}

function baseInput(
  over: Partial<OpeningReconciliationInput> = {}
): OpeningReconciliationInput {
  return {
    riderCode: '9991001',
    motorcycleBagHeld: true,
    bicycleBagHeld: false,
    tshirtQuantity: 2,
    jacketQuantity: 0,
    helmetQuantity: 0,
    securityStatus: 'NOT_PAID',
    historicalPaidMilli: 0,
    operatorConfirmation: true,
    actorCode: 'admin-test',
    actorName: 'Admin Test',
    ...over,
  };
}

describe('4D.5.4.15 allowlist enforcement', () => {
  it('1. empty allowlist refuses persist', async () => {
    await withPilotEnv('', async () => {
      const g = assertOpeningPilotPersistAllowed('9991001');
      assert.equal(g.ok, false);
      if (g.ok) return;
      assert.equal(g.code, 'PILOT_ALLOWLIST_EMPTY');
    });
  });

  it('1b. rider not on allowlist refused', async () => {
    await withPilotEnv('9991001', async () => {
      const g = assertOpeningPilotPersistAllowed('9991002');
      assert.equal(g.ok, false);
      if (g.ok) return;
      assert.equal(g.code, 'RIDER_NOT_ON_PILOT_ALLOWLIST');
    });
  });

  it('1c. >3 eligible codes invalidate allowlist; 4811093 never eligible', () => {
    const tooMany = validateOpeningPilotAllowlistConfig(
      '9991001,9991002,9991003,9991004'
    );
    assert.equal(tooMany.ok, false);
    if (tooMany.ok) return;
    assert.equal(tooMany.code, 'PILOT_ALLOWLIST_TOO_LARGE');
    assert.deepEqual(parseOpeningPilotAllowlist('9991001,9991002,9991003,9991004'), []);

    const withDiag = validateOpeningPilotAllowlistConfig('9991001,4811093,9991002');
    assert.equal(withDiag.ok, true);
    if (!withDiag.ok) return;
    assert.deepEqual(withDiag.list, ['9991001', '9991002']);
    assert.equal(isRiderOnOpeningPilotAllowlist('4811093'), false);
  });

  it('1d. duplicate allowlist codes rejected', () => {
    const d = validateOpeningPilotAllowlistConfig('9991001,9991001');
    assert.equal(d.ok, false);
    if (d.ok) return;
    assert.equal(d.code, 'PILOT_ALLOWLIST_DUPLICATE');
  });

  it('1e. malformed allowlist token rejected', () => {
    const d = validateOpeningPilotAllowlistConfig('9991001,WA-016');
    assert.equal(d.ok, false);
    if (d.ok) return;
    assert.equal(d.code, 'PILOT_ALLOWLIST_MALFORMED');
  });

  it('1f. persist gate requires exactly ONE allowlisted rider (15B)', async () => {
    await withPilotEnv('9991001,9991002', async () => {
      const g = assertOpeningPilotPersistAllowed('9991001');
      assert.equal(g.ok, false);
      if (g.ok) return;
      assert.equal(g.code, 'PILOT_ALLOWLIST_MUST_BE_EXACTLY_ONE');
    });
  });

  it('16. 4811093 always blocked', async () => {
    await withPilotEnv('4811093,9991001', async () => {
      const g = assertOpeningPilotPersistAllowed('4811093');
      assert.equal(g.ok, false);
      if (g.ok) return;
      assert.equal(g.code, 'DIAGNOSTIC_RIDER_BLOCKED');
      assert.equal(OPENING_PILOT_BLOCKED_DIAGNOSTIC_RIDER, '4811093');
    });
  });
});

describe('4D.5.4.15 admin authorization', () => {
  it('2. equipment_liability required', () => {
    assert.equal(adminFeatureAllowed('limited:dashboard', 'equipment_liability'), false);
    assert.equal(adminFeatureAllowed('limited:equipment_liability', 'equipment_liability'), true);
    const route = readFileSync(
      join(process.cwd(), 'app/api/admin/equipment-reconciliation/route.ts'),
      'utf8'
    );
    assert.ok(route.includes("await assertAdminApiAccess(decoded, 'equipment_liability')"));
  });
});

describe('4D.5.4.15 successful write + idempotency + conflicts', () => {
  it('3. successful single Opening write (in-memory)', async () => {
    await withPilotEnv('9991001', async () => {
      const stored: EquipmentLiabilityIssue[] = [];
      const audits: Array<{ action: string }> = [];
      const r = await runControlledOpeningPilotPersist(baseInput(), catalog, {
        liveRiderExists: () => true,
        findByMigrationKey: async (k) =>
          stored.find((i) => i.deliveryRowRef === k) || null,
        persistIssue: async (issue) => {
          stored.push(issue);
        },
        appendAudit: async (e) => {
          audits.push(e);
        },
        acquireLocks: async () => ({ ok: true, release: async () => undefined }),
        countByMigrationKey: async (k) =>
          stored.filter((i) => i.deliveryRowRef === k).length,
      });
      assert.equal(r.ok, true);
      if (!r.ok) return;
      assert.equal(r.created, true);
      assert.equal(r.mode, 'PERSISTED');
      assert.equal(r.duplicateAttempt, false);
      assert.equal(r.issue.pricingSource, 'OPENING_MIGRATION');
      assert.equal(r.issue.deliveryRowRef, 'OPENING:9991001');
      assert.equal(r.issue.amountDeductedMilli, 0);
      assert.equal(r.verification.ok, true);
      assert.equal(r.auditAction, 'create_opening_liability');
      assert.equal(audits[0]?.action, 'create_opening_liability');
      assert.equal(r.financialSideEffects.walletMutated, false);
      assert.equal(r.financialSideEffects.ledgerMoneyMutated, false);
      assert.equal(stored.length, 1);
    });
  });

  it('4. duplicate idempotency returns existing without changing economics', async () => {
    await withPilotEnv('9991001', async () => {
      const first = buildOpeningLiabilityIssue(
        baseInput({ historicalPaidMilli: 10000 }),
        catalog
      );
      assert.ok(first.ok);
      if (!first.ok) return;
      const stored = [first.issue];
      let persistCalls = 0;
      const r = await runControlledOpeningPilotPersist(
        baseInput({ historicalPaidMilli: 50000 }),
        catalog,
        {
          liveRiderExists: () => true,
          findByMigrationKey: async () => stored[0],
          persistIssue: async () => {
            persistCalls += 1;
          },
          appendAudit: async () => undefined,
          acquireLocks: async () => ({ ok: true, release: async () => undefined }),
        }
      );
      assert.equal(r.ok, true);
      if (!r.ok) return;
      assert.equal(r.created, false);
      assert.equal(r.duplicateAttempt, true);
      assert.equal(r.issue.settlementPaidMilli, 10000);
      assert.equal(persistCalls, 0);
    });
  });

  it('5. existing conflicting open liability blocked', async () => {
    await withPilotEnv('9991001', async () => {
      const r = await runControlledOpeningPilotPersist(baseInput(), catalog, {
        liveRiderExists: () => true,
        hasOpenAssignmentLiability: () => true,
        persistIssue: async () => {
          throw new Error('no');
        },
        acquireLocks: async () => ({ ok: true, release: async () => undefined }),
      });
      assert.equal(r.ok, false);
      if (r.ok) return;
      assert.equal(r.code, 'OPEN_LIABILITY_EXISTS');
    });
  });

  it('17. concurrent duplicate protection', async () => {
    await withPilotEnv('9991001', async () => {
      const r = await runControlledOpeningPilotPersist(baseInput(), catalog, {
        liveRiderExists: () => true,
        persistIssue: async () => undefined,
        acquireLocks: async () => ({ ok: false, busy: true }),
      });
      assert.equal(r.ok, false);
      if (r.ok) return;
      assert.equal(r.code, 'CONCURRENT_WRITE_BUSY');
      assert.equal(r.busy, true);
    });
  });
});

describe('4D.5.4.15 validation rejections', () => {
  it('6. Security UNKNOWN rejection', async () => {
    await withPilotEnv('9991001', async () => {
      const r = await createOpeningLiability(
        baseInput({ securityStatus: 'UNKNOWN' as 'PAID' }),
        catalog,
        { liveRiderExists: () => true, persistIssue: async () => undefined },
        { persist: true }
      );
      assert.equal(r.ok, false);
      if (r.ok) return;
      assert.equal(r.code, 'SECURITY_STATUS_REQUIRED');
    });
  });

  it('7. historical paid > original', async () => {
    await withPilotEnv('9991001', async () => {
      const r = await createOpeningLiability(
        baseInput({ historicalPaidMilli: 999999 }),
        catalog,
        { liveRiderExists: () => true, persistIssue: async () => undefined },
        { persist: true }
      );
      assert.equal(r.ok, false);
      if (r.ok) return;
      assert.equal(r.code, 'PAID_EXCEEDS_ORIGINAL');
    });
  });

  it('8. negative amounts', async () => {
    await withPilotEnv('9991001', async () => {
      const r = await createOpeningLiability(
        baseInput({ historicalPaidMilli: -1 }),
        catalog,
        { liveRiderExists: () => true, persistIssue: async () => undefined },
        { persist: true }
      );
      assert.equal(r.ok, false);
      if (r.ok) return;
      assert.equal(r.code, 'NEGATIVE_PAID');
    });
  });
});

describe('4D.5.4.15 snapshot / zero / expected / money isolation', () => {
  it('9. snapshot immutability fields present', () => {
    const built = buildOpeningLiabilityIssue(baseInput({ securityStatus: 'PAID' }), catalog);
    assert.ok(built.ok);
    if (!built.ok) return;
    assert.equal(built.issue.pricingSource, 'OPENING_MIGRATION');
    assert.equal(built.issue.snapMotorcycleBagMilli, catalog.motorcycleBagMilli);
    const v = verifyOpeningLiabilityReadOnly(built.issue, { expectedRiderCode: '9991001' });
    assert.equal(v.ok, true);
  });

  it('10. zero balance → settled; not in open Expected', async () => {
    await withPilotEnv('9991001', async () => {
      const stored: EquipmentLiabilityIssue[] = [];
      const r = await runControlledOpeningPilotPersist(
        baseInput({ securityStatus: 'PAID', historicalPaidMilli: 80000 }),
        catalog,
        {
          liveRiderExists: () => true,
          findByMigrationKey: async () => null,
          persistIssue: async (issue) => {
            stored.push(issue);
          },
          appendAudit: async () => undefined,
          acquireLocks: async () => ({ ok: true, release: async () => undefined }),
          countByMigrationKey: async () => stored.length,
        }
      );
      assert.equal(r.ok, true);
      if (!r.ok) return;
      assert.equal(r.issue.status, 'settled');
      assert.equal(r.issue.outstandingMilli, 0);
      assert.equal(openingEntersOpenExpectedPopulation(r.issue), false);
      assert.equal(r.expectedDryRun.entersOpenExpected, false);
    });
  });

  it('11–14. no wallet/ledger; FA OFF; Auto REQUEST OFF', () => {
    assert.equal(isSrs014FinancialApplyEnabled(), false);
    assert.equal(isAutoEquipmentDeductionsEnabled(), false);
    assert.equal(isSrs014OpeningBalanceWriteEnabled(), false);
  });

  it('15. Expected dry-run uses persisted original only', () => {
    const built = buildOpeningLiabilityIssue(baseInput(), catalog);
    assert.ok(built.ok);
    if (!built.ok) return;
    const dry = expectedDryRunForOpeningIssue(built.issue);
    assert.equal(dry.financialMutation, false);
    assert.equal(dry.usesPersistedOriginal, true);
    assert.equal(dry.autoRequestEnabled, false);
    assert.equal(dry.financialApplyEnabled, false);
    assert.equal(dry.entersOpenExpected, true);
    assert.ok(dry.expectedDeductionMilli > 0);
  });

  it('18. audit event correctness on successful write', async () => {
    await withPilotEnv('9991001', async () => {
      const audits: Array<{ action: string; after?: unknown }> = [];
      await runControlledOpeningPilotPersist(baseInput(), catalog, {
        liveRiderExists: () => true,
        persistIssue: async () => undefined,
        appendAudit: async (e) => {
          audits.push(e);
        },
        acquireLocks: async () => ({ ok: true, release: async () => undefined }),
        countByMigrationKey: async () => 1,
      });
      assert.equal(audits.length, 1);
      assert.equal(audits[0].action, 'create_opening_liability');
      const after = audits[0].after as { migrationKey?: string; riderCode?: string };
      assert.equal(after.migrationKey, 'OPENING:9991001');
      assert.equal(after.riderCode, '9991001');
    });
  });
});
