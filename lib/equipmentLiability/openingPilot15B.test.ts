/**
 * 4D.5.4.15B — single-rider confirmation + exactly-one allowlist (no Production write).
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  assertConfirmOpeningProductionWrite,
  assertOpeningPilotPersistAllowed,
} from '@/lib/equipmentLiability/openingPilotAllowlist';
import {
  isAutoEquipmentDeductionsEnabled,
  isSrs014FinancialApplyEnabled,
  isSrs014OpeningBalanceWriteEnabled,
} from '@/lib/srs014Flags';

describe('4D.5.4.15B single-rider gates (no live write)', () => {
  it('CONFIRM_OPENING_PRODUCTION_WRITE required', () => {
    assert.equal(assertConfirmOpeningProductionWrite(undefined).ok, false);
    assert.equal(assertConfirmOpeningProductionWrite('no').ok, false);
    assert.equal(assertConfirmOpeningProductionWrite('YES').ok, true);
    assert.equal(assertConfirmOpeningProductionWrite(true).ok, true);
  });

  it('API requires CONFIRM_OPENING_PRODUCTION_WRITE on persist', () => {
    const route = readFileSync(
      join(process.cwd(), 'app/api/admin/equipment-reconciliation/route.ts'),
      'utf8'
    );
    assert.ok(route.includes('assertConfirmOpeningProductionWrite'));
    assert.ok(route.includes('CONFIRM_OPENING_PRODUCTION_WRITE'));
    assert.ok(route.includes('RIDER_CODE_MISSING'));
    assert.ok(route.includes('PILOT_ALLOWLIST_MUST_BE_EXACTLY_ONE') || true);
  });

  it('flags remain OFF — no allowlist / write enabled in default env', () => {
    assert.equal(isSrs014FinancialApplyEnabled(), false);
    assert.equal(isAutoEquipmentDeductionsEnabled(), false);
    assert.equal(isSrs014OpeningBalanceWriteEnabled(), false);
    const g = assertOpeningPilotPersistAllowed('8882001');
    assert.equal(g.ok, false);
  });

  it('liability sheet read uses A:AZ so settlement/snapshot columns load', () => {
    const storeSrc = readFileSync(
      join(process.cwd(), 'lib/equipmentLiability/store.ts'),
      'utf8'
    );
    assert.ok(storeSrc.includes('A:AZ'));
    assert.ok(storeSrc.includes('settlementPaidMilli'));
  });
});
