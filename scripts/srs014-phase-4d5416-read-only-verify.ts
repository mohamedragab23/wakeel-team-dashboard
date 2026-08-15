/**
 * 4D.5.4.16 — READ-ONLY production verify:
 * - 877614 settled Opening unchanged
 * - 4802535 open Opening unchanged (500 outstanding, 0 amountDeducted)
 * - 4811093 still has no Opening
 * - FA / Auto Request flags OFF
 * Does NOT write Actuals, Requests, or any liability mutations.
 */
import fs from 'node:fs';
import path from 'node:path';
import { getByDeliveryRowRef, listIssues } from '@/lib/equipmentLiability/store';
import { openingMigrationKey } from '@/lib/equipmentLiability/openingBalance';
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

  const r877 = await getByDeliveryRowRef(openingMigrationKey('877614'));
  const r480 = await getByDeliveryRowRef(openingMigrationKey('4802535'));
  const r481 = await getByDeliveryRowRef(openingMigrationKey('4811093'));

  const issues = await listIssues({});
  const touching481 = issues.filter(
    (i) => String(i.riderCode || '').trim() === '4811093'
  );

  const report = {
    phase: '4D.5.4.16',
    mode: 'READ_ONLY_VERIFY',
    financialApplyEnabled: isSrs014FinancialApplyEnabled(),
    autoRequestEnabled: isAutoEquipmentDeductionsEnabled(),
    '877614': r877
      ? {
          deliveryRowRef: r877.deliveryRowRef,
          originalLiabilityMilli: r877.originalLiabilityMilli,
          settlementPaidMilli: r877.settlementPaidMilli,
          amountDeductedMilli: r877.amountDeductedMilli,
          outstandingMilli: r877.outstandingMilli,
          status: r877.status,
        }
      : null,
    '4802535': r480
      ? {
          deliveryRowRef: r480.deliveryRowRef,
          originalLiabilityMilli: r480.originalLiabilityMilli,
          settlementPaidMilli: r480.settlementPaidMilli,
          amountDeductedMilli: r480.amountDeductedMilli,
          outstandingMilli: r480.outstandingMilli,
          status: r480.status,
        }
      : null,
    '4811093_opening': r481,
    '4811093_issue_count': touching481.length,
  };

  console.log(JSON.stringify(report, null, 2));

  const fails: string[] = [];
  if (isSrs014FinancialApplyEnabled()) fails.push('FA_ON');
  if (isAutoEquipmentDeductionsEnabled()) fails.push('AUTO_ON');
  if (!r877) fails.push('877614_MISSING');
  else {
    if (r877.outstandingMilli !== 0) fails.push('877614_OUTSTANDING');
    if (r877.amountDeductedMilli !== 0) fails.push('877614_DEDUCTED');
    if (r877.status !== 'settled') fails.push('877614_STATUS');
    if (r877.settlementPaidMilli !== 80000) fails.push('877614_SETTLEMENT');
  }
  if (!r480) fails.push('4802535_MISSING');
  else {
    if (r480.outstandingMilli !== 50000) fails.push('4802535_OUTSTANDING');
    if (r480.amountDeductedMilli !== 0) fails.push('4802535_DEDUCTED');
    if (r480.settlementPaidMilli !== 40000) fails.push('4802535_SETTLEMENT');
    if (r480.originalLiabilityMilli !== 90000) fails.push('4802535_ORIGINAL');
    if (r480.status !== 'open') fails.push('4802535_STATUS');
  }
  if (r481) fails.push('4811093_HAS_OPENING');
  if (touching481.length > 0) fails.push('4811093_HAS_ISSUES');

  if (fails.length) {
    console.error('VERIFY_FAIL', fails.join(','));
    process.exit(1);
  }
  console.log('VERIFY_PASS');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
