/**
 * 4D.5.4.14 — Opening reconciliation UI helpers + dry-run preview tests.
 * No production writes. No Financial Apply.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { adminFeatureAllowed, getAdminMenuDefs } from '@/lib/adminFeatureAccess';
import { isSrs014FinancialApplyEnabled } from '@/lib/srs014Flags';
import { defaultOpeningCatalogFromApprovedDefaults } from '@/lib/equipmentLiability/openingBalance';
import type { EquipmentLiabilityIssue } from '@/lib/equipmentLiability/store';
import {
  buildOpeningPreview,
  formToOpeningInput,
  isOpeningMigrationIssue,
  parseLiveRidersFromSheet,
  resolveReconciliationStatus,
  riderOpeningDiagnostic,
  type LiveRiderRow,
  type OpeningPreviewFormInput,
} from '@/lib/equipmentLiability/openingReconciliationUi';

const catalog = defaultOpeningCatalogFromApprovedDefaults();

function baseForm(over: Partial<OpeningPreviewFormInput> = {}): OpeningPreviewFormInput {
  return {
    riderCode: '9990001',
    motorcycleBagHeld: true,
    bicycleBagHeld: false,
    tshirtQuantity: 2,
    jacketQuantity: 0,
    helmetQuantity: 0,
    securityStatus: 'NOT_PAID',
    historicalPaidEgp: 0,
    operatorConfirmation: true,
    ...over,
  };
}

function liveRider(over: Partial<LiveRiderRow> = {}): LiveRiderRow {
  return {
    riderCode: '9990001',
    name: 'Test Rider',
    zone: 'Alexandria',
    supervisorCode: 'WA-001',
    supervisorName: 'Sup',
    joinDate: '1/1/2026',
    status: 'نشط',
    active: true,
    ...over,
  };
}

function mockIssue(
  over: Partial<EquipmentLiabilityIssue> = {}
): EquipmentLiabilityIssue {
  return {
    equipmentIssueId: 'iss-1',
    riderCode: '9990001',
    riderNameSnapshot: 'Test',
    zoneSnapshot: 'Alexandria',
    supervisorCodeSnapshot: 'WA-001',
    supervisorNameSnapshot: 'Sup',
    issueDate: '2026-01-01',
    activationDate: '2026-01-01',
    bagType: 'motorcycle',
    bagCostMilli: 53000,
    shirtQty: 2,
    shirtCostMilli: 27000,
    securityFeeMilli: 10000,
    securityPaidUpfront: false,
    originalLiabilityMilli: 90000,
    outstandingMilli: 90000,
    amountDeductedMilli: 0,
    settlementPaidMilli: 0,
    installmentsCompleted: 0,
    status: 'open',
    deliveryRowRef: 'OPENING:9990001',
    jacketHeld: false,
    helmetHeld: false,
    createdAt: '2026-01-01T00:00:00.000Z',
    createdBy: 'test',
    updatedAt: '2026-01-01T00:00:00.000Z',
    updatedBy: 'test',
    pricingSource: 'OPENING_MIGRATION',
    ...over,
  };
}

describe('4D.5.4.14 parseLiveRidersFromSheet', () => {
  it('parses المناديب-shaped rows', () => {
    const rows = parseLiveRidersFromSheet([
      ['كود', 'اسم', 'منطقة', 'كود مشرف', 'مشرف', 'x', 'انضمام', 'حالة'],
      ['4811093', 'Khiyam', 'Alexandria', 'WA-016', 'S', '', '8/6/2026', 'نشط'],
      ['', 'skip', '', '', '', '', '', ''],
      ['9990002', 'Idle', 'Cairo', 'WA-002', 'T', '', '1/1/2025', 'موقوف'],
    ]);
    assert.equal(rows.length, 2);
    assert.equal(rows[0].riderCode, '4811093');
    assert.equal(rows[0].active, true);
    assert.equal(rows[1].active, false);
  });
});

describe('4D.5.4.14 reconciliation status', () => {
  it('READY for active non-migrated', () => {
    assert.equal(
      resolveReconciliationStatus({
        rider: liveRider(),
        openingIssue: null,
        hasOtherOpenLiability: false,
      }),
      'READY'
    );
  });

  it('NOT_MIGRATED for inactive', () => {
    assert.equal(
      resolveReconciliationStatus({
        rider: liveRider({ active: false, status: 'موقوف' }),
        openingIssue: null,
        hasOtherOpenLiability: false,
      }),
      'NOT_MIGRATED'
    );
  });

  it('MIGRATED when opening issue exists', () => {
    assert.equal(
      resolveReconciliationStatus({
        rider: liveRider(),
        openingIssue: mockIssue(),
        hasOtherOpenLiability: false,
      }),
      'MIGRATED'
    );
  });

  it('CONFLICT when other open liability', () => {
    assert.equal(
      resolveReconciliationStatus({
        rider: liveRider(),
        openingIssue: null,
        hasOtherOpenLiability: true,
      }),
      'CONFLICT'
    );
  });

  it('isOpeningMigrationIssue detects pricingSource and key', () => {
    assert.equal(isOpeningMigrationIssue(mockIssue()), true);
    assert.equal(
      isOpeningMigrationIssue(
        mockIssue({
          pricingSource: 'ADMIN_EQUIPMENT_PRICES',
          deliveryRowRef: 'DEL:1',
        })
      ),
      false
    );
    assert.equal(
      isOpeningMigrationIssue(
        mockIssue({
          pricingSource: undefined,
          deliveryRowRef: 'OPENING:9990001',
        })
      ),
      true
    );
  });
});

describe('4D.5.4.14 preview calculation + validation', () => {
  it('preview NOT_PAID → original 900', () => {
    const p = buildOpeningPreview(baseForm(), catalog);
    assert.equal(p.ok, true);
    if (!p.ok) return;
    assert.equal(p.originalLiabilityEgp, 900);
    assert.equal(p.historicalPaidEgp, 0);
    assert.equal(p.outstandingEgp, 900);
    assert.equal(p.financialSideEffects.productionWrite, false);
    assert.equal(p.entersExpectedRequest, true);
  });

  it('preview PAID → original 800', () => {
    const p = buildOpeningPreview(baseForm({ securityStatus: 'PAID' }), catalog);
    assert.equal(p.ok, true);
    if (!p.ok) return;
    assert.equal(p.originalLiabilityEgp, 800);
  });

  it('security UNKNOWN invalid', () => {
    const p = buildOpeningPreview(baseForm({ securityStatus: '' }), catalog);
    assert.equal(p.ok, false);
    if (p.ok) return;
    assert.equal(p.code, 'SECURITY_STATUS_REQUIRED');
  });

  it('paid > original rejected', () => {
    const p = buildOpeningPreview(
      baseForm({ securityStatus: 'PAID', historicalPaidEgp: 900 }),
      catalog
    );
    assert.equal(p.ok, false);
    if (p.ok) return;
    assert.equal(p.code, 'PAID_EXCEEDS_ORIGINAL');
  });

  it('negative paid rejected', () => {
    const mapped = formToOpeningInput(baseForm({ historicalPaidEgp: -10 }));
    assert.ok(!('ok' in mapped && mapped.ok === false));
    const p = buildOpeningPreview(baseForm({ historicalPaidEgp: -10 }), catalog);
    assert.equal(p.ok, false);
    if (p.ok) return;
    assert.equal(p.code, 'NEGATIVE_PAID');
  });

  it('invalid quantity rejected', () => {
    const p = buildOpeningPreview(baseForm({ tshirtQuantity: -1 }), catalog);
    assert.equal(p.ok, false);
    if (p.ok) return;
    assert.equal(p.code, 'INVALID_QUANTITY');
  });

  it('zero outstanding → CREATE_SETTLED_OPENING_RECORD; not Expected', () => {
    const p = buildOpeningPreview(
      baseForm({ securityStatus: 'PAID', historicalPaidEgp: 800 }),
      catalog
    );
    assert.equal(p.ok, true);
    if (!p.ok) return;
    assert.equal(p.outstandingEgp, 0);
    assert.equal(p.status, 'settled');
    assert.equal(p.zeroBalancePolicy, 'CREATE_SETTLED_OPENING_RECORD');
    assert.equal(p.entersExpectedRequest, false);
  });

  it('confirmation required', () => {
    const p = buildOpeningPreview(
      baseForm({ operatorConfirmation: false }),
      catalog
    );
    assert.equal(p.ok, false);
    if (p.ok) return;
    assert.equal(p.code, 'CONFIRMATION_REQUIRED');
  });

  it('does not invent values — empty form fields stay explicit zeros', () => {
    const mapped = formToOpeningInput(
      baseForm({
        motorcycleBagHeld: false,
        bicycleBagHeld: false,
        tshirtQuantity: 0,
        securityStatus: 'PAID',
        historicalPaidEgp: 0,
      })
    );
    assert.ok(!('ok' in mapped && mapped.ok === false));
    if ('ok' in mapped && mapped.ok === false) return;
    assert.equal(mapped.motorcycleBagHeld, false);
    assert.equal(mapped.tshirtQuantity, 0);
    assert.equal(mapped.historicalPaidMilli, 0);
  });
});

describe('4D.5.4.14 rider 4811093 read-only diagnostic', () => {
  it('IDENTITY_READY YES + RECONCILIATION_DATA_COMPLETE NO without inventing data', () => {
    const d = riderOpeningDiagnostic({
      riderCode: '4811093',
      liveRiderExists: true,
      openingIssue: null,
    });
    assert.equal(d.identityReady, true);
    assert.equal(d.reconciliationDataComplete, false);
    assert.equal(d.candidateRequired, false);
    assert.equal(d.migrationKey, 'OPENING:4811093');
    assert.equal(d.alreadyMigrated, false);
  });

  it('does not mark reconciliation complete even if opening exists elsewhere logic', () => {
    const d = riderOpeningDiagnostic({
      riderCode: '4811093',
      liveRiderExists: true,
      openingIssue: mockIssue({
        riderCode: '4811093',
        deliveryRowRef: 'OPENING:4811093',
      }),
    });
    assert.equal(d.reconciliationDataComplete, false);
    assert.equal(d.alreadyMigrated, true);
  });
});

describe('4D.5.4.14 admin access + route safety', () => {
  it('equipment_liability feature gates nav + API', () => {
    assert.equal(adminFeatureAllowed('limited:dashboard', 'equipment_liability'), false);
    assert.equal(
      adminFeatureAllowed('limited:equipment_liability', 'equipment_liability'),
      true
    );
    const nav = getAdminMenuDefs();
    const item = nav.find((n) => n.href === '/admin/equipment-reconciliation');
    assert.ok(item);
    assert.equal(item?.feature, 'equipment_liability');
  });

  it('API route uses equipment_liability; preview + pilot persist gated', () => {
    const body = readFileSync(
      join(process.cwd(), 'app/api/admin/equipment-reconciliation/route.ts'),
      'utf8'
    );
    assert.ok(body.includes("await assertAdminApiAccess(decoded, 'equipment_liability')"));
    assert.ok(body.includes('DRY_RUN_PREVIEW') || body.includes("mode: 'DRY_RUN_PREVIEW'"));
    assert.ok(body.includes('runControlledOpeningPilotPersist'));
    assert.ok(body.includes("action !== 'preview' && action !== 'persist'"));
    assert.ok(body.includes('confirmPersist'));
    assert.ok(body.includes('DIAGNOSTIC_RIDER_BLOCKED'));
  });

  it('UI page never prefills 4811093 equipment/paid', () => {
    const page = readFileSync(
      join(process.cwd(), 'app/admin/equipment-reconciliation/page.tsx'),
      'utf8'
    );
    assert.ok(page.includes("'/admin/equipment-reconciliation'") || page.includes('equipment-reconciliation'));
    assert.ok(page.includes('emptyForm'));
    assert.ok(page.includes('Never invent') || page.includes('لا يتم تعبئة'));
    assert.ok(!page.includes('historicalPaidEgp: 800'));
    assert.ok(!page.includes('motorcycleBagHeld: true'));
  });

  it('Financial Apply remains OFF in test env', () => {
    assert.equal(isSrs014FinancialApplyEnabled(), false);
  });
});
