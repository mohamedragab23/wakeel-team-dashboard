/**
 * SRS-014 Phase 4C — Auto/Cron → REQUEST integration only.
 *
 * Emits REQUEST obligations via Phase 4B persistence.
 * Does NOT: allocate, collect, mutate wallet/liability, write ledger_native, or Y-gate.
 *
 * Legacy paid-on-cron lives in `engine.ts` (`runEquipmentAutoDeductionsForDate`) and is
 * intentionally NOT called from the production cron route after Phase 4C.
 */

import { appendAuditLog } from '@/lib/auditLog';
import {
  appendToSheet,
  ensureHeaderRow,
  ensureSheetExists,
  getSheetDataOrThrow,
  updateSheetRow,
} from '@/lib/googleSheets';
import {
  ARABIC_MONTH_NAMES,
  DEDUCTION_CYCLE_LABELS,
  type DeductionCycleKey,
} from '@/lib/equipmentSheetConstants';
import { computeCycleRequestMilli } from '@/lib/equipmentDeductions/equipmentFinancialModel';
import { scheduleFromPersistedOriginalMilli } from '@/lib/equipmentPricing';
import {
  isCycleEligibleForEquipmentDeduction,
  resolveCycleForDeductionDate,
} from '@/lib/payoutCycles/eligibility';
import { listPayoutCycles } from '@/lib/payoutCycles/store';
import type { PayoutCycle } from '@/lib/payoutCycles/types';
import { isRiderCode, normalizeRiderCodeForPerformance } from '@/lib/riderCodeUtils';
import { isAutoEquipmentDeductionsEnabled } from '@/lib/srs014Flags';
import { listOpenIssues, listOutstandingIssues, type EquipmentLiabilityIssue } from '@/lib/equipmentLiability/store';
import { isOpenForAllocation } from '@/lib/equipmentDeductions/obligations';
import {
  createSheetsObligationLedgerStore,
  emitRequestObligation,
  listPersistedObligations,
  stableEquipmentInstallmentDeductionId,
  type EmitRequestResult,
  type ObligationLedgerStore,
} from '@/lib/equipmentDeductions/requestPersistence';
import {
  buildRiderCycleHistory,
  carryForwardForCycle,
  cycleKeyFromParts,
} from '@/lib/equipmentDeductions/carryForward';
import { getSheetData } from '@/lib/googleSheets';
import { classifyOperationalBucket } from '@/lib/equipmentDeductions/operationalEngine';
import {
  declaredPaidFromStatus,
  ledgerOutstandingInvariant,
  normalizeRiderCodeKey,
} from '@/lib/equipmentDeductions/equipmentFinancialModel';
import {
  evaluatePostDeclarationReview,
  isFinalAuthoritativeDeclaration,
} from '@/lib/equipmentDeductions/declarationReview';
import {
  latestDeclarationsByRiderCycle,
  listSupervisorEquipmentDeclarations,
} from '@/lib/equipmentDeductions/supervisorDeclarations';

export type AutoRequestDecision =
  | { action: 'skip'; reason: string }
  | {
      action: 'request';
      /** Full installment target for REQUEST (NOT Y-capped). */
      originalAmountMilli: number;
      installmentNumber: number;
      deductionId: string;
    };

function scheduleForIssue(issue: EquipmentLiabilityIssue): number[] {
  if (issue.installmentSchedule?.length) return issue.installmentSchedule;
  // Historical: always derive from persisted original — never live Admin / money.ts catalog.
  return scheduleFromPersistedOriginalMilli(issue.originalLiabilityMilli);
}

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

/**
 * Pure eligibility + installment sizing for REQUEST emission.
 * No availablePayout / Y-gate. No wallet / ledger side effects.
 */
