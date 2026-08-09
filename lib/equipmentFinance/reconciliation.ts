import { appendToSheet, ensureSheetExists, getSheetData } from '@/lib/googleSheets';
import type { EquipmentAutoDeductionRunResult } from '@/lib/equipmentDeductions/engine';
import { listOpenIssues } from '@/lib/equipmentLiability/store';
import { getPayoutCycleById } from '@/lib/payoutCycles/store';

export const SHEET_DEDUCTION_CYCLE_RECONCILIATION = 'مطابقة_دورات_الاستقطاع';

export const RECONCILIATION_HEADERS = [
  'snapshotId',
  'cycleId',
  'asOfDate',
  'openIssuesCount',
  'processed',
  'deducted',
  'skipped',
  'errorCount',
  'outstandingMilliTotal',
  'createdAt',
] as const;

let ensuredOnce = false;

async function ensureReconciliationSheet(): Promise<void> {
  if (ensuredOnce) return;
  await ensureSheetExists(SHEET_DEDUCTION_CYCLE_RECONCILIATION, [...RECONCILIATION_HEADERS]);
  ensuredOnce = true;
}

function newSnapshotId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID();
  return `rec_${Date.now()}_${Math.random().toString(36).slice(2)}`;
}

export async function writeCycleReconciliationSnapshot(
  cycleId: string,
  run: EquipmentAutoDeductionRunResult
): Promise<void> {
  await ensureReconciliationSheet();
  const open = await listOpenIssues();
  const outstandingMilliTotal = open.reduce((s, i) => s + i.outstandingMilli, 0);
  await appendToSheet(SHEET_DEDUCTION_CYCLE_RECONCILIATION, [
    [
      newSnapshotId(),
      cycleId,
      run.asOfDate,
      open.length,
      run.processed,
      run.deducted,
      run.skipped,
      run.errors.length,
      outstandingMilliTotal,
      new Date().toISOString(),
    ],
  ]);
}

export async function listReconciliationSnapshots(cycleId?: string) {
  await ensureReconciliationSheet();
  const data = await getSheetData(SHEET_DEDUCTION_CYCLE_RECONCILIATION, false);
  const out: Record<string, string | number>[] = [];
  for (let i = 1; i < data.length; i++) {
    const row = data[i];
    const id = String(row[0] ?? '').trim();
    if (!id) continue;
    const snap = {
      snapshotId: id,
      cycleId: String(row[1] ?? '').trim(),
      asOfDate: String(row[2] ?? '').trim(),
      openIssuesCount: Number(row[3]) || 0,
      processed: Number(row[4]) || 0,
      deducted: Number(row[5]) || 0,
      skipped: Number(row[6]) || 0,
      errorCount: Number(row[7]) || 0,
      outstandingMilliTotal: Number(row[8]) || 0,
      createdAt: String(row[9] ?? '').trim(),
    };
    if (cycleId && snap.cycleId !== cycleId) continue;
    out.push(snap);
  }
  return out.reverse();
}

export async function getEquipmentFinanceSummary() {
  const open = await listOpenIssues();
  const outstandingMilliTotal = open.reduce((s, i) => s + i.outstandingMilli, 0);
  const deductedMilliTotal = open.reduce((s, i) => s + i.amountDeductedMilli, 0);
  const snapshots = await listReconciliationSnapshots();
  return {
    openIssuesCount: open.length,
    outstandingMilliTotal,
    deductedMilliTotal,
    recentSnapshots: snapshots.slice(0, 20),
    sampleOpen: open.slice(0, 50).map((i) => ({
      equipmentIssueId: i.equipmentIssueId,
      riderCode: i.riderCode,
      riderNameSnapshot: i.riderNameSnapshot,
      outstandingMilli: i.outstandingMilli,
      installmentsCompleted: i.installmentsCompleted,
      supervisorCodeSnapshot: i.supervisorCodeSnapshot,
      cycleHint: i.activationDate,
    })),
  };
}

export async function describeCycle(cycleId: string) {
  return getPayoutCycleById(cycleId);
}
