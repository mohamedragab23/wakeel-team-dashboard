import { formatIsoDateInTimeZone, addDays } from '@/lib/timezone';
import { fetchRiderPerformanceCrosstab } from '@/lib/tableauClient';
import {
  parseTableauPerformanceExport,
  assessTableauPerformanceQuality,
  mergeCodDebt,
  toDailySheetRows,
  type TableauPerformanceRow,
} from '@/lib/tableauPerformanceTransform';
import { loadCodDebtByRiderForDate } from '@/lib/codDebtLookup';
import { replacePerformanceDay, performanceDateExists } from '@/lib/performanceDaySheet';
import { upsertSyncQueueEntry, listPendingSyncEntries, type SyncQueueEntry } from '@/lib/performanceSyncQueue';

export type SyncRunResult = {
  targetDate: string;
  status: 'done' | 'pending' | 'skipped' | 'failed';
  message: string;
  wakeelRows: number;
  zeroRatio: number;
  written?: number;
  deleted?: number;
  hadCod: boolean;
};

export function getYesterdayCairoIso(now = new Date()): string {
  return formatIsoDateInTimeZone(addDays(now, -1), 'Africa/Cairo');
}

export async function pullAndProcessTableauForDate(targetDate: string): Promise<{
  rows: TableauPerformanceRow[];
  quality: ReturnType<typeof assessTableauPerformanceQuality>;
  format: 'excel' | 'csv';
}> {
  let buffer: ArrayBuffer;
  let format: 'excel' | 'csv' = 'excel';
  try {
    const res = await fetchRiderPerformanceCrosstab(targetDate, { format: 'excel' });
    buffer = res.buffer;
    format = res.format;
  } catch (e) {
    const res = await fetchRiderPerformanceCrosstab(targetDate, { format: 'csv' });
    buffer = res.buffer;
    format = res.format;
  }

  const { rows: parsed, warnings } = parseTableauPerformanceExport(buffer, format);
  if (warnings.length) console.warn('[performanceSync]', warnings.join('; '));

  const debtMap = await loadCodDebtByRiderForDate(targetDate);
  const merged = mergeCodDebt(parsed, debtMap);
  const quality = assessTableauPerformanceQuality(merged);

  return { rows: merged, quality, format };
}

export async function applyPerformanceToSheet(
  targetDate: string,
  rows: TableauPerformanceRow[]
): Promise<{ deleted: number; written: number }> {
  const sheetRows = toDailySheetRows(targetDate, rows);
  const result = await replacePerformanceDay(targetDate, sheetRows);
  try {
    const { syncTerminationDebtsFromPerformanceRows } = await import('@/lib/terminationDebtSync');
    await syncTerminationDebtsFromPerformanceRows(sheetRows);
  } catch (e) {
    console.warn('[performanceSync] termination debt sync failed', e);
  }
  return result;
}

/**
 * Sync one calendar day from Tableau → optional pending → sheet.
 */
export async function runPerformanceSyncForDate(
  targetDate: string,
  options?: { forceApply?: boolean; skipIfDone?: boolean }
): Promise<SyncRunResult> {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(targetDate)) {
    return { targetDate, status: 'failed', message: 'تاريخ غير صالح', wakeelRows: 0, zeroRatio: 0, hadCod: false };
  }

  const skipIfDone = options?.skipIfDone !== false;
  if (skipIfDone) {
    const exists = await performanceDateExists(targetDate);
    const pending = (await listPendingSyncEntries()).some((p) => p.targetDate === targetDate);
    if (exists && !pending && !options?.forceApply) {
      return {
        targetDate,
        status: 'skipped',
        message: 'الأداء موجود مسبقاً لهذا اليوم',
        wakeelRows: 0,
        zeroRatio: 0,
        hadCod: false,
      };
    }
  }

  try {
    const { rows, quality } = await pullAndProcessTableauForDate(targetDate);
    const debtMap = await loadCodDebtByRiderForDate(targetDate);
    const hadCod = debtMap.size > 0;

    const autoApplyGood =
      process.env.PERFORMANCE_SYNC_AUTO_APPLY_GOOD !== 'false' && !quality.isSuspiciousEmpty;

    if (quality.isSuspiciousEmpty && !options?.forceApply) {
      await upsertSyncQueueEntry({
        targetDate,
        status: 'pending',
        reason: quality.message,
        wakeelRows: quality.wakeelRows,
        zeroRatio: quality.zeroRatio,
      });
      return {
        targetDate,
        status: 'pending',
        message: quality.message,
        wakeelRows: quality.wakeelRows,
        zeroRatio: quality.zeroRatio,
        hadCod,
      };
    }

    if (!autoApplyGood && !options?.forceApply) {
      await upsertSyncQueueEntry({
        targetDate,
        status: 'pending',
        reason: 'بانتظار موافقة الأدمن',
        wakeelRows: quality.wakeelRows,
        zeroRatio: quality.zeroRatio,
      });
      return {
        targetDate,
        status: 'pending',
        message: 'بانتظار موافقة الأدمن',
        wakeelRows: quality.wakeelRows,
        zeroRatio: quality.zeroRatio,
        hadCod,
      };
    }

    const { deleted, written } = await applyPerformanceToSheet(targetDate, rows);
    await upsertSyncQueueEntry({
      targetDate,
      status: 'done',
      reason: `تم التحديث (${written} صف)`,
      wakeelRows: quality.wakeelRows,
      zeroRatio: quality.zeroRatio,
    });

    return {
      targetDate,
      status: 'done',
      message: `تم تحديث أداء ${targetDate}`,
      wakeelRows: quality.wakeelRows,
      zeroRatio: quality.zeroRatio,
      written,
      deleted,
      hadCod,
    };
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error);
    await upsertSyncQueueEntry({
      targetDate,
      status: 'failed',
      reason: msg.slice(0, 500),
      wakeelRows: 0,
      zeroRatio: 0,
    });
    return { targetDate, status: 'failed', message: msg, wakeelRows: 0, zeroRatio: 0, hadCod: false };
  }
}

export async function approvePendingSync(targetDate: string): Promise<SyncRunResult> {
  return runPerformanceSyncForDate(targetDate, { forceApply: true, skipIfDone: false });
}

export async function runDailyPerformanceSync(): Promise<{
  yesterday: SyncRunResult;
  backlog: SyncRunResult[];
}> {
  const yesterday = getYesterdayCairoIso();
  const primary = await runPerformanceSyncForDate(yesterday);

  const backlog: SyncRunResult[] = [];
  const pending = await listPendingSyncEntries();
  for (const p of pending) {
    if (p.targetDate === yesterday && primary.status === 'pending') continue;
    const res = await runPerformanceSyncForDate(p.targetDate, { forceApply: false, skipIfDone: false });
    backlog.push(res);
  }

  return { yesterday: primary, backlog };
}

export async function getPendingForDashboard(): Promise<SyncQueueEntry[]> {
  return listPendingSyncEntries();
}
