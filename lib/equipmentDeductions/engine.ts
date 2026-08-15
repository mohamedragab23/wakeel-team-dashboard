import { appendAuditLog } from '@/lib/auditLog';
import { appendToSheet, ensureSheetExists, getSheetDataOrThrow } from '@/lib/googleSheets';
import { appendLedgerTransaction, getLedgerTransactionByIdempotencyKey } from '@/lib/payrollLedger';
import { egpToMilliemes, expectedInstallmentMilliemes, milliemesToEgp } from '@/lib/money';
import { scheduleFromPersistedOriginalMilli } from '@/lib/equipmentPricing';
import {
  shouldIncrementInstallmentAfterRecover,
  unrecoveredLedgerPostMilli,
} from './reconcile';
import { listPayoutCycles } from '@/lib/payoutCycles/store';
import {
  isCycleEligibleForEquipmentDeduction,
  resolveCycleForDeductionDate,
} from '@/lib/payoutCycles/eligibility';
import type { PayoutCycle } from '@/lib/payoutCycles/types';
import { isRiderCode, normalizeRiderCodeForPerformance } from '@/lib/riderCodeUtils';
import { isAutoEquipmentDeductionsEnabled } from '@/lib/srs014Flags';
import {
  getById,
  listOpenIssues,
  updateBalance,
  type EquipmentLiabilityIssue,
} from '@/lib/equipmentLiability/store';
import { resolveAvailablePayoutMilliByRider } from './availablePayout';
import {
  EQUIPMENT_AUTO_DEDUCTION_HEADERS,
  SHEET_EQUIPMENT_AUTO_DEDUCTIONS,
  type EquipmentAutoDeductionStatus,
} from './constants';
import { acquireAutoDeductionLock } from './lock';

export type AutoDeductionDecision =
  | { action: 'skip'; reason: string }
  | {
      action: 'deduct';
      amountMilli: number;
      /** Uncapped installment target for this index (before available-payout cap). */
      expectedMilli: number;
      installmentNumber: number;
      /** False when partial payout — installment index must not advance. */
      installmentComplete: boolean;
    };

let autoSheetEnsured = false;

function newAutoDeductionId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID();
  return `ead_${Date.now()}_${Math.random().toString(36).slice(2)}`;
}

function cell(row: unknown[], i: number): string {
  return String(row[i] ?? '').trim();
}

function cyclePeriod(cycle: Pick<PayoutCycle, 'year' | 'month'>): string {
  return `${cycle.year}-${String(cycle.month).padStart(2, '0')}`;
}

export function buildIdempotencyKey(
  riderCode: string,
  equipmentIssueId: string,
  cycleId: string,
  installmentNumber: number
): string {
  return `equipment:${riderCode.trim()}:${equipmentIssueId.trim()}:${cycleId.trim()}:${installmentNumber}`;
}

