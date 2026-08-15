/**
 * READ-ONLY Phase C production monitoring — no writes.
 * Scans liability sheet for anomalies (does not modify).
 *
 * Run: npx tsx scripts/srs014-phase-c-production-monitor.ts
 */
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

import { getSheetData } from '../lib/googleSheets';
import { SHEET_EQUIPMENT_LIABILITY } from '../lib/equipmentLiability/constants';
import { rowToEquipmentLiability } from '../lib/equipmentLiability/store';
import { isRiderCode, normalizeRiderCodeForPerformance } from '../lib/riderCodeUtils';
import { PAYROLL_LEDGER_SHEET_NAME } from '../lib/payrollLedger';
import { SHEET_EQUIPMENT_AUTO_DEDUCTIONS } from '../lib/equipmentDeductions/constants';

async function main() {
  console.log('=== Phase C Production Monitoring (READ-ONLY) ===\n');

  const data = await getSheetData(SHEET_EQUIPMENT_LIABILITY, false);
  const issues = [];
  for (let i = 1; i < data.length; i++) {
    const issue = rowToEquipmentLiability(data[i], i + 1);
    if (issue) issues.push(issue);
  }

  console.log(`Total liability rows: ${issues.length}`);
  const open = issues.filter((i) => i.status === 'open');
  console.log(`Open: ${open.length}`);

  const byDelivery = new Map<string, number>();
  const byRiderOpen = new Map<string, number>();
  const anomalies: string[] = [];

  for (const i of issues) {
    if (i.deliveryRowRef) {
      byDelivery.set(i.deliveryRowRef, (byDelivery.get(i.deliveryRowRef) || 0) + 1);
    }
    if (i.status === 'open') {
      const rc = normalizeRiderCodeForPerformance(i.riderCode);
      byRiderOpen.set(rc, (byRiderOpen.get(rc) || 0) + 1);
    }

    const n = normalizeRiderCodeForPerformance(i.riderCode);
    if (!n || !isRiderCode(n)) {
      anomalies.push(`invalid_rider_code:${i.equipmentIssueId}:${i.riderCode}`);
    }
    if (![80000, 90000].includes(i.originalLiabilityMilli) && i.originalLiabilityMilli > 0) {
      // Allow historical/other only if zero empty — flag unexpected originals
      if (!String(i.riderNameSnapshot || '').includes('SRS014_')) {
        anomalies.push(
          `unexpected_original:${i.equipmentIssueId}:milli=${i.originalLiabilityMilli}`
        );
      }
    }
    if (!i.supervisorCodeSnapshot?.trim()) {
      anomalies.push(`missing_supervisor_snapshot:${i.equipmentIssueId}`);
    }
  }

  for (const [ref, count] of byDelivery) {
    if (count > 1) anomalies.push(`duplicate_deliveryRowRef:${ref}:count=${count}`);
  }
  for (const [rc, count] of byRiderOpen) {
    if (rc && count > 1) anomalies.push(`multiple_open_for_rider:${rc}:count=${count}`);
  }

  // QA leftovers
  const qaPc = issues.filter((i) => JSON.stringify(i).includes('SRS014_PC_QA_'));
  const qaAudit = issues.filter((i) => JSON.stringify(i).includes('SRS014_PC_AUDIT_'));
  console.log(`SRS014_PC_QA_ liability leftovers: ${qaPc.length}`);
  console.log(`SRS014_PC_AUDIT_ liability leftovers: ${qaAudit.length}`);

  let payrollEquip = 0;
  try {
    const led = await getSheetData(PAYROLL_LEDGER_SHEET_NAME, false);
    payrollEquip = led.filter((r) => {
      const s = JSON.stringify(r);
      return s.includes('equipment_installment') || s.includes('SRS014_PC_');
    }).length;
  } catch (e: any) {
    console.warn('payroll read', e?.message || e);
  }
  console.log(`Payroll rows mentioning equipment_installment or SRS014_PC_: ${payrollEquip}`);

  let autoRows = 0;
  try {
    const auto = await getSheetData(SHEET_EQUIPMENT_AUTO_DEDUCTIONS, false);
    autoRows = Math.max(0, auto.length - 1);
  } catch (e: any) {
    console.warn('auto sheet', e?.message || e);
  }
  console.log(`Auto-deduction sheet data rows: ${autoRows}`);

  console.log('\n--- Anomalies ---');
  if (anomalies.length === 0) console.log('(none)');
  else anomalies.forEach((a) => console.log('!', a));

  console.log(`\n=== Monitor done: ${anomalies.length} anomalies ===`);
  if (anomalies.length > 0) process.exitCode = 2;
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
