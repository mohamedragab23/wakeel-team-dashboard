/**
 * Equipment payment proposals — RBAC menu + pure view helpers + no pilot auto-mutation.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  buildPermissionsForOperationalRole,
  roleAllowsFeature,
} from '@/lib/operationalRoles';
import {
  adminFeatureAllowed,
  filterAdminMenuForPermissions,
} from '@/lib/adminFeatureAccess';
import { issueToSupervisorView, issueMatchesSupervisorScope } from '@/lib/equipmentLiability/paymentProposals';
import type { EquipmentLiabilityIssue } from '@/lib/equipmentLiability/store';
import { isSrs014FinancialApplyEnabled } from '@/lib/srs014Flags';
import { egpToMilliemes } from '@/lib/money';

function sampleIssue(
  overrides: Partial<EquipmentLiabilityIssue> = {}
): EquipmentLiabilityIssue {
  return {
    equipmentIssueId: 'eq_test_1',
    riderCode: 'R1',
    riderNameSnapshot: 'Rider',
    supervisorCodeSnapshot: 'SUP1',
    supervisorNameSnapshot: 'Sup',
    zoneSnapshot: 'Nasr city',
    bagType: 'moto',
    originalLiabilityMilli: egpToMilliemes(1000),
    outstandingMilli: egpToMilliemes(500),
    amountDeductedMilli: egpToMilliemes(200),
    settlementPaidMilli: egpToMilliemes(300),
    status: 'open',
    deliveryRowRef: '',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    updatedBy: '',
    ...overrides,
  } as EquipmentLiabilityIssue;
}

describe('Equipment payment proposals — RBAC', () => {
  it('EQUIPMENT_MANAGER menu includes proposals inbox; Recruitment Manager denied equipment_liability', () => {
    const eqMenu = filterAdminMenuForPermissions(
      buildPermissionsForOperationalRole('EQUIPMENT_MANAGER')
    );
    assert.ok(eqMenu.some((m) => m.href === '/admin/equipment-payment-proposals'));
    assert.equal(
      adminFeatureAllowed(
        buildPermissionsForOperationalRole('EQUIPMENT_MANAGER'),
        'equipment_liability'
      ),
      true
    );

    // Recruitment uses sentinel role (not admin) + no equipment_liability feature.
    assert.equal(roleAllowsFeature('RECRUITMENT_MANAGER', 'equipment_liability'), false);
    assert.equal(
      adminFeatureAllowed(
        buildPermissionsForOperationalRole('ACCOUNTING_MANAGER'),
        'equipment_liability'
      ),
      false
    );
    const acMenu = filterAdminMenuForPermissions(
      buildPermissionsForOperationalRole('ACCOUNTING_MANAGER')
    );
    assert.ok(!acMenu.some((m) => m.href === '/admin/equipment-payment-proposals'));
  });

  it('admin proposals API is gated by equipment_liability assert', () => {
    const route = readFileSync(
      join(process.cwd(), 'app/api/admin/equipment-payment-proposals/route.ts'),
      'utf8'
    );
    assert.ok(route.includes("assertAdminApiAccess(decoded, 'equipment_liability')"));
    assert.ok(route.includes('reviewEquipmentPaymentProposal'));
    assert.ok(!route.includes('isSrs014FinancialApplyEnabled'));
  });
});

describe('Equipment payment proposals — supervisor view + safety', () => {
  it('issueToSupervisorView derives PARTIAL when credited and outstanding remain', () => {
    const view = issueToSupervisorView(sampleIssue());
    assert.equal(view.paymentStatus, 'PARTIALLY_PAID');
    assert.equal(view.outstandingEgp, 500);
    assert.equal(view.equipmentIssueId, 'eq_test_1');
  });

  it('scopes liabilities by roster rider codes even when snapshot supervisor differs', () => {
    assert.equal(
      issueMatchesSupervisorScope({
        riderCode: '4802535',
        supervisorCodeSnapshot: 'OTHER_SUP',
        supervisorCode: 'SUP_A',
        rosterRiderCodes: ['4802535', '877614'],
      }),
      true
    );
    assert.equal(
      issueMatchesSupervisorScope({
        riderCode: '999999',
        supervisorCodeSnapshot: 'OTHER_SUP',
        supervisorCode: 'SUP_A',
        rosterRiderCodes: ['4802535'],
      }),
      false
    );
    assert.equal(
      issueMatchesSupervisorScope({
        riderCode: '999999',
        supervisorCodeSnapshot: 'SUP_A',
        supervisorCode: 'SUP_A',
        rosterRiderCodes: [],
      }),
      true
    );
  });

  it('FA remains OFF; proposal module does not enable FA or bulk-mutate pilots', () => {
    delete process.env.FEATURE_SRS014_FINANCIAL_APPLY_ENABLED;
    assert.equal(isSrs014FinancialApplyEnabled(), false);

    const mod = readFileSync(
      join(process.cwd(), 'lib/equipmentLiability/paymentProposals.ts'),
      'utf8'
    );
    assert.ok(mod.includes('applySettlementPayment'));
    assert.ok(mod.includes('getSupervisorRiders'));
    assert.ok(mod.includes('issueMatchesSupervisorScope'));
    assert.ok(!mod.includes('FEATURE_SRS014_FINANCIAL_APPLY'));
  });
});
