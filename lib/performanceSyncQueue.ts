import { getSheetData, ensureSheetExists, appendToSheet, updateSheetRow } from '@/lib/googleSheets';

export const SYNC_QUEUE_SHEET = 'مزامنة_الأداء';

export type SyncQueueStatus = 'pending' | 'approved' | 'done' | 'skipped' | 'failed';

export type SyncQueueEntry = {
  rowIndex1Based: number;
  targetDate: string;
  status: SyncQueueStatus;
  reason: string;
  wakeelRows: number;
  zeroRatio: number;
  createdAt: string;
  updatedAt: string;
};

const HEADERS = [
  'التاريخ',
  'الحالة',
  'السبب',
  'عدد_المناديب',
  'نسبة_الصفر',
  'أُنشئ',
  'آخر_تحديث',
];

export async function ensureSyncQueueSheet(): Promise<void> {
  await ensureSheetExists(SYNC_QUEUE_SHEET, HEADERS);
}

function parseEntry(row: unknown[], rowIndex1Based: number): SyncQueueEntry | null {
  const targetDate = String(row[0] ?? '').trim().slice(0, 10);
  if (!targetDate) return null;
  return {
    rowIndex1Based,
    targetDate,
    status: (String(row[1] ?? 'pending').trim() as SyncQueueStatus) || 'pending',
    reason: String(row[2] ?? '').trim(),
    wakeelRows: parseInt(String(row[3] ?? '0'), 10) || 0,
    zeroRatio: parseFloat(String(row[4] ?? '0')) || 0,
    createdAt: String(row[5] ?? '').trim(),
    updatedAt: String(row[6] ?? '').trim(),
  };
}

export async function listSyncQueueEntries(): Promise<SyncQueueEntry[]> {
  await ensureSyncQueueSheet();
  const data = await getSheetData(SYNC_QUEUE_SHEET, false);
  const out: SyncQueueEntry[] = [];
  for (let i = 1; i < data.length; i++) {
    const e = parseEntry(data[i] || [], i + 1);
    if (e) out.push(e);
  }
  return out;
}

export async function findSyncEntryForDate(targetDate: string): Promise<SyncQueueEntry | null> {
  const all = await listSyncQueueEntries();
  const matches = all.filter((e) => e.targetDate === targetDate);
  if (!matches.length) return null;
  return matches[matches.length - 1];
}

export async function upsertSyncQueueEntry(params: {
  targetDate: string;
  status: SyncQueueStatus;
  reason: string;
  wakeelRows: number;
  zeroRatio: number;
}): Promise<SyncQueueEntry> {
  await ensureSyncQueueSheet();
  const now = new Date().toISOString();
  const existing = await findSyncEntryForDate(params.targetDate);

  const row = [
    params.targetDate,
    params.status,
    params.reason,
    params.wakeelRows,
    params.zeroRatio,
    existing?.createdAt || now,
    now,
  ];

  if (existing) {
    await updateSheetRow(SYNC_QUEUE_SHEET, existing.rowIndex1Based, row);
    return { ...existing, ...params, updatedAt: now };
  }

  const data = await getSheetData(SYNC_QUEUE_SHEET, false);
  const nextRow = (data?.length || 1) + 1;
  await appendToSheet(SYNC_QUEUE_SHEET, [row], false);
  return {
    rowIndex1Based: nextRow,
    targetDate: params.targetDate,
    status: params.status,
    reason: params.reason,
    wakeelRows: params.wakeelRows,
    zeroRatio: params.zeroRatio,
    createdAt: now,
    updatedAt: now,
  };
}

export async function listPendingSyncEntries(): Promise<SyncQueueEntry[]> {
  const all = await listSyncQueueEntries();
  return all.filter((e) => e.status === 'pending');
}
