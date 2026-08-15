/**
 * 4D.5.4.15B Pilot #2 — SINGLE-RIDER Production Opening for 4802535 ONLY.
 * Explicit HUMAN GO. Does not touch 877614 / 4811093.
 * FA / Auto REQUEST remain OFF.
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

const PILOT_RIDER = '4802535';
const FORBIDDEN = new Set(['877614', '4811093']);

function loadEnvLocal() {
  const envPath = path.join(process.cwd(), '.env.local');
  if (!fs.existsSync(envPath)) return;
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

  console.log('=== 4D.5.4.15B PILOT #2 — 4802535 ===\n');

  if (FORBIDDEN.has(PILOT_RIDER)) throw new Error('forbidden rider');

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
  if (!live) throw new Error('STOP: rider 4802535 not found in المناديب');
  console.log('LIVE_RIDER', {
    riderCode: live.riderCode,
    name: live.name,
    zone: live.zone,
    supervisor: live.supervisorName || live.supervisorCode,
    active: live.active,
  });

  const openingKey = openingMigrationKey(PILOT_RIDER);
  const issues = await listIssues({});
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
  const opening877614 = issues.filter((i) => i.deliveryRowRef === 'OPENING:877614');

  console.log('PRECHECK', {
    alreadyMigrated: Boolean(existingOpening),
    openingKeyUnused: !byKey,
    conflictingOpenLiability: Boolean(otherOpen),
    opening877614Count: opening877614.length,
  });
  if (existingOpening || byKey) {
    throw new Error('STOP: OPENING:4802535 already exists');
  }
  if (otherOpen) throw new Error('STOP: conflicting open liability');
  if (opening877614.length !== 1) {
    console.warn('WARN: unexpected OPENING:877614 count', opening877614.length);
  }

  const catalogBundle = await loadCatalog();
  const { source: catalogSource, ...catalog } = catalogBundle;

  const input = {
    riderCode: PILOT_RIDER,
    motorcycleBagHeld: true,
    bicycleBagHeld: false,
    tshirtQuantity: 2,
    jacketQuantity: 0,
    helmetQuantity: 0,
    securityStatus: 'NOT_PAID' as const,
    historicalPaidMilli: 40000, // 400 EGP equipment historical
    operatorConfirmation: true,
    evidenceReference: 'HUMAN_GO_15B_PILOT2_4802535',
    notes:
      'Pilot #2. Security NOT_PAID (100 in original). Historical equipment paid 400 EGP. Outstanding 500.',
    riderNameSnapshot: live.name,
    zoneSnapshot: live.zone,
    supervisorCodeSnapshot: live.supervisorCode,
    supervisorNameSnapshot: live.supervisorName,
    actorCode: 'human-go-15b-p2',
    actorName: 'Human GO 15B Pilot2',
  };

  const preview = calculateOpeningLiability(input, catalog);
  if ('ok' in preview && preview.ok === false) {
    throw new Error(`STOP preview: ${preview.code} ${preview.error}`);
  }

  console.log('\nPREVIEW', {
    catalogSource,
    bagEgp: milliemesToEgp(preview.bagCostMilli),
    shirtEgp: milliemesToEgp(preview.shirtCostMilli),
    securityContributionEgp: preview.securityPaidUpfront
      ? 0
      : milliemesToEgp(preview.securityFeeMilli),
    securityPaidUpfront: preview.securityPaidUpfront,
    originalEgp: milliemesToEgp(preview.originalLiabilityMilli),
    historicalPaidEgp: milliemesToEgp(preview.historicalPaidMilli),
    outstandingEgp: milliemesToEgp(preview.outstandingMilli),
    status: preview.status,
    migrationKey: preview.migrationKey,
    originalLiabilityMilli: preview.originalLiabilityMilli,
    settlementPaidMilli: preview.historicalPaidMilli,
    outstandingMilli: preview.outstandingMilli,
    equation:
      preview.originalLiabilityMilli -
      preview.historicalPaidMilli -
      0 ===
      preview.outstandingMilli,
    snap: {
      motorcycleBagMilli: catalog.motorcycleBagMilli,
      bicycleBagMilli: catalog.bicycleBagMilli,
      shirtMilli: catalog.shirtMilli,
      securityFeeMilli: catalog.securityFeeMilli,
    },
  });

  if (preview.originalLiabilityMilli !== 90000) {
    throw new Error(`STOP: expected Original 90000 milli, got ${preview.originalLiabilityMilli}`);
  }
  if (preview.historicalPaidMilli !== 40000) throw new Error('STOP: paid');
  if (preview.outstandingMilli !== 50000) throw new Error('STOP: outstanding');
  if (preview.status !== 'open') throw new Error('STOP: status open');
  if (preview.securityPaidUpfront !== false) throw new Error('STOP: security NOT_PAID');
  if (preview.amountDeductedMilli !== 0) throw new Error('STOP: deducted');

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
    auditAction: result.auditAction,
  });

  const reloaded = await getByDeliveryRowRef(openingKey);
  if (!reloaded) throw new Error('POST_WRITE missing row');
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
    failures: verification.failures,
  });

  if (!verification.ok) {
    throw new Error('POST_WRITE_VERIFICATION=FAIL ' + verification.failures.join(','));
  }
  if (reloaded.originalLiabilityMilli !== 90000) throw new Error('original');
  if (reloaded.settlementPaidMilli !== 40000) throw new Error('settlement');
  if (reloaded.amountDeductedMilli !== 0) throw new Error('deducted');
  if (reloaded.outstandingMilli !== 50000) throw new Error('outstanding');
  if (reloaded.securityPaidUpfront !== false) throw new Error('security');
  if (reloaded.status !== 'open') throw new Error('status');
  if (reloaded.pricingSource !== 'OPENING_MIGRATION') throw new Error('pricingSource');
  if (reloaded.snapMotorcycleBagMilli !== 53000) throw new Error('snap moto');
  if (reloaded.snapBicycleBagMilli !== 53000) throw new Error('snap bike');
  if (reloaded.snapShirtUnitMilli !== 13500) throw new Error('snap shirt');
  if (
    reloaded.outstandingMilli !==
    reloaded.originalLiabilityMilli -
      reloaded.settlementPaidMilli -
      reloaded.amountDeductedMilli
  ) {
    throw new Error('equation');
  }

  const expected = expectedDryRunForOpeningIssue(reloaded);
  console.log('\nEXPECTED_DRY_RUN', {
    entersOpenExpected: expected.entersOpenExpected,
    expectedDeductionMilli: expected.expectedDeductionMilli,
    expectedDeductionEgp: milliemesToEgp(expected.expectedDeductionMilli),
    reasonIfZero: expected.reasonIfZero,
    financialMutation: expected.financialMutation,
    autoRequestEnabled: expected.autoRequestEnabled,
    financialApplyEnabled: expected.financialApplyEnabled,
    populationHelper: openingEntersOpenExpectedPopulation(reloaded),
  });
  if (!expected.entersOpenExpected || !openingEntersOpenExpectedPopulation(reloaded)) {
    throw new Error('open outstanding must enter Expected population');
  }
  if (expected.expectedDeductionMilli <= 0) {
    throw new Error('Expected installment preview should be > 0 for open 500 outstanding');
  }
  if (expected.financialMutation !== false) throw new Error('Expected mutated');
  if (expected.autoRequestEnabled || expected.financialApplyEnabled) {
    throw new Error('FA/AR must stay OFF');
  }

  const second = await runControlledOpeningPilotPersist(input, catalog, {
    liveRiderExists: async () => true,
    findByMigrationKey: async (key) => getByDeliveryRowRef(key),
    hasOpenAssignmentLiability: async () => false,
    persistIssue: async () => {
      throw new Error('MUST NOT persist');
    },
    appendAudit: async () => {
      throw new Error('MUST NOT audit');
    },
    countByMigrationKey: async () => 1,
  });
  console.log('\nDUPLICATE_CHECK', {
    ok: second.ok,
    created: second.ok ? second.created : null,
    duplicateAttempt: second.ok ? second.duplicateAttempt : null,
  });
  if (!second.ok || second.created !== false || !second.duplicateAttempt) {
    throw new Error('DUPLICATE_CHECK=FAIL');
  }

  const all = await listIssues({});
  const count480 = all.filter((i) => String(i.deliveryRowRef || '') === openingKey).length;
  const count877 = all.filter((i) => String(i.deliveryRowRef || '') === 'OPENING:877614')
    .length;
  if (count480 !== 1) throw new Error(`expected 1 Opening for 4802535, got ${count480}`);
  if (count877 !== 1) throw new Error(`877614 must remain exactly 1, got ${count877}`);

  console.log('\nFINAL', {
    PILOT_RIDER_CODE: PILOT_RIDER,
    ORIGINAL_EGP: 900,
    ORIGINAL_MILLI: 90000,
    HISTORICAL_EQUIPMENT_PAID_EGP: 400,
    HISTORICAL_EQUIPMENT_PAID_MILLI: 40000,
    OUTSTANDING_EGP: 500,
    OUTSTANDING_MILLI: 50000,
    SECURITY_STATUS: 'NOT_PAID',
    securityPaidUpfront: false,
    MIGRATION_KEY: openingKey,
    PRODUCTION_WRITE: 'SUCCESS',
    AUDIT_WRITE: 'SUCCESS',
    POST_WRITE_VERIFICATION: 'PASS',
    EXPECTED_DRY_RUN: 'PASS',
    DUPLICATE_CHECK: 'PASS',
    openingRows4802535: count480,
    openingRows877614: count877,
    FINANCIAL_APPLY: isSrs014FinancialApplyEnabled() ? 'ON' : 'OFF',
    AUTO_REQUEST: isAutoEquipmentDeductionsEnabled() ? 'ON' : 'OFF',
    WALLET_MUTATIONS: 0,
    FINANCIAL_LEDGER_MUTATIONS: 0,
    PAYROLL_MUTATIONS: 0,
    FINANCIAL_TRANSACTIONS: 0,
    FLOW_B_LIABILITIES_CREATED: 0,
  });
}

main().catch((e) => {
  console.error('FATAL', e);
  process.exit(1);
});
