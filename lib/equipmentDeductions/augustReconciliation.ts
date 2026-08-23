/**
 * August 2026 equipment deduction reconciliation (pure + sheet assembly).
 */
import {
  aggregateActualPayrollByRiderCycle,
  aggregateRequestedByRiderCycle,
  buildRiderCycleHistory,
  cycleKeyFromParts,
} from '@/lib/equipmentDeductions/carryForward';
import {
  classifyReconciliation,
  computeFinancialState,
  computeCycleRequestMilli,
  formatMilliEgp,
  normalizeRiderCodeKey,
  type ReconciliationStatus,
} from '@/lib/equipmentDeductions/equipmentFinancialModel';
import {
  latestDeclarationsByRiderCycle,
  listSupervisorEquipmentDeclarations,
  type SupervisorEquipmentDeclaration,
} from '@/lib/equipmentDeductions/supervisorDeclarations';
import type { EquipmentLiabilityIssue } from '@/lib/equipmentLiability/store';
import type { PayoutCycle } from '@/lib/payoutCycles/types';
import {
  ARABIC_MONTH_NAMES,
  DEDUCTION_CYCLE_LABELS,
  type DeductionCycleKey,
} from '@/lib/equipmentSheetConstants';
import { MAX_CYCLE_INSTALLMENT_MILLI } from '@/lib/money';

export type AugustCycleSpec = {
  cycle: PayoutCycle;
  cycleLabel: string;
  monthLabel: string;
  year: number;
  cycleKey: string;
};

export type RiderReconciliationRow = {
  riderCode: string;
  normalizedRiderCode: string;
  supervisor: string;
  equipmentIssueId: string | null;
  originalLiabilityMilli: number;
  securityPaidUpfront: boolean | null;
  supervisorDeclaredPaidMilli: number;
  outstandingAfterSupervisorMilli: number;
  week1RequestedMilli: number;
  week1ActualMilli: number;
  week1ShortfallMilli: number;
  week2RequestedMilli: number;
  week2ActualMilli: number;
  week2ShortfallMilli: number;
  cumulativeActualMilli: number;
  currentOutstandingMilli: number;
  systemOutstandingMilli: number | null;
  systemDeltaMilli: number | null;
  nextRecommendedRequestMilli: number;
  status: ReconciliationStatus;
  notes: string[];
};

export type AugustReconciliationReport = {
  mode: 'READ_ONLY';
  cycles: AugustCycleSpec[];
  rows: RiderReconciliationRow[];
  summary: {
    totalRiders: number;
    totalOriginalLiabilityMilli: number;
    totalSupervisorDeclaredPaidMilli: number;
    totalWeek1RequestedMilli: number;
    totalWeek1ActualMilli: number;
    totalWeek2RequestedMilli: number;
    totalWeek2ActualMilli: number;
    totalCumulativeActualMilli: number;
    totalCurrentOutstandingMilli: number;
    matchCount: number;
    mismatchCount: number;
    missingActualCount: number;
    missingLiabilityCount: number;
    anomalyCount: number;
  };
  dataAccessNotes: string[];
};

function cycleLabelForPayout(cycle: PayoutCycle): string {
  if (cycle.isClosing) return DEDUCTION_CYCLE_LABELS.closing;
  const keys: DeductionCycleKey[] = ['first', 'second', 'third', 'fourth'];
  const key = keys[Math.max(0, Math.trunc(cycle.cycleNumber) - 1)];
  return key ? DEDUCTION_CYCLE_LABELS[key] : '';
}

function monthLabelForPayout(cycle: PayoutCycle): string {
  const m = Math.trunc(cycle.month);
  if (m < 1 || m > 12) return '';
  return ARABIC_MONTH_NAMES[m - 1];
}

export function resolveAugust2026Cycles(allCycles: PayoutCycle[]): AugustCycleSpec[] {
  const august = allCycles.filter((c) => c.year === 2026 && c.month === 8 && !c.isClosing);
  const sorted = [...august].sort((a, b) => a.startDate.localeCompare(b.startDate));
  return sorted.slice(0, 2).map((cycle) => {
    const cycleLabel = cycleLabelForPayout(cycle);
    const monthLabel = monthLabelForPayout(cycle);
    return {
      cycle,
      cycleLabel,
      monthLabel,
      year: cycle.year,
      cycleKey: cycleKeyFromParts(cycleLabel, monthLabel, cycle.year),
    };
  });
}

function declarationPaidForRider(
  riderCode: string,
  declarations: Map<string, SupervisorEquipmentDeclaration>,
  fallbackIssue: EquipmentLiabilityIssue | null
): number {
  const keys = [...declarations.keys()].filter((k) => k.startsWith(`${riderCode}|`));
  if (keys.length > 0) {
    let maxPaid = 0;
    for (const k of keys) {
      const d = declarations.get(k);
      if (d) maxPaid = Math.max(maxPaid, d.declaredPaidMilli);
    }
    return maxPaid;
  }
  return fallbackIssue?.settlementPaidMilli || 0;
}

