/**
 * 4D.5.4.15C — READ-ONLY consistency tests (A:AZ mapping + settled Opening rules).
 * No Production Sheets I/O in this file.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { EQUIPMENT_LIABILITY_HEADERS } from '@/lib/equipmentLiability/constants';
import {
  buildOpeningLiabilityIssue,
  defaultOpeningCatalogFromApprovedDefaults,
} from '@/lib/equipmentLiability/openingBalance';
import {
  expectedDryRunForOpeningIssue,
  openingEntersOpenExpectedPopulation,
  verifyOpeningLiabilityReadOnly,
} from '@/lib/equipmentLiability/openingPilot';
import {
  isAutoEquipmentDeductionsEnabled,
  isSrs014FinancialApplyEnabled,
  isSrs014OpeningBalanceWriteEnabled,
} from '@/lib/srs014Flags';

describe('4D.5.4.15C A:AZ column mapping contract', () => {
  it('settlement + snapshot columns are beyond index 25 (A:Z truncation hazard)', () => {
    const settlement = EQUIPMENT_LIABILITY_HEADERS.indexOf('settlementPaidMilli');
    const pricing = EQUIPMENT_LIABILITY_HEADERS.indexOf('pricingSource');
    const snapMoto = EQUIPMENT_LIABILITY_HEADERS.indexOf('snapMotorcycleBagMilli');
    const snapBike = EQUIPMENT_LIABILITY_HEADERS.indexOf('snapBicycleBagMilli');
    const snapShirt = EQUIPMENT_LIABILITY_HEADERS.indexOf('snapShirtUnitMilli');
    assert.equal(settlement, 26);
    assert.equal(pricing, 27);
    assert.equal(snapMoto, 29);
    assert.equal(snapBike, 30);
    assert.equal(snapShirt, 31);
    assert.ok(settlement >= 26);
  });

  it('store readAllIssues uses A:AZ override', () => {
    const src = readFileSync(
      join(process.cwd(), 'lib/equipmentLiability/store.ts'),
      'utf8'
    );
    assert.ok(src.includes('A:AZ'));
    assert.ok(src.includes('A:Z truncates'));
    // issueToRow order matches headers for settlement/pricing/snaps
    assert.ok(src.includes('issue.settlementPaidMilli'));
    assert.ok(src.includes('issue.pricingSource'));
    assert.ok(src.includes('issue.snapMotorcycleBagMilli'));
  });
});

describe('4D.5.4.15C settled Opening consistency (mocked 877614 shape)', () => {
  it('equation + OPENING_MIGRATION + Expected exclusion', () => {
    const catalog = defaultOpeningCatalogFromApprovedDefaults();
    const built = buildOpeningLiabilityIssue(
      {
        riderCode: '877614',
        motorcycleBagHeld: true,
        bicycleBagHeld: false,
        tshirtQuantity: 2,
        jacketQuantity: 1,
        helmetQuantity: 0,
        securityStatus: 'PAID',
        historicalPaidMilli: 80000,
        operatorConfirmation: true,
      },
      catalog
    );
    assert.ok(built.ok);
    if (!built.ok) return;
    const issue = built.issue;
    assert.equal(issue.deliveryRowRef, 'OPENING:877614');
    assert.equal(issue.pricingSource, 'OPENING_MIGRATION');
    assert.equal(issue.originalLiabilityMilli, 80000);
    assert.equal(issue.settlementPaidMilli, 80000);
    assert.equal(issue.amountDeductedMilli, 0);
    assert.equal(issue.outstandingMilli, 0);
    assert.equal(issue.status, 'settled');
    assert.equal(issue.securityPaidUpfront, true);
    assert.equal(issue.snapMotorcycleBagMilli, 53000);
    assert.equal(issue.snapShirtUnitMilli, 13500);
    const v = verifyOpeningLiabilityReadOnly(issue, { expectedRiderCode: '877614' });
    assert.equal(v.ok, true);
    assert.equal(openingEntersOpenExpectedPopulation(issue), false);
    const dry = expectedDryRunForOpeningIssue(issue);
    assert.equal(dry.entersOpenExpected, false);
    assert.equal(dry.financialMutation, false);
  });

  it('financial flags remain OFF in default test env', () => {
    assert.equal(isSrs014FinancialApplyEnabled(), false);
    assert.equal(isAutoEquipmentDeductionsEnabled(), false);
    assert.equal(isSrs014OpeningBalanceWriteEnabled(), false);
  });
});
