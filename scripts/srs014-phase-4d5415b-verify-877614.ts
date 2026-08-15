/**
 * 4D.5.4.15B — READ-ONLY re-verify Opening:877614 after A:AZ read fix.
 * Does NOT create another Opening.
 */
import fs from 'node:fs';
import path from 'node:path';
import { getByDeliveryRowRef, listIssues } from '@/lib/equipmentLiability/store';
import { openingMigrationKey } from '@/lib/equipmentLiability/openingBalance';
import {
  expectedDryRunForOpeningIssue,
  openingEntersOpenExpectedPopulation,
  runControlledOpeningPilotPersist,
  verifyOpeningLiabilityReadOnly,
} from '@/lib/equipmentLiability/openingPilot';
import { defaultOpeningCatalogFromApprovedDefaults } from '@/lib/equipmentLiability/openingBalance';
import {
  isAutoEquipmentDeductionsEnabled,
  isSrs014FinancialApplyEnabled,
} from '@/lib/srs014Flags';

const PILOT_RIDER = '877614';

function loadEnvLocal() {
  const envPath = path.join(process.cwd(), '.env.local');
  for (const line of fs.readFileSync(envPath, 'utf8').split(/\r?\n/)) {
    const t = line.trim();
    if (!t || t.startsWith('#')) continue;
    const eq = t.indexOf('=');
    if (eq <= 0) continue;
    const k = t.slice(0, eq).trim();
    let v = t.slice(eq + 1).trim();
    if (
      (v.startsWith('"') && v.endsWith('"')) ||
      (v.startsWith("'") && v.endsWith("'"))
    ) {
      v = v.slice(1, -1);
    }
    if (process.env[k] === undefined) process.env[k] = v;
  }
}

async function main() {
  loadEnvLocal();
  process.env.FEATURE_SRS014_OPENING_BALANCE_WRITE_ENABLED = 'true';
  process.env.FEATURE_SRS014_OPENING_PILOT_ALLOWLIST = PILOT_RIDER;
  delete process.env.FEATURE_SRS014_FINANCIAL_APPLY_ENABLED;
  delete process.env.FEATURE_AUTO_EQUIPMENT_DEDUCTIONS_ENABLED;

  const key = openingMigrationKey(PILOT_RIDER);
  const reloaded = await getByDeliveryRowRef(key);
  if (!reloaded) throw new Error('Opening row missing');

  const verification = verifyOpeningLiabilityReadOnly(reloaded, {
    expectedRiderCode: PILOT_RIDER,
  });

  console.log('RELOADED', {
    riderCode: reloaded.riderCode,
    deliveryRowRef: reloaded.deliveryRowRef,
    pricingSource: reloaded.pricingSource,
    originalLiabilityMilli: reloaded.originalLiabilityMilli,
    settlementPaidMilli: reloaded.settlementPaidMilli,
    amountDeductedMilli: reloaded.amountDeductedMilli,
    outstandingMilli: reloaded.outstandingMilli,
    securityPaidUpfront: reloaded.securityPaidUpfront,
    status: reloaded.status,
    snapMotorcycleBagMilli: reloaded.snapMotorcycleBagMilli,
    snapBicycleBagMilli: reloaded.snapBicycleBagMilli,
    snapShirtUnitMilli: reloaded.snapShirtUnitMilli,
    verificationOk: verification.ok,
    failures: verification.failures,
  });

  if (!verification.ok) throw new Error('VERIFY_FAIL ' + verification.failures.join(','));
  if (reloaded.pricingSource !== 'OPENING_MIGRATION') throw new Error('pricingSource');
  if (reloaded.originalLiabilityMilli !== 80000) throw new Error('original');
  if (reloaded.settlementPaidMilli !== 80000) throw new Error('settlement');
  if (reloaded.amountDeductedMilli !== 0) throw new Error('deducted');
  if (reloaded.outstandingMilli !== 0) throw new Error('outstanding');
  if (reloaded.status !== 'settled') throw new Error('status');
  if (reloaded.securityPaidUpfront !== true) throw new Error('security');

  const expected = expectedDryRunForOpeningIssue(reloaded);
  console.log('EXPECTED_DRY_RUN', expected);
  if (expected.entersOpenExpected || openingEntersOpenExpectedPopulation(reloaded)) {
    throw new Error('must not enter open Expected');
  }

  const catalog = defaultOpeningCatalogFromApprovedDefaults();
  const second = await runControlledOpeningPilotPersist(
    {
      riderCode: PILOT_RIDER,
      motorcycleBagHeld: true,
      bicycleBagHeld: false,
      tshirtQuantity: 2,
      jacketQuantity: 1,
      helmetQuantity: 0,
      securityStatus: 'PAID',
      historicalPaidMilli: 80000,
      operatorConfirmation: true,
      actorCode: 'human-go-15b',
      actorName: 'Human GO 15B',
    },
    catalog,
    {
      liveRiderExists: async () => true,
      findByMigrationKey: async (k) => getByDeliveryRowRef(k),
      hasOpenAssignmentLiability: async () => false,
      persistIssue: async () => {
        throw new Error('MUST NOT persist');
      },
      appendAudit: async () => {
        throw new Error('MUST NOT audit');
      },
      countByMigrationKey: async () => 1,
    }
  );
  console.log('DUPLICATE', {
    ok: second.ok,
    created: second.ok ? second.created : null,
    duplicateAttempt: second.ok ? second.duplicateAttempt : null,
  });
  if (!second.ok || second.created !== false) throw new Error('DUPLICATE_FAIL');

  const count = (await listIssues({})).filter(
    (i) => String(i.deliveryRowRef || '') === key
  ).length;
  console.log('FINAL_OK', {
    openingRowsForKey: count,
    FINANCIAL_APPLY: isSrs014FinancialApplyEnabled() ? 'ON' : 'OFF',
    AUTO_REQUEST: isAutoEquipmentDeductionsEnabled() ? 'ON' : 'OFF',
    POST_WRITE_VERIFICATION: 'PASS',
    EXPECTED_DRY_RUN: 'PASS',
    DUPLICATE_CHECK: 'PASS',
  });
  if (count !== 1) throw new Error('expected exactly 1 row');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