export function buildAugustReconciliationReport(params: {
  cycles: AugustCycleSpec[];
  requestRows: unknown[][];
  actualRows: unknown[][];
  liabilities: EquipmentLiabilityIssue[];
  declarations: SupervisorEquipmentDeclaration[];
}): AugustReconciliationReport {
  const dataAccessNotes: string[] = [];
  if (params.cycles.length < 2) {
    dataAccessNotes.push('Fewer than 2 August 2026 cycles resolved from دورات_القبض');
  }

  const w1 = params.cycles[0];
  const w2 = params.cycles[1];
  const orderedCycles = params.cycles.map((c) => ({
    cycleKey: c.cycleKey,
    cycleLabel: c.cycleLabel,
    monthLabel: c.monthLabel,
    year: c.year,
  }));

  const declMap = latestDeclarationsByRiderCycle(params.declarations);
  const byRiderIssue = new Map<string, EquipmentLiabilityIssue>();
  const duplicateRiders = new Set<string>();
  for (const issue of params.liabilities) {
    const key = normalizeRiderCodeKey(issue.riderCode);
    if (!key) continue;
    if (byRiderIssue.has(key)) duplicateRiders.add(key);
    if (!byRiderIssue.has(key) || issue.status === 'open') {
      byRiderIssue.set(key, issue);
    }
  }

  const riderCodes = new Set<string>();
  for (const issue of params.liabilities) {
    const k = normalizeRiderCodeKey(issue.riderCode);
    if (k) riderCodes.add(k);
  }
  if (w1) {
    for (const k of aggregateRequestedByRiderCycle(
      params.requestRows,
      w1.cycleLabel,
      w1.monthLabel,
      w1.year
    ).keys()) {
      riderCodes.add(k);
    }
    for (const k of aggregateActualPayrollByRiderCycle(
      params.actualRows,
      w1.cycleLabel,
      w1.monthLabel,
      w1.year
    ).keys()) {
      riderCodes.add(k);
    }
  }
  if (w2) {
    for (const k of aggregateRequestedByRiderCycle(
      params.requestRows,
      w2.cycleLabel,
      w2.monthLabel,
      w2.year
    ).keys()) {
      riderCodes.add(k);
    }
    for (const k of aggregateActualPayrollByRiderCycle(
      params.actualRows,
      w2.cycleLabel,
      w2.monthLabel,
      w2.year
    ).keys()) {
      riderCodes.add(k);
    }
  }

  const rows: RiderReconciliationRow[] = [];

  for (const riderCode of [...riderCodes].sort()) {
    const issue = byRiderIssue.get(riderCode) || null;
    const history = buildRiderCycleHistory({
      riderCode,
      orderedCycles,
      requestRows: params.requestRows,
      actualRows: params.actualRows,
    });

    const w1h = history[0] || { requestedMilli: 0, actualMilli: 0, cycleKey: '' };
    const w2h = history[1] || { requestedMilli: 0, actualMilli: 0, cycleKey: '' };
    const cumulativeActual = history.reduce((s, h) => s + h.actualMilli, 0);

    const original = issue?.originalLiabilityMilli || 0;
    const supervisorPaid = declarationPaidForRider(riderCode, declMap, issue);
    const financial = computeFinancialState({
      originalLiabilityMilli: original,
      supervisorDeclaredPaidMilli: supervisorPaid,
      cumulativeActualPayrollMilli: cumulativeActual,
    });

    const carryAfterW1 = w1h.requestedMilli - w1h.actualMilli;
    const nextRec = w2
      ? computeCycleRequestMilli({
          payrollOutstandingMilli: financial.currentOutstandingMilli,
          carryForwardShortfallMilli: Math.max(0, carryAfterW1),
        })
      : computeCycleRequestMilli({
          payrollOutstandingMilli: financial.currentOutstandingMilli,
          carryForwardShortfallMilli: 0,
        });

    const w1Short = Math.max(0, w1h.requestedMilli - w1h.actualMilli);
    const w2Short = Math.max(0, w2h.requestedMilli - w2h.actualMilli);

    const status = classifyReconciliation({
      hasLiability: Boolean(issue),
      financial,
      requestedMilli: w1h.requestedMilli + w2h.requestedMilli,
      actualMilli: cumulativeActual,
      shortfallMilli: w1Short + w2Short,
      duplicateRider: duplicateRiders.has(riderCode),
      invalidCycle: params.cycles.length < 2,
    });

    const notes: string[] = [];
    if (issue && issue.outstandingMilli !== financial.currentOutstandingMilli) {
      notes.push(
        `system outstanding ${formatMilliEgp(issue.outstandingMilli)} vs reconstructed ${formatMilliEgp(financial.currentOutstandingMilli)}`
      );
    }
    if (financial.actualExceedsSupervisorBaselineMilli > 0) {
      notes.push('actual exceeds post-supervisor baseline');
    }

    rows.push({
      riderCode: issue?.riderCode || riderCode,
      normalizedRiderCode: riderCode,
      supervisor: issue?.supervisorCodeSnapshot || '',
      equipmentIssueId: issue?.equipmentIssueId || null,
      originalLiabilityMilli: original,
      securityPaidUpfront: issue?.securityPaidUpfront ?? null,
      supervisorDeclaredPaidMilli: supervisorPaid,
      outstandingAfterSupervisorMilli: financial.outstandingAfterSupervisorMilli,
      week1RequestedMilli: w1h.requestedMilli,
      week1ActualMilli: w1h.actualMilli,
      week1ShortfallMilli: w1Short,
      week2RequestedMilli: w2h.requestedMilli,
      week2ActualMilli: w2h.actualMilli,
      week2ShortfallMilli: w2Short,
      cumulativeActualMilli: cumulativeActual,
      currentOutstandingMilli: financial.currentOutstandingMilli,
      systemOutstandingMilli: issue?.outstandingMilli ?? null,
      systemDeltaMilli:
        issue != null ? issue.outstandingMilli - financial.currentOutstandingMilli : null,
      nextRecommendedRequestMilli: nextRec,
      status,
      notes,
    });
  }

  const summary = {
    totalRiders: rows.length,
    totalOriginalLiabilityMilli: rows.reduce((s, r) => s + r.originalLiabilityMilli, 0),
    totalSupervisorDeclaredPaidMilli: rows.reduce((s, r) => s + r.supervisorDeclaredPaidMilli, 0),
    totalWeek1RequestedMilli: rows.reduce((s, r) => s + r.week1RequestedMilli, 0),
    totalWeek1ActualMilli: rows.reduce((s, r) => s + r.week1ActualMilli, 0),
    totalWeek2RequestedMilli: rows.reduce((s, r) => s + r.week2RequestedMilli, 0),
    totalWeek2ActualMilli: rows.reduce((s, r) => s + r.week2ActualMilli, 0),
    totalCumulativeActualMilli: rows.reduce((s, r) => s + r.cumulativeActualMilli, 0),
    totalCurrentOutstandingMilli: rows.reduce((s, r) => s + r.currentOutstandingMilli, 0),
    matchCount: rows.filter((r) => r.status === 'MATCH').length,
    mismatchCount: rows.filter((r) =>
      ['REQUEST_MISMATCH', 'PARTIAL_ACTUAL', 'OVER_DEDUCTION'].includes(r.status)
    ).length,
    missingActualCount: rows.filter((r) =>
      ['MISSING_ACTUAL', 'ACTUAL_ZERO'].includes(r.status)
    ).length,
    missingLiabilityCount: rows.filter((r) => r.status === 'MISSING_LIABILITY').length,
    anomalyCount: rows.filter((r) =>
      ['DUPLICATE_RIDER', 'INVALID_CYCLE', 'DATA_ERROR'].includes(r.status)
    ).length,
  };

  return {
    mode: 'READ_ONLY',
    cycles: params.cycles,
    rows,
    summary,
    dataAccessNotes,
  };
}