export function computeAutoDeductionDecision(params: {
  remainingMilli: number;
  schedule: number[];
  installmentsCompleted: number;
  /** Installment/auto progress only — must exclude settlement cash. */
  amountDeductedMilli?: number;
  cycle: Pick<
    PayoutCycle,
    'cycleId' | 'equipmentDeductionEnabled' | 'isClosing' | 'startDate' | 'endDate' | 'status'
  >;
  allCycles: PayoutCycle[];
  activationDate: string;
  riderCode: string;
  equipmentIssueId: string;
  /**
   * Available payout in milliemes. When `requireAvailablePayout` is true (default),
   * omitting this value fail-closes — it is NEVER treated as unlimited.
   */
  availablePayoutMilli?: number;
  /**
   * Production default true: missing/unknown available payout → skip.
   * Set false only for pure schedule unit tests that inject an explicit cap separately.
   */
  requireAvailablePayout?: boolean;
  existingIdempotencyKeys: Set<string>;
  /** When set, blocks a second installment in the same cycle (cron re-run safety). */
  existingIssueCycleKeys?: Set<string>;
}): AutoDeductionDecision {
  const remaining = Math.trunc(params.remainingMilli);
  if (!Number.isFinite(remaining)) {
    return { action: 'skip', reason: 'malformed_payout_amount' };
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

  const issueCycleKey = `${params.equipmentIssueId.trim()}:${params.cycle.cycleId.trim()}`;
  if (params.existingIssueCycleKeys?.has(issueCycleKey)) {
    return { action: 'skip', reason: 'already_posted_for_cycle' };
  }

  const installmentNumber = params.installmentsCompleted + 1;
  const idempotencyKey = buildIdempotencyKey(
    params.riderCode,
    params.equipmentIssueId,
    params.cycle.cycleId,
    installmentNumber
  );
  if (params.existingIdempotencyKeys.has(idempotencyKey)) {
    return { action: 'skip', reason: 'duplicate_idempotency' };
  }

  const scheduleTarget = expectedInstallmentMilliemes({
    remainingMilli: remaining,
    schedule: params.schedule,
    installmentIndex: params.installmentsCompleted,
  });
  if (scheduleTarget <= 0) {
    return { action: 'skip', reason: 'zero_installment' };
  }

  // Installment progress only (settlement must not inflate amountDeductedMilli).
  const deducted = Math.max(0, Math.trunc(params.amountDeductedMilli ?? 0));
  const completedSum = params.schedule
    .slice(0, params.installmentsCompleted)
    .reduce((a, b) => a + Math.max(0, Math.trunc(b)), 0);
  const paidTowardCurrent = Math.max(0, deducted - completedSum);
  const expectedMilli = Math.min(remaining, Math.max(0, scheduleTarget - paidTowardCurrent));
  if (expectedMilli <= 0) {
    return { action: 'skip', reason: 'installment_already_satisfied' };
  }

  const requireAvailable = params.requireAvailablePayout !== false;
  if (requireAvailable && params.availablePayoutMilli === undefined) {
    return { action: 'skip', reason: 'available_payout_unresolved' };
  }

  let amountMilli = expectedMilli;
  if (params.availablePayoutMilli !== undefined) {
    const raw = params.availablePayoutMilli;
    if (!Number.isFinite(raw) || Math.trunc(raw) !== raw) {
      return { action: 'skip', reason: 'invalid_available_payout' };
    }
    if (raw < 0) {
      return { action: 'skip', reason: 'negative_available_payout' };
    }
    const available = Math.trunc(raw);
    if (available <= 0) {
      return { action: 'skip', reason: 'insufficient_payout' };
    }
    amountMilli = Math.min(amountMilli, available);
  }

  if (amountMilli <= 0) {
    return { action: 'skip', reason: 'zero_deductible' };
  }

  return {
    action: 'deduct',
    amountMilli,
    expectedMilli,
    installmentNumber,
    installmentComplete: amountMilli >= expectedMilli,
  };
}

async function ensureAutoDeductionsSheet(): Promise<void> {
  if (autoSheetEnsured) return;
  await ensureSheetExists(SHEET_EQUIPMENT_AUTO_DEDUCTIONS, [...EQUIPMENT_AUTO_DEDUCTION_HEADERS]);
  autoSheetEnsured = true;
}

export async function loadExistingAutoDeductionGuards(): Promise<{
  idempotencyKeys: Set<string>;
  /** Keys with status=posted (balance evidence row written after successful balance). */
  postedIdempotencyKeys: Set<string>;
  /** One equipment installment per cycle — `${equipmentIssueId}:${cycleId}` */
  issueCycleKeys: Set<string>;
}> {
  await ensureAutoDeductionsSheet();
  // Fail closed: empty-on-error must not look like "no prior deductions".
  const data = await getSheetDataOrThrow(SHEET_EQUIPMENT_AUTO_DEDUCTIONS, false);
  const idempotencyKeys = new Set<string>();
  const postedIdempotencyKeys = new Set<string>();
  const issueCycleKeys = new Set<string>();
  for (let i = 1; i < data.length; i++) {
    const key = cell(data[i], 1);
    const equipmentIssueId = cell(data[i], 2);
    const cycleId = cell(data[i], 5);
    const status = cell(data[i], 11);
    if (key) idempotencyKeys.add(key);
    if (key && status === 'posted') postedIdempotencyKeys.add(key);
    if (equipmentIssueId && cycleId && status === 'posted') {
      issueCycleKeys.add(`${equipmentIssueId}:${cycleId}`);
    }
  }
  return { idempotencyKeys, postedIdempotencyKeys, issueCycleKeys };
}

function scheduleForIssue(issue: EquipmentLiabilityIssue): number[] {
  if (issue.installmentSchedule?.length) return issue.installmentSchedule;
  return scheduleFromPersistedOriginalMilli(issue.originalLiabilityMilli);
}

async function appendAutoDeductionRow(row: {
  idempotencyKey: string;
  equipmentIssueId: string;
  riderCode: string;
  riderNameSnapshot: string;
  cycleId: string;
  installmentNumber: number;
  amountMilli: number;
  period: string;
  ledgerTransactionId: string;
  status: EquipmentAutoDeductionStatus;
  skipReason: string;
}): Promise<void> {
  await ensureAutoDeductionsSheet();
  const now = new Date().toISOString();
  await appendToSheet(SHEET_EQUIPMENT_AUTO_DEDUCTIONS, [
    [
      newAutoDeductionId(),
      row.idempotencyKey,
      row.equipmentIssueId,
      row.riderCode,
      row.riderNameSnapshot,
      row.cycleId,
      row.installmentNumber,
      row.amountMilli,
      milliemesToEgp(row.amountMilli),
      row.period,
      row.ledgerTransactionId,
      row.status,
      row.skipReason,
      now,
    ],
  ]);
}

export type EquipmentAutoDeductionRunResult = {
  enabled: boolean;
  asOfDate: string;
  cycleId: string | null;
  processed: number;
  deducted: number;
  skipped: number;
  errors: string[];
  /** Auditable skip/failure reasons collected during the run (tests). */
  auditTrail?: Array<{
    timestamp: string;
    actor: string;
    riderCode: string;
    equipmentIssueId: string;
    cycleId: string;
    installmentNumber: number;
    requestedMilli: number;
    deductedMilli: number;
    remainingMilli: number;
    result: 'posted' | 'skipped' | 'error';
    reason: string;
    idempotencyKey: string;
  }>;
};

/** Injectable deps for Phase D acceptance tests (production omits this). */
export type AutoDeductionRunDeps = {
  listPayoutCycles?: () => Promise<PayoutCycle[]>;
  listOpenIssues?: () => Promise<EquipmentLiabilityIssue[]>;
  loadGuards?: () => Promise<{
    idempotencyKeys: Set<string>;
    postedIdempotencyKeys: Set<string>;
    issueCycleKeys: Set<string>;
  }>;
  appendLedger?: typeof appendLedgerTransaction;
  getLedgerByKey?: typeof getLedgerTransactionByIdempotencyKey;
  appendAutoRow?: typeof appendAutoDeductionRow;
  updateBalance?: typeof updateBalance;
  acquireLock?: typeof acquireAutoDeductionLock;
  appendAudit?: typeof appendAuditLog;
  resolveAvailablePayout?: (params: {
    riderCodes: string[];
    overrideByRider?: Record<string, number>;
  }) => Promise<Record<string, number>>;
  getIssueById?: (equipmentIssueId: string) => Promise<EquipmentLiabilityIssue | null>;
  /**
   * When true, write one auto-deduction sheet row per skip (QPM-heavy).
   * Production default false — skips go to audit log + in-run trail/summary only.
   * Posted deductions always write a sheet row.
   */
  persistSkipRows?: boolean;
};

/**
 * LEGACY TARGET-CONFLICT — paid-on-cron path (ledger_native + updateBalance + Y-gate).
 *
 * Phase 4C production cron uses `runEquipmentAutoRequestsForDate` (REQUEST only).
 * Keep this function for historical/regression reference; do not wire it back to cron
 * without an explicit separate Go. SRS target: REQUEST ≠ ACTUAL ≠ ALLOCATED.
 *
 * No-op when `FEATURE_AUTO_EQUIPMENT_DEDUCTIONS_ENABLED` is off.
 */
export async function runEquipmentAutoDeductionsForDate(
  asOfDate: string,
  actor: { code: string; name: string },
  opts?: {
    availablePayoutMilliByRider?: Record<string, number>;
    deps?: AutoDeductionRunDeps;
  }
): Promise<EquipmentAutoDeductionRunResult> {
  const deps = opts?.deps || {};
  const result: EquipmentAutoDeductionRunResult = {
    enabled: isAutoEquipmentDeductionsEnabled(),
    asOfDate,
    cycleId: null,
    processed: 0,
    deducted: 0,
    skipped: 0,
    errors: [],
    auditTrail: [],
  };

  if (!result.enabled) return result;

  const listCycles = deps.listPayoutCycles ?? listPayoutCycles;
  const listOpen = deps.listOpenIssues ?? listOpenIssues;
  const loadGuards = deps.loadGuards ?? loadExistingAutoDeductionGuards;
  const appendLedger = deps.appendLedger ?? appendLedgerTransaction;
  const getLedgerByKey = deps.getLedgerByKey ?? getLedgerTransactionByIdempotencyKey;
  const appendAutoRow = deps.appendAutoRow ?? appendAutoDeductionRow;
  const updateBal = deps.updateBalance ?? updateBalance;
  const acquireLock = deps.acquireLock ?? acquireAutoDeductionLock;
  const appendAudit = deps.appendAudit ?? appendAuditLog;
  const resolvePayout = deps.resolveAvailablePayout ?? resolveAvailablePayoutMilliByRider;
  // Default OFF: one Sheets row per skip is unsafe at Production volume.
  const persistSkipRows = deps.persistSkipRows === true;
  const getIssueById = deps.getIssueById ?? getById;

  const pushAudit = (entry: NonNullable<EquipmentAutoDeductionRunResult['auditTrail']>[number]) => {
    result.auditTrail!.push(entry);
  };

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
    pushAudit({
      timestamp: new Date().toISOString(),
      actor: actor.code,
      riderCode: '',
      equipmentIssueId: '',
      cycleId: '',
      installmentNumber: 0,
      requestedMilli: 0,
      deductedMilli: 0,
      remainingMilli: 0,
      result: 'skipped',
      reason: 'no_cycle_for_date',
      idempotencyKey: '',
    });
    return result;
  }
  result.cycleId = cycle.cycleId;

  if (cycle.status === 'finalized') {
    result.errors.push('cycle_finalized');
    result.skipped += 1;
    pushAudit({
      timestamp: new Date().toISOString(),
      actor: actor.code,
      riderCode: '',
      equipmentIssueId: '',
      cycleId: cycle.cycleId,
      installmentNumber: 0,
      requestedMilli: 0,
      deductedMilli: 0,
      remainingMilli: 0,
      result: 'skipped',
      reason: 'cycle_finalized',
      idempotencyKey: '',
    });
    try {
      await appendAudit({
        domain: 'equipment',
        action: 'auto_deduction_skip',
        entityType: 'payout_cycle',
        entityCode: cycle.cycleId,
        actorCode: actor.code,
        actorName: actor.name,
        after: { reason: 'cycle_finalized', asOfDate },
      });
    } catch {
      /* audit failure must not mutate payroll */
    }
    return result;
  }

  if (cycle.status === 'draft') {
    result.errors.push('cycle_draft');
    result.skipped += 1;
    pushAudit({
      timestamp: new Date().toISOString(),
      actor: actor.code,
      riderCode: '',
      equipmentIssueId: '',
      cycleId: cycle.cycleId,
      installmentNumber: 0,
      requestedMilli: 0,
      deductedMilli: 0,
      remainingMilli: 0,
      result: 'skipped',
      reason: 'cycle_draft',
      idempotencyKey: '',
    });
    return result;
  }

  let openIssues: EquipmentLiabilityIssue[];
  let guards: {
    idempotencyKeys: Set<string>;
    postedIdempotencyKeys: Set<string>;
    issueCycleKeys: Set<string>;
  };
  try {
    openIssues = await listOpen();
    guards = await loadGuards();
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    result.errors.push(`sheets_failure:liability_or_guards:${msg}`);
    return result;
  }

  const existingKeys = guards.idempotencyKeys;
  const postedKeys = guards.postedIdempotencyKeys;
  const issueCycleKeys = guards.issueCycleKeys;
  const period = cyclePeriod(cycle);

  const riderCodes = openIssues.map((i) => i.riderCode);
  let availableByRider: Record<string, number>;
  try {
    availableByRider = await resolvePayout({
      riderCodes,
      overrideByRider: opts?.availablePayoutMilliByRider,
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    result.errors.push(`available_payout_resolve_failed:${msg}`);
    return result;
  }

  for (const issue of openIssues) {
    result.processed += 1;
    const schedule = scheduleForIssue(issue);
    const riderKey = issue.riderCode.trim();
    const riderNorm = normalizeRiderCodeForPerformance(riderKey) || riderKey;
    const hasAvailable =
      Object.prototype.hasOwnProperty.call(availableByRider, riderKey) ||
      Object.prototype.hasOwnProperty.call(availableByRider, riderNorm);
    const availablePayoutMilli = hasAvailable
      ? availableByRider[riderKey] ?? availableByRider[riderNorm]
      : undefined;

    const decision = computeAutoDeductionDecision({
      remainingMilli: issue.outstandingMilli,
      schedule,
      installmentsCompleted: issue.installmentsCompleted,
      amountDeductedMilli: issue.amountDeductedMilli,
      cycle,
      allCycles: cycles,
      activationDate: issue.activationDate,
      riderCode: issue.riderCode,
      equipmentIssueId: issue.equipmentIssueId,
      availablePayoutMilli,
      requireAvailablePayout: true,
      existingIdempotencyKeys: existingKeys,
      existingIssueCycleKeys: issueCycleKeys,
    });

    const baseIdempotencyKey = buildIdempotencyKey(
      issue.riderCode,
      issue.equipmentIssueId,
      cycle.cycleId,
      decision.action === 'deduct' ? decision.installmentNumber : issue.installmentsCompleted + 1
    );

    if (decision.action === 'skip') {
      result.skipped += 1;
      pushAudit({
        timestamp: new Date().toISOString(),
        actor: actor.code,
        riderCode: issue.riderCode,
        equipmentIssueId: issue.equipmentIssueId,
        cycleId: cycle.cycleId,
        installmentNumber: issue.installmentsCompleted + 1,
        requestedMilli: 0,
        deductedMilli: 0,
        remainingMilli: issue.outstandingMilli,
        result: 'skipped',
        reason: decision.reason,
        idempotencyKey: baseIdempotencyKey,
      });
      if (persistSkipRows) {
        try {
          await appendAutoRow({
            idempotencyKey: baseIdempotencyKey,
            equipmentIssueId: issue.equipmentIssueId,
            riderCode: issue.riderCode,
            riderNameSnapshot: issue.riderNameSnapshot,
            cycleId: cycle.cycleId,
            installmentNumber: issue.installmentsCompleted + 1,
            amountMilli: 0,
            period,
            ledgerTransactionId: '',
            status: 'skipped',
            skipReason: decision.reason,
          });
        } catch (err: unknown) {
          const msg = err instanceof Error ? err.message : String(err);
          result.errors.push(`skip_audit_row_failed:${issue.equipmentIssueId}:${msg}`);
        }
      }
      try {
        await appendAudit({
          domain: 'equipment',
          action: 'auto_deduction_skip',
          entityType: 'equipment_issue',
          entityCode: issue.equipmentIssueId,
          actorCode: actor.code,
          actorName: actor.name,
          after: {
            reason: decision.reason,
            riderCode: issue.riderCode,
            cycleId: cycle.cycleId,
            idempotencyKey: baseIdempotencyKey,
            remainingMilli: issue.outstandingMilli,
          },
        });
      } catch {
        /* audit failure must not mutate payroll */
      }
      continue;
    }

    const idempotencyKey = buildIdempotencyKey(
      issue.riderCode,
      issue.equipmentIssueId,
      cycle.cycleId,
      decision.installmentNumber
    );
    const issueCycleKey = `${issue.equipmentIssueId}:${cycle.cycleId}`;

    const lock = await acquireLock(idempotencyKey);
    if (!lock.ok) {
      result.skipped += 1;
      pushAudit({
        timestamp: new Date().toISOString(),
        actor: actor.code,
        riderCode: issue.riderCode,
        equipmentIssueId: issue.equipmentIssueId,
        cycleId: cycle.cycleId,
        installmentNumber: decision.installmentNumber,
        requestedMilli: decision.expectedMilli,
        deductedMilli: 0,
        remainingMilli: issue.outstandingMilli,
        result: 'skipped',
        reason: 'lock_busy',
        idempotencyKey,
      });
      if (persistSkipRows) {
        try {
          await appendAutoRow({
            idempotencyKey,
            equipmentIssueId: issue.equipmentIssueId,
            riderCode: issue.riderCode,
            riderNameSnapshot: issue.riderNameSnapshot,
            cycleId: cycle.cycleId,
            installmentNumber: decision.installmentNumber,
            amountMilli: 0,
            period,
            ledgerTransactionId: '',
            status: 'skipped',
            skipReason: 'lock_busy',
          });
        } catch {
          /* ignore */
        }
      }
      continue;
    }

    try {
      const ledgerDup = await getLedgerByKey(idempotencyKey);
      if (ledgerDup) {
        // Ledger already posted — never append a second txn. Recover balance if needed.
        const postedMilli = egpToMilliemes(Math.abs(Number((ledgerDup as { amount?: number }).amount) || 0));
        let snap = issue;
        if (getIssueById) {
          const fresh = await getIssueById(issue.equipmentIssueId);
          if (fresh) snap = fresh;
        }
        const balanceAlreadyApplied = postedKeys.has(idempotencyKey);
        const gap = unrecoveredLedgerPostMilli({
          snapshot: {
            originalLiabilityMilli: snap.originalLiabilityMilli,
            amountDeductedMilli: snap.amountDeductedMilli,
            settlementPaidMilli: snap.settlementPaidMilli || 0,
            outstandingMilli: snap.outstandingMilli,
            status: snap.status,
          },
          postedMilli: postedMilli || decision.amountMilli,
          balanceAlreadyApplied,
        });
        if (gap > 0) {
          const incrementInstallment = shouldIncrementInstallmentAfterRecover({
            schedule,
            installmentsCompleted: snap.installmentsCompleted,
            amountDeductedMilli: snap.amountDeductedMilli,
            gapMilli: gap,
          });
          const recovered = await updateBal(issue.equipmentIssueId, gap, actor, {
            incrementInstallment,
          });
          if (!recovered.ok) {
            result.errors.push(`balance_reconcile_failed:${issue.equipmentIssueId}`);
          } else {
            result.errors.push(`balance_reconciled_after_ledger_dup:${issue.equipmentIssueId}`);
            try {
              await appendAutoRow({
                idempotencyKey,
                equipmentIssueId: issue.equipmentIssueId,
                riderCode: issue.riderCode,
                riderNameSnapshot: issue.riderNameSnapshot,
                cycleId: cycle.cycleId,
                installmentNumber: decision.installmentNumber,
                amountMilli: gap,
                period,
                ledgerTransactionId: String((ledgerDup as { transactionId?: string }).transactionId || ''),
                status: 'posted',
                skipReason: '',
              });
              postedKeys.add(idempotencyKey);
            } catch (err: unknown) {
              const msg = err instanceof Error ? err.message : String(err);
              result.errors.push(`auto_row_failed_on_reconcile:${issue.equipmentIssueId}:${msg}`);
            }
          }
        }
        existingKeys.add(idempotencyKey);
        if (postedKeys.has(idempotencyKey) || gap > 0) {
          issueCycleKeys.add(issueCycleKey);
        }
        result.skipped += 1;
        pushAudit({
          timestamp: new Date().toISOString(),
          actor: actor.code,
          riderCode: issue.riderCode,
          equipmentIssueId: issue.equipmentIssueId,
          cycleId: cycle.cycleId,
          installmentNumber: decision.installmentNumber,
          requestedMilli: decision.expectedMilli,
          deductedMilli: gap > 0 ? gap : 0,
          remainingMilli: snap.outstandingMilli,
          result: 'skipped',
          reason: gap > 0 ? 'reconciled_after_ledger_dup' : 'already_processed',
          idempotencyKey,
        });
        await lock.release();
        continue;
      }

      let txn: { transactionId: string };
      try {
        txn = await appendLedger({
          entityType: 'rider',
          entityCode: issue.riderCode,
          entityNameSnapshot: issue.riderNameSnapshot,
          type: 'deduction',
          rawAmount: milliemesToEgp(decision.amountMilli),
          reason: `قسط معدات (${decision.installmentNumber}/3)`,
          period,
          createdBy: actor.code,
          createdByName: actor.name,
          source: 'ledger_native',
          category: 'equipment_installment',
          idempotencyKey,
          cycleId: cycle.cycleId,
          equipmentIssueId: issue.equipmentIssueId,
        });
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        result.errors.push(`payroll_post_failed:${issue.equipmentIssueId}:${msg}`);
        pushAudit({
          timestamp: new Date().toISOString(),
          actor: actor.code,
          riderCode: issue.riderCode,
          equipmentIssueId: issue.equipmentIssueId,
          cycleId: cycle.cycleId,
          installmentNumber: decision.installmentNumber,
          requestedMilli: decision.expectedMilli,
          deductedMilli: 0,
          remainingMilli: issue.outstandingMilli,
          result: 'error',
          reason: 'payroll_post_failure',
          idempotencyKey,
        });
        // Release lock so a retry can proceed after failed post.
        await lock.release();
        continue;
      }

      // Order: ledger → balance → auto evidence row (so balance-fail retries can reconcile).
      const balanceResult = await updateBal(issue.equipmentIssueId, decision.amountMilli, actor, {
        incrementInstallment: decision.installmentComplete,
      });
      if (!balanceResult.ok) {
        result.errors.push(`balance_update_failed:${issue.equipmentIssueId}`);
        pushAudit({
          timestamp: new Date().toISOString(),
          actor: actor.code,
          riderCode: issue.riderCode,
          equipmentIssueId: issue.equipmentIssueId,
          cycleId: cycle.cycleId,
          installmentNumber: decision.installmentNumber,
          requestedMilli: decision.expectedMilli,
          deductedMilli: decision.amountMilli,
          remainingMilli: issue.outstandingMilli,
          result: 'error',
          reason: 'liability_update_failure',
          idempotencyKey,
        });
        // Ledger posted; no posted auto row yet → retry reconciles via ledgerDup.
        await lock.release();
        continue;
      }

      try {
        await appendAutoRow({
          idempotencyKey,
          equipmentIssueId: issue.equipmentIssueId,
          riderCode: issue.riderCode,
          riderNameSnapshot: issue.riderNameSnapshot,
          cycleId: cycle.cycleId,
          installmentNumber: decision.installmentNumber,
          amountMilli: decision.amountMilli,
          period,
          ledgerTransactionId: txn.transactionId,
          status: 'posted',
          skipReason: '',
        });
        postedKeys.add(idempotencyKey);
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        result.errors.push(`auto_row_failed:${issue.equipmentIssueId}:${msg}`);
        // Balance already updated — mark cycle guard to prevent a second installment.
        postedKeys.add(idempotencyKey);
      }

      const remainingAfter = balanceResult.issue.outstandingMilli;
      existingKeys.add(idempotencyKey);
      issueCycleKeys.add(issueCycleKey);
      result.deducted += 1;
      pushAudit({
        timestamp: new Date().toISOString(),
        actor: actor.code,
        riderCode: issue.riderCode,
        equipmentIssueId: issue.equipmentIssueId,
        cycleId: cycle.cycleId,
        installmentNumber: decision.installmentNumber,
        requestedMilli: decision.expectedMilli,
        deductedMilli: decision.amountMilli,
        remainingMilli: remainingAfter,
        result: 'posted',
        reason: decision.installmentComplete ? 'posted_full_installment' : 'posted_partial_installment',
        idempotencyKey,
      });

      try {
        await appendAudit({
          domain: 'equipment',
          action: 'auto_deduction_posted',
          entityType: 'equipment_issue',
          entityCode: issue.equipmentIssueId,
          actorCode: actor.code,
          actorName: actor.name,
          after: {
            riderCode: issue.riderCode,
            cycleId: cycle.cycleId,
            installmentNumber: decision.installmentNumber,
            requestedMilli: decision.expectedMilli,
            deductedMilli: decision.amountMilli,
            remainingMilli: remainingAfter,
            installmentComplete: decision.installmentComplete,
            idempotencyKey,
            ledgerTransactionId: txn.transactionId,
          },
        });
      } catch {
        /* audit failure after successful financial post — do not reverse money */
        result.errors.push(`audit_failed:${issue.equipmentIssueId}`);
      }

      // Success: release short-lived exec lock (sheet + ledger keep idempotency).
      await lock.release();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      result.errors.push(`deduct_failed:${issue.equipmentIssueId}:${msg}`);
      await lock.release();
    }
  }

  return result;
}
