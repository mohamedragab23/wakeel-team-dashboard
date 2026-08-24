/**
 * Equipment deduction operational engine — GREEN / RED / YELLOW classification
 * and next-cycle REQUEST preview (pure + sheet assembly).
 *
 * Does NOT write sheets or mutate liability.
 */
import {
  computeCycleRequestBreakdown,
  cycleShortfallMilli,
  declaredPaidFromStatus,
  ledgerOutstandingInvariant,
  normalizeRiderCodeKey,
  type OperationalBucket,
  type OperationalExceptionCode,
  type SupervisorPaymentStatus,
} from '@/lib/equipmentDeductions/equipmentFinancialModel';
import {
  aggregateActualPayrollByRiderCycle,
  buildRiderCycleHistory,
  cycleKeyFromParts,
} from '@/lib/equipmentDeductions/carryForward';
import type { SupervisorEquipmentDeclaration } from '@/lib/equipmentDeductions/supervisorDeclarations';
import { latestDeclarationsByRiderCycle } from '@/lib/equipmentDeductions/supervisorDeclarations';
import type { EquipmentLiabilityIssue } from '@/lib/equipmentLiability/store';
import type { PayoutCycle } from '@/lib/payoutCycles/types';
import {
  ARABIC_MONTH_NAMES,
  DEDUCTION_CYCLE_LABELS,
  DEDUCTION_IMPORT_HEADERS,
  DEDUCTIONS_ACTUAL_HEADERS,
  type DeductionCycleKey,
} from '@/lib/equipmentSheetConstants';
import { milliemesToEgp } from '@/lib/money';
import {
  isFinalAuthoritativeDeclaration,
  evaluatePostDeclarationReview,
  type PostDeclarationReview,
} from '@/lib/equipmentDeductions/declarationReview';
import { isGenuineSheetVsLedgerDisagree } from '@/lib/equipmentDeductions/exceptionQueues';
import {
  analyzeManualV2ForCycle,
  type ManualV2CycleAnalysis,
} from '@/lib/equipmentDeductions/manualV2CycleAnalysis';

export type EquipmentRequestPreviewLine = {
  riderCode: string;
  riderName: string;
  supervisorCode: string;
  operationalBucket: OperationalBucket;
  exceptionCode: OperationalExceptionCode | null;
  declarationStatus: SupervisorPaymentStatus | 'DECLARATION_MISSING' | 'LEGACY_DECLARATION_ONLY';
  declaredPaidMilli: number | null;
  hasLiability: boolean;
  originalLiabilityMilli: number;
  systemOutstandingMilli: number | null;
  remainingAfterDeclarationMilli: number;
  baseInstallmentMilli: number;
  carryForwardMilli: number;
  equipmentRequestMilli: number;
  exceedsThreeHundredDueToCarry: boolean;
  manualV2Milli: number;
  totalCombinedRequestMilli: number;
  securityPaidUpfront: boolean | null;
  warnings: string[];
  notes: string[];
  hasFreshFinalDeclaration: boolean;
};

export type DryRunPreview = {
  mode: 'READ_ONLY_DRY_RUN';
  cycle: {
    cycleId: string;
    startDate: string;
    endDate: string;
    cycleLabel: string;
    monthLabel: string;
    year: number;
  };
  priorCycles: Array<{ cycleId: string; cycleLabel: string; monthLabel: string; year: number }>;
  summary: {
    greenCount: number;
    redCount: number;
    yellowCount: number;
    totalEquipmentRequestMilli: number;
    totalEquipmentBaseMilli: number;
    totalCarryForwardMilli: number;
    totalManualV2Milli: number;
    totalCombinedRequestMilli: number;
    ridersWithDeductions: number;
    missingLiabilityCount: number;
    ledgerDisagreementCount: number;
    declarationMissingCount: number;
    adminLedgerCorrectionCount: number;
    adminLiabilityCreationCount: number;
    completedFreshDeclarations: number;
    pendingFreshDeclarations: number;
  };
  manualV2Analysis: ManualV2CycleAnalysis;
  lines: EquipmentRequestPreviewLine[];
};

