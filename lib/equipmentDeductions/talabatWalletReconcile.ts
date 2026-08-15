/**
 * Talabat Wallet file → Actual reconcile → next-cycle REQUEST prep.
 *
 * External result only: we do NOT execute wallet/payroll deductions.
 * ACTUAL = Applaied Deduction on Wallet (actualWalletDeductionMilli).
 * REQUESTED (file) = 3Pl Internal Deductions — never reduces outstanding.
 */

import { createHash } from 'node:crypto';
import {
  reconcileActualPayrollDeduction,
  type ActualPayrollReconcileDeps,
} from '@/lib/equipmentDeductions/actualPayrollReconcile';
import { computeAutoRequestDecision } from '@/lib/equipmentDeductions/autoRequest';
import { isOpenForAllocation, type DeductionObligation } from '@/lib/equipmentDeductions/obligations';
import {
  emitRequestObligation,
  listPersistedObligations,
  type ObligationLedgerStore,
} from '@/lib/equipmentDeductions/requestPersistence';
import {
  aggregateTalabatWalletByRiderId,
  parseTalabatWalletRows,
  TALABAT_WALLET_SOURCE_COLUMNS,
  type TalabatWalletParsedRow,
} from '@/lib/equipmentDeductions/talabatWalletSource';
import { scheduleFromPersistedOriginalMilli } from '@/lib/equipmentPricing';
import type { EquipmentLiabilityIssue } from '@/lib/equipmentLiability/store';
import type { PayoutCycle } from '@/lib/payoutCycles/types';
import { normalizeRiderCodeForPerformance } from '@/lib/riderCodeUtils';
import { isSrs014FinancialApplyEnabled } from '@/lib/srs014Flags';

export type WalletReconcileException = {
  riderId: string;
  code: string;
  message: string;
  requestedFromFileMilli: number | null;
  actualWalletDeductionMilli: number | null;
};

export type WalletReconcileAppliedLine = {
  riderId: string;
  deductionId: string;
  equipmentIssueId: string;
  /** From file: 3Pl Internal Deductions */
  requestedFromFileMilli: number;
  /** From our REQUEST ledger (immutable) */
  requestLedgerMilli: number;
  /** From file: Applaied Deduction on Wallet */
  actualWalletDeductionMilli: number;
  previousOutstandingMilli: number;
  newOutstandingMilli: number;
  duplicate: boolean;
  status: string;
};

export type NextCyclePrepLine = {
  riderCode: string;
  equipmentIssueId: string;
  outstandingMilli: number;
  nextExpectedMilli: number;
  deductionId: string | null;
  outcome: 'created' | 'queued' | 'skipped' | 'settled';
  reason: string;
};

export type TalabatWalletBatchResult = {
  ok: boolean;
  batchId: string;
  duplicateBatch: boolean;
  sourceColumns: typeof TALABAT_WALLET_SOURCE_COLUMNS;
  applied: WalletReconcileAppliedLine[];
  exceptions: WalletReconcileException[];
  nextCyclePrep: NextCyclePrepLine[];
  parseErrors: string[];
  safety: {
    financialApplyEnabled: boolean;
    walletMutatedByUs: false;
    ledgerMoneyMutated: false;
    payrollExecuted: false;
    actualSource: typeof TALABAT_WALLET_SOURCE_COLUMNS.actual;
    requestedSource: typeof TALABAT_WALLET_SOURCE_COLUMNS.requested;
  };
};

export type TalabatWalletBatchDeps = ActualPayrollReconcileDeps & {
  listOpenLiabilities: () => Promise<EquipmentLiabilityIssue[]>;
  /** Optional: prevent re-processing same file+cycle. */
  findBatchById?: (batchId: string) => Promise<boolean>;
  persistBatchId?: (batchId: string) => Promise<void>;
  /** Cycles for next-request eligibility. */
  allCycles: PayoutCycle[];
  /** Cycle that the wallet file belongs to (Sunday request cycle). */
  walletCycle: PayoutCycle;
  /** Next cycle for auto REQUEST prep (may be null → skip prep). */
  nextCycle: PayoutCycle | null;
  actor: { code: string; name: string };
  actualDeductionDate: string;
  operatorConfirmation: boolean;
};

export function computeWalletFileBatchId(params: {
  cycleId: string;
  fileBytes: Buffer | Uint8Array | string;
}): string {
  const h = createHash('sha256')
    .update(String(params.cycleId || '').trim())
    .update('|')
    .update(params.fileBytes)
    .digest('hex')
    .slice(0, 32);
  return `wallet_batch:${params.cycleId}:${h}`;
}

function normRider(code: string): string {
  return normalizeRiderCodeForPerformance(code) || String(code || '').replace(/\s+/g, '').trim();
}

