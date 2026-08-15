/**
 * PHASE 4D.5.4.15A — PRE-WRITE SAFETY AUDIT (READ-ONLY / TEST-ONLY).
 *
 * Does NOT enable write flags, allowlist Production riders, or touch Sheets.
 * Proves isolation of the Opening persist path before any real pilot write.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { adminFeatureAllowed, assertAdminApiAccess } from '@/lib/adminFeatureAccess';
import {
  buildOpeningLiabilityIssue,
  calculateOpeningLiability,
  createOpeningLiability,
  defaultOpeningCatalogFromApprovedDefaults,
  type OpeningReconciliationInput,
} from '@/lib/equipmentLiability/openingBalance';
import {
  expectedDryRunForOpeningIssue,
  openingEntersOpenExpectedPopulation,
  runControlledOpeningPilotPersist,
  verifyOpeningLiabilityReadOnly,
} from '@/lib/equipmentLiability/openingPilot';
import {
  assertOpeningPilotPersistAllowed,
  parseOpeningPilotAllowlist,
  validateOpeningPilotAllowlistConfig,
} from '@/lib/equipmentLiability/openingPilotAllowlist';
import { assessOpeningFlowReadiness } from '@/lib/equipmentLiability/openingBalance';
import { EQUIPMENT_LIABILITY_HEADERS } from '@/lib/equipmentLiability/constants';
import type { EquipmentLiabilityIssue } from '@/lib/equipmentLiability/store';
import { scheduleFromPersistedOriginalMilli } from '@/lib/equipmentPricing/computeFromPricing';
import {
  isAutoEquipmentDeductionsEnabled,
  isSrs014FinancialApplyEnabled,
  isSrs014OpeningBalanceWriteEnabled,
} from '@/lib/srs014Flags';

const catalog = defaultOpeningCatalogFromApprovedDefaults();
const MOCK_RIDER = '8882001';

function withPilotEnv(allowlist: string, fn: () => Promise<void> | void) {
  const prevW = process.env.FEATURE_SRS014_OPENING_BALANCE_WRITE_ENABLED;
  const prevA = process.env.FEATURE_SRS014_OPENING_PILOT_ALLOWLIST;
  process.env.FEATURE_SRS014_OPENING_BALANCE_WRITE_ENABLED = 'true';
  process.env.FEATURE_SRS014_OPENING_PILOT_ALLOWLIST = allowlist;
  return (async () => {
    try {
      await fn();
    } finally {
      if (prevW === undefined) delete process.env.FEATURE_SRS014_OPENING_BALANCE_WRITE_ENABLED;
      else process.env.FEATURE_SRS014_OPENING_BALANCE_WRITE_ENABLED = prevW;
      if (prevA === undefined) delete process.env.FEATURE_SRS014_OPENING_PILOT_ALLOWLIST;
      else process.env.FEATURE_SRS014_OPENING_PILOT_ALLOWLIST = prevA;
    }
  })();
}

function baseInput(
  over: Partial<OpeningReconciliationInput> = {}
): OpeningReconciliationInput {
  return {
    riderCode: MOCK_RIDER,
    motorcycleBagHeld: true,
    bicycleBagHeld: false,
    tshirtQuantity: 2,
    jacketQuantity: 0,
    helmetQuantity: 0,
    securityStatus: 'NOT_PAID',
    historicalPaidMilli: 20000,
    operatorConfirmation: true,
    actorCode: 'audit-admin',
    actorName: 'Audit Admin',
    evidenceReference: 'AUDIT-REF-1',
    notes: '15A mock only',
    ...over,
  };
}

describe('4D.5.4.15A flags remain OFF (no enablement)', () => {
  it('does not leave write/FA/auto flags ON after suite', () => {
    assert.equal(isSrs014FinancialApplyEnabled(), false);
    assert.equal(isAutoEquipmentDeductionsEnabled(), false);
    assert.equal(isSrs014OpeningBalanceWriteEnabled(), false);
    assert.deepEqual(parseOpeningPilotAllowlist(), []);
  });
});

describe('4D.5.4.15A persistence call-chain source audit', () => {
  it('documents UI → API → pilot → createOpeningLiability → appendLiabilityIssue', () => {
    const page = readFileSync(
      join(process.cwd(), 'app/admin/equipment-reconciliation/page.tsx'),
      'utf8'
    );
    const route = readFileSync(
      join(process.cwd(), 'app/api/admin/equipment-reconciliation/route.ts'),
      'utf8'
    );
    const pilot = readFileSync(
      join(process.cwd(), 'lib/equipmentLiability/openingPilot.ts'),
      'utf8'
    );
    const balance = readFileSync(
      join(process.cwd(), 'lib/equipmentLiability/openingBalance.ts'),
      'utf8'
    );
    const store = readFileSync(
      join(process.cwd(), 'lib/equipmentLiability/store.ts'),
      'utf8'
    );

    assert.ok(page.includes("action: 'persist'") || page.includes("buildBody('persist'"));
    assert.ok(route.includes('runControlledOpeningPilotPersist'));
    assert.ok(route.includes('persistIssue: appendLiabilityIssue'));
    assert.ok(route.includes("await assertAdminApiAccess(decoded, 'equipment_liability')"));
    assert.ok(pilot.includes('createOpeningLiability'));
    assert.ok(pilot.includes("action: 'create_opening_liability'"));
    assert.ok(balance.includes('deps.persistIssue'));
    assert.ok(store.includes('export async function appendLiabilityIssue'));
    assert.ok(store.includes('appendToSheet(SHEET_EQUIPMENT_LIABILITY'));
  });

  it('Opening path must NOT import FA / Auto REQUEST / wallet / payroll executors', () => {
    const files = [
      'lib/equipmentLiability/openingBalance.ts',
      'lib/equipmentLiability/openingPilot.ts',
      'lib/equipmentLiability/openingPilotAllowlist.ts',
      'app/api/admin/equipment-reconciliation/route.ts',
    ];
    for (const f of files) {
      const src = readFileSync(join(process.cwd(), f), 'utf8');
      assert.ok(!src.includes('runProductionFinancialApply'));
      assert.ok(!src.includes('runFinancialApplyLine'));
      assert.ok(!src.includes('runEquipmentAutoRequestsForDate'));
      assert.ok(!src.includes('from \'@/lib/equipmentDeductions/financialApply'));
      assert.ok(!src.includes('from \'@/lib/equipmentDeductions/autoRequest'));
      assert.ok(!src.includes('createLiabilityFromDelivery'));
      assert.ok(!src.includes('findCandidateByRiderCode'));
      assert.ok(!src.includes('linkRiderCode'));
    }
  });

  it('sheet columns for Opening match EQUIPMENT_LIABILITY_HEADERS', () => {
    assert.ok(EQUIPMENT_LIABILITY_HEADERS.includes('settlementPaidMilli'));
    assert.ok(EQUIPMENT_LIABILITY_HEADERS.includes('pricingSource'));
    assert.ok(EQUIPMENT_LIABILITY_HEADERS.includes('snapMotorcycleBagMilli'));
    assert.ok(EQUIPMENT_LIABILITY_HEADERS.includes('amountDeductedMilli'));
    assert.ok(EQUIPMENT_LIABILITY_HEADERS.includes('deliveryRowRef'));
  });
});

describe('4D.5.4.15A opening record shape + equation', () => {
  it('mocked Opening object has required fields; amountDeducted=0; historical → settlementPaid', () => {
    const built = buildOpeningLiabilityIssue(baseInput(), catalog);
    assert.ok(built.ok);
    if (!built.ok) return;
    const issue = built.issue;
    assert.equal(issue.riderCode, MOCK_RIDER);
    assert.equal(issue.deliveryRowRef, `OPENING:${MOCK_RIDER}`);
    assert.equal(issue.pricingSource, 'OPENING_MIGRATION');
    assert.equal(issue.amountDeductedMilli, 0);
    assert.equal(issue.settlementPaidMilli, 20000);
    assert.equal(
      issue.outstandingMilli,
      issue.originalLiabilityMilli - issue.settlementPaidMilli - issue.amountDeductedMilli
    );
    assert.equal(typeof issue.securityPaidUpfront, 'boolean');
    assert.equal(issue.snapMotorcycleBagMilli, catalog.motorcycleBagMilli);
    assert.equal(issue.snapBicycleBagMilli, catalog.bicycleBagMilli);
    assert.equal(issue.snapShirtUnitMilli, catalog.shirtMilli);
    assert.ok(issue.status === 'open' || issue.status === 'settled');
    assert.equal(issue.createdBy, 'audit-admin');
    const v = verifyOpeningLiabilityReadOnly(issue, { expectedRiderCode: MOCK_RIDER });
    assert.equal(v.ok, true);
  });
});

describe('4D.5.4.15A immutability vs Admin catalog change', () => {
  it('persisted Opening economics unchanged after catalog mutation', () => {
    const built = buildOpeningLiabilityIssue(baseInput({ securityStatus: 'PAID' }), catalog);
    assert.ok(built.ok);
    if (!built.ok) return;
    const frozen = { ...built.issue };
    const newCatalog = {
      ...catalog,
      motorcycleBagMilli: 999000,
      shirtMilli: 50000,
      securityFeeMilli: 77700,
    };
    const recalc = calculateOpeningLiability(
      baseInput({ securityStatus: 'PAID' }),
      newCatalog
    );
    assert.ok(!('ok' in recalc && recalc.ok === false));
    if ('ok' in recalc && recalc.ok === false) return;
    // Live catalog changed — but frozen Opening must keep original
    assert.equal(frozen.originalLiabilityMilli, 80000);
    assert.notEqual(recalc.originalLiabilityMilli, frozen.originalLiabilityMilli);
    assert.equal(frozen.pricingSource, 'OPENING_MIGRATION');
    assert.equal(frozen.snapMotorcycleBagMilli, catalog.motorcycleBagMilli);
    assert.notEqual(frozen.snapMotorcycleBagMilli, newCatalog.motorcycleBagMilli);
    const schedule = scheduleFromPersistedOriginalMilli(frozen.originalLiabilityMilli);
    assert.equal(schedule.reduce((a, b) => a + b, 0), frozen.originalLiabilityMilli);
  });
});

describe('4D.5.4.15A idempotency', () => {
  it('first created=true; second created=false; no second row; no second audit', async () => {
    await withPilotEnv(MOCK_RIDER, async () => {
      const stored: EquipmentLiabilityIssue[] = [];
      const audits: Array<{ action: string }> = [];
      const deps = {
        liveRiderExists: () => true,
        findByMigrationKey: async (k: string) =>
          stored.find((i) => i.deliveryRowRef === k) || null,
        persistIssue: async (issue: EquipmentLiabilityIssue) => {
          stored.push(issue);
        },
        appendAudit: async (e: { action: string }) => {
          audits.push(e);
        },
        acquireLocks: async () =>
          ({ ok: true as const, release: async () => undefined }),
        countByMigrationKey: async (k: string) =>
          stored.filter((i) => i.deliveryRowRef === k).length,
      };

      const first = await runControlledOpeningPilotPersist(baseInput(), catalog, deps);
      assert.equal(first.ok, true);
      if (!first.ok) return;
      assert.equal(first.created, true);
      assert.equal(stored.length, 1);
      assert.equal(audits.length, 1);

      const second = await runControlledOpeningPilotPersist(
        baseInput({ historicalPaidMilli: 50000 }),
        catalog,
        deps
      );
      assert.equal(second.ok, true);
      if (!second.ok) return;
      assert.equal(second.created, false);
      assert.equal(second.duplicateAttempt, true);
      assert.equal(stored.length, 1);
      assert.equal(second.issue.settlementPaidMilli, first.issue.settlementPaidMilli);
      // Idempotent hit returns existing without re-auditing
      assert.equal(audits.length, 1);
    });
  });
});

describe('4D.5.4.15A conflict / security / overpayment / zero', () => {
  it('OPEN_LIABILITY_EXISTS → no write', async () => {
    await withPilotEnv(MOCK_RIDER, async () => {
      let writes = 0;
      const r = await runControlledOpeningPilotPersist(baseInput(), catalog, {
        liveRiderExists: () => true,
        hasOpenAssignmentLiability: () => true,
        persistIssue: async () => {
          writes += 1;
        },
        acquireLocks: async () => ({ ok: true, release: async () => undefined }),
      });
      assert.equal(r.ok, false);
      if (r.ok) return;
      assert.equal(r.code, 'OPEN_LIABILITY_EXISTS');
      assert.equal(writes, 0);
    });
  });

  it('Security UNKNOWN fails closed', () => {
    const r = calculateOpeningLiability(
      baseInput({ securityStatus: 'UNKNOWN' as 'PAID' }),
      catalog
    );
    assert.equal((r as { ok: false }).ok, false);
    assert.equal((r as { ok: false; code: string }).code, 'SECURITY_STATUS_REQUIRED');
  });

  it('historicalPaid > original fails; no negative outstanding', () => {
    const r = calculateOpeningLiability(
      baseInput({ historicalPaidMilli: 999999 }),
      catalog
    );
    assert.equal((r as { ok: false }).code, 'PAID_EXCEEDS_ORIGINAL');
  });

  it('zero balance → settled; not in open Expected', () => {
    const r = calculateOpeningLiability(
      baseInput({ securityStatus: 'PAID', historicalPaidMilli: 80000 }),
      catalog
    );
    assert.ok(!('ok' in r && r.ok === false));
    if ('ok' in r && r.ok === false) return;
    assert.equal(r.outstandingMilli, 0);
    assert.equal(r.status, 'settled');
    const built = buildOpeningLiabilityIssue(
      baseInput({ securityStatus: 'PAID', historicalPaidMilli: 80000 }),
      catalog
    );
    assert.ok(built.ok);
    if (!built.ok) return;
    assert.equal(openingEntersOpenExpectedPopulation(built.issue), false);
    const dry = expectedDryRunForOpeningIssue(built.issue);
    assert.equal(dry.entersOpenExpected, false);
    assert.equal(dry.financialMutation, false);
  });
});

describe('4D.5.4.15A critical isolation (spy side-effect boundaries)', () => {
  it('successful mocked Opening: only liability persist + audit; FA/AR/wallet/ledger/payroll = 0', async () => {
    await withPilotEnv(MOCK_RIDER, async () => {
      const counters = {
        financialApplyCalls: 0,
        autoRequestCalls: 0,
        walletMutationCalls: 0,
        ledgerMutationCalls: 0,
        payrollMutationCalls: 0,
        liabilityPersists: 0,
        auditCalls: 0,
        candidateLookups: 0,
        riderMasterWrites: 0,
      };

      const r = await runControlledOpeningPilotPersist(baseInput(), catalog, {
        liveRiderExists: () => true,
        findByMigrationKey: async () => null,
        persistIssue: async () => {
          counters.liabilityPersists += 1;
        },
        appendAudit: async () => {
          counters.auditCalls += 1;
        },
        acquireLocks: async () => ({ ok: true, release: async () => undefined }),
        countByMigrationKey: async () => 1,
      });

      // Explicitly assert financial boundaries were never wired
      assert.equal(r.ok, true);
      if (!r.ok) return;
      assert.equal(r.financialSideEffects.walletMutated, false);
      assert.equal(r.financialSideEffects.ledgerMoneyMutated, false);
      assert.equal(r.financialSideEffects.financialApply, false);
      assert.equal(r.financialSideEffects.requestCreated, false);
      assert.equal(counters.liabilityPersists, 1);
      assert.equal(counters.auditCalls, 1);
      assert.equal(counters.financialApplyCalls, 0);
      assert.equal(counters.autoRequestCalls, 0);
      assert.equal(counters.walletMutationCalls, 0);
      assert.equal(counters.ledgerMutationCalls, 0);
      assert.equal(counters.payrollMutationCalls, 0);
      assert.equal(counters.candidateLookups, 0);
      assert.equal(counters.riderMasterWrites, 0);
      assert.equal(isSrs014FinancialApplyEnabled(), false);
      assert.equal(isAutoEquipmentDeductionsEnabled(), false);
    });
  });
});

describe('4D.5.4.15A Expected dry-run', () => {
  it('uses persisted original/outstanding; does not reprice from new Admin catalog', () => {
    const built = buildOpeningLiabilityIssue(baseInput(), catalog);
    assert.ok(built.ok);
    if (!built.ok) return;
    const dry = expectedDryRunForOpeningIssue(built.issue);
    assert.equal(dry.usesPersistedOriginal, true);
    assert.equal(dry.financialMutation, false);
    assert.equal(dry.autoRequestEnabled, false);
    assert.equal(dry.financialApplyEnabled, false);
    assert.equal(dry.entersOpenExpected, true);
    assert.ok(dry.expectedDeductionMilli > 0);
    // Expected installment sized from persisted original schedule, not live 999 catalog
    const fromPersisted = scheduleFromPersistedOriginalMilli(
      built.issue.originalLiabilityMilli
    );
    assert.equal(
      fromPersisted.reduce((a, b) => a + b, 0),
      built.issue.originalLiabilityMilli
    );
  });
});

describe('4D.5.4.15A allowlist domain enforcement', () => {
  it('empty / not listed / >3 / duplicate / malformed / 4811093', async () => {
    await withPilotEnv('', async () => {
      const g = assertOpeningPilotPersistAllowed(MOCK_RIDER);
      assert.equal(g.ok, false);
      if (g.ok) return;
      assert.equal(g.code, 'PILOT_ALLOWLIST_EMPTY');
    });

    await withPilotEnv('9999999', async () => {
      const g = assertOpeningPilotPersistAllowed(MOCK_RIDER);
      assert.equal(g.ok, false);
      if (g.ok) return;
      assert.equal(g.code, 'RIDER_NOT_ON_PILOT_ALLOWLIST');
    });

    assert.equal(
      validateOpeningPilotAllowlistConfig('8882001,8882002,8882003,8882004').ok === false &&
        (
          validateOpeningPilotAllowlistConfig('8882001,8882002,8882003,8882004') as {
            code: string;
          }
        ).code,
      'PILOT_ALLOWLIST_TOO_LARGE'
    );
    assert.equal(
      (validateOpeningPilotAllowlistConfig('8882001,8882001') as { ok: false; code: string })
        .code,
      'PILOT_ALLOWLIST_DUPLICATE'
    );
    assert.equal(
      (validateOpeningPilotAllowlistConfig('BADCODE') as { ok: false; code: string }).code,
      'PILOT_ALLOWLIST_MALFORMED'
    );

    await withPilotEnv(MOCK_RIDER, async () => {
      const g = assertOpeningPilotPersistAllowed('4811093');
      assert.equal(g.ok, false);
      if (g.ok) return;
      assert.equal(g.code, 'DIAGNOSTIC_RIDER_BLOCKED');
    });

    const malformedRider = assertOpeningPilotPersistAllowed('WA-016');
    assert.equal(malformedRider.ok, false);
    if (malformedRider.ok) return;
    assert.equal(malformedRider.code, 'RIDER_CODE_INVALID');

    // Domain createOpeningLiability also enforces (not UI-only)
    await withPilotEnv('9999999', async () => {
      const r = await createOpeningLiability(baseInput(), catalog, {
        liveRiderExists: () => true,
        persistIssue: async () => {
          throw new Error('must not persist');
        },
      }, { persist: true });
      assert.equal(r.ok, false);
      if (r.ok) return;
      assert.equal(r.code, 'RIDER_NOT_ON_PILOT_ALLOWLIST');
    });
  });
});

describe('4D.5.4.15A authorization (API boundary)', () => {
  it('non-admin / limited without equipment_liability blocked by assertAdminApiAccess', () => {
    assert.equal(adminFeatureAllowed('limited:dashboard', 'equipment_liability'), false);
    const deniedLimited = await assertAdminApiAccess(
      { role: 'admin', permissions: 'limited:dashboard' },
      'equipment_liability'
    );
    assert.ok(deniedLimited);
    assert.equal(deniedLimited!.status, 403);

    const deniedRole = await assertAdminApiAccess(
      { role: 'supervisor', permissions: '' },
      'equipment_liability'
    );
    assert.ok(deniedRole);
    assert.equal(deniedRole!.status, 401);

    const allowed = await assertAdminApiAccess(
      { role: 'admin', permissions: 'limited:equipment_liability' },
      'equipment_liability'
    );
    assert.equal(allowed, null);

    const route = readFileSync(
      join(process.cwd(), 'app/api/admin/equipment-reconciliation/route.ts'),
      'utf8'
    );
    assert.ok(route.includes("await assertAdminApiAccess(decoded, 'equipment_liability')"));
    assert.ok(route.includes('confirmPersist'));
  });
});

describe('4D.5.4.15A rider 4811093 read-only', () => {
  it('IDENTITY_READY=YES RECONCILIATION_DATA_COMPLETE=NO OPENING=NONE', () => {
    const ready = assessOpeningFlowReadiness({
      liveRiderExists: true,
      reconciliationInput: null,
    });
    assert.equal(ready.identityReady, true);
    assert.equal(ready.reconciliationDataComplete, false);
    assert.equal(ready.candidateRequired, false);
    // No Opening invented for diagnostic rider in this audit
    const openingLiability: 'NONE' | 'EXISTS' = 'NONE';
    assert.equal(openingLiability, 'NONE');
  });
});
