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
import { expectedInstallmentMilliemes } from '@/lib/money';
import { scheduleFromPersistedOriginalMilli } from '@/lib/equipmentPricing';
import {
  isCycleEligibleForEquipmentDeduction,
  resolveCycleForDeductionDate,
} from '@/lib/payoutCycles/eligibility';
import { listPayoutCycles } from '@/lib/payoutCycles/store';
import type { PayoutCycle } from '@/lib/payoutCycles/types';
import { isRiderCode, normalizeRiderCodeForPerformance } from '@/lib/riderCodeUtils';
import { isAutoEquipmentDeductionsEnabled } from '@/lib/srs014Flags';
import { listOpenIssues, type EquipmentLiabilityIssue } from '@/lib/equipmentLiability/store';
import { isOpenForAllocation } from '@/lib/equipmentDeductions/obligations';
import {
  createSheetsObligationLedgerStore,
  emitRequestObligation,
  listPersistedObligations,
  stableEquipmentInstallmentDeductionId,
  type EmitRequestResult,
  type ObligationLedgerStore,
} from '@/lib/equipmentDeductions/requestPersistence';

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
}): AutoRequestDecision {
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
    params.activationDate
  );
  if (!eligibility.eligible) {
    return { action: 'skip', reason: eligibility.reason || 'cycle_ineligible' };
  }

  const installmentNumber = Math.max(1, Math.trunc(params.installmentsCompleted) + 1);
  const scheduleTarget = expectedInstallmentMilliemes({
    remainingMilli: remaining,
    schedule: params.schedule,
    installmentIndex: Math.max(0, Math.trunc(params.installmentsCompleted)),
  });
  if (scheduleTarget <= 0) {
    return { action: 'skip', reason: 'zero_installment' };
  }

  const deducted = Math.max(0, Math.trunc(params.amountDeductedMilli ?? 0));
  const completedSum = params.schedule
    .slice(0, Math.max(0, Math.trunc(params.installmentsCompleted)))
    .reduce((a, b) => a + Math.max(0, Math.trunc(b)), 0);
  const paidTowardCurrent = Math.max(0, deducted - completedSum);
  const originalAmountMilli = Math.min(remaining, Math.max(0, scheduleTarget - paidTowardCurrent));
  if (originalAmountMilli <= 0) {
    return { action: 'skip', reason: 'installment_already_satisfied' };
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

/**
 * Cron entry (Phase 4C): emit/queue REQUEST obligations only.
 * No-op when `FEATURE_AUTO_EQUIPMENT_DEDUCTIONS_ENABLED` is off.
 * Financial side effects remain zero (no wallet / ledger / liability mutation).
 */
export async function runEquipmentAutoRequestsForDate(
  asOfDate: string,
  actor: { code: string; name: string },
  opts?: { deps?: AutoRequestRunDeps }
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
    errors: [],
    auditTrail: [],
  };

  if (!enabled) return result;

  const listCycles = deps.listPayoutCycles ?? listPayoutCycles;
  const listOpen = deps.listOpenIssues ?? listOpenIssues;

  let cycles: PayoutCycle[];
  try {
    cycles = await listCycles();
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    result.errors.push(`sheets_failure:cycles:${msg}`);
    return result;
  }

  const cycle = resolveCycleForDeductionDate(cycles, asOfDate);
  if (!cycle) {
    result.errors.push('no_cycle_for_date');
    result.skipped += 1;
    return result;
  }
  result.cycleId = cycle.cycleId;

  if (cycle.status === 'finalized') {
    result.errors.push('cycle_finalized');
    result.skipped += 1;
    return result;
  }
  if (cycle.status === 'draft') {
    result.errors.push('cycle_draft');
    result.skipped += 1;
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

  for (const issue of openIssues) {
    result.processed += 1;
    const schedule = scheduleForIssue(issue);

    let persisted;
    try {
      persisted = await listPersistedObligations(store);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      result.errors.push(`obligation_list_failed:${issue.equipmentIssueId}:${msg}`);
      result.skipped += 1;
      continue;
    }

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
            result.skipped += 1;
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

    const decision = computeAutoRequestDecision({
      remainingMilli: issue.outstandingMilli,
      schedule,
      installmentsCompleted: issue.installmentsCompleted,
      amountDeductedMilli: issue.amountDeductedMilli,
      cycle,
      allCycles: cycles,
      activationDate: issue.activationDate,
      riderCode: issue.riderCode,
      equipmentIssueId: issue.equipmentIssueId,
    });

    if (decision.action === 'skip') {
      result.skipped += 1;
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
        result.skipped += 1;
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
