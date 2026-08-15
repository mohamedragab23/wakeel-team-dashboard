/**
 * 4D.5.4.15D — READ-ONLY Expected installment audit for Opening:4802535.
 * No Production writes. No REQUEST / FA / Auto REQUEST.
 */
import fs from 'node:fs';
import path from 'node:path';
import { getByDeliveryRowRef, listIssues } from '@/lib/equipmentLiability/store';
import {
  simulateExpectedInstallmentLadder,
  totalTheoreticalDeductions,
} from '@/lib/equipmentLiability/expectedInstallmentLadder';
import { expectedDryRunForOpeningIssue } from '@/lib/equipmentLiability/openingPilot';
import { milliemesToEgp } from '@/lib/money';
import { scheduleFromPersistedOriginalMilli } from '@/lib/equipmentPricing/computeFromPricing';
import {
  isAutoEquipmentDeductionsEnabled,
  isSrs014FinancialApplyEnabled,
} from '@/lib/srs014Flags';

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
  delete process.env.FEATURE_SRS014_FINANCIAL_APPLY_ENABLED;
  delete process.env.FEATURE_AUTO_EQUIPMENT_DEDUCTIONS_ENABLED;
  delete process.env.FEATURE_SRS014_OPENING_BALANCE_WRITE_ENABLED;

  console.log('=== 4D.5.4.15D READ-ONLY EXPECTED INSTALLMENT AUDIT ===\n');

  const issue = await getByDeliveryRowRef('OPENING:4802535');
  if (!issue) throw new Error('OPENING:4802535 missing');

  console.log('RELOADED', {
    riderCode: issue.riderCode,
    originalLiabilityMilli: issue.originalLiabilityMilli,
    settlementPaidMilli: issue.settlementPaidMilli,
    amountDeductedMilli: issue.amountDeductedMilli,
    outstandingMilli: issue.outstandingMilli,
    installmentsCompleted: issue.installmentsCompleted,
    status: issue.status,
    pricingSource: issue.pricingSource,
  });

  if (issue.originalLiabilityMilli !== 90000) throw new Error('original');
  if (issue.settlementPaidMilli !== 40000) throw new Error('settlement');
  if (issue.amountDeductedMilli !== 0) throw new Error('deducted');
  if (issue.outstandingMilli !== 50000) throw new Error('outstanding');
  if (issue.status !== 'open') throw new Error('status');
  if (issue.installmentsCompleted !== 0) throw new Error('installmentsCompleted must be 0');

  const schedule = scheduleFromPersistedOriginalMilli(issue.originalLiabilityMilli);
  console.log('SCHEDULE_FROM_PERSISTED_ORIGINAL', schedule);

  const steps = simulateExpectedInstallmentLadder({
    originalLiabilityMilli: issue.originalLiabilityMilli,
    openingOutstandingMilli: issue.outstandingMilli,
    amountDeductedMilli: issue.amountDeductedMilli,
    installmentsCompleted: issue.installmentsCompleted,
  });

  const c1 = steps[0];
  const c2 = steps[1];
  const c3 = steps[2];
  console.log('CYCLE_1', {
    outstandingEgp: milliemesToEgp(c1.currentOutstandingMilli),
    normalInstallmentEgp: milliemesToEgp(c1.normalInstallmentMilli),
    expectedEgp: milliemesToEgp(c1.expectedDeductionMilli),
    remainingEgp: milliemesToEgp(c1.theoreticalRemainingMilli),
  });
  console.log('CYCLE_2', {
    outstandingEgp: milliemesToEgp(c2.currentOutstandingMilli),
    expectedEgp: milliemesToEgp(c2.expectedDeductionMilli),
    remainingEgp: milliemesToEgp(c2.theoreticalRemainingMilli),
  });
  console.log('CYCLE_3', {
    outstandingEgp: milliemesToEgp(c3.currentOutstandingMilli),
    expectedEgp: milliemesToEgp(c3.expectedDeductionMilli),
    remainingEgp: milliemesToEgp(c3.theoreticalRemainingMilli),
  });

  if (c1.expectedDeductionMilli !== 30000 || c1.theoreticalRemainingMilli !== 20000) {
    throw new Error('cycle1 mismatch');
  }
  if (c2.expectedDeductionMilli !== 20000 || c2.theoreticalRemainingMilli !== 0) {
    throw new Error('cycle2 mismatch');
  }
  if (c3.expectedDeductionMilli !== 0) throw new Error('cycle3 mismatch');

  const total = totalTheoreticalDeductions(steps);
  if (total !== 50000) throw new Error('total deductions must equal opening outstanding');
  if (total > issue.outstandingMilli) throw new Error('OVER_DEDUCTION');

  const liveExpected = expectedDryRunForOpeningIssue(issue);
  console.log('LIVE_EXPECTED_PREVIEW', {
    entersOpenExpected: liveExpected.entersOpenExpected,
    expectedDeductionMilli: liveExpected.expectedDeductionMilli,
    expectedDeductionEgp: milliemesToEgp(liveExpected.expectedDeductionMilli),
    financialMutation: liveExpected.financialMutation,
    autoRequestEnabled: liveExpected.autoRequestEnabled,
    financialApplyEnabled: liveExpected.financialApplyEnabled,
  });
  if (liveExpected.expectedDeductionMilli !== 30000) {
    throw new Error('live Expected preview must be 300 for cycle-1');
  }
  if (liveExpected.financialMutation !== false) throw new Error('mutation');
  if (liveExpected.autoRequestEnabled || liveExpected.financialApplyEnabled) {
    throw new Error('FA/AR must be OFF');
  }

  const all = await listIssues({});
  const c480 = all.filter((i) => i.deliveryRowRef === 'OPENING:4802535').length;
  const c877 = all.filter((i) => i.deliveryRowRef === 'OPENING:877614').length;
  const c481 = all.filter(
    (i) =>
      i.riderCode === '4811093' &&
      (i.pricingSource === 'OPENING_MIGRATION' ||
        String(i.deliveryRowRef || '').startsWith('OPENING:'))
  ).length;

  console.log('\nFINAL', {
    PHASE: '4D.5.4.15D',
    '4802535_CURRENT_OUTSTANDING_EGP': 500,
    NORMAL_INSTALLMENT_EGP: 300,
    CYCLE_1_EXPECTED_EGP: 300,
    CYCLE_1_REMAINING_EGP: 200,
    CYCLE_2_EXPECTED_EGP: 200,
    CYCLE_2_REMAINING_EGP: 0,
    CYCLE_3_EXPECTED_EGP: 0,
    OVER_DEDUCTION: 0,
    REQUEST_CREATED: 0,
    FINANCIAL_MUTATIONS: 0,
    PRODUCTION_MUTATIONS: 0,
    FINANCIAL_APPLY: isSrs014FinancialApplyEnabled() ? 'ON' : 'OFF',
    AUTO_REQUEST: isAutoEquipmentDeductionsEnabled() ? 'ON' : 'OFF',
    openingRows4802535: c480,
    openingRows877614: c877,
    openingRows4811093: c481,
  });

  if (c480 !== 1 || c877 !== 1 || c481 !== 0) {
    throw new Error('production opening row counts unexpected');
  }
}

main().catch((e) => {
  console.error('FATAL', e);
  process.exit(1);
});
