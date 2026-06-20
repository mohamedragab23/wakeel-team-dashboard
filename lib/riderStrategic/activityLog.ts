import { appendToSheet, ensureSheetExists } from '@/lib/googleSheets';
import {
  AUDIT_LOG_HEADERS,
  SHEET_STRATEGIC_AUDIT,
  STRATEGIC_RIDER_HEADERS,
  SHEET_STRATEGIC_RIDERS,
  type RiderStrategicEditableFields,
  type StrategicAuditEntry,
} from './types';

const FIELD_LABELS: Record<keyof RiderStrategicEditableFields, string> = {
  actualJoinDate: 'تاريخ_الانضمام_الفعلي',
  riderType: 'نوع_الطيار',
  dailyTargetHours: 'التارجت_اليومي',
  currentStatus: 'حالة_الطيار',
  supervisorNotes: 'ملاحظات_المشرف',
  lastFollowUpDate: 'تاريخ_آخر_متابعة',
};

export async function logStrategicRiderChanges(
  riderCode: string,
  before: Record<string, string>,
  after: Record<string, string>,
  changedBy: string,
  changedByName: string,
  source: 'manual' | 'bulk' | 'system' = 'manual'
): Promise<void> {
  await ensureSheetExists(SHEET_STRATEGIC_AUDIT, [...AUDIT_LOG_HEADERS]);
  await ensureSheetExists(SHEET_STRATEGIC_RIDERS, [...STRATEGIC_RIDER_HEADERS]);
  const now = new Date().toISOString();
  const rows: string[][] = [];

  for (const key of Object.keys(after) as (keyof RiderStrategicEditableFields)[]) {
    const field = FIELD_LABELS[key] ?? key;
    const oldV = String(before[key] ?? '');
    const newV = String(after[key] ?? '');
    if (oldV !== newV) {
      rows.push([riderCode, field, oldV, newV, changedBy, changedByName, now, source]);
    }
  }

  if (rows.length > 0) {
    await appendToSheet(SHEET_STRATEGIC_AUDIT, rows, false);
  }
}

export function parseAuditRows(data: unknown[][]): StrategicAuditEntry[] {
  const entries: StrategicAuditEntry[] = [];
  const start = data.length > 0 && isAuditHeader(data[0]) ? 1 : 0;

  for (let i = start; i < data.length; i++) {
    const row = data[i];
    if (!row?.length) continue;
    entries.push({
      riderCode: String(row[0] ?? '').trim(),
      field: String(row[1] ?? ''),
      oldValue: String(row[2] ?? ''),
      newValue: String(row[3] ?? ''),
      changedBy: String(row[4] ?? ''),
      changedByName: String(row[5] ?? ''),
      timestamp: String(row[6] ?? ''),
      source: String(row[7] ?? ''),
    });
  }

  return entries.sort((a, b) => b.timestamp.localeCompare(a.timestamp));
}

function isAuditHeader(row: unknown[]): boolean {
  const a = String(row[0] ?? '').trim();
  return a === 'كود_الطيار' || a.toLowerCase() === 'ridercode';
}

export async function ensureAuditSheet(): Promise<void> {
  const { ensureSheetExists } = await import('@/lib/googleSheets');
  await ensureSheetExists(SHEET_STRATEGIC_AUDIT, [...AUDIT_LOG_HEADERS]);
}
