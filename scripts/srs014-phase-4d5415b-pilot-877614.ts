/**
 * 4D.5.4.15B — SINGLE-RIDER controlled Production Opening for 877614 ONLY.
 *
 * Explicit HUMAN GO. Writes at most:
 * 1) Opening Liability row
 * 2) create_opening_liability audit
 *
 * Does NOT enable FA / Auto REQUEST / wallet / ledger / payroll.
 *
 * Usage:
 *   npx --yes tsx scripts/srs014-phase-4d5415b-pilot-877614.ts
 */
import fs from 'node:fs';
import path from 'node:path';
import { getSheetData } from '@/lib/googleSheets';
import {
  appendLiabilityIssue,
  getByDeliveryRowRef,
  listIssues,
} from '@/lib/equipmentLiability/store';
import {
  calculateOpeningLiability,
  defaultOpeningCatalogFromApprovedDefaults,
  openingMigrationKey,
} from '@/lib/equipmentLiability/openingBalance';
import {
  expectedDryRunForOpeningIssue,
  openingEntersOpenExpectedPopulation,
  runControlledOpeningPilotPersist,
  verifyOpeningLiabilityReadOnly,
} from '@/lib/equipmentLiability/openingPilot';
import {
  isOpeningMigrationIssue,
  parseLiveRidersFromSheet,
} from '@/lib/equipmentLiability/openingReconciliationUi';
import { loadAdminEquipmentPricingFromSheets } from '@/lib/equipmentPricing/loadAdminPricing';
import { milliemesToEgp } from '@/lib/money';
import { normalizeRiderCodeForPerformance } from '@/lib/riderCodeUtils';
import {
  isAutoEquipmentDeductionsEnabled,
  isSrs014FinancialApplyEnabled,
  isSrs014OpeningBalanceWriteEnabled,
} from '@/lib/srs014Flags';

const PILOT_RIDER = '877614';

function loadEnvLocal() {
  const envPath = path.join(process.cwd(), '.env.local');
  if (!fs.existsSync(envPath)) return;
  const text = fs.readFileSync(envPath, 'utf8');
  for (const line of text.split(/\r?\n/)) {
    const t = line.trim();
    if (!t || t.startsWith('#')) continue;
    const eq = t.indexOf('=');
    if (eq <= 0) continue;
    const key = t.slice(0, eq).trim();
    let val = t.slice(eq + 1).trim();
    if (
      (val.startsWith('"') && val.endsWith('"')) ||
      (val.startsWith("'") && val.endsWith("'"))
    ) {
      val = val.slice(1, -1);
    }
    if (process.env[key] === undefined) process.env[key] = val;
  }
}

async function loadCatalog() {
  const loaded = await loadAdminEquipmentPricingFromSheets();
  if (loaded.ok) {
    return {
      motorcycleBagMilli: loaded.pricing.motorcycleBagMilli,
      bicycleBagMilli: loaded.pricing.bicycleBagMilli,
      shirtMilli: loaded.pricing.shirtMilli,
      securityFeeMilli: loaded.pricing.securityFeeMilli,
      jacketMilli: loaded.pricing.jacketMilli,
      helmetMilli: loaded.pricing.helmetMilli,
      source: 'admin_sheet' as const,
    };
  }
  return {
    ...defaultOpeningCatalogFromApprovedDefaults(),
    source: 'approved_defaults_reference' as const,
  };
}

