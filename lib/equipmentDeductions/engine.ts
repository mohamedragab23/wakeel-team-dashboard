import { appendToSheet, ensureSheetExists, getSheetData } from '@/lib/googleSheets';
import { appendLedgerTransaction, getLedgerTransactionByIdempotencyKey } from '@/lib/payrollLedger';
import {
  expectedInstallmentMilliemes,
  liabilityInstallmentSchedule,
  milliemesToEgp,
  type SecurityInquiryPayment,
} from '@/lib/money';
import { listPayoutCycles } from '@/lib/payoutCycles/store';
import {
  isCycleEligibleForEquipmentDeduction,
  resolveCycleForDeductionDate,
} from '@/lib/payoutCycles/eligibility';
import type { PayoutCycle } from '@/lib/payoutCycles/types';
import { isAutoEquipmentDeductionsEnabled } from '@/lib/srs014Flags';
import { isUpstashConfigured, redisSetNx } from '@/lib/upstashRest';
import { listOpenIssues, updateBalance, type EquipmentLiabilityIssue } from '@/lib/equipmentLiability/store';
import {
  EQUIPMENT_AUTO_DEDUCTION_HEADERS,
  SHEET_EQUIPMENT_AUTO_DEDUCTIONS,
  type EquipmentAutoDeductionStatus,
} from './constants';

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

const IDEMPOTENCY_REDIS_PREFIX = 'equipment:auto_deduction:';
const IDEMPOTENCY_TTL_SECONDS = 90 * 24 * 60 * 60;

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
  /** Total already deducted on the issue (used to compute remainder of current installment). */
  amountDeductedMilli?: number;
  cycle: Pick<PayoutCycle, 'cycleId' | 'equipmentDeductionEnabled' | 'isClosing' | 'startDate' | 'endDate'>;
  allCycles: PayoutCycle[];
  activationDate: string;
  riderCode: string;
  equipmentIssueId: string;
  availablePayoutMilli?: number;
  existingIdempotencyKeys: Set<string>;
}): AutoDeductionDecision {
  const remaining = Math.max(0, Math.trunc(params.remainingMilli));
  if (remaining <= 0) {
    return { action: 'skip', reason: 'no_outstanding' };
  }

  const eligibility = isCycleEligibleForEquipmentDeduction(
    params.cycle as PayoutCycle,
    params.allCycles,
    params.activationDate
  );
  if (!eligibility.eligible) {
    return { action: 'skip', reason: eligibility.reason || 'cycle_ineligible' };
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

  // How much of prior completed installments + current partial has already been paid.
  const deducted = Math.max(0, Math.trunc(params.amountDeductedMilli ?? 0));
  const completedSum = params.schedule
    .slice(0, params.installmentsCompleted)
    .reduce((a, b) => a + Math.max(0, Math.trunc(b)), 0);
  const paidTowardCurrent = Math.max(0, deducted - completedSum);
  const expectedMilli = Math.min(remaining, Math.max(0, scheduleTarget - paidTowardCurrent));
  if (expectedMilli <= 0) {
    return { action: 'skip', reason: 'installment_already_satisfied' };
  }

  let amountMilli = expectedMilli;
  if (params.availablePayoutMilli != null) {
    const available = Math.max(0, Math.trunc(params.availablePayoutMilli));
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

async function loadExistingIdempotencyKeys(): Promise<Set<string>> {
  await ensureAutoDeductionsSheet();
  const data = await getSheetData(SHEET_EQUIPMENT_AUTO_DEDUCTIONS, false);
  const keys = new Set<string>();
  for (let i = 1; i < data.length; i++) {
    const key = cell(data[i], 1);
    if (key) keys.add(key);
  }
  return keys;
}

function scheduleForIssue(issue: EquipmentLiabilityIssue): number[] {
  if (issue.installmentSchedule?.length) return issue.installmentSchedule;
  const security: SecurityInquiryPayment = issue.securityPaidUpfront ? 'PAID' : 'NOT_PAID';
  return liabilityInstallmentSchedule(security).schedule;
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

async function tryAcquireIdempotencyLock(idempotencyKey: string): Promise<boolean> {
  if (!isUpstashConfigured()) return true;
  return redisSetNx(`${IDEMPOTENCY_REDIS_PREFIX}${idempotencyKey}`, '1', IDEMPOTENCY_TTL_SECONDS);
}

export type EquipmentAutoDeductionRunResult = {
  enabled: boolean;
  asOfDate: string;
  cycleId: string | null;
  processed: number;
  deducted: number;
  skipped: number;
  errors: string[];
};

/**
 * Daily cron entry: posts eligible equipment installments to payroll ledger.
 * No-op when `FEATURE_AUTO_EQUIPMENT_DEDUCTIONS_ENABLED` is off.
 */
export async function runEquipmentAutoDeductionsForDate(
  asOfDate: string,
  actor: { code: string; name: string },
  opts?: { availablePayoutMilliByRider?: Record<string, number> }
): Promise<EquipmentAutoDeductionRunResult> {
  const result: EquipmentAutoDeductionRunResult = {
    enabled: isAutoEquipmentDeductionsEnabled(),
    asOfDate,
    cycleId: null,
    processed: 0,
    deducted: 0,
    skipped: 0,
    errors: [],
  };

  if (!result.enabled) return result;

  const cycles = await listPayoutCycles();
  const cycle = resolveCycleForDeductionDate(cycles, asOfDate);
  if (!cycle) {
    result.errors.push('no_cycle_for_date');
    return result;
  }
  result.cycleId = cycle.cycleId;

  const openIssues = await listOpenIssues();
  const existingKeys = await loadExistingIdempotencyKeys();
  const period = cyclePeriod(cycle);

  for (const issue of openIssues) {
    result.processed += 1;
    const schedule = scheduleForIssue(issue);
    const availablePayoutMilli = opts?.availablePayoutMilliByRider?.[issue.riderCode];

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
      existingIdempotencyKeys: existingKeys,
    });

    if (decision.action === 'skip') {
      result.skipped += 1;
      continue;
    }

    const idempotencyKey = buildIdempotencyKey(
      issue.riderCode,
      issue.equipmentIssueId,
      cycle.cycleId,
      decision.installmentNumber
    );

    const gotLock = await tryAcquireIdempotencyLock(idempotencyKey);
    if (!gotLock) {
      result.skipped += 1;
      continue;
    }

    const ledgerDup = await getLedgerTransactionByIdempotencyKey(idempotencyKey);
    if (ledgerDup) {
      existingKeys.add(idempotencyKey);
      result.skipped += 1;
      continue;
    }

    try {
      const txn = await appendLedgerTransaction({
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

      await appendAutoDeductionRow({
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

      const balanceResult = await updateBalance(issue.equipmentIssueId, decision.amountMilli, actor, {
        incrementInstallment: decision.installmentComplete,
      });
      if (!balanceResult.ok) {
        result.errors.push(`balance_update_failed:${issue.equipmentIssueId}`);
      }

      existingKeys.add(idempotencyKey);
      result.deducted += 1;
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      result.errors.push(`deduct_failed:${issue.equipmentIssueId}:${msg}`);
    }
  }

  return result;
}