export function computeAutoRequestDecision(params: {
  remainingMilli: number;
  schedule: number[];
  installmentsCompleted: number;
  /** Installment progress only — must exclude settlement cash. */
  amountDeductedMilli?: number;
  cycle: Pick<
    PayoutCycle,
    'cycleId' | 'equipmentDeductionEnabled' | 'isClosing' | 'startDate' | 'endDate' | 'status'
  >;
  allCycles: PayoutCycle[];
  activationDate: string;
  riderCode: string;
  equipmentIssueId: string;
  /** Opening / old-fleet liabilities: do not wait for a post-activation cycle. */
  existingFleetLiability?: boolean;
  /** Unfulfilled REQUEST shortfall carried from prior cycles (milliemes). */
  carryForwardShortfallMilli?: number;
  /**
   * Operational gate (GREEN/RED/YELLOW). When provided:
   * - GREEN / YELLOW → skip (no auto REQUEST)
   * - RED → proceed
   * When omitted, legacy callers keep prior behavior (tests / prep).
   */
  operationalBucket?: 'GREEN' | 'RED' | 'YELLOW';
}): AutoRequestDecision {
  if (params.operationalBucket === 'GREEN') {
    return { action: 'skip', reason: 'operational_green_no_deduct' };
  }
  if (params.operationalBucket === 'YELLOW') {
    return { action: 'skip', reason: 'operational_yellow_blocked' };
  }

  const remaining = Math.trunc(params.remainingMilli);
  if (!Number.isFinite(remaining)) {
    return { action: 'skip', reason: 'malformed_outstanding' };
  }
  if (remaining < 0) {
    return { action: 'skip', reason: 'negative_outstanding' };
  }
  if (remaining <= 0) {
    return { action: 'skip', reason: 'no_outstanding' };
  }

  const riderNorm = normalizeRiderCodeForPerformance(params.riderCode);
  if (!riderNorm || !isRiderCode(riderNorm)) {
    return { action: 'skip', reason: 'invalid_rider' };
  }

  const eligibility = isCycleEligibleForEquipmentDeduction(
    params.cycle as PayoutCycle,
    params.allCycles,
    params.activationDate,
    { existingFleetLiability: Boolean(params.existingFleetLiability) }
  );
  if (!eligibility.eligible) {
    return { action: 'skip', reason: eligibility.reason || 'cycle_ineligible' };
  }

  const installmentNumber = Math.max(1, Math.trunc(params.installmentsCompleted) + 1);
  const carry = Math.max(0, Math.trunc(params.carryForwardShortfallMilli ?? 0));
  const originalAmountMilli = computeCycleRequestMilli({
    payrollOutstandingMilli: remaining,
    carryForwardShortfallMilli: carry,
  });
  if (originalAmountMilli <= 0) {
    return { action: 'skip', reason: 'zero_installment' };
  }

  const deductionId = stableEquipmentInstallmentDeductionId(
    params.equipmentIssueId,
    installmentNumber
  );

  return {
    action: 'request',
    originalAmountMilli,
    installmentNumber,
    deductionId,
  };
}

export type EquipmentAutoRequestRunResult = {
  enabled: boolean;
  asOfDate: string;
  cycleId: string | null;
  processed: number;
  /** New REQUEST rows created this run. */
  requested: number;
  /** Open remainders queued (currentCycleId update only). */
  queued: number;
  skipped: number;
  /** Why riders were skipped (reason → count). */
  skipReasons: Record<string, number>;
  errors: string[];
  auditTrail: Array<{
    timestamp: string;
    actor: string;
    riderCode: string;
    equipmentIssueId: string;
    cycleId: string;
    installmentNumber: number;
    deductionId: string;
    originalAmountMilli: number;
    result: 'created' | 'queued' | 'skipped' | 'error';
    reason: string;
    /** Always 0 — H-1 / REQUEST path never advances installmentsCompleted. */
    installmentsCompletedDelta: 0;
    financialSideEffects: EmitRequestResult['financialSideEffects'] | null;
  }>;
};

export type AutoRequestRunDeps = {
  listPayoutCycles?: () => Promise<PayoutCycle[]>;
  listOpenIssues?: () => Promise<EquipmentLiabilityIssue[]>;
  obligationStore?: ObligationLedgerStore;
  /** Override flag check (tests). */
  isEnabled?: () => boolean;
  /** Override supervisor declarations for cycle (tests / dry-run). */
  listDeclarationsForCycle?: (
    cycleId: string
  ) => Promise<Awaited<ReturnType<typeof listSupervisorEquipmentDeclarations>>>;
  /** Optional audit sink (defaults to appendAuditLog). */
  appendAudit?: (entry: {
    domain: 'equipment';
    action: 'create_equipment_deduction_request';
    entityType: string;
    entityCode: string;
    actorCode: string;
    actorName: string;
    after: Record<string, unknown>;
  }) => Promise<unknown>;
};