async function main() {
  loadEnvLocal();

  process.env.FEATURE_SRS014_OPENING_BALANCE_WRITE_ENABLED = 'true';
  process.env.FEATURE_SRS014_OPENING_PILOT_ALLOWLIST = PILOT_RIDER;
  delete process.env.FEATURE_SRS014_FINANCIAL_APPLY_ENABLED;
  delete process.env.FEATURE_AUTO_EQUIPMENT_DEDUCTIONS_ENABLED;

  console.log('=== 4D.5.4.15B SINGLE-RIDER PILOT 877614 ===\n');

  const safety = {
    FINANCIAL_APPLY: isSrs014FinancialApplyEnabled() ? 'ON' : 'OFF',
    AUTO_REQUEST: isAutoEquipmentDeductionsEnabled() ? 'ON' : 'OFF',
    OPENING_WRITE: isSrs014OpeningBalanceWriteEnabled() ? 'ON' : 'OFF',
  };
  console.log('SAFETY', safety);
  if (safety.FINANCIAL_APPLY !== 'OFF' || safety.AUTO_REQUEST !== 'OFF') {
    throw new Error('STOP: FA or Auto REQUEST must be OFF');
  }

  const liveData = await getSheetData('المناديب', false);
  const riders = parseLiveRidersFromSheet(liveData);
  const live = riders.find((r) => r.riderCode === PILOT_RIDER);
  if (!live) {
    throw new Error('STOP: rider 877614 not found in المناديب');
  }
  console.log('LIVE_RIDER', {
    riderCode: live.riderCode,
    name: live.name,
    zone: live.zone,
    supervisor: live.supervisorName || live.supervisorCode,
    active: live.active,
  });

  const issues = await listIssues({});
  const openingKey = openingMigrationKey(PILOT_RIDER);
  const existingOpening = issues.find(
    (i) =>
      normalizeRiderCodeForPerformance(i.riderCode) === PILOT_RIDER &&
      isOpeningMigrationIssue(i)
  );
  const otherOpen = issues.find(
    (i) =>
      normalizeRiderCodeForPerformance(i.riderCode) === PILOT_RIDER &&
      i.status === 'open' &&
      !isOpeningMigrationIssue(i)
  );
  const byKey = await getByDeliveryRowRef(openingKey);

  console.log('PRECHECK', {
    alreadyMigrated: Boolean(existingOpening),
    openingKeyUnused: !byKey,
    conflictingOpenLiability: Boolean(otherOpen),
  });

  if (existingOpening || byKey) {
    throw new Error('STOP: OPENING:877614 already exists — refuse duplicate write');
  }
  if (otherOpen) {
    throw new Error('STOP: conflicting open liability exists');
  }

  const catalogBundle = await loadCatalog();
  const { source: catalogSource, ...catalog } = catalogBundle;

  const input = {
    riderCode: PILOT_RIDER,
    motorcycleBagHeld: true,
    bicycleBagHeld: false,
    tshirtQuantity: 2,
    jacketQuantity: 1,
    helmetQuantity: 0,
    securityStatus: 'PAID' as const,
    historicalPaidMilli: 80000,
    operatorConfirmation: true,
    evidenceReference: 'HUMAN_GO_15B_877614',
    notes:
      'Equipment fully paid = 800 EGP. Security inquiry paid = 100 EGP (securityPaidUpfront). Total historical cash 900; equipment historical paid = 800 only. Rider has no outstanding equipment balance.',
    riderNameSnapshot: live.name,
    zoneSnapshot: live.zone,
    supervisorCodeSnapshot: live.supervisorCode,
    supervisorNameSnapshot: live.supervisorName,
    actorCode: 'human-go-15b',
    actorName: 'Human GO 15B',
  };

  const preview = calculateOpeningLiability(input, catalog);
  if ('ok' in preview && preview.ok === false) {
    throw new Error(`STOP preview failed: ${preview.code} ${preview.error}`);
  }

  console.log('\nPREVIEW', {
    catalogSource,
    bagEgp: milliemesToEgp(preview.bagCostMilli),
    shirtEgp: milliemesToEgp(preview.shirtCostMilli),
    jacketEgp: milliemesToEgp(preview.jacketCostMilli),
    helmetEgp: milliemesToEgp(preview.helmetCostMilli),
    securityFeeCatalogEgp: milliemesToEgp(preview.securityFeeMilli),
    securityPaidUpfront: preview.securityPaidUpfront,
    originalEgp: milliemesToEgp(preview.originalLiabilityMilli),
    historicalEquipmentPaidEgp: milliemesToEgp(preview.historicalPaidMilli),
    outstandingEgp: milliemesToEgp(preview.outstandingMilli),
    status: preview.status,
    migrationKey: preview.migrationKey,
    originalLiabilityMilli: preview.originalLiabilityMilli,
    settlementPaidMilli: preview.historicalPaidMilli,
    snap: {
      motorcycleBagMilli: catalog.motorcycleBagMilli,
      bicycleBagMilli: catalog.bicycleBagMilli,
      shirtMilli: catalog.shirtMilli,
      securityFeeMilli: catalog.securityFeeMilli,
      jacketMilli: catalog.jacketMilli,
      helmetMilli: catalog.helmetMilli,
    },
  });

  if (preview.originalLiabilityMilli !== 80000) {
    throw new Error(
      `STOP: expected Original 800 EGP (80000 milli), got ${preview.originalLiabilityMilli}`
    );
  }
  if (preview.historicalPaidMilli !== 80000) {
    throw new Error('STOP: expected Historical Equipment Paid 80000 milli');
  }
  if (preview.outstandingMilli !== 0 || preview.status !== 'settled') {
    throw new Error('STOP: expected settled outstanding 0');
  }
  if (preview.securityPaidUpfront !== true) {
    throw new Error('STOP: expected securityPaidUpfront=true');
  }

  console.log('\nCONFIRM_OPENING_PRODUCTION_WRITE=YES — persisting ONE Opening...\n');

  const result = await runControlledOpeningPilotPersist(input, catalog, {
    liveRiderExists: async (rc) =>
      riders.some((r) => r.riderCode === normalizeRiderCodeForPerformance(rc)),
    findByMigrationKey: async (key) => getByDeliveryRowRef(key),
    hasOpenAssignmentLiability: async (rc) => {
      const norm = normalizeRiderCodeForPerformance(rc);
      const all = await listIssues({});
      return all.some(
        (i) =>
          normalizeRiderCodeForPerformance(i.riderCode) === norm &&
          i.status === 'open' &&
          !isOpeningMigrationIssue(i)
      );
    },
    persistIssue: appendLiabilityIssue,
    countByMigrationKey: async (key) => {
      const all = await listIssues({});
      return all.filter((i) => String(i.deliveryRowRef || '') === key).length;
    },
  });

  if (!result.ok) {
    console.error('WRITE_FAILED', result);
    process.exit(1);
  }

  console.log('WRITE_OK', {
    created: result.created,
    equipmentIssueId: result.issue.equipmentIssueId,
    mode: result.mode,
    auditAction: result.auditAction,
  });

  const reloaded = await getByDeliveryRowRef(openingKey);
  if (!reloaded) {
    throw new Error('POST_WRITE_VERIFICATION_FAILED: row not found after write');
  }
  const verification = verifyOpeningLiabilityReadOnly(reloaded, {
    expectedRiderCode: PILOT_RIDER,
  });
  console.log('\nPOST_WRITE_RELOAD', {
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
    verificationFailures: verification.failures,
  });

  if (!verification.ok) {
    throw new Error(`POST_WRITE_VERIFICATION=FAIL ${verification.failures.join(',')}`);
  }
  if (reloaded.originalLiabilityMilli !== 80000) throw new Error('bad original');
  if (reloaded.settlementPaidMilli !== 80000) throw new Error('bad settlementPaid');
  if (reloaded.amountDeductedMilli !== 0) throw new Error('bad amountDeducted');
  if (reloaded.outstandingMilli !== 0) throw new Error('bad outstanding');
  if (reloaded.securityPaidUpfront !== true) throw new Error('bad securityPaidUpfront');
  if (reloaded.status !== 'settled') throw new Error('bad status');
  if (reloaded.settlementPaidMilli === 90000) {
    throw new Error('Security 100 incorrectly included in equipment historical paid');
  }

  const expected = expectedDryRunForOpeningIssue(reloaded);
  console.log('\nEXPECTED_DRY_RUN', {
    entersOpenExpected: expected.entersOpenExpected,
    expectedDeductionMilli: expected.expectedDeductionMilli,
    reasonIfZero: expected.reasonIfZero,
    financialMutation: expected.financialMutation,
    autoRequestEnabled: expected.autoRequestEnabled,
    financialApplyEnabled: expected.financialApplyEnabled,
    openingEntersOpenExpectedPopulation: openingEntersOpenExpectedPopulation(reloaded),
  });
  if (expected.entersOpenExpected || openingEntersOpenExpectedPopulation(reloaded)) {
    throw new Error('EXPECTED dry-run: settled opening must NOT enter open Expected');
  }

  const second = await runControlledOpeningPilotPersist(input, catalog, {
    liveRiderExists: async () => true,
    findByMigrationKey: async (key) => getByDeliveryRowRef(key),
    hasOpenAssignmentLiability: async () => false,
    persistIssue: async () => {
      throw new Error('MUST NOT persist on duplicate');
    },
    appendAudit: async () => {
      throw new Error('MUST NOT audit on duplicate');
    },
    countByMigrationKey: async () => 1,
  });
  console.log('\nDUPLICATE_CHECK', {
    ok: second.ok,
    created: second.ok ? second.created : null,
    duplicateAttempt: second.ok ? second.duplicateAttempt : null,
  });
  if (!second.ok || second.created !== false || second.duplicateAttempt !== true) {
    throw new Error('DUPLICATE_CHECK=FAIL');
  }

  const afterCount = (await listIssues({})).filter(
    (i) => String(i.deliveryRowRef || '') === openingKey
  ).length;
  console.log('\nFINAL', {
    PILOT_RIDER_CODE: PILOT_RIDER,
    ORIGINAL_EGP: 800,
    ORIGINAL_MILLI: 80000,
    HISTORICAL_EQUIPMENT_PAID_EGP: 800,
    HISTORICAL_EQUIPMENT_PAID_MILLI: 80000,
    OUTSTANDING_EGP: 0,
    SECURITY_STATUS: 'PAID',
    securityPaidUpfront: true,
    MIGRATION_KEY: openingKey,
    PRODUCTION_WRITE: 'SUCCESS',
    AUDIT_WRITE: 'SUCCESS',
    POST_WRITE_VERIFICATION: 'PASS',
    EXPECTED_DRY_RUN: 'PASS',
    DUPLICATE_CHECK: 'PASS',
    openingRowsForKey: afterCount,
    FINANCIAL_APPLY: isSrs014FinancialApplyEnabled() ? 'ON' : 'OFF',
    AUTO_REQUEST: isAutoEquipmentDeductionsEnabled() ? 'ON' : 'OFF',
    WALLET_MUTATIONS: 0,
    FINANCIAL_LEDGER_MUTATIONS: 0,
    PAYROLL_MUTATIONS: 0,
    FINANCIAL_TRANSACTIONS: 0,
    FLOW_B_LIABILITIES_CREATED: 0,
  });

  if (afterCount !== 1) {
    throw new Error(`Expected exactly 1 Opening row, found ${afterCount}`);
  }
}

main().catch((e) => {
  console.error('FATAL', e);
  process.exit(1);
});