export function cycleLabelForPayout(cycle: PayoutCycle): string {
  if (cycle.isClosing) return DEDUCTION_CYCLE_LABELS.closing;
  const keys: DeductionCycleKey[] = ['first', 'second', 'third', 'fourth'];
  const key = keys[Math.max(0, Math.trunc(cycle.cycleNumber) - 1)];
  return key ? DEDUCTION_CYCLE_LABELS[key] : '';
}

export function monthLabelForPayout(cycle: PayoutCycle): string {
  const m = Math.trunc(cycle.month);
  if (m < 1 || m > 12) return '';
  return ARABIC_MONTH_NAMES[m - 1];
}

export function classifyOperationalBucket(params: {
  hasLiability: boolean;
  declaration: SupervisorEquipmentDeclaration | null;
  /** Only FINAL_AUTHORITATIVE declarations count operationally. */
  declarationIsAuthoritative: boolean;
  systemOutstandingMilli: number | null;
  remainingAfterDeclarationMilli: number;
  sheetVsLedgerDisagree: boolean;
  ledgerInvariantOk: boolean;
  duplicateRider: boolean;
  invalidCycle: boolean;
  postReview?: PostDeclarationReview | null;
}): {
  bucket: OperationalBucket;
  exceptionCode: OperationalExceptionCode | null;
  notes: string[];
} {
  const notes: string[] = [];
  if (params.invalidCycle) {
    return { bucket: 'YELLOW', exceptionCode: 'INVALID_CYCLE', notes: ['invalid cycle'] };
  }
  if (params.duplicateRider) {
    return { bucket: 'YELLOW', exceptionCode: 'DUPLICATE_RIDER', notes: ['duplicate rider'] };
  }
  if (!params.ledgerInvariantOk) {
    return {
      bucket: 'YELLOW',
      exceptionCode: 'ADMIN_LEDGER_CORRECTION_REQUIRED',
      notes: ['ledger invariant failed'],
    };
  }

  // Authoritative final declaration drives admin queues / GREEN / RED.
  if (params.declarationIsAuthoritative && params.declaration && params.postReview) {
    const pr = params.postReview;
    if (pr.exceptionCode) {
      return {
        bucket: 'YELLOW',
        exceptionCode: pr.exceptionCode,
        notes: [pr.proposedCorrection?.note || pr.exceptionCode],
      };
    }
    if (pr.operationalHint === 'GREEN') {
      return { bucket: 'GREEN', exceptionCode: null, notes: ['final declaration clear'] };
    }
    if (pr.operationalHint === 'RED') {
      return { bucket: 'RED', exceptionCode: null, notes };
    }
  }

  if (!params.hasLiability) {
    return {
      bucket: 'YELLOW',
      exceptionCode: 'MISSING_LIABILITY_NEEDS_SUPERVISOR_REVIEW',
      notes: ['missing liability row — supervisor final review required'],
    };
  }

  // Full booking-path set (≈67) stays YELLOW until fresh final declaration resolves it.
  if (params.sheetVsLedgerDisagree) {
    return {
      bucket: 'YELLOW',
      exceptionCode: 'SHEET_VS_LEDGER_DISAGREE',
      notes: ['booking-path sheet vs ledger — supervisor final review required (full set, not subset)'],
    };
  }

  // Verified outstanding 0 with no unresolved conflict → GREEN.
  if (params.systemOutstandingMilli != null && params.systemOutstandingMilli <= 0) {
    return { bucket: 'GREEN', exceptionCode: null, notes: ['system outstanding already 0'] };
  }

  if (!params.declarationIsAuthoritative) {
    return {
      bucket: 'YELLOW',
      exceptionCode: 'DECLARATION_MISSING',
      notes: params.declaration
        ? ['legacy declaration only — fresh FINAL_AUTHORITATIVE required']
        : ['fresh final supervisor declaration required'],
    };
  }

  if (
    params.declaration?.paymentStatus === 'FULLY_PAID' ||
    params.remainingAfterDeclarationMilli <= 0
  ) {
    return { bucket: 'GREEN', exceptionCode: null, notes };
  }

  return { bucket: 'RED', exceptionCode: null, notes };
}

/**
 * Build READ-ONLY next-cycle dry-run preview.
 * Does not write sheets or mutate liability.
 */
