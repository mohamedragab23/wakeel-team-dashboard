/**
 * Apply ACTUAL payroll deductions from «الاستقطاعات_الفعلية» to liability balances.
 * Idempotent per rider+cycle+cumulative-actual fingerprint.
 */
import { createHash } from 'node:crypto';
import {
  appendToSheet,
  ensureHeaderRow,
  ensureSheetExists,
  getSheetDataOrThrow,
} from '@/lib/googleSheets';
import { appendAuditLog } from '@/lib/auditLog';
import {
  aggregateActualPayrollByRiderCycle,
  cycleKeyFromParts,
} from '@/lib/equipmentDeductions/carryForward';
import { normalizeRiderCodeKey } from '@/lib/equipmentDeductions/equipmentFinancialModel';
import { SHEET_DEDUCTIONS_ACTUAL } from '@/lib/equipmentSheetConstants';
import { listIssues, updateBalance } from '@/lib/equipmentLiability/store';

export const SHEET_EQUIPMENT_ACTUAL_APPLY_LOG = 'سجل_تطبيق_الاستقطاعات_الفعلية';

export const EQUIPMENT_ACTUAL_APPLY_LOG_HEADERS = [
  'applyKey',
  'riderCode',
  'cycleKey',
  'targetActualMilli',
  'appliedDeltaMilli',
  'appliedAt',
  'actorCode',
  'equipmentIssueId',
] as const;

function cell(row: unknown[], i: number): string {
  return String(row[i] ?? '').trim();
}

async function ensureApplyLogSheet(): Promise<void> {
  await ensureSheetExists(SHEET_EQUIPMENT_ACTUAL_APPLY_LOG, [
    ...EQUIPMENT_ACTUAL_APPLY_LOG_HEADERS,
  ]);
  await ensureHeaderRow(SHEET_EQUIPMENT_ACTUAL_APPLY_LOG, [
    ...EQUIPMENT_ACTUAL_APPLY_LOG_HEADERS,
  ]);
}

function applyKeyForRiderCycleActual(params: {
  cycleKey: string;
  riderCode: string;
  targetActualMilli: number;
}): string {
  const raw = `${params.cycleKey}|${params.riderCode}|${params.targetActualMilli}`;
  return createHash('sha256').update(raw).digest('hex').slice(0, 32);
}

async function loadApplyLogKeys(): Promise<Set<string>> {
  await ensureApplyLogSheet();
  const data = await getSheetDataOrThrow(SHEET_EQUIPMENT_ACTUAL_APPLY_LOG, false);
  const keys = new Set<string>();
  for (let i = 1; i < data.length; i++) {
    const k = cell(data[i] || [], 0);
    if (k) keys.add(k);
  }
  return keys;
}

export type ApplyActualPayrollResult = {
  processed: number;
  applied: number;
  skipped: number;
  errors: string[];
  details: Array<{
    riderCode: string;
    targetActualMilli: number;
    appliedDeltaMilli: number;
    result: 'applied' | 'skipped' | 'error';
    reason?: string;
  }>;
};

