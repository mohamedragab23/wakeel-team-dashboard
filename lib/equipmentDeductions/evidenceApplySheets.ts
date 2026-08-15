/**
 * Sheets-backed EvidenceApplyStore (shared by Manager Compare + Financial Apply routes).
 * Creates tabs lazily — does not mutate wallet / ledger_native.
 */

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
import type { ManagerCompareCycleScope } from '@/lib/equipmentDeductions/managerCompare';

function cell(row: unknown[], i: number): string {
  return String(row[i] ?? '').trim();
}

function cellNum(row: unknown[], i: number): number {
  const n = Number(String(row[i] ?? '').replace(/,/g, ''));
  return Number.isFinite(n) ? Math.trunc(n) : 0;
}

export async function createSheetsEvidenceApplyStore(): Promise<EvidenceApplyStore> {
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