export function buildEquipmentDryRunPreview(params: {
  targetCycle: PayoutCycle;
  priorCycles: PayoutCycle[];
  liabilities: EquipmentLiabilityIssue[];
  declarations: SupervisorEquipmentDeclaration[];
  requestRows: unknown[][];
  actualRows: unknown[][];
  roster: Array<{ riderCode: string; riderName: string; supervisorCode: string }>;
  /** Evidence cycles for sheet-vs-ledger (e.g. Aug W1+W2). Defaults to priorCycles. */
  evidenceCycles?: Array<{ cycleLabel: string; monthLabel: string; year: number; cycleId?: string }>;
}): DryRunPreview {
  const target = params.targetCycle;
  const cycleLabel = cycleLabelForPayout(target);
  const monthLabel = monthLabelForPayout(target);
  const year = target.year;

  const declMap = latestDeclarationsByRiderCycle(
    params.declarations.filter((d) => d.cycleId === target.cycleId)
  );

  const byRider = new Map<string, EquipmentLiabilityIssue>();
  const dup = new Set<string>();
  for (const issue of params.liabilities) {
    const k = normalizeRiderCodeKey(issue.riderCode);
    if (!k) continue;
    if (byRider.has(k)) dup.add(k);
    if (!byRider.has(k) || issue.status === 'open') byRider.set(k, issue);
  }

  const orderedPrior = [...params.priorCycles]
    .filter((c) => !c.isClosing)
    .sort((a, b) => a.startDate.localeCompare(b.startDate))
    .map((c) => ({
      cycleKey: cycleKeyFromParts(cycleLabelForPayout(c), monthLabelForPayout(c), c.year),
      cycleLabel: cycleLabelForPayout(c),
      monthLabel: monthLabelForPayout(c),
      year: c.year,
      cycleId: c.cycleId,
    }));

  const evidence =
    params.evidenceCycles && params.evidenceCycles.length > 0
      ? params.evidenceCycles
      : orderedPrior;

  const manualV2Analysis = analyzeManualV2ForCycle({
    requestRows: params.requestRows,
    cycleId: target.cycleId,
    cycleLabel,
    monthLabel,
    year,
  });
  const manualMap = manualV2Analysis.manualV2ByRider;

  const rosterByCode = new Map(
    params.roster.map((r) => [normalizeRiderCodeKey(r.riderCode), r] as const)
  );

  // Operational population = liabilities ∪ scoped evidence activity (not entire idle roster).
  const riderSet = new Set<string>();
  for (const k of byRider.keys()) riderSet.add(k);

  const REQ = DEDUCTION_IMPORT_HEADERS;
  const ACT = DEDUCTIONS_ACTUAL_HEADERS;
  for (let i = 1; i < params.requestRows.length; i++) {
    const row = params.requestRows[i];
    if (!row) continue;
    const c = String(row[REQ.indexOf('دورة_الاستقطاع')] ?? '').trim();
    const m = String(row[REQ.indexOf('شهر')] ?? '').trim();
    const y = String(row[REQ.indexOf('سنة')] ?? '').replace(/,/g, '').trim();
    if (!evidence.some((ec) => ec.cycleLabel === c && ec.monthLabel === m && String(ec.year) === y)) {
      continue;
    }
    const k = normalizeRiderCodeKey(row[REQ.indexOf('كود_المندوب')]);
    if (k) riderSet.add(k);
  }
  for (let i = 1; i < params.actualRows.length; i++) {
    const row = params.actualRows[i];
    if (!row) continue;
    const c = String(row[ACT.indexOf('دورة_الاستقطاع')] ?? '').trim();
    const m = String(row[ACT.indexOf('شهر')] ?? '').trim();
    const yNum = Number(String(row[ACT.indexOf('سنة')] ?? '').replace(/,/g, ''));
    if (
      !evidence.some(
        (ec) =>
          ec.cycleLabel === c &&
          ec.monthLabel === m &&
          (!Number.isFinite(yNum) || Math.round(yNum) === ec.year)
      )
    ) {
      continue;
    }
    const k = normalizeRiderCodeKey(row[ACT.indexOf('كود_المندوب')]);
    if (k) riderSet.add(k);
  }

  const lines: EquipmentRequestPreviewLine[] = [];

  for (const rider of [...riderSet].sort()) {
    const issue = byRider.get(rider) || null;
    const roster = rosterByCode.get(rider);
    const decl = declMap.get(`${rider}|${target.cycleId}`) || null;

    const original = issue?.originalLiabilityMilli || decl?.originalLiabilityMilli || 0;
    const settlement = issue?.settlementPaidMilli || 0;
    const amountDeducted = issue?.amountDeductedMilli || 0;
    const systemOutstanding = issue?.outstandingMilli ?? null;

    const inv = issue
      ? ledgerOutstandingInvariant({
          originalLiabilityMilli: original,
          amountDeductedMilli: amountDeducted,
          settlementPaidMilli: settlement,
          outstandingMilli: systemOutstanding ?? 0,
        })
      : { ok: true, expectedOutstandingMilli: 0, deltaMilli: 0 };

    let sheetActualMilli = 0;
    for (const pc of evidence) {
      sheetActualMilli +=
        aggregateActualPayrollByRiderCycle(
          params.actualRows,
          pc.cycleLabel,
          pc.monthLabel,
          pc.year
        ).get(rider) || 0;
    }

    const sheetVsLedgerDisagree =
      Boolean(issue) &&
      isGenuineSheetVsLedgerDisagree({
        outstandingMilli: systemOutstanding ?? 0,
        amountDeductedMilli: amountDeducted,
        settlementPaidMilli: settlement,
        sheetActualMilli,
      });

    const history = buildRiderCycleHistory({
      riderCode: rider,
      orderedCycles: orderedPrior,
      requestRows: params.requestRows,
      actualRows: params.actualRows,
    });
    const carryForwardMilli = history.reduce(
      (s, h) => s + cycleShortfallMilli(h.requestedMilli, h.actualMilli),
      0
    );

    let remainingAfterDeclaration = systemOutstanding != null ? systemOutstanding : original;
    const authoritative = isFinalAuthoritativeDeclaration(decl);
    if (decl && authoritative) {
      const paid = declaredPaidFromStatus({
        status: decl.paymentStatus,
        declaredPaidMilli: decl.declaredPaidMilli,
        originalLiabilityMilli: original || decl.originalLiabilityMilli,
      });
      const afterDecl = Math.max(0, (original || decl.originalLiabilityMilli) - paid);
      if (systemOutstanding != null) {
        remainingAfterDeclaration = Math.min(systemOutstanding, afterDecl);
        if (decl.paymentStatus === 'FULLY_PAID') remainingAfterDeclaration = 0;
      } else {
        remainingAfterDeclaration = afterDecl;
      }
    }

    const warnings: string[] = [];
    if (!issue) warnings.push('MISSING_LIABILITY');
    if (sheetVsLedgerDisagree) warnings.push('SHEET_VS_LEDGER_DISAGREE');
    if (!authoritative) warnings.push('FRESH_FINAL_DECLARATION_REQUIRED');

    const postReview =
      decl && authoritative
        ? evaluatePostDeclarationReview({
            hasLiability: Boolean(issue),
            declaration: decl,
            originalLiabilityMilli: original || decl.originalLiabilityMilli,
            settlementPaidMilli: settlement,
            amountDeductedMilli: amountDeducted,
            outstandingMilli: systemOutstanding,
            sheetActualMilli,
            hadSheetVsLedgerDisagree: sheetVsLedgerDisagree,
          })
        : null;

    const classified = classifyOperationalBucket({
      hasLiability: Boolean(issue),
      declaration: decl,
      declarationIsAuthoritative: authoritative,
      systemOutstandingMilli: systemOutstanding,
      remainingAfterDeclarationMilli: remainingAfterDeclaration,
      sheetVsLedgerDisagree,
      ledgerInvariantOk: inv.ok,
      duplicateRider: dup.has(rider),
      invalidCycle: !target.cycleId,
      postReview,
    });

    const breakdown = computeCycleRequestBreakdown({
      remainingLiabilityMilli: classified.bucket === 'RED' ? remainingAfterDeclaration : 0,
      carryForwardShortfallMilli: classified.bucket === 'RED' ? carryForwardMilli : 0,
    });

    const equipmentRequestMilli =
      classified.bucket === 'RED' ? breakdown.totalRequestMilli : 0;
    const manualV2Milli = manualMap.get(rider) || 0;

    lines.push({
      riderCode: issue?.riderCode || roster?.riderCode || rider,
      riderName: issue?.riderNameSnapshot || roster?.riderName || '',
      supervisorCode: issue?.supervisorCodeSnapshot || roster?.supervisorCode || '',
      operationalBucket: classified.bucket,
      exceptionCode: classified.exceptionCode,
      declarationStatus: authoritative
        ? decl!.paymentStatus
        : decl
          ? 'LEGACY_DECLARATION_ONLY'
          : 'DECLARATION_MISSING',
      declaredPaidMilli: authoritative ? decl!.declaredPaidMilli : null,
      hasLiability: Boolean(issue),
      originalLiabilityMilli: original,
      systemOutstandingMilli: systemOutstanding,
      remainingAfterDeclarationMilli: remainingAfterDeclaration,
      baseInstallmentMilli: classified.bucket === 'RED' ? breakdown.baseInstallmentMilli : 0,
      carryForwardMilli: classified.bucket === 'RED' ? breakdown.carryForwardMilli : 0,
      equipmentRequestMilli,
      exceedsThreeHundredDueToCarry: breakdown.exceedsThreeHundredDueToCarry,
      manualV2Milli,
      totalCombinedRequestMilli: equipmentRequestMilli + manualV2Milli,
      securityPaidUpfront: issue?.securityPaidUpfront ?? null,
      warnings,
      notes: classified.notes,
      hasFreshFinalDeclaration: authoritative,
    });
  }

  const green = lines.filter((l) => l.operationalBucket === 'GREEN');
  const red = lines.filter((l) => l.operationalBucket === 'RED');
  const yellow = lines.filter((l) => l.operationalBucket === 'YELLOW');
  const freshDone = lines.filter((l) => l.hasFreshFinalDeclaration).length;

  return {
    mode: 'READ_ONLY_DRY_RUN',
    cycle: {
      cycleId: target.cycleId,
      startDate: target.startDate,
      endDate: target.endDate,
      cycleLabel,
      monthLabel,
      year,
    },
    priorCycles: orderedPrior.map((c) => ({
      cycleId: c.cycleId,
      cycleLabel: c.cycleLabel,
      monthLabel: c.monthLabel,
      year: c.year,
    })),
    summary: {
      greenCount: green.length,
      redCount: red.length,
      yellowCount: yellow.length,
      totalEquipmentRequestMilli: red.reduce((s, l) => s + l.equipmentRequestMilli, 0),
      totalEquipmentBaseMilli: red.reduce((s, l) => s + l.baseInstallmentMilli, 0),
      totalCarryForwardMilli: red.reduce((s, l) => s + l.carryForwardMilli, 0),
      totalManualV2Milli: manualV2Analysis.manualV2TotalMilli,
      totalCombinedRequestMilli:
        red.reduce((s, l) => s + l.equipmentRequestMilli, 0) +
        manualV2Analysis.manualV2TotalMilli,
      ridersWithDeductions: lines.filter(
        (l) => l.equipmentRequestMilli > 0 || l.manualV2Milli > 0
      ).length,
      missingLiabilityCount: yellow.filter(
        (l) => l.exceptionCode === 'MISSING_LIABILITY_NEEDS_SUPERVISOR_REVIEW'
      ).length,
      ledgerDisagreementCount: yellow.filter(
        (l) => l.exceptionCode === 'SHEET_VS_LEDGER_DISAGREE'
      ).length,
      declarationMissingCount: yellow.filter((l) => l.exceptionCode === 'DECLARATION_MISSING')
        .length,
      adminLedgerCorrectionCount: yellow.filter(
        (l) => l.exceptionCode === 'ADMIN_LEDGER_CORRECTION_REQUIRED'
      ).length,
      adminLiabilityCreationCount: yellow.filter(
        (l) => l.exceptionCode === 'ADMIN_LIABILITY_CREATION_REQUIRED'
      ).length,
      completedFreshDeclarations: freshDone,
      pendingFreshDeclarations: lines.length - freshDone,
    },
    manualV2Analysis,
    lines,
  };
}

export { milliemesToEgp };