export async function applyActualPayrollFromLegacySheet(params: {
  cycleLabel: string;
  monthLabel: string;
  year: number;
  actor: { code: string; name: string };
}): Promise<ApplyActualPayrollResult> {
  const result: ApplyActualPayrollResult = {
    processed: 0,
    applied: 0,
    skipped: 0,
    errors: [],
    details: [],
  };

  const cycleKey = cycleKeyFromParts(params.cycleLabel, params.monthLabel, params.year);
  const actualData = await getSheetDataOrThrow(SHEET_DEDUCTIONS_ACTUAL, false);
  const byRider = aggregateActualPayrollByRiderCycle(
    actualData,
    params.cycleLabel,
    params.monthLabel,
    params.year
  );
  const applyKeys = await loadApplyLogKeys();
  const issues = await listIssues({});

  for (const [riderCode, targetActualMilli] of byRider) {
    if (targetActualMilli <= 0) continue;
    result.processed += 1;

    const applyKey = applyKeyForRiderCycleActual({
      cycleKey,
      riderCode,
      targetActualMilli,
    });

    if (applyKeys.has(applyKey)) {
      result.skipped += 1;
      result.details.push({
        riderCode,
        targetActualMilli,
        appliedDeltaMilli: 0,
        result: 'skipped',
        reason: 'already_applied',
      });
      continue;
    }

    const issue =
      issues.find(
        (x) =>
          normalizeRiderCodeKey(x.riderCode) === riderCode && x.status === 'open'
      ) || issues.find((x) => normalizeRiderCodeKey(x.riderCode) === riderCode);

    if (!issue) {
      result.skipped += 1;
      result.details.push({
        riderCode,
        targetActualMilli,
        appliedDeltaMilli: 0,
        result: 'skipped',
        reason: 'missing_liability',
      });
      continue;
    }

    const alreadyDeducted = issue.amountDeductedMilli || 0;
    const delta = targetActualMilli - alreadyDeducted;

    if (delta <= 0) {
      result.skipped += 1;
      result.details.push({
        riderCode,
        targetActualMilli,
        appliedDeltaMilli: 0,
        result: 'skipped',
        reason: delta < 0 ? 'over_deduction_detected' : 'no_delta',
      });
      if (delta < 0) {
        result.errors.push(`${riderCode}: sheet actual ${targetActualMilli} < recorded ${alreadyDeducted}`);
      }
      continue;
    }

    if (delta > issue.outstandingMilli) {
      result.errors.push(
        `${riderCode}: delta ${delta} exceeds outstanding ${issue.outstandingMilli}`
      );
      result.skipped += 1;
      result.details.push({
        riderCode,
        targetActualMilli,
        appliedDeltaMilli: 0,
        result: 'error',
        reason: 'exceeds_outstanding',
      });
      continue;
    }

    const upd = await updateBalance(issue.equipmentIssueId, delta, params.actor, {
      incrementInstallment: delta >= 30000,
    });
    if (!upd.ok) {
      result.errors.push(`${riderCode}: ${upd.error}`);
      result.details.push({
        riderCode,
        targetActualMilli,
        appliedDeltaMilli: 0,
        result: 'error',
        reason: upd.error,
      });
      continue;
    }

    await appendToSheet(
      SHEET_EQUIPMENT_ACTUAL_APPLY_LOG,
      [
        [
          applyKey,
          riderCode,
          cycleKey,
          targetActualMilli,
          delta,
          new Date().toISOString(),
          params.actor.code,
          issue.equipmentIssueId,
        ],
      ],
      false
    );
    applyKeys.add(applyKey);

    result.applied += 1;
    result.details.push({
      riderCode,
      targetActualMilli,
      appliedDeltaMilli: delta,
      result: 'applied',
    });

    void appendAuditLog({
      domain: 'equipment',
      action: 'apply_legacy_actual_payroll',
      entityType: 'equipment_issue',
      entityCode: issue.equipmentIssueId,
      actorCode: params.actor.code,
      actorName: params.actor.name,
      after: { riderCode, deltaMilli: delta, cycleKey, targetActualMilli },
    }).catch(() => undefined);
  }

  return result;
}

export async function previewActualPayrollFromLegacySheet(params: {
  cycleLabel: string;
  monthLabel: string;
  year: number;
}): Promise<
  Array<{
    riderCode: string;
    requestedMilli: number;
    actualMilli: number;
    shortfallMilli: number;
  }>
> {
  const actualData = await getSheetDataOrThrow(SHEET_DEDUCTIONS_ACTUAL, false);
  const requestData = await getSheetDataOrThrow('الاستقطاعات', false);
  const { aggregateRequestedByRiderCycle } = await import('@/lib/equipmentDeductions/carryForward');
  const reqMap = aggregateRequestedByRiderCycle(
    requestData,
    params.cycleLabel,
    params.monthLabel,
    params.year
  );
  const actMap = aggregateActualPayrollByRiderCycle(
    actualData,
    params.cycleLabel,
    params.monthLabel,
    params.year
  );
  const riders = new Set([...reqMap.keys(), ...actMap.keys()]);
  return [...riders].map((riderCode) => {
    const requestedMilli = reqMap.get(riderCode) || 0;
    const actualMilli = actMap.get(riderCode) || 0;
    return {
      riderCode,
      requestedMilli,
      actualMilli,
      shortfallMilli: Math.max(0, requestedMilli - actualMilli),
    };
  });
}
