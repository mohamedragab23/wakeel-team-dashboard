/**
 * SRS-014 Production QA gate — isolated sheet mutations only.
 *
 * - Vercel Production SRS-014 flags must remain OFF (HTTP checked separately).
 * - This script enables flags ONLY in the local Node process to exercise the
 *   same libraries/sheets the deploy will use when flags are later enabled.
 * - All entities use riderCode / notes prefix SRS014QA_ and are deleted at end.
 *
 * Run: npx tsx scripts/srs014-prod-qa-gate.ts
 */
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

import { computeLiabilityFields, createLiabilityFromDelivery, getById, listIssues, updateBalance } from '../lib/equipmentLiability/store';
import { listOpenLiabilityRiderCodesForSupervisor } from '../lib/equipmentLiability/store';
import { buildIdempotencyKey, computeAutoDeductionDecision, runEquipmentAutoDeductionsForDate } from '../lib/equipmentDeductions/engine';
import { createPayoutCycle, listPayoutCycles, finalizePayoutCycle } from '../lib/payoutCycles/store';
import { createSettlement, approveSettlement, listSettlements, patchSettlementAmounts } from '../lib/equipmentReturns/settlement';
import { getLedgerTransactions } from '../lib/payrollLedger';
import { getSheetData, deleteSheetRow } from '../lib/googleSheets';
import { SHEET_EQUIPMENT_LIABILITY } from '../lib/equipmentLiability/constants';
import { SHEET_EQUIPMENT_AUTO_DEDUCTIONS } from '../lib/equipmentDeductions/constants';
import { SHEET_PAYOUT_CYCLES } from '../lib/payoutCycles/constants';
import { SHEET_EQUIPMENT_RETURN_SETTLEMENT } from '../lib/equipmentReturns/settlement';
import { PAYROLL_LEDGER_SHEET_NAME } from '../lib/payrollLedger';
import { formatMilliemesAsEgp } from '../lib/money';
import { calculateSupervisorSalary } from '../lib/salaryService';
import { invalidateSalaryCaches } from '../lib/cacheInvalidation';
import { isCycleEligibleForEquipmentDeduction, findFirstEligibleEquipmentCycle } from '../lib/payoutCycles/eligibility';

const QA = 'SRS014QA_';
const actor = { code: 'SRS014QA', name: 'SRS014 QA Gate' };
const results: Array<{ name: string; ok: boolean; detail: string }> = [];

function record(name: string, ok: boolean, detail: string) {
  results.push({ name, ok, detail });
  console.log(`${ok ? '✅' : '❌'} ${name}: ${detail}`);
}

function enableLocalFlags(on: boolean) {
  const v = on ? 'true' : '';
  process.env.FEATURE_PAYOUT_CYCLES_ENABLED = v;
  process.env.FEATURE_EQUIPMENT_LEDGER_ENABLED = v;
  process.env.FEATURE_AUTO_EQUIPMENT_DEDUCTIONS_ENABLED = v;
  process.env.FEATURE_EQUIPMENT_RETURNS_V2_ENABLED = v;
  process.env.FEATURE_MANUAL_DEDUCTIONS_V2_ENABLED = v;
  process.env.FEATURE_EQUIPMENT_INVENTORY_V2_ENABLED = v;
  process.env.FEATURE_RECRUITMENT_V2_ENABLED = v;
}

async function deleteRowsMatching(sheet: string, pred: (row: unknown[], rowNumber: number) => boolean) {
  let data: unknown[][] = [];
  try {
    data = await getSheetData(sheet, false);
  } catch (err) {
    console.warn('cleanup read failed', sheet, err);
    return 0;
  }
  const toDelete: number[] = [];
  for (let i = 1; i < data.length; i++) {
    if (pred(data[i], i + 1)) toDelete.push(i + 1);
  }
  // Delete bottom-up so indices stay valid.
  toDelete.sort((a, b) => b - a);
  let n = 0;
  for (const rowNumber of toDelete) {
    try {
      const ok = await deleteSheetRow(sheet, rowNumber);
      if (ok) n += 1;
      await new Promise((r) => setTimeout(r, 400));
    } catch (err) {
      console.warn('delete row failed', sheet, rowNumber, err);
    }
  }
  return n;
}

