/**
 * 4D.5.4.13 — Opening Balance / FLOW A domain tests (non-financial).
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  assessOpeningFlowReadiness,
  buildOpeningLiabilityIssue,
  calculateOpeningLiability,
  createOpeningLiability,
  defaultOpeningCatalogFromApprovedDefaults,
  openingMigrationKey,
  type OpeningReconciliationInput,
} from '@/lib/equipmentLiability/openingBalance';
import { scheduleFromPersistedOriginalMilli } from '@/lib/equipmentPricing/computeFromPricing';
import { assessEquipmentLiabilityReadiness } from '@/lib/recruitment/equipmentLiabilityReadiness';
import { assertPhaseCCandidateReady } from '@/lib/equipmentLiability/phaseCGates';
import { isSrs014FinancialApplyEnabled } from '@/lib/srs014Flags';
import type { EquipmentLiabilityIssue } from '@/lib/equipmentLiability/store';

const catalog = defaultOpeningCatalogFromApprovedDefaults();

function baseInput(
  over: Partial<OpeningReconciliationInput> = {}
): OpeningReconciliationInput {
  return {
    riderCode: '4811093',
    motorcycleBagHeld: true,
    bicycleBagHeld: false,
    tshirtQuantity: 2,
    jacketQuantity: 0,
    helmetQuantity: 0,
    securityStatus: 'NOT_PAID',
    historicalPaidMilli: 0,
    operatorConfirmation: true,
    ...over,
  };
}

describe('4D.5.4.13 opening liability calculation', () => {
  it('1. valid opening reconciliation (NOT_PAID → 900)', () => {
    const r = calculateOpeningLiability(baseInput(), catalog);
    assert.ok(!('ok' in r && r.ok === false));
    if ('ok' in r && r.ok === false) return;
    assert.equal(r.originalLiabilityMilli, 90000);
    assert.equal(r.outstandingMilli, 90000);
    assert.equal(r.pricingSource, 'OPENING_MIGRATION');
    assert.equal(r.migrationKey, 'OPENING:4811093');
    assert.equal(r.financialSideEffects.walletMutated, false);
  });

  it('2. rider code invalid', () => {
    const r = calculateOpeningLiability(baseInput({ riderCode: 'WA-016' }), catalog);
    assert.equal((r as { ok: false }).ok, false);
  });

  it('3. both bag types selected', () => {
    const r = calculateOpeningLiability(
      baseInput({ motorcycleBagHeld: true, bicycleBagHeld: true }),
      catalog
    );
    assert.equal((r as { ok: false }).code, 'BOTH_BAG_TYPES');
  });

  it('4. negative shirt quantity', () => {
    const r = calculateOpeningLiability(baseInput({ tshirtQuantity: -1 }), catalog);
    assert.equal((r as { ok: false }).code, 'INVALID_QUANTITY');
  });

  it('5. negative paid amount', () => {
    const r = calculateOpeningLiability(baseInput({ historicalPaidMilli: -100 }), catalog);
    assert.equal((r as { ok: false }).code, 'NEGATIVE_PAID');
  });

  it('6. paid > original', () => {
    const r = calculateOpeningLiability(
      baseInput({ historicalPaidMilli: 999999 }),
      catalog
    );
    assert.equal((r as { ok: false }).code, 'PAID_EXCEEDS_ORIGINAL');
  });

  it('7. Security UNKNOWN fails closed', () => {
    const r = calculateOpeningLiability(
      baseInput({ securityStatus: 'UNKNOWN' as 'PAID' }),
      catalog
    );
    assert.equal((r as { ok: false }).code, 'SECURITY_STATUS_REQUIRED');
  });

  it('8. PAID security → 800', () => {
    const r = calculateOpeningLiability(baseInput({ securityStatus: 'PAID' }), catalog);
    assert.ok(!('ok' in r && r.ok === false));
    if ('ok' in r && r.ok === false) return;
    assert.equal(r.originalLiabilityMilli, 80000);
    assert.equal(r.securityPaidUpfront, true);
  });

  it('9. NOT_PAID security → includes 100', () => {
    const r = calculateOpeningLiability(baseInput({ securityStatus: 'NOT_PAID' }), catalog);
    assert.ok(!('ok' in r && r.ok === false));
    if ('ok' in r && r.ok === false) return;
    assert.equal(r.originalLiabilityMilli, 90000);
  });

  it('10. jacket/helmet zero pricing', () => {
    const r = calculateOpeningLiability(
      baseInput({
        securityStatus: 'PAID',
        jacketQuantity: 1,
        helmetQuantity: 1,
      }),
      catalog
    );
    assert.ok(!('ok' in r && r.ok === false));
    if ('ok' in r && r.ok === false) return;
    assert.equal(r.jacketCostMilli, 0);
    assert.equal(r.helmetCostMilli, 0);
    assert.equal(r.originalLiabilityMilli, 80000);
  });

  it('16. outstanding calculation', () => {
    const r = calculateOpeningLiability(
      baseInput({ securityStatus: 'PAID', historicalPaidMilli: 30000 }),
      catalog
    );
    assert.ok(!('ok' in r && r.ok === false));
    if ('ok' in r && r.ok === false) return;
    assert.equal(r.originalLiabilityMilli, 80000);
    assert.equal(r.settlementPaidMilli, 30000);
    assert.equal(r.outstandingMilli, 50000);
    assert.equal(r.amountDeductedMilli, 0);
  });

  it('17–18. fully paid → settled zero outstanding policy', () => {
    const r = calculateOpeningLiability(
      baseInput({ securityStatus: 'PAID', historicalPaidMilli: 80000 }),
      catalog
    );
    assert.ok(!('ok' in r && r.ok === false));
    if ('ok' in r && r.ok === false) return;
    assert.equal(r.outstandingMilli, 0);
    assert.equal(r.status, 'settled');
    assert.equal(r.zeroBalancePolicy, 'CREATE_SETTLED_OPENING_RECORD');
  });
});

describe('4D.5.4.13 idempotency + createOpeningLiability guard', () => {
  it('11. duplicate OPENING:<riderCode> returns existing', async () => {
    const existing = buildOpeningLiabilityIssue(baseInput(), catalog);
    assert.ok(existing.ok);
    if (!existing.ok) return;
    const r = await createOpeningLiability(baseInput(), catalog, {
      liveRiderExists: () => true,
      findByMigrationKey: async () => existing.issue,
    });
    assert.equal(r.ok, true);
    if (!r.ok) return;
    assert.equal(r.created, false);
    assert.equal(r.issue.deliveryRowRef, 'OPENING:4811093');
  });

  it('12. existing open liability blocked', async () => {
    const r = await createOpeningLiability(baseInput(), catalog, {
      liveRiderExists: () => true,
      hasOpenAssignmentLiability: () => true,
    });
    assert.equal(r.ok, false);
    if (r.ok) return;
    assert.equal(r.code, 'OPEN_LIABILITY_EXISTS');
  });

  it('persist refused when production write flag OFF', async () => {
    const r = await createOpeningLiability(
      baseInput({ riderCode: '9990001' }),
      catalog,
      {
        liveRiderExists: () => true,
        persistIssue: async () => {
          throw new Error('should not persist');
        },
      },
      { persist: true }
    );
    assert.equal(r.ok, false);
    if (r.ok) return;
    assert.equal(r.code, 'PRODUCTION_WRITE_DISABLED');
  });

  it('persist refused for diagnostic rider 4811093 even if write flag ON', async () => {
    const prevW = process.env.FEATURE_SRS014_OPENING_BALANCE_WRITE_ENABLED;
    const prevA = process.env.FEATURE_SRS014_OPENING_PILOT_ALLOWLIST;
    process.env.FEATURE_SRS014_OPENING_BALANCE_WRITE_ENABLED = 'true';
    process.env.FEATURE_SRS014_OPENING_PILOT_ALLOWLIST = '4811093,9990001';
    try {
      const r = await createOpeningLiability(
        baseInput({ riderCode: '4811093' }),
        catalog,
        {
          liveRiderExists: () => true,
          persistIssue: async () => {
            throw new Error('should not persist 4811093');
          },
        },
        { persist: true }
      );
      assert.equal(r.ok, false);
      if (r.ok) return;
      assert.equal(r.code, 'DIAGNOSTIC_RIDER_BLOCKED');
    } finally {
      if (prevW === undefined) delete process.env.FEATURE_SRS014_OPENING_BALANCE_WRITE_ENABLED;
      else process.env.FEATURE_SRS014_OPENING_BALANCE_WRITE_ENABLED = prevW;
      if (prevA === undefined) delete process.env.FEATURE_SRS014_OPENING_PILOT_ALLOWLIST;
      else process.env.FEATURE_SRS014_OPENING_PILOT_ALLOWLIST = prevA;
    }
  });

  it('2b. live rider missing', async () => {
    const r = await createOpeningLiability(baseInput(), catalog, {
      liveRiderExists: () => false,
    });
    assert.equal(r.ok, false);
    if (r.ok) return;
    assert.equal(r.code, 'LIVE_RIDER_NOT_FOUND');
  });
});

describe('4D.5.4.13 snapshot immutability vs Admin price change', () => {
  it('13–15. Admin price change does not alter persisted opening original/schedule', () => {
    const built = buildOpeningLiabilityIssue(baseInput({ securityStatus: 'PAID' }), catalog);
    assert.ok(built.ok);
    if (!built.ok) return;
    const original = built.issue.originalLiabilityMilli;
    assert.equal(original, 80000);

    const futureCatalog = {
      ...catalog,
      motorcycleBagMilli: 99900,
      shirtMilli: 20000,
      securityFeeMilli: 50000,
    };
    // Reconstruct schedule ONLY from persisted original — never future catalog
    const schedule = scheduleFromPersistedOriginalMilli(built.issue.originalLiabilityMilli);
    assert.equal(schedule.reduce((a, b) => a + b, 0), original);
    assert.notEqual(futureCatalog.motorcycleBagMilli, catalog.motorcycleBagMilli);
    assert.equal(built.issue.pricingSource, 'OPENING_MIGRATION');
    assert.equal(built.issue.deliveryRowRef, openingMigrationKey('4811093'));
  });
});

describe('4D.5.4.13 FLOW A vs FLOW B separation', () => {
  it('19. Candidate missing but FLOW A identity can be ready', () => {
    const a = assessOpeningFlowReadiness({ liveRiderExists: true });
    assert.equal(a.identityReady, true);
    assert.equal(a.candidateRequired, false);
    assert.equal(a.reconciliationDataComplete, false);
    assert.ok(a.blockers.includes('RECONCILIATION_DATA_INCOMPLETE'));
  });

  it('19b. FLOW A with complete reconciliation data', () => {
    const a = assessOpeningFlowReadiness({
      liveRiderExists: true,
      reconciliationInput: baseInput(),
      catalog,
    });
    assert.equal(a.identityReady, true);
    assert.equal(a.reconciliationDataComplete, true);
  });

  it('20. Candidate missing → FLOW B blocked', () => {
    const gate = assertPhaseCCandidateReady(null, '4811093');
    assert.equal(gate.ok, false);
    if (gate.ok) return;
    assert.equal(gate.code, 'CANDIDATE_NOT_FOUND');

    const ready = assessEquipmentLiabilityReadiness({
      candidate: null,
      deliveryRiderCode: '4811093',
      delivery: {
        deliveryRowRef: '1',
        riderCode: '4811093',
        deliveryType: 'تعيين',
      },
      riderMaster: { found: true, riderCode: '4811093' },
      pricing: { adminPricingOk: true },
    });
    assert.equal(ready.status, 'BLOCKED');
    assert.ok(ready.blockers.includes('MISSING_CANDIDATE_LINK'));
  });

  it('21–23. no money side effects; FA OFF', async () => {
    assert.equal(isSrs014FinancialApplyEnabled(), false);
    const r = await createOpeningLiability(baseInput(), catalog, {
      liveRiderExists: () => true,
    });
    assert.equal(r.ok, true);
    if (!r.ok) return;
    assert.equal(r.mode, 'DRY_RUN');
    assert.equal(r.financialSideEffects.walletMutated, false);
    assert.equal(r.financialSideEffects.ledgerMoneyMutated, false);
    assert.equal(r.financialSideEffects.financialApply, false);
    assert.equal(r.financialSideEffects.financialApplyEnabled, false);
  });
});
