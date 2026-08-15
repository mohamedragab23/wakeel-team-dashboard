/**
 * SRS-014 Phase 4D.5 — gated HTTP shell for production financial apply.
 *
 * FEATURE_SRS014_FINANCIAL_APPLY_ENABLED defaults OFF → ZERO mutations.
 * Approved production function: runProductionFinancialApplyLine (lib).
 * Not connected to cron / Auto REQUEST / legacy paid-on-cron.
 */

import { NextRequest, NextResponse } from 'next/server';
import { extractBearerToken } from '@/lib/requestAuth';
import { verifyToken } from '@/lib/auth';
import { assertAdminApiAccess } from '@/lib/adminFeatureAccess';
import { adminHasPermission } from '@/lib/adminPermissions';
import {
  isSrs014FinancialApplyEnabled,
  SRS014_FLAG_OFF_BODY,
} from '@/lib/srs014Flags';
import {
  createLiveFinancialApplyPorts,
  financialApplyObservability,
  runProductionFinancialApplyLine,
  validateProductionFinancialApplyPeriodCycleId,
} from '@/lib/equipmentDeductions/financialApplyProduction';
import { authorizeProductionFinancialApply } from '@/lib/equipmentDeductions/financialApplyAuthorization';
import { createSheetsObligationLedgerStore } from '@/lib/equipmentDeductions/requestPersistence';
import {
  appendToSheet,
  ensureHeaderRow,
  ensureSheetExists,
  getSheetDataOrThrow,
  updateSheetRow,
} from '@/lib/googleSheets';
import {
  ALLOCATION_APPLY_HEADERS,
  MANAGER_EVIDENCE_HEADERS,
  SHEET_ALLOCATION_APPLY,
  SHEET_MANAGER_EVIDENCE,
  type EvidenceApplyStore,
  type PersistedApplyRecord,
  type PersistedEvidenceBatch,
} from '@/lib/equipmentDeductions/evidenceApply';
import { checkManagerCompareDualGate } from '@/lib/equipmentDeductions/managerCompare';
import type { ManagerCompareCycleScope } from '@/lib/equipmentDeductions/managerCompare';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

function cell(row: unknown[], i: number): string {
  return String(row[i] ?? '').trim();
}

function cellNum(row: unknown[], i: number): number {
  const n = Number(String(row[i] ?? '').replace(/,/g, ''));
  return Number.isFinite(n) ? Math.trunc(n) : 0;
}