export async function loadAugustReconciliationFromSheets(deps: {
  listPayoutCycles: () => Promise<PayoutCycle[]>;
  getSheetData: (name: string) => Promise<unknown[][]>;
  listIssues: () => Promise<EquipmentLiabilityIssue[]>;
}): Promise<AugustReconciliationReport> {
  const notes: string[] = [];
  let cycles: PayoutCycle[] = [];
  try {
    cycles = await deps.listPayoutCycles();
  } catch (e) {
    notes.push(`دورات_القبض read failed: ${e instanceof Error ? e.message : String(e)}`);
  }

  const augustCycles = resolveAugust2026Cycles(cycles);
  if (augustCycles.length === 0) {
    notes.push('No August 2026 payout cycles found in sheet');
  }

  let requestRows: unknown[][] = [];
  let actualRows: unknown[][] = [];
  let liabilities: EquipmentLiabilityIssue[] = [];
  let declarations: SupervisorEquipmentDeclaration[] = [];

  try {
    requestRows = await deps.getSheetData('الاستقطاعات');
    if (requestRows.length <= 1) notes.push('الاستقطاعات empty or header-only');
  } catch (e) {
    notes.push(`الاستقطاعات read failed: ${e instanceof Error ? e.message : String(e)}`);
  }
  try {
    actualRows = await deps.getSheetData('الاستقطاعات_الفعلية');
    if (actualRows.length <= 1) notes.push('الاستقطاعات_الفعلية empty or header-only');
  } catch (e) {
    notes.push(`الاستقطاعات_الفعلية read failed: ${e instanceof Error ? e.message : String(e)}`);
  }
  try {
    liabilities = await deps.listIssues();
  } catch (e) {
    notes.push(`عهدة_المعدات read failed: ${e instanceof Error ? e.message : String(e)}`);
  }
  try {
    declarations = await listSupervisorEquipmentDeclarations();
  } catch (e) {
    notes.push(`declarations read failed: ${e instanceof Error ? e.message : String(e)}`);
  }

  const report = buildAugustReconciliationReport({
    cycles: augustCycles,
    requestRows,
    actualRows,
    liabilities,
    declarations,
  });
  report.dataAccessNotes.push(...notes);
  return report;
}

export { MAX_CYCLE_INSTALLMENT_MILLI };
