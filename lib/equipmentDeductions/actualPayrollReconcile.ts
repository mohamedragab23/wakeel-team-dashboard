/**
 * SRS-014 Phase 4D.5.4.16 — Actual Talabat payroll deduction reconciliation.
 *
 * REQUEST ≠ ACTUAL.
 * Only actualDeductedMilli advances amountDeductedMilli / outstanding.
 * Never mutates wallet, financial ledger, or Financial Apply.
 * Never uses settlementPaidMilli for payroll progress.
 */

import { appendAuditLog } from '@/lib/auditLog';
import {
  projectAfterAllocation,
  type DeductionObligation,
} from '@/lib/equipmentDeductions/obligations';
import {
  findPersistedByDeductionId,
  updatePersistedObligationEconomics,
  type ObligationLedgerStore,
} from '@/lib/equipmentDeductions/requestPersistence';
import type { EquipmentLiabilityIssue } from '@/lib/equipmentLiability/store';
import { isSrs014FinancialApplyEnabled } from '@/lib/srs014Flags';

export type ActualPayrollReconcileInput = {
  deductionId: string;
  actualDeductedMilli: number;
  actualDeductionDate: string;
  /** Required for idempotency — Talabat payroll / batch reference. */
  talabatReference: string;
  evidenceNote?: string;
  operatorConfirmation: boolean;
  actorCode: string;
  actorName: string;
};

export type ActualPayrollReconcileDeps = {
  obligationStore: ObligationLedgerStore;
  getLiabilityById: (
    equipmentIssueId: string
  ) => Promise<EquipmentLiabilityIssue | null>;
  updateLiabilityBalance: (
    equipmentIssueId: string,
    deductionMilli: number,
    actor: { code: string; name: string },
    opts?: { incrementInstallment?: boolean }
  ) => Promise<{ ok: true; issue: EquipmentLiabilityIssue } | { ok: false; error: string }>;
  /** Return existing reconcile row by idempotency key (if any). */
  findByIdempotencyKey?: (
    key: string
  ) => Promise<{ idempotencyKey: string; actualDeductedMilli: number } | null>;
  /** Persist reconcile audit row (Sheets or memory). */
  persistReconcileRecord?: (record: ActualReconcileRecord) => Promise<void>;
  appendAudit?: typeof appendAuditLog;
};

export type ActualReconcileRecord = {
  reconcileId: string;
  idempotencyKey: string;
  deductionId: string;
  equipmentIssueId: string;
  riderCode: string;
  cycleId: string;
  requestedAmountMilli: number;
  actualDeductedMilli: number;
  previousOutstandingMilli: number;
  newOutstandingMilli: number;
  amountDeductedDelta: number;
  talabatReference: string;
  actualDeductionDate: string;
  actorCode: string;
  actorName: string;
  createdAt: string;
  notes: string;
  status: 'APPLIED';
};

export type ActualPayrollReconcileResult =
  | {
      ok: true;
      created: boolean;
      duplicate: boolean;
      obligation: DeductionObligation;
      issue: EquipmentLiabilityIssue;
      record: ActualReconcileRecord;
      financialSideEffects: {
        walletMutated: false;
        ledgerMoneyMutated: false;
        financialApply: false;
        requestOriginalMutated: false;
        settlementPaidMutated: false;
      };
    }
  | { ok: false; code: string; error: string };

export function actualPayrollIdempotencyKey(params: {
  talabatReference: string;
  deductionId: string;
}): string {
  return `actual_payroll:${String(params.talabatReference || '').trim()}:${String(params.deductionId || '').trim()}`;
}

function truncNonNeg(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.trunc(n));
}

/**
 * Apply a confirmed Talabat Actual deduction against an existing REQUEST.
 * Caps actual to obligation remaining AND liability outstanding.
 * Blocks over-actual vs outstanding.
 */