/** Exact Rider ID match only — never by name. */
export function matchRiderIdExactly(
  walletRiderId: string,
  knownCodes: Iterable<string>
): string | null {
  const target = normRider(walletRiderId);
  if (!target) return null;
  for (const c of knownCodes) {
    if (normRider(c) === target) return normRider(c) || c;
  }
  return null;
}

export function pickOpenEquipmentRequestForRider(
  obligations: DeductionObligation[],
  riderCode: string,
  cycleId?: string
): DeductionObligation | null {
  const n = normRider(riderCode);
  const open = obligations
    .filter(
      (o) =>
        o.reason === 'معدات' &&
        o.equipmentIssueId &&
        normRider(o.riderCode) === n &&
        isOpenForAllocation(o)
    )
    .sort((a, b) => {
      if (cycleId) {
        const aC = a.currentCycleId === cycleId ? 0 : 1;
        const bC = b.currentCycleId === cycleId ? 0 : 1;
        if (aC !== bC) return aC - bC;
      }
      return String(a.obligationAgeKey).localeCompare(String(b.obligationAgeKey));
    });
  return open[0] || null;
}

/**
 * After Actuals applied: for each OPEN liability, prep next Expected/REQUEST.
 * Settled → nextExpected 0, no request.
 */
export async function prepareNextCycleEquipmentRequests(params: {
  openIssues: EquipmentLiabilityIssue[];
  nextCycle: PayoutCycle;
  allCycles: PayoutCycle[];
  store: ObligationLedgerStore;
  actor: { code: string; name: string };
}): Promise<NextCyclePrepLine[]> {
  const lines: NextCyclePrepLine[] = [];
  const uploadedAt = new Date().toISOString();

  for (const issue of params.openIssues) {
    if (issue.status !== 'open' || issue.outstandingMilli <= 0) {
      lines.push({
        riderCode: issue.riderCode,
        equipmentIssueId: issue.equipmentIssueId,
        outstandingMilli: issue.outstandingMilli,
        nextExpectedMilli: 0,
        deductionId: null,
        outcome: 'settled',
        reason: 'no_outstanding',
      });
      continue;
    }

    const schedule =
      issue.installmentSchedule?.length
        ? issue.installmentSchedule
        : scheduleFromPersistedOriginalMilli(issue.originalLiabilityMilli);

    const decision = computeAutoRequestDecision({
      remainingMilli: issue.outstandingMilli,
      schedule,
      installmentsCompleted: issue.installmentsCompleted,
      amountDeductedMilli: issue.amountDeductedMilli,
      cycle: params.nextCycle,
      allCycles: params.allCycles,
      activationDate: issue.activationDate,
      riderCode: issue.riderCode,
      equipmentIssueId: issue.equipmentIssueId,
    });

    if (decision.action === 'skip') {
      lines.push({
        riderCode: issue.riderCode,
        equipmentIssueId: issue.equipmentIssueId,
        outstandingMilli: issue.outstandingMilli,
        nextExpectedMilli: 0,
        deductionId: null,
        outcome: 'skipped',
        reason: decision.reason,
      });
      continue;
    }

    // Do not mint a new installment while an open remainder exists.
    const persisted = await listPersistedObligations(params.store);
    const openRem = persisted.find(
      (p) =>
        p.obligation.equipmentIssueId === issue.equipmentIssueId &&
        p.obligation.reason === 'معدات' &&
        isOpenForAllocation(p.obligation)
    );
    if (openRem) {
      const queued = await emitRequestObligation(params.store, {
        deductionId: openRem.obligation.deductionId,
        source: openRem.obligation.source,
        riderCode: openRem.obligation.riderCode,
        reason: 'معدات',
        originalCycleId: openRem.obligation.originalCycleId,
        currentCycleId: params.nextCycle.cycleId,
        originalAmount: openRem.obligation.originalAmount,
        obligationAgeKey: openRem.obligation.obligationAgeKey,
        equipmentIssueId: openRem.obligation.equipmentIssueId,
        installmentNumber: openRem.obligation.installmentNumber,
        riderName: issue.riderNameSnapshot,
        uploadedAt,
      });
      lines.push({
        riderCode: issue.riderCode,
        equipmentIssueId: issue.equipmentIssueId,
        outstandingMilli: issue.outstandingMilli,
        nextExpectedMilli: openRem.obligation.remainingAmount,
        deductionId: openRem.obligation.deductionId,
        outcome: queued.outcome === 'created' ? 'created' : 'queued',
        reason: 'open_remainder_queued',
      });
      continue;
    }

    const emit = await emitRequestObligation(params.store, {
      deductionId: decision.deductionId,
      source: 'auto_equipment',
      riderCode: issue.riderCode,
      reason: 'معدات',
      originalCycleId: params.nextCycle.cycleId,
      currentCycleId: params.nextCycle.cycleId,
      originalAmount: decision.originalAmountMilli,
      obligationAgeKey: uploadedAt,
      equipmentIssueId: issue.equipmentIssueId,
      installmentNumber: decision.installmentNumber,
      riderName: issue.riderNameSnapshot,
      supervisorCode: issue.supervisorCodeSnapshot,
      supervisorName: issue.supervisorNameSnapshot,
      zone: issue.zoneSnapshot,
      uploadedAt,
    });

    lines.push({
      riderCode: issue.riderCode,
      equipmentIssueId: issue.equipmentIssueId,
      outstandingMilli: issue.outstandingMilli,
      nextExpectedMilli: decision.originalAmountMilli,
      deductionId: decision.deductionId,
      outcome: emit.outcome === 'created' ? 'created' : emit.outcome === 'queued_existing' ? 'queued' : 'skipped',
      reason: emit.outcome,
    });
  }

  return lines;
}