async function createSheetsEvidenceApplyStore(): Promise<EvidenceApplyStore> {
  await ensureSheetExists(SHEET_MANAGER_EVIDENCE, [...MANAGER_EVIDENCE_HEADERS]);
  await ensureHeaderRow(SHEET_MANAGER_EVIDENCE, [...MANAGER_EVIDENCE_HEADERS]);
  await ensureSheetExists(SHEET_ALLOCATION_APPLY, [...ALLOCATION_APPLY_HEADERS]);
  await ensureHeaderRow(SHEET_ALLOCATION_APPLY, [...ALLOCATION_APPLY_HEADERS]);

  return {
    async listEvidence() {
      const data = await getSheetDataOrThrow(SHEET_MANAGER_EVIDENCE, false);
      const out: PersistedEvidenceBatch[] = [];
      for (let i = 1; i < data.length; i++) {
        const row = data[i] || [];
        const evidenceRecordId = cell(row, 0);
        if (!evidenceRecordId) continue;
        const scope: ManagerCompareCycleScope = {
          cycleId: cell(row, 4),
          cycleLabel: cell(row, 5),
          monthLabel: cell(row, 6),
          year: cellNum(row, 7) || 0,
        };
        out.push({
          evidenceRecordId,
          evidenceIdentityKey: cell(row, 1),
          reconcileBatchId: cell(row, 2),
          cycleScopeKey: cell(row, 3),
          cycleScope: scope,
          fileValidationStatus: cell(row, 8) as PersistedEvidenceBatch['fileValidationStatus'],
          completeCycleConfirmed: cell(row, 9).toLowerCase() === 'true',
          completeCycleConfirmedBy: cell(row, 10) || null,
          completeCycleConfirmedAt: cell(row, 11) || null,
          evidenceLifecycleStatus: cell(row, 12) as PersistedEvidenceBatch['evidenceLifecycleStatus'],
          supersedesEvidenceIdentityKey: cell(row, 13) || null,
          supersededByEvidenceIdentityKey: cell(row, 14) || null,
          createdAt: cell(row, 15),
          updatedAt: cell(row, 16),
        });
      }
      return out;
    },
    async appendEvidence(row) {
      await appendToSheet(
        SHEET_MANAGER_EVIDENCE,
        [
          [
            row.evidenceRecordId,
            row.evidenceIdentityKey,
            row.reconcileBatchId,
            row.cycleScopeKey,
            row.cycleScope.cycleId,
            row.cycleScope.cycleLabel,
            row.cycleScope.monthLabel,
            row.cycleScope.year,
            row.fileValidationStatus,
            row.completeCycleConfirmed ? 'true' : 'false',
            row.completeCycleConfirmedBy ?? '',
            row.completeCycleConfirmedAt ?? '',
            row.evidenceLifecycleStatus,
            row.supersedesEvidenceIdentityKey ?? '',
            row.supersededByEvidenceIdentityKey ?? '',
            row.createdAt,
            row.updatedAt,
          ],
        ],
        false
      );
    },
    async updateEvidence(evidenceRecordId, row) {
      const data = await getSheetDataOrThrow(SHEET_MANAGER_EVIDENCE, false);
      for (let i = 1; i < data.length; i++) {
        if (cell(data[i], 0) !== evidenceRecordId) continue;
        await updateSheetRow(SHEET_MANAGER_EVIDENCE, i + 1, [
          row.evidenceRecordId,
          row.evidenceIdentityKey,
          row.reconcileBatchId,
          row.cycleScopeKey,
          row.cycleScope.cycleId,
          row.cycleScope.cycleLabel,
          row.cycleScope.monthLabel,
          row.cycleScope.year,
          row.fileValidationStatus,
          row.completeCycleConfirmed ? 'true' : 'false',
          row.completeCycleConfirmedBy ?? '',
          row.completeCycleConfirmedAt ?? '',
          row.evidenceLifecycleStatus,
          row.supersedesEvidenceIdentityKey ?? '',
          row.supersededByEvidenceIdentityKey ?? '',
          row.createdAt,
          row.updatedAt,
        ]);
        return;
      }
      throw new Error(`evidence not found: ${evidenceRecordId}`);
    },
    async listApplyRecords() {
      const data = await getSheetDataOrThrow(SHEET_ALLOCATION_APPLY, false);
      const out: PersistedApplyRecord[] = [];
      for (let i = 1; i < data.length; i++) {
        const row = data[i] || [];
        const applyRecordId = cell(row, 0);
        if (!applyRecordId) continue;
        out.push({
          applyRecordId,
          evidenceIdentityKey: cell(row, 1),
          reconcileBatchId: cell(row, 2),
          deductionId: cell(row, 3),
          allocatedMilli: cellNum(row, 4),
          reason: cell(row, 5),
          applyStatus: cell(row, 6) as PersistedApplyRecord['applyStatus'],
          liabilityRecoverable: cell(row, 7).toLowerCase() === 'true',
          supersedesApplyRecordId: cell(row, 8) || null,
          supersededByApplyRecordId: cell(row, 9) || null,
          createdAt: cell(row, 10),
          updatedAt: cell(row, 11),
        });
      }
      return out;
    },
    async appendApplyRecord(row) {
      await appendToSheet(
        SHEET_ALLOCATION_APPLY,
        [
          [
            row.applyRecordId,
            row.evidenceIdentityKey,
            row.reconcileBatchId,
            row.deductionId,
            row.allocatedMilli,
            row.reason,
            row.applyStatus,
            row.liabilityRecoverable ? 'true' : 'false',
            row.supersedesApplyRecordId ?? '',
            row.supersededByApplyRecordId ?? '',
            row.createdAt,
            row.updatedAt,
          ],
        ],
        false
      );
    },
    async updateApplyRecord(applyRecordId, row) {
      const data = await getSheetDataOrThrow(SHEET_ALLOCATION_APPLY, false);
      for (let i = 1; i < data.length; i++) {
        if (cell(data[i], 0) !== applyRecordId) continue;
        await updateSheetRow(SHEET_ALLOCATION_APPLY, i + 1, [
          row.applyRecordId,
          row.evidenceIdentityKey,
          row.reconcileBatchId,
          row.deductionId,
          row.allocatedMilli,
          row.reason,
          row.applyStatus,
          row.liabilityRecoverable ? 'true' : 'false',
          row.supersedesApplyRecordId ?? '',
          row.supersededByApplyRecordId ?? '',
          row.createdAt,
          row.updatedAt,
        ]);
        return;
      }
      throw new Error(`apply record not found: ${applyRecordId}`);
    },
  };
}