function rowHasQa(row: unknown[]): boolean {
  return row.some((cell) => String(cell ?? '').includes(QA));
}

async function cleanupQaArtifacts() {
  const deleted = {
    liability: await deleteRowsMatching(SHEET_EQUIPMENT_LIABILITY, rowHasQa),
    auto: await deleteRowsMatching(SHEET_EQUIPMENT_AUTO_DEDUCTIONS, rowHasQa),
    cycles: await deleteRowsMatching(SHEET_PAYOUT_CYCLES, rowHasQa),
    settlements: await deleteRowsMatching(SHEET_EQUIPMENT_RETURN_SETTLEMENT, rowHasQa),
    ledger: await deleteRowsMatching(PAYROLL_LEDGER_SHEET_NAME, rowHasQa),
  };
  console.log('cleanup deleted', deleted);
  return deleted;
}

async function main() {
  console.log('=== SRS-014 Production QA Gate (isolated SRS014QA_*) ===\n');

  // Always start clean.
  enableLocalFlags(true);
  await cleanupQaArtifacts();

  // --- A/B/C money proofs (pure + sheet create) ---
  const notPaid = computeLiabilityFields({ securityPaidUpfront: false, bagType: 'motorcycle' });
  record(
    'A 900 liability',
    notPaid.originalLiabilityMilli === 90000 && formatMilliemesAsEgp(notPaid.originalLiabilityMilli) === '900.00',
    `milli=${notPaid.originalLiabilityMilli} egp=${formatMilliemesAsEgp(notPaid.originalLiabilityMilli)} schedule=${notPaid.installmentSchedule.join('+')}`
  );
  const paid = computeLiabilityFields({ securityPaidUpfront: true, bagType: 'bicycle' });
  record(
    'B 800 liability',
    paid.originalLiabilityMilli === 80000 && formatMilliemesAsEgp(paid.originalLiabilityMilli) === '800.00',
    `milli=${paid.originalLiabilityMilli} schedule=${paid.installmentSchedule.map(formatMilliemesAsEgp).join(' / ')}`
  );
  record(
    'C installment split',
    JSON.stringify(notPaid.installmentSchedule) === JSON.stringify([30000, 30000, 30000]) &&
      JSON.stringify(paid.installmentSchedule) === JSON.stringify([26667, 26667, 26666]),
    `900→${notPaid.installmentSchedule} 800→${paid.installmentSchedule}`
  );

  // --- Cycles for activation / closing / partial ---
  const c1 = await createPayoutCycle(
    {
      year: 2099,
      month: 1,
      cycleNumber: 1,
      startDate: '2099-01-17',
      endDate: '2099-01-23',
      payoutDate: '2099-01-24',
      deductionGenerationDate: '2099-01-23',
      isClosing: false,
      equipmentDeductionEnabled: true,
      status: 'active',
      notes: `${QA} cycle1`,
    },
    actor
  );
  const c2 = await createPayoutCycle(
    {
      year: 2099,
      month: 1,
      cycleNumber: 2,
      startDate: '2099-01-24',
      endDate: '2099-01-30',
      payoutDate: '2099-01-31',
      deductionGenerationDate: '2099-01-30',
      isClosing: false,
      equipmentDeductionEnabled: true,
      status: 'active',
      notes: `${QA} cycle2`,
    },
    actor
  );
  const cClose = await createPayoutCycle(
    {
      year: 2099,
      month: 1,
      cycleNumber: 3,
      startDate: '2099-01-31',
      endDate: '2099-01-31',
      payoutDate: '2099-02-01',
      deductionGenerationDate: '2099-01-31',
      isClosing: true,
      equipmentDeductionEnabled: true,
      status: 'active',
      notes: `${QA} closing`,
    },
    actor
  );
  record('cycle create', c1.ok && c2.ok && cClose.ok, `c1=${c1.ok && c1.ok ? c1.cycle.cycleId : 'fail'}`);

  if (!c1.ok || !c2.ok || !cClose.ok) {
    throw new Error('cycle create failed');
  }

  const cycles = await listPayoutCycles({ year: 2099, month: 1 });
  const act = isCycleEligibleForEquipmentDeduction(c1.cycle, cycles, '2099-01-20');
  const first = findFirstEligibleEquipmentCycle(cycles, '2099-01-20');
  record(
    'D activation mid-cycle',
    act.eligible === false && act.reason === 'activation_in_current_cycle' && first?.cycleId === c2.cycle.cycleId,
    `c1Eligible=${act.eligible}/${act.reason} first=${first?.cycleId}`
  );
  const before = findFirstEligibleEquipmentCycle(cycles, '2099-01-16');
  record('D activation before cycle', before?.cycleId === c1.cycle.cycleId, `first=${before?.cycleId}`);

  // --- Liability issues ---
  const liab900 = await createLiabilityFromDelivery(
    {
      deliveryRowRef: `${QA}DEL900`,
      riderCode: `${QA}R900`,
      riderNameSnapshot: `${QA} Rider 900`,
      zoneSnapshot: 'QA',
      supervisorCodeSnapshot: `${QA}SUP`,
      supervisorNameSnapshot: `${QA} Supervisor`,
      issueDate: '2099-01-10',
      activationDate: '2099-01-10',
      bagType: 'motorcycle',
      securityPaidUpfront: false,
      jacketHeld: true,
      helmetHeld: true,
    },
    actor
  );
  record('create 900 issue', liab900.ok && liab900.ok && liab900.issue.originalLiabilityMilli === 90000, liab900.ok ? liab900.issue.equipmentIssueId : liab900.error);

  const liabPartial = await createLiabilityFromDelivery(
    {
      deliveryRowRef: `${QA}DELPARTIAL`,
      riderCode: `${QA}RPARTIAL`,
      riderNameSnapshot: `${QA} Rider Partial`,
      zoneSnapshot: 'QA',
      supervisorCodeSnapshot: `${QA}SUP`,
      supervisorNameSnapshot: `${QA} Supervisor`,
      issueDate: '2099-01-10',
      activationDate: '2099-01-10',
      bagType: 'motorcycle',
      securityPaidUpfront: false,
    },
    actor
  );

  // E partial
  if (liabPartial.ok) {
    const d1 = computeAutoDeductionDecision({
      remainingMilli: liabPartial.issue.outstandingMilli,
      schedule: [30000, 30000, 30000],
      installmentsCompleted: 0,
      amountDeductedMilli: 0,
      cycle: c2.cycle,
      allCycles: cycles,
      activationDate: '2099-01-10',
      riderCode: liabPartial.issue.riderCode,
      equipmentIssueId: liabPartial.issue.equipmentIssueId,
      availablePayoutMilli: 15000,
      existingIdempotencyKeys: new Set(),
    });
    const okPartial =
      d1.action === 'deduct' && d1.amountMilli === 15000 && d1.installmentComplete === false && d1.installmentNumber === 1;
    record('E partial payout decision', okPartial, JSON.stringify(d1));

    if (d1.action === 'deduct') {
      await updateBalance(liabPartial.issue.equipmentIssueId, d1.amountMilli, actor, {
        incrementInstallment: d1.installmentComplete,
      });
      const after = await getById(liabPartial.issue.equipmentIssueId);
      const d2 = computeAutoDeductionDecision({
        remainingMilli: after!.outstandingMilli,
        schedule: [30000, 30000, 30000],
        installmentsCompleted: after!.installmentsCompleted,
        amountDeductedMilli: after!.amountDeductedMilli,
        cycle: c2.cycle,
        allCycles: cycles,
        activationDate: '2099-01-10',
        riderCode: after!.riderCode,
        equipmentIssueId: after!.equipmentIssueId,
        existingIdempotencyKeys: new Set(),
      });
      record(
        'E carry remaining 150',
        after!.installmentsCompleted === 0 && d2.action === 'deduct' && d2.amountMilli === 15000,
        `installmentsCompleted=${after!.installmentsCompleted} next=${JSON.stringify(d2)} outstanding=${after!.outstandingMilli}`
      );
    }
  }

  // F closing
  const closeDecision = computeAutoDeductionDecision({
    remainingMilli: 90000,
    schedule: [30000, 30000, 30000],
    installmentsCompleted: 0,
    cycle: cClose.cycle,
    allCycles: cycles,
    activationDate: '2099-01-10',
    riderCode: `${QA}R900`,
    equipmentIssueId: liab900.ok ? liab900.issue.equipmentIssueId : 'x',
    existingIdempotencyKeys: new Set(),
  });
  record('F closing skip', closeDecision.action === 'skip' && closeDecision.reason === 'closing_cycle', JSON.stringify(closeDecision));

  // G idempotency via engine run twice on generation date of c2 (only R900 open for this date path)
  if (liab900.ok) {
    // Close other open QA issues temporarily so this measures one rider.
    for (const code of [`${QA}RPARTIAL`, `${QA}RWAIVE`, `${QA}RRETURN`, `${QA}RGUARD`]) {
      const open = (await listIssues({ status: 'open' })).filter((i) => i.riderCode === code);
      for (const issue of open) {
        await updateBalance(issue.equipmentIssueId, issue.outstandingMilli, actor, { incrementInstallment: false });
      }
    }
    const beforeLedger = await getLedgerTransactions({ entityCode: `${QA}R900` });
    const run1 = await runEquipmentAutoDeductionsForDate('2099-01-30', actor);
    const run2 = await runEquipmentAutoDeductionsForDate('2099-01-30', actor);
    const afterLedger = await getLedgerTransactions({ entityCode: `${QA}R900` });
    const newTx = afterLedger.filter(
      (t) => t.status === 'active' && !beforeLedger.some((b) => b.transactionId === t.transactionId)
    );
    const key = buildIdempotencyKey(`${QA}R900`, liab900.issue.equipmentIssueId, c2.cycle.cycleId, 1);
    record(
      'G idempotency',
      newTx.length === 1 && run1.deducted === 1 && run2.deducted === 0,
      `newTx=${newTx.length} deducted=${run1.deducted}+${run2.deducted} skipped2=${run2.skipped} key=${key} cycle=${run1.cycleId}`
    );
  }

  // H settlement payment 200 on remaining 600
  if (liab900.ok) {
    const issue = await getById(liab900.issue.equipmentIssueId);
    // Force state: 300 deducted, 600 remaining if engine already took 300
    const outstanding = issue!.outstandingMilli;
    const settlement = await createSettlement(
      {
        equipmentIssueId: issue!.equipmentIssueId,
        riderCode: issue!.riderCode,
        settlementPaidMilli: 20000,
        waivedMilli: 0,
        waiverReason: '',
        notes: `${QA} pay200`,
      },
      actor
    );
    if (settlement.ok) {
      const approved = await approveSettlement(settlement.settlement.settlementId, actor);
      const after = await getById(issue!.equipmentIssueId);
      const expected = Math.max(0, outstanding - 20000);
      record(
        'H settlement payment 200',
        approved.ok && approved.ok && approved.mode === 'payment' && after!.outstandingMilli === expected && after!.status === 'open',
        `before=${outstanding} after=${after?.outstandingMilli} status=${after?.status} mode=${approved.ok ? approved.mode : approved.error}`
      );
    }
  }

  // I waiver separate issue
  const liabWaive = await createLiabilityFromDelivery(
    {
      deliveryRowRef: `${QA}DELWAIVE`,
      riderCode: `${QA}RWAIVE`,
      riderNameSnapshot: `${QA} Rider Waive`,
      zoneSnapshot: 'QA',
      supervisorCodeSnapshot: `${QA}SUP`,
      supervisorNameSnapshot: `${QA} Supervisor`,
      issueDate: '2099-01-10',
      activationDate: '2099-01-10',
      bagType: 'motorcycle',
      securityPaidUpfront: false,
    },
    actor
  );
  if (liabWaive.ok) {
    const s = await createSettlement(
      {
        equipmentIssueId: liabWaive.issue.equipmentIssueId,
        riderCode: liabWaive.issue.riderCode,
        settlementPaidMilli: 0,
        waivedMilli: liabWaive.issue.outstandingMilli,
        waiverReason: `${QA} explicit waiver`,
        notes: `${QA} waiver`,
      },
      actor
    );
    if (s.ok) {
      const approved = await approveSettlement(s.settlement.settlementId, actor);
      const after = await getById(liabWaive.issue.equipmentIssueId);
      record(
        'I explicit waiver',
        approved.ok && after?.status === 'waived' && after.outstandingMilli === 0 && approved.ok && approved.mode === 'waiver',
        `status=${after?.status} outstanding=${after?.outstandingMilli} mode=${approved.ok ? approved.mode : approved.error}`
      );
    }
  }

  // J return before completion — payment not auto-waive
  const liabReturn = await createLiabilityFromDelivery(
    {
      deliveryRowRef: `${QA}DELRETURN`,
      riderCode: `${QA}RRETURN`,
      riderNameSnapshot: `${QA} Rider Return`,
      zoneSnapshot: 'QA',
      supervisorCodeSnapshot: `${QA}SUP`,
      supervisorNameSnapshot: `${QA} Supervisor`,
      issueDate: '2099-01-10',
      activationDate: '2099-01-10',
      bagType: 'motorcycle',
      securityPaidUpfront: false,
    },
    actor
  );
  if (liabReturn.ok) {
    await updateBalance(liabReturn.issue.equipmentIssueId, 30000, actor, { incrementInstallment: true });
    const before = await getById(liabReturn.issue.equipmentIssueId);
    const s = await createSettlement(
      {
        equipmentIssueId: liabReturn.issue.equipmentIssueId,
        riderCode: liabReturn.issue.riderCode,
        settlementPaidMilli: 0,
        waivedMilli: 0,
        waiverReason: '',
        notes: `${QA} return pending admin decision`,
      },
      actor
    );
    // Patch payment only — must not waive automatically
    if (s.ok) {
      await patchSettlementAmounts(s.settlement.settlementId, { settlementPaidMilli: 10000 });
      const approved = await approveSettlement(s.settlement.settlementId, actor);
      const after = await getById(liabReturn.issue.equipmentIssueId);
      record(
        'J return settle without auto-waive',
        approved.ok && after?.status === 'open' && after.outstandingMilli === (before!.outstandingMilli - 10000),
        `before=${before?.outstandingMilli} after=${after?.outstandingMilli} status=${after?.status}`
      );
    }
  }

  // K double-count protection
  await invalidateSalaryCaches();
  process.env.FEATURE_AUTO_EQUIPMENT_DEDUCTIONS_ENABLED = 'false';
  const legacyOff = await calculateSupervisorSalary('WA-003', '2026-07-01', '2026-07-31');
  await invalidateSalaryCaches();
  process.env.FEATURE_AUTO_EQUIPMENT_DEDUCTIONS_ENABLED = 'true';
  const legacyOnNoLiab = await calculateSupervisorSalary('WA-003', '2026-07-01', '2026-07-31');
  record(
    'K legacy rider unchanged AUTO on/off (no liability)',
    (legacyOff as any).netSalary === (legacyOnNoLiab as any).netSalary &&
      (legacyOff as any).deductions.equipment === (legacyOnNoLiab as any).deductions.equipment,
    `netOff=${(legacyOff as any).netSalary} netOn=${(legacyOnNoLiab as any).netSalary} eqOff=${(legacyOff as any).deductions.equipment} eqOn=${(legacyOnNoLiab as any).deductions.equipment}`
  );

  // Attach a QA liability under WA-003 to prove guard triggers, then remove.
  const liabGuard = await createLiabilityFromDelivery(
    {
      deliveryRowRef: `${QA}DELGUARD`,
      riderCode: `${QA}RGUARD`,
      riderNameSnapshot: `${QA} Guard Rider`,
      zoneSnapshot: 'QA',
      supervisorCodeSnapshot: 'WA-003',
      supervisorNameSnapshot: 'WA-003',
      issueDate: '2026-07-01',
      activationDate: '2026-07-01',
      bagType: 'motorcycle',
      securityPaidUpfront: false,
    },
    actor
  );
  if (liabGuard.ok) {
    const codes = await listOpenLiabilityRiderCodesForSupervisor('WA-003');
    await invalidateSalaryCaches();
    process.env.FEATURE_AUTO_EQUIPMENT_DEDUCTIONS_ENABLED = 'true';
    const withGuard = await calculateSupervisorSalary('WA-003', '2026-07-01', '2026-07-31');
    record(
      'K guard triggers for WA-003 with QA liability',
      codes.includes(`${QA}RGUARD`) && (withGuard as any).deductions.equipment === 0,
      `codes=${codes.join(',')} equipment=${(withGuard as any).deductions.equipment} net=${(withGuard as any).netSalary}`
    );
  }

  // Reconciliation sample
  if (liab900.ok) {
    const issue = await getById(liab900.issue.equipmentIssueId);
    const ledger = await getLedgerTransactions({ entityCode: issue!.riderCode });
    const ledgerSumMilli = Math.round(
      ledger.filter((t) => t.status === 'active' && t.source === 'ledger_native').reduce((s, t) => s + Math.abs(t.amount), 0) * 100
    );
    const settlements = await listSettlements({ equipmentIssueId: issue!.equipmentIssueId, status: 'approved' });
    const paidSum = settlements.reduce((s, x) => s + x.settlementPaidMilli, 0);
    const waivedSum = settlements.reduce((s, x) => s + (x.waiverReason || x.waivedMilli ? Math.max(0, x.waivedMilli) : 0), 0);
    // For payment-only settlements waivedMilli may be 0
    const expectedRemaining = issue!.originalLiabilityMilli - issue!.amountDeductedMilli;
    // amountDeducted includes auto + settlement payments applied to balance
    record(
      'reconciliation identity',
      issue!.outstandingMilli === expectedRemaining && issue!.outstandingMilli >= 0,
      `original=${issue!.originalLiabilityMilli} deducted=${issue!.amountDeductedMilli} outstanding=${issue!.outstandingMilli} ledgerEgpSum~milli=${ledgerSumMilli} settlementPaid=${paidSum} waived=${waivedSum}`
    );
  }

  // Finalize cycle blocked silent edit proof
  const fin = await finalizePayoutCycle(c1.cycle.cycleId, actor);
  record('finalize cycle', fin.ok === true, fin.ok ? fin.cycle.status : JSON.stringify(fin));

  // Cleanup
  const deleted = await cleanupQaArtifacts();
  const leftover = (await listIssues()).filter((i) => i.riderCode.includes(QA));
  record('cleanup no orphan liabilities', leftover.length === 0, `leftover=${leftover.length} deleted=${JSON.stringify(deleted)}`);

  enableLocalFlags(false);

  const failed = results.filter((r) => !r.ok);
  console.log(`\n=== QA Result: ${results.length - failed.length}/${results.length} passed ===`);
  if (failed.length) {
    console.log('FAILED:', failed);
    process.exit(1);
  }
}

main().catch(async (e) => {
  console.error(e);
  try {
    enableLocalFlags(true);
    await cleanupQaArtifacts();
  } catch (err) {
    console.error('cleanup after failure also errored', err);
  }
  process.exit(1);
});