export function pickNextEligibleCycle(
  allCycles: PayoutCycle[],
  current: PayoutCycle
): PayoutCycle | null {
  const sorted = [...allCycles].sort(
    (a, b) =>
      a.startDate.localeCompare(b.startDate) || a.cycleNumber - b.cycleNumber
  );
  const idx = sorted.findIndex((c) => c.cycleId === current.cycleId);
  if (idx < 0) return null;
  for (let i = idx + 1; i < sorted.length; i++) {
    const c = sorted[i];
    if (c.status === 'finalized' || c.status === 'draft') continue;
    if (c.isClosing || !c.equipmentDeductionEnabled) continue;
    return c;
  }
  return null;
}

/**
 * Full Thursday/Friday wallet import reconciliation batch.
 */
export async function runTalabatWalletReconcileBatch(
  jsonRows: Record<string, unknown>[],
  deps: TalabatWalletBatchDeps,
  opts?: { batchId?: string }
): Promise<TalabatWalletBatchResult> {
  const safety = {
    financialApplyEnabled: isSrs014FinancialApplyEnabled(),
    walletMutatedByUs: false as const,
    ledgerMoneyMutated: false as const,
    payrollExecuted: false as const,
    actualSource: TALABAT_WALLET_SOURCE_COLUMNS.actual,
    requestedSource: TALABAT_WALLET_SOURCE_COLUMNS.requested,
  };

  const batchId =
    opts?.batchId ||
    `wallet_batch:${deps.walletCycle.cycleId}:${Date.now()}`;

  if (deps.findBatchById && (await deps.findBatchById(batchId))) {
    return {
      ok: true,
      batchId,
      duplicateBatch: true,
      sourceColumns: TALABAT_WALLET_SOURCE_COLUMNS,
      applied: [],
      exceptions: [],
      nextCyclePrep: [],
      parseErrors: [],
      safety,
    };
  }

  const parsed = parseTalabatWalletRows(jsonRows);
  const exceptions: WalletReconcileException[] = [];
  const applied: WalletReconcileAppliedLine[] = [];

  if (!parsed.columnPresence.hasApplaiedDeductionOnWallet) {
    return {
      ok: false,
      batchId,
      duplicateBatch: false,
      sourceColumns: TALABAT_WALLET_SOURCE_COLUMNS,
      applied: [],
      exceptions: [
        {
          riderId: '',
          code: 'MISSING_ACTUAL_COLUMN',
          message: `عمود «${TALABAT_WALLET_SOURCE_COLUMNS.actual}» مطلوب`,
          requestedFromFileMilli: null,
          actualWalletDeductionMilli: null,
        },
      ],
      nextCyclePrep: [],
      parseErrors: parsed.errors,
      safety,
    };
  }

  const byRider = aggregateTalabatWalletByRiderId(parsed.rows);
  const openLiabilities = await deps.listOpenLiabilities();
  const allPersisted = await listPersistedObligations(deps.obligationStore);
  const obligations = allPersisted.map((p) => p.obligation);

  const knownCodes = new Set<string>();
  for (const issue of openLiabilities) knownCodes.add(normRider(issue.riderCode));
  for (const o of obligations) {
    if (o.reason === 'معدات') knownCodes.add(normRider(o.riderCode));
  }
  // Also include settled-with-request? Unknown riders fail closed even if only in wallet.
  for (const o of obligations) knownCodes.add(normRider(o.riderCode));

  for (const [riderId, row] of byRider) {
    const matched = matchRiderIdExactly(riderId, knownCodes);
    if (!matched) {
      exceptions.push({
        riderId,
        code: 'UNKNOWN_RIDER_ID',
        message: 'Rider ID غير مطابق لأي مندوب/طلب معدات — FAIL CLOSED',
        requestedFromFileMilli: row.requestedFromFileMilli,
        actualWalletDeductionMilli: row.actualWalletDeductionMilli,
      });
      continue;
    }

    const request = pickOpenEquipmentRequestForRider(
      obligations,
      matched,
      deps.walletCycle.cycleId
    );
    if (!request) {
      // Zero applied with no open request → informational skip (not an exception for noise)
      if (row.actualWalletDeductionMilli === 0 && row.requestedFromFileMilli === 0) {
        continue;
      }
      exceptions.push({
        riderId: matched,
        code: 'NO_OPEN_EQUIPMENT_REQUEST',
        message: 'لا يوجد طلب معدات مفتوح للمطابقة — FAIL CLOSED',
        requestedFromFileMilli: row.requestedFromFileMilli,
        actualWalletDeductionMilli: row.actualWalletDeductionMilli,
      });
      continue;
    }

    const talabatReference = `${batchId}:${request.deductionId}`;
    const result = await reconcileActualPayrollDeduction(
      {
        deductionId: request.deductionId,
        actualDeductedMilli: row.actualWalletDeductionMilli,
        actualDeductionDate: deps.actualDeductionDate,
        talabatReference,
        evidenceNote: `source=${TALABAT_WALLET_SOURCE_COLUMNS.actual}; file3Pl=${row.requestedFromFileMilli}`,
        operatorConfirmation: deps.operatorConfirmation,
        actorCode: deps.actor.code,
        actorName: deps.actor.name,
      },
      deps
    );

    if (!result.ok) {
      exceptions.push({
        riderId: matched,
        code: result.code,
        message: result.error,
        requestedFromFileMilli: row.requestedFromFileMilli,
        actualWalletDeductionMilli: row.actualWalletDeductionMilli,
      });
      continue;
    }

    applied.push({
      riderId: matched,
      deductionId: request.deductionId,
      equipmentIssueId: request.equipmentIssueId || '',
      requestedFromFileMilli: row.requestedFromFileMilli,
      requestLedgerMilli: result.obligation.originalAmount,
      actualWalletDeductionMilli: result.record.actualDeductedMilli,
      previousOutstandingMilli: result.record.previousOutstandingMilli,
      newOutstandingMilli: result.record.newOutstandingMilli,
      duplicate: result.duplicate,
      status: result.obligation.status,
    });
  }

  // Refresh open liabilities after Actuals
  const refreshed = await deps.listOpenLiabilities();
  const stillOpen = refreshed.filter(
    (i) => i.status === 'open' && i.outstandingMilli > 0
  );

  let nextCyclePrep: NextCyclePrepLine[] = [];
  if (deps.nextCycle) {
    nextCyclePrep = await prepareNextCycleEquipmentRequests({
      openIssues: stillOpen,
      nextCycle: deps.nextCycle,
      allCycles: deps.allCycles,
      store: deps.obligationStore,
      actor: deps.actor,
    });
  }

  // Mark settled riders for report
  for (const line of applied) {
    if (line.newOutstandingMilli <= 0) {
      nextCyclePrep.push({
        riderCode: line.riderId,
        equipmentIssueId: line.equipmentIssueId,
        outstandingMilli: 0,
        nextExpectedMilli: 0,
        deductionId: null,
        outcome: 'settled',
        reason: 'outstanding_zero',
      });
    }
  }

  if (deps.persistBatchId && exceptions.length === 0) {
    await deps.persistBatchId(batchId);
  } else if (deps.persistBatchId && applied.length > 0) {
    // Persist even with partial exceptions so successful Actuals are not double-applied
    // (per-row idempotency still protects). Batch flag helps ops detect re-upload.
    await deps.persistBatchId(batchId);
  }

  return {
    ok: exceptions.length === 0 && parsed.errors.length === 0,
    batchId,
    duplicateBatch: false,
    sourceColumns: TALABAT_WALLET_SOURCE_COLUMNS,
    applied,
    exceptions,
    nextCyclePrep,
    parseErrors: parsed.errors,
    safety,
  };
}

/** Helper for tests: build a wallet row object with source-accurate headers. */
export function talabatWalletExcelRow(params: {
  riderId: string;
  threePlInternalDeductionsEgp: number;
  applaiedDeductionOnWalletEgp: number;
}): Record<string, unknown> {
  return {
    [TALABAT_WALLET_SOURCE_COLUMNS.riderId]: params.riderId,
    [TALABAT_WALLET_SOURCE_COLUMNS.requested]: params.threePlInternalDeductionsEgp,
    [TALABAT_WALLET_SOURCE_COLUMNS.actual]: params.applaiedDeductionOnWalletEgp,
  };
}

export type { TalabatWalletParsedRow };
