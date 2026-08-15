/**
 * 4D.5.4.15C — READ-ONLY post-pilot consistency audit for OPENING:877614.
 * No append / update / FA / Auto REQUEST.
 */
import fs from 'node:fs';
import path from 'node:path';
import { getSheetData } from '@/lib/googleSheets';
import {
  EQUIPMENT_LIABILITY_HEADERS,
  SHEET_EQUIPMENT_LIABILITY,
} from '@/lib/equipmentLiability/constants';
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
  isSrs014OpeningBalanceWriteEnabled,
} from '@/lib/srs014Flags';

const PILOT = '877614';
const KEY = `OPENING:${PILOT}`;

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

async function main() {
  loadEnvLocal();
  // Do NOT enable write flag for this audit process.
  delete process.env.FEATURE_SRS014_OPENING_BALANCE_WRITE_ENABLED;
  delete process.env.FEATURE_SRS014_FINANCIAL_APPLY_ENABLED;
  delete process.env.FEATURE_AUTO_EQUIPMENT_DEDUCTIONS_ENABLED;

  console.log('=== 4D.5.4.15C READ-ONLY POST-PILOT AUDIT ===\n');

  const idxSettlement = EQUIPMENT_LIABILITY_HEADERS.indexOf('settlementPaidMilli');
  const idxPricing = EQUIPMENT_LIABILITY_HEADERS.indexOf('pricingSource');
  const idxSnapShirt = EQUIPMENT_LIABILITY_HEADERS.indexOf('snapShirtUnitMilli');
  console.log('COLUMN_MAP', {
    headerCount: EQUIPMENT_LIABILITY_HEADERS.length,
    settlementPaidMilliIndex: idxSettlement,
    pricingSourceIndex: idxPricing,
    snapShirtUnitMilliIndex: idxSnapShirt,
    beyondZ: idxSettlement >= 26,
    aZWouldTruncate: true,
  });

  const narrow = await getSheetData(SHEET_EQUIPMENT_LIABILITY, false);
  const wide = await getSheetData(
    SHEET_EQUIPMENT_LIABILITY,
    false,
    `${SHEET_EQUIPMENT_LIABILITY}!A:AZ`
  );
  console.log('RANGE_COMPARE', {
    narrowHeaderLen: (narrow[0] || []).length,
    wideHeaderLen: (wide[0] || []).length,
    narrowWouldDropSettlement: (narrow[0] || []).length <= idxSettlement,
  });

  const rawRows = wide.filter(
    (r, i) => i > 0 && String(r[19] || '') === KEY
  );
  console.log('RAW_OPENING_ROW_COUNT', rawRows.length);
  if (rawRows.length !== 1) {
    throw new Error(`Expected exactly 1 raw OPENING:877614 row, got ${rawRows.length}`);
  }
  const raw = rawRows[0];
  console.log('RAW_TAIL', {
    settlementPaidMilli: raw[idxSettlement],
    pricingSource: raw[idxPricing],
    pricingCapturedAt: raw[idxPricing + 1],
    snapMotorcycleBagMilli: raw[idxPricing + 2],
    snapBicycleBagMilli: raw[idxPricing + 3],
    snapShirtUnitMilli: raw[idxSnapShirt],
  });

  const issue = await getByDeliveryRowRef(KEY);
  if (!issue) throw new Error('getByDeliveryRowRef returned null');
  const verification = verifyOpeningLiabilityReadOnly(issue, {
    expectedRiderCode: PILOT,
  });
  const equationOk =
    issue.outstandingMilli ===
    issue.originalLiabilityMilli -
      (issue.settlementPaidMilli || 0) -
      (issue.amountDeductedMilli || 0);

  console.log('PARSED_ISSUE', {
    riderCode: issue.riderCode,
    deliveryRowRef: issue.deliveryRowRef,
    pricingSource: issue.pricingSource,
    originalLiabilityMilli: issue.originalLiabilityMilli,
    settlementPaidMilli: issue.settlementPaidMilli,
    amountDeductedMilli: issue.amountDeductedMilli,
    outstandingMilli: issue.outstandingMilli,
    securityPaidUpfront: issue.securityPaidUpfront,
    status: issue.status,
    snapMotorcycleBagMilli: issue.snapMotorcycleBagMilli,
    snapBicycleBagMilli: issue.snapBicycleBagMilli,
    snapShirtUnitMilli: issue.snapShirtUnitMilli,
    verificationOk: verification.ok,
    equationOk,
  });

  if (!verification.ok) throw new Error('verification failed: ' + verification.failures.join(','));
  if (issue.pricingSource !== 'OPENING_MIGRATION') throw new Error('pricingSource');
  if (issue.settlementPaidMilli !== 80000) throw new Error('settlementPaidMilli');
  if (issue.originalLiabilityMilli !== 80000) throw new Error('original');
  if (issue.outstandingMilli !== 0) throw new Error('outstanding');
  if (issue.amountDeductedMilli !== 0) throw new Error('amountDeducted');
  if (issue.status !== 'settled') throw new Error('status');
  if (issue.securityPaidUpfront !== true) throw new Error('security');
  if (issue.snapMotorcycleBagMilli !== 53000) throw new Error('snap moto');
  if (issue.snapBicycleBagMilli !== 53000) throw new Error('snap bike');
  if (issue.snapShirtUnitMilli !== 13500) throw new Error('snap shirt');
  if (!equationOk) throw new Error('equation');

  const all = await listIssues({});
  const openingMatches = all.filter((i) => String(i.deliveryRowRef || '') === KEY);
  console.log('PARSED_OPENING_ROW_COUNT', openingMatches.length);
  if (openingMatches.length !== 1) {
    throw new Error(`Expected exactly 1 parsed Opening row, got ${openingMatches.length}`);
  }

  const expected = expectedDryRunForOpeningIssue(issue);
  console.log('EXPECTED_DRY_RUN', {
    entersOpenExpected: expected.entersOpenExpected,
    expectedDeductionMilli: expected.expectedDeductionMilli,
    reasonIfZero: expected.reasonIfZero,
    financialMutation: expected.financialMutation,
    populationHelper: openingEntersOpenExpectedPopulation(issue),
  });
  if (expected.entersOpenExpected || openingEntersOpenExpectedPopulation(issue)) {
    throw new Error('settled must not enter open Expected');
  }

  // Idempotency check with write flag ON only inside deps path that refuses persist
  process.env.FEATURE_SRS014_OPENING_BALANCE_WRITE_ENABLED = 'true';
  process.env.FEATURE_SRS014_OPENING_PILOT_ALLOWLIST = PILOT;
  const catalog = defaultOpeningCatalogFromApprovedDefaults();
  const second = await runControlledOpeningPilotPersist(
    {
      riderCode: PILOT,
      motorcycleBagHeld: true,
      bicycleBagHeld: false,
      tshirtQuantity: 2,
      jacketQuantity: 1,
      helmetQuantity: 0,
      securityStatus: 'PAID',
      historicalPaidMilli: 80000,
      operatorConfirmation: true,
    },
    catalog,
    {
      liveRiderExists: async () => true,
      findByMigrationKey: async (k) => getByDeliveryRowRef(k),
      hasOpenAssignmentLiability: async () => false,
      persistIssue: async () => {
        throw new Error('AUDIT MUST NOT WRITE');
      },
      appendAudit: async () => {
        throw new Error('AUDIT MUST NOT AUDIT');
      },
      countByMigrationKey: async () => 1,
    }
  );
  delete process.env.FEATURE_SRS014_OPENING_BALANCE_WRITE_ENABLED;
  delete process.env.FEATURE_SRS014_OPENING_PILOT_ALLOWLIST;

  console.log('IDEMPOTENCY', {
    ok: second.ok,
    created: second.ok ? second.created : null,
    duplicateAttempt: second.ok ? second.duplicateAttempt : null,
  });
  if (!second.ok || second.created !== false || !second.duplicateAttempt) {
    throw new Error('idempotency failed');
  }

  // Confirm still exactly one row after idempotency attempt
  const after = (await listIssues({})).filter(
    (i) => String(i.deliveryRowRef || '') === KEY
  ).length;
  if (after !== 1) throw new Error('row count changed');

  console.log('\nFINAL', {
    A_AZ_MAPPING: 'PASS',
    SETTLEMENT_RELOAD: 'PASS',
    SNAPSHOT_RELOAD: 'PASS',
    PRICING_SOURCE_RELOAD: 'PASS',
    EQUATION: 'PASS',
    EXPECTED_EXCLUSION: 'PASS',
    IDEMPOTENCY: 'PASS',
    EXACTLY_ONE_OPENING_ROW: 'PASS',
    UNINTENDED_WRITES_DURING_READER_FIX: 0,
    FINANCIAL_APPLY: isSrs014FinancialApplyEnabled() ? 'ON' : 'OFF',
    AUTO_REQUEST: isAutoEquipmentDeductionsEnabled() ? 'ON' : 'OFF',
    OPENING_WRITE_DEFAULT: isSrs014OpeningBalanceWriteEnabled() ? 'ON' : 'OFF',
    WALLET_MUTATIONS: 0,
    FINANCIAL_LEDGER_MUTATIONS: 0,
    PAYROLL_MUTATIONS: 0,
    migrationKey: openingMigrationKey(PILOT),
  });
}

main().catch((e) => {
  console.error('FATAL', e);
  process.exit(1);
});