export async function POST(request: NextRequest) {
  try {
    const token = extractBearerToken(request);
    if (!token) {
      return NextResponse.json({ success: false, error: 'غير مصرح' }, { status: 401 });
    }
    const decoded = verifyToken(token);
    if (!decoded || decoded.role !== 'admin') {
      return NextResponse.json({ success: false, error: 'المديرون فقط' }, { status: 401 });
    }

    const dr = await assertAdminApiAccess(decoded, 'deductions_reconcile');
    if (dr) return dr;
    if (!adminHasPermission(decoded, 'deductions_verify')) {
      return NextResponse.json(
        {
          success: false,
          error:
            'لا تملك صلاحية تطبيق الاستقطاع المالي. أضف: deductions_verify أو استقطاعات_ادمن',
        },
        { status: 403 }
      );
    }

    // Hard gate: default OFF ⇒ zero financial mutations (no Sheets/wallet/ledger touched).
    if (!isSrs014FinancialApplyEnabled()) {
      return NextResponse.json(
        { ...SRS014_FLAG_OFF_BODY, phase: '4D.5', path: 'deductions-financial-apply' },
        { status: 403 }
      );
    }

    const body = (await request.json().catch(() => null)) as {
      evidenceIdentityKey?: string;
      reconcileBatchId?: string;
      deductionId?: string;
      period?: string;
      cycleId?: string;
      /** Non-authoritative — ignored for authorization (4D.5.2). */
      managerConfirmed?: boolean;
    } | null;

    if (!body?.evidenceIdentityKey || !body?.deductionId || !body?.reconcileBatchId) {
      return NextResponse.json(
        { success: false, error: 'evidenceIdentityKey, deductionId, reconcileBatchId required' },
        { status: 400 }
      );
    }

    const meta = validateProductionFinancialApplyPeriodCycleId(
      String(body.period ?? ''),
      String(body.cycleId ?? '')
    );
    if (!meta.ok) {
      return NextResponse.json(
        { success: false, error: meta.reason, reason: meta.reason },
        { status: 400 }
      );
    }

    const dualGate = checkManagerCompareDualGate(decoded);
    const evidenceStore = await createSheetsEvidenceApplyStore();

    // Route-level check (UX). Production entry re-validates independently (4D.5.4).
    const auth = await authorizeProductionFinancialApply({
      evidenceStore,
      evidenceIdentityKey: body.evidenceIdentityKey,
      deductionId: body.deductionId,
      dualGateSatisfied: dualGate.ok,
      requestManagerConfirmed: body.managerConfirmed,
    });

    if (!auth.ok) {
      return NextResponse.json(
        {
          success: false,
          outcome: 'rejected',
          reason: auth.reason,
          evidenceIdentityKey: auth.evidenceIdentityKey,
          deductionId: auth.deductionId,
          fileValidationStatus: auth.fileValidationStatus,
          managerConfirmed: auth.managerConfirmed ?? false,
        },
        { status: 403 }
      );
    }

    const obligationStore = await createSheetsObligationLedgerStore({
      ensureSheetExists,
      ensureHeaderRow,
      getSheetDataOrThrow,
      appendToSheet,
      updateSheetRow,
    });
    const ports = await createLiveFinancialApplyPorts({ evidenceStore, obligationStore });

    // Production entry enforces auth + period/cycle again; body gates are non-authoritative.
    const result = await runProductionFinancialApplyLine({
      evidenceIdentityKey: auth.evidenceIdentityKey,
      reconcileBatchId: body.reconcileBatchId,
      deductionId: auth.deductionId,
      dualGateSatisfied: dualGate.ok,
      actor: {
        code: String((decoded as { code?: string }).code || 'admin'),
        name: String((decoded as { name?: string }).name || 'admin'),
      },
      period: meta.period,
      cycleId: meta.cycleId,
      ports,
    });

    return NextResponse.json({
      success: result.outcome === 'financially_applied' || result.outcome === 'idempotent_already_applied',
      result: {
        outcome: result.outcome,
        reason: result.reason,
        observability: financialApplyObservability(result),
      },
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    console.error('[deductions-financial-apply]', message);
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