async function defaultObligationStore(): Promise<ObligationLedgerStore> {
  return createSheetsObligationLedgerStore({
    ensureSheetExists,
    ensureHeaderRow,
    getSheetDataOrThrow,
    appendToSheet,
    updateSheetRow,
  });
}

function isExistingFleetLiability(issue: EquipmentLiabilityIssue): boolean {
  return (
    issue.pricingSource === 'OPENING_MIGRATION' ||
    String(issue.equipmentIssueId || '').startsWith('opening_') ||
    String(issue.deliveryRowRef || '').startsWith('opening:')
  );
}

function bumpSkip(result: EquipmentAutoRequestRunResult, reason: string): void {
  result.skipped += 1;
  result.skipReasons[reason] = (result.skipReasons[reason] || 0) + 1;
}

/**
 * Cron entry (Phase 4C): emit/queue REQUEST obligations only.
 * No-op when `FEATURE_AUTO_EQUIPMENT_DEDUCTIONS_ENABLED` is off.
 * Financial side effects remain zero (no wallet / ledger / liability mutation).
 *
 * Admin prep may pass `cycleId` so the selected payout cycle is used instead of
 * re-resolving by deductionGenerationDate (which silently no-ops on draft cycles).
 */
export async function runEquipmentAutoRequestsForDate(
  asOfDate: string,
  actor: { code: string; name: string },
  opts?: { deps?: AutoRequestRunDeps; cycleId?: string; adminExplicitPrep?: boolean }
): Promise<EquipmentAutoRequestRunResult> {
  const deps = opts?.deps || {};
  const enabled = (deps.isEnabled ?? isAutoEquipmentDeductionsEnabled)();
  const result: EquipmentAutoRequestRunResult = {
    enabled,
    asOfDate,
    cycleId: null,
    processed: 0,
    requested: 0,
    queued: 0,
    skipped: 0,
    skipReasons: {},
    errors: [],
    auditTrail: [],
  };

  if (!enabled) return result;

  const listCycles = deps.listPayoutCycles ?? listPayoutCycles;
  const adminExplicitPrep = Boolean(opts?.adminExplicitPrep);
  const listOpen = deps.listOpenIssues ?? (adminExplicitPrep ? listOutstandingIssues : listOpenIssues);

  let cycles: PayoutCycle[];
  try {
    cycles = await listCycles();
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    result.errors.push(`sheets_failure:cycles:${msg}`);
    return result;
  }

  const forcedId = String(opts?.cycleId || '').trim().toLowerCase();
  const cycle = forcedId
    ? cycles.find((c) => String(c.cycleId || '').trim().toLowerCase() === forcedId) || null
    : resolveCycleForDeductionDate(cycles, asOfDate);
  if (!cycle) {
    result.errors.push(forcedId ? 'cycle_not_found' : 'no_cycle_for_date');
    bumpSkip(result, forcedId ? 'cycle_not_found' : 'no_cycle_for_date');
    return result;
  }
  result.cycleId = cycle.cycleId;

  if (cycle.status === 'finalized') {
    result.errors.push('cycle_finalized');
    bumpSkip(result, 'cycle_finalized');
    return result;
  }
  if (cycle.status === 'draft') {
    result.errors.push('cycle_draft');
    bumpSkip(result, 'cycle_draft');
    return result;
  }

  let openIssues: EquipmentLiabilityIssue[];
  let store: ObligationLedgerStore;
  try {
    openIssues = await listOpen();
    store = deps.obligationStore ?? (await defaultObligationStore());
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    result.errors.push(`sheets_failure:liability_or_ledger:${msg}`);
    return result;
  }

  const cycleLabel = cycleLabelForPayout(cycle);
  const monthLabel = monthLabelForPayout(cycle);
  const uploadedAt = new Date().toISOString();
  const targetCycleKey = cycleKeyFromParts(cycleLabel, monthLabel, cycle.year);

  let requestSheetRows: unknown[][] = [];
  let actualSheetRows: unknown[][] = [];
  try {
    requestSheetRows = (await getSheetData('الاستقطاعات', false)) || [];
    actualSheetRows = (await getSheetData('الاستقطاعات_الفعلية', false)) || [];
  } catch {
    /* carry-forward falls back to 0 when sheets unavailable */
  }

  let declarationMap = new Map<
    string,
    Awaited<ReturnType<typeof listSupervisorEquipmentDeclarations>>[number]
  >();
  try {
    const listDecls =
      deps.listDeclarationsForCycle ??
      ((cycleId: string) => listSupervisorEquipmentDeclarations({ cycleId }));
    const decls = await listDecls(cycle.cycleId);
    declarationMap = latestDeclarationsByRiderCycle(decls);
  } catch {
    /* missing sheet ⇒ all riders treated as declaration_missing (YELLOW) */
  }

  const orderedPriorCycles = cycles
    .filter((c) => c.year === cycle.year && c.month === cycle.month)
    .sort((a, b) => a.startDate.localeCompare(b.startDate))
    .map((c) => ({
      cycleKey: cycleKeyFromParts(cycleLabelForPayout(c), monthLabelForPayout(c), c.year),
      cycleLabel: cycleLabelForPayout(c),
      monthLabel: monthLabelForPayout(c),
      year: c.year,
    }))
    .filter((c) => c.cycleKey !== targetCycleKey);

  let persisted;
  try {
    persisted = await listPersistedObligations(store);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    result.errors.push(`sheets_failure:obligation_list:${msg}`);
    return result;
  }

  for (const issue of openIssues) {
    result.processed += 1;
    const schedule = scheduleForIssue(issue);

    const openRemainders = persisted.filter(
      (p) =>
        p.obligation.equipmentIssueId === issue.equipmentIssueId &&
        p.obligation.reason === 'معدات' &&
        (isOpenForAllocation(p.obligation) || p.obligation.remainingAmount > 0)
    );

    if (openRemainders.length > 0) {
      for (const rem of openRemainders) {
        try {
          const emit = await emitRequestObligation(store, {
            deductionId: rem.obligation.deductionId,
            source: rem.obligation.source,
            riderCode: rem.obligation.riderCode,
            reason: 'معدات',
            originalCycleId: rem.obligation.originalCycleId,
            currentCycleId: cycle.cycleId,
            originalAmount: rem.obligation.originalAmount,
            obligationAgeKey: rem.obligation.obligationAgeKey,
            equipmentIssueId: rem.obligation.equipmentIssueId,
            installmentNumber: rem.obligation.installmentNumber,
            riderName: issue.riderNameSnapshot,
            supervisorCode: issue.supervisorCodeSnapshot,
            supervisorName: issue.supervisorNameSnapshot,
            zone: issue.zoneSnapshot,
            cycleLabel,
            monthLabel,
            year: cycle.year,
            uploadedAt,
          });
          if (emit.outcome === 'queued_existing' || emit.outcome === 'created') {
            // created should not happen for existing open id; treat both as non-financial
            if (emit.outcome === 'queued_existing') result.queued += 1;
            else result.requested += 1;
            result.auditTrail.push({
              timestamp: uploadedAt,
              actor: actor.code,
              riderCode: issue.riderCode,
              equipmentIssueId: issue.equipmentIssueId,
              cycleId: cycle.cycleId,
              installmentNumber: rem.obligation.installmentNumber || 0,
              deductionId: rem.obligation.deductionId,
              originalAmountMilli: rem.obligation.originalAmount,
              result: emit.outcome === 'queued_existing' ? 'queued' : 'created',
              reason: 'open_remainder_queued',
              installmentsCompletedDelta: 0,
              financialSideEffects: emit.financialSideEffects,
            });
          } else {
            bumpSkip(result, 'already_exists_closed');
            result.auditTrail.push({
              timestamp: uploadedAt,
              actor: actor.code,
              riderCode: issue.riderCode,
              equipmentIssueId: issue.equipmentIssueId,
              cycleId: cycle.cycleId,
              installmentNumber: rem.obligation.installmentNumber || 0,
              deductionId: rem.obligation.deductionId,
              originalAmountMilli: rem.obligation.originalAmount,
              result: 'skipped',
              reason: 'already_exists_closed',
              installmentsCompletedDelta: 0,
              financialSideEffects: emit.financialSideEffects,
            });
          }
        } catch (err: unknown) {
          const msg = err instanceof Error ? err.message : String(err);
          result.errors.push(`queue_failed:${rem.obligation.deductionId}:${msg}`);
          result.auditTrail.push({
            timestamp: uploadedAt,
            actor: actor.code,
            riderCode: issue.riderCode,
            equipmentIssueId: issue.equipmentIssueId,
            cycleId: cycle.cycleId,
            installmentNumber: rem.obligation.installmentNumber || 0,
            deductionId: rem.obligation.deductionId,
            originalAmountMilli: rem.obligation.originalAmount,
            result: 'error',
            reason: 'queue_failed',
            installmentsCompletedDelta: 0,
            financialSideEffects: null,
          });
        }
      }
      // Do not mint a new installment REQUEST while an open remainder exists for this issue.
      continue;
    }

    const riderKey = normalizeRiderCodeKey(issue.riderCode);
    const decl = declarationMap.get(`${riderKey}|${cycle.cycleId}`) || null;
    const authoritative = isFinalAuthoritativeDeclaration(decl);
    const inv = ledgerOutstandingInvariant({
      originalLiabilityMilli: issue.originalLiabilityMilli,
      amountDeductedMilli: issue.amountDeductedMilli,
      settlementPaidMilli: issue.settlementPaidMilli,
      outstandingMilli: issue.outstandingMilli,
    });

    let remainingAfterDeclaration = Math.max(0, Math.trunc(issue.outstandingMilli));
    if (decl && authoritative) {
      const paid = declaredPaidFromStatus({
        status: decl.paymentStatus,
        declaredPaidMilli: decl.declaredPaidMilli,
        originalLiabilityMilli: issue.originalLiabilityMilli,
      });
      if (decl.paymentStatus === 'FULLY_PAID') {
        remainingAfterDeclaration = 0;
      } else {
        const afterDecl = Math.max(0, issue.originalLiabilityMilli - paid);
        remainingAfterDeclaration = Math.min(remainingAfterDeclaration, afterDecl);
      }
    }

    const postReview =
      decl && authoritative
        ? evaluatePostDeclarationReview({
            hasLiability: true,
            declaration: decl,
            originalLiabilityMilli: issue.originalLiabilityMilli,
            settlementPaidMilli: issue.settlementPaidMilli,
            amountDeductedMilli: issue.amountDeductedMilli,
            outstandingMilli: issue.outstandingMilli,
            sheetActualMilli: 0,
            hadSheetVsLedgerDisagree: false,
          })
        : null;

    const classified = classifyOperationalBucket({
      hasLiability: true,
      declaration: decl,
      declarationIsAuthoritative: authoritative,
      systemOutstandingMilli: issue.outstandingMilli,
      remainingAfterDeclarationMilli: remainingAfterDeclaration,
      sheetVsLedgerDisagree: false,
      ledgerInvariantOk: inv.ok,
      duplicateRider: false,
      invalidCycle: false,
      postReview,
    });

    const decision = computeAutoRequestDecision({
      remainingMilli: remainingAfterDeclaration,
      schedule,
      installmentsCompleted: issue.installmentsCompleted,
      amountDeductedMilli: issue.amountDeductedMilli,
      cycle,
      allCycles: cycles,
      activationDate: issue.activationDate,
      riderCode: issue.riderCode,
      equipmentIssueId: issue.equipmentIssueId,
      existingFleetLiability: adminExplicitPrep || isExistingFleetLiability(issue),
      carryForwardShortfallMilli: carryForwardForCycle(
        buildRiderCycleHistory({
          riderCode: issue.riderCode,
          orderedCycles: orderedPriorCycles,
          requestRows: requestSheetRows,
          actualRows: actualSheetRows,
        }),
        targetCycleKey
      ),
      operationalBucket: classified.bucket,
    });

    if (decision.action === 'skip') {
      bumpSkip(result, decision.reason);
      result.auditTrail.push({
        timestamp: uploadedAt,
        actor: actor.code,
        riderCode: issue.riderCode,
        equipmentIssueId: issue.equipmentIssueId,
        cycleId: cycle.cycleId,
        installmentNumber: issue.installmentsCompleted + 1,
        deductionId: '',
        originalAmountMilli: 0,
        result: 'skipped',
        reason: decision.reason,
        installmentsCompletedDelta: 0,
        financialSideEffects: null,
      });
      continue;
    }

    // Snapshot for H-1 assertion in tests — never mutate liability in this path.
    const installmentsBefore = issue.installmentsCompleted;

    try {
      const emit = await emitRequestObligation(store, {
        deductionId: decision.deductionId,
        source: 'auto_equipment',
        riderCode: issue.riderCode,
        reason: 'معدات',
        originalCycleId: cycle.cycleId,
        currentCycleId: cycle.cycleId,
        originalAmount: decision.originalAmountMilli,
        obligationAgeKey: uploadedAt,
        equipmentIssueId: issue.equipmentIssueId,
        installmentNumber: decision.installmentNumber,
        riderName: issue.riderNameSnapshot,
        supervisorCode: issue.supervisorCodeSnapshot,
        supervisorName: issue.supervisorNameSnapshot,
        zone: issue.zoneSnapshot,
        cycleLabel,
        monthLabel,
        year: cycle.year,
        uploadedAt,
      });

      if (issue.installmentsCompleted !== installmentsBefore) {
        result.errors.push(`h1_violation:${issue.equipmentIssueId}`);
      }

      if (emit.outcome === 'created') {
        result.requested += 1;
        result.auditTrail.push({
          timestamp: uploadedAt,
          actor: actor.code,
          riderCode: issue.riderCode,
          equipmentIssueId: issue.equipmentIssueId,
          cycleId: cycle.cycleId,
          installmentNumber: decision.installmentNumber,
          deductionId: decision.deductionId,
          originalAmountMilli: decision.originalAmountMilli,
          result: 'created',
          reason: 'request_created',
          installmentsCompletedDelta: 0,
          financialSideEffects: emit.financialSideEffects,
        });
        const appendAudit = deps.appendAudit ?? appendAuditLog;
        void appendAudit({
          domain: 'equipment',
          action: 'create_equipment_deduction_request',
          entityType: 'equipment_issue',
          entityCode: issue.equipmentIssueId,
          actorCode: actor.code,
          actorName: actor.name,
          after: {
            riderCode: issue.riderCode,
            equipmentIssueId: issue.equipmentIssueId,
            cycleId: cycle.cycleId,
            deductionId: decision.deductionId,
            requestedAmountMilli: decision.originalAmountMilli,
            previousOutstandingMilli: issue.outstandingMilli,
            newOutstandingMilli: issue.outstandingMilli,
            idempotencyKey: decision.deductionId,
            timestamp: uploadedAt,
          },
        }).catch((err) =>
          console.error('[autoRequest] create_equipment_deduction_request audit failed:', err)
        );
      } else if (emit.outcome === 'queued_existing') {
        result.queued += 1;
        result.auditTrail.push({
          timestamp: uploadedAt,
          actor: actor.code,
          riderCode: issue.riderCode,
          equipmentIssueId: issue.equipmentIssueId,
          cycleId: cycle.cycleId,
          installmentNumber: decision.installmentNumber,
          deductionId: decision.deductionId,
          originalAmountMilli: decision.originalAmountMilli,
          result: 'queued',
          reason: 'idempotent_queue',
          installmentsCompletedDelta: 0,
          financialSideEffects: emit.financialSideEffects,
        });
      } else {
        bumpSkip(result, 'already_exists_closed');
        result.auditTrail.push({
          timestamp: uploadedAt,
          actor: actor.code,
          riderCode: issue.riderCode,
          equipmentIssueId: issue.equipmentIssueId,
          cycleId: cycle.cycleId,
          installmentNumber: decision.installmentNumber,
          deductionId: decision.deductionId,
          originalAmountMilli: decision.originalAmountMilli,
          result: 'skipped',
          reason: 'already_exists_closed',
          installmentsCompletedDelta: 0,
          financialSideEffects: emit.financialSideEffects,
        });
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      result.errors.push(`request_emit_failed:${issue.equipmentIssueId}:${msg}`);
      result.auditTrail.push({
        timestamp: uploadedAt,
        actor: actor.code,
        riderCode: issue.riderCode,
        equipmentIssueId: issue.equipmentIssueId,
        cycleId: cycle.cycleId,
        installmentNumber: decision.installmentNumber,
        deductionId: decision.deductionId,
        originalAmountMilli: decision.originalAmountMilli,
        result: 'error',
        reason: 'request_emit_failed',
        installmentsCompletedDelta: 0,
        financialSideEffects: null,
      });
    }
  }

  return result;
}