export async function reconcileActualPayrollDeduction(
  input: ActualPayrollReconcileInput,
  deps: ActualPayrollReconcileDeps
): Promise<ActualPayrollReconcileResult> {
  if (isSrs014FinancialApplyEnabled()) {
    // Even if FA is somehow ON, this path must remain FA-independent.
  }

  if (input.operatorConfirmation !== true) {
    return {
      ok: false,
      code: 'CONFIRMATION_REQUIRED',
      error: 'يلزم تأكيد المشغّل قبل تسجيل الخصم الفعلي',
    };
  }

  const deductionId = String(input.deductionId || '').trim();
  const talabatReference = String(input.talabatReference || '').trim();
  if (!deductionId) {
    return { ok: false, code: 'DEDUCTION_ID_REQUIRED', error: 'deductionId مطلوب' };
  }
  if (!talabatReference) {
    return {
      ok: false,
      code: 'TALABAT_REFERENCE_REQUIRED',
      error: 'مرجع Talabat مطلوب لمنع التكرار',
    };
  }

  const actualRaw = Number(input.actualDeductedMilli);
  if (!Number.isFinite(actualRaw) || actualRaw < 0) {
    return {
      ok: false,
      code: 'INVALID_ACTUAL',
      error: 'actualDeductedMilli يجب أن يكون ≥ 0',
    };
  }
  const actual = truncNonNeg(actualRaw);

  const idempotencyKey = actualPayrollIdempotencyKey({
    talabatReference,
    deductionId,
  });

  if (deps.findByIdempotencyKey) {
    const existing = await deps.findByIdempotencyKey(idempotencyKey);
    if (existing) {
      const found = await findPersistedByDeductionId(deps.obligationStore, deductionId);
      if (!found?.obligation.equipmentIssueId) {
        return {
          ok: false,
          code: 'DUPLICATE_ACTUAL_ORPHAN',
          error: 'تكرار مرجع فعلي لكن الطلب/العهدة غير موجودين',
        };
      }
      const issue = await deps.getLiabilityById(found.obligation.equipmentIssueId);
      if (!issue) {
        return { ok: false, code: 'LIABILITY_NOT_FOUND', error: 'العهدة غير موجودة' };
      }
      return {
        ok: true,
        created: false,
        duplicate: true,
        obligation: found.obligation,
        issue,
        record: {
          reconcileId: `dup_${idempotencyKey}`,
          idempotencyKey,
          deductionId,
          equipmentIssueId: found.obligation.equipmentIssueId,
          riderCode: found.obligation.riderCode,
          cycleId: found.obligation.currentCycleId,
          requestedAmountMilli: found.obligation.originalAmount,
          actualDeductedMilli: existing.actualDeductedMilli,
          previousOutstandingMilli: issue.outstandingMilli,
          newOutstandingMilli: issue.outstandingMilli,
          amountDeductedDelta: 0,
          talabatReference,
          actualDeductionDate: input.actualDeductionDate,
          actorCode: input.actorCode,
          actorName: input.actorName,
          createdAt: new Date().toISOString(),
          notes: 'idempotent_hit',
          status: 'APPLIED',
        },
        financialSideEffects: {
          walletMutated: false,
          ledgerMoneyMutated: false,
          financialApply: false,
          requestOriginalMutated: false,
          settlementPaidMutated: false,
        },
      };
    }
  }

  const found = await findPersistedByDeductionId(deps.obligationStore, deductionId);
  if (!found) {
    return { ok: false, code: 'REQUEST_NOT_FOUND', error: 'طلب الاستقطاع غير موجود' };
  }
  const obligation = found.obligation;
  if (!obligation.equipmentIssueId) {
    return {
      ok: false,
      code: 'NOT_EQUIPMENT_REQUEST',
      error: 'الطلب ليس طلب معدات مرتبط بعهدة',
    };
  }

  // Actual 0 = explicit no-deduction result; keep outstanding, mark pending→not deducted economics unchanged
  if (actual === 0) {
    const issue = await deps.getLiabilityById(obligation.equipmentIssueId);
    if (!issue) {
      return { ok: false, code: 'LIABILITY_NOT_FOUND', error: 'العهدة غير موجودة' };
    }
    const record: ActualReconcileRecord = {
      reconcileId: `ar_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      idempotencyKey,
      deductionId,
      equipmentIssueId: obligation.equipmentIssueId,
      riderCode: obligation.riderCode,
      cycleId: obligation.currentCycleId,
      requestedAmountMilli: obligation.originalAmount,
      actualDeductedMilli: 0,
      previousOutstandingMilli: issue.outstandingMilli,
      newOutstandingMilli: issue.outstandingMilli,
      amountDeductedDelta: 0,
      talabatReference,
      actualDeductionDate: input.actualDeductionDate,
      actorCode: input.actorCode,
      actorName: input.actorName,
      createdAt: new Date().toISOString(),
      notes: String(input.evidenceNote || 'actual_zero'),
      status: 'APPLIED',
    };
    if (deps.persistReconcileRecord) await deps.persistReconcileRecord(record);
    const appendAudit = deps.appendAudit ?? appendAuditLog;
    await appendAudit({
      domain: 'equipment',
      action: 'reconcile_equipment_actual_deduction',
      entityType: 'equipment_issue',
      entityCode: issue.equipmentIssueId,
      actorCode: input.actorCode,
      actorName: input.actorName,
      after: record,
    });
    return {
      ok: true,
      created: true,
      duplicate: false,
      obligation,
      issue,
      record,
      financialSideEffects: {
        walletMutated: false,
        ledgerMoneyMutated: false,
        financialApply: false,
        requestOriginalMutated: false,
        settlementPaidMutated: false,
      },
    };
  }

  const issue = await deps.getLiabilityById(obligation.equipmentIssueId);
  if (!issue) {
    return { ok: false, code: 'LIABILITY_NOT_FOUND', error: 'العهدة غير موجودة' };
  }
  if (issue.status !== 'open') {
    return {
      ok: false,
      code: 'LIABILITY_NOT_OPEN',
      error: 'العهدة ليست مفتوحة للخصم',
    };
  }
  if (issue.outstandingMilli <= 0) {
    return {
      ok: false,
      code: 'NO_OUTSTANDING',
      error: 'لا يوجد متبقي على العهدة',
    };
  }

  if (actual > issue.outstandingMilli) {
    return {
      ok: false,
      code: 'OVER_ACTUAL_DEDUCTION',
      error: 'الخصم الفعلي يتجاوز المتبقي على العهدة',
    };
  }
  if (actual > obligation.remainingAmount) {
    return {
      ok: false,
      code: 'OVER_REQUEST_REMAINING',
      error: 'الخصم الفعلي يتجاوز المتبقي على الطلب',
    };
  }

  const projected = projectAfterAllocation(obligation, actual);
  const previousOutstanding = issue.outstandingMilli;
  const settlementBefore = issue.settlementPaidMilli;

  const balance = await deps.updateLiabilityBalance(
    issue.equipmentIssueId,
    projected.allocatedAmount,
    { code: input.actorCode, name: input.actorName },
    { incrementInstallment: projected.installmentCompleted }
  );
  if (!balance.ok) {
    return { ok: false, code: 'BALANCE_UPDATE_FAILED', error: balance.error };
  }

  if (balance.issue.settlementPaidMilli !== settlementBefore) {
    return {
      ok: false,
      code: 'SETTLEMENT_MUTATED',
      error: 'خطأ: لا يجوز تغيير settlementPaidMilli عبر خصم الرواتب',
    };
  }

  await updatePersistedObligationEconomics(
    deps.obligationStore,
    projected.obligation
  );

  const record: ActualReconcileRecord = {
    reconcileId: `ar_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    idempotencyKey,
    deductionId,
    equipmentIssueId: issue.equipmentIssueId,
    riderCode: obligation.riderCode,
    cycleId: obligation.currentCycleId,
    requestedAmountMilli: obligation.originalAmount,
    actualDeductedMilli: projected.allocatedAmount,
    previousOutstandingMilli: previousOutstanding,
    newOutstandingMilli: balance.issue.outstandingMilli,
    amountDeductedDelta: projected.allocatedAmount,
    talabatReference,
    actualDeductionDate: input.actualDeductionDate,
    actorCode: input.actorCode,
    actorName: input.actorName,
    createdAt: new Date().toISOString(),
    notes: String(input.evidenceNote || ''),
    status: 'APPLIED',
  };

  if (deps.persistReconcileRecord) await deps.persistReconcileRecord(record);

  const appendAudit = deps.appendAudit ?? appendAuditLog;
  await appendAudit({
    domain: 'equipment',
    action: 'reconcile_equipment_actual_deduction',
    entityType: 'equipment_issue',
    entityCode: issue.equipmentIssueId,
    actorCode: input.actorCode,
    actorName: input.actorName,
    before: {
      outstandingMilli: previousOutstanding,
      amountDeductedMilli: issue.amountDeductedMilli,
      requestedAmountMilli: obligation.originalAmount,
    },
    after: record,
  });

  return {
    ok: true,
    created: true,
    duplicate: false,
    obligation: projected.obligation,
    issue: balance.issue,
    record,
    financialSideEffects: {
      walletMutated: false,
      ledgerMoneyMutated: false,
      financialApply: false,
      requestOriginalMutated: false,
      settlementPaidMutated: false,
    },
  };
}
