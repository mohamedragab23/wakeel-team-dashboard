/**
 * سجل نشاط تعديلات المرشحين (للأدمن فقط)
 */
import { appendToSheet, getSheetData } from '@/lib/googleSheets';
import type { ActivityLogEntry, Candidate } from './types';
import { ACTIVITY_LOG_HEADERS, SHEET_ACTIVITY_LOG } from './types';
import { isCandidateHeaderRow, rowToCandidate } from './recruitmentSheetParser';

const TRACKED_FIELDS: (keyof Candidate)[] = [
  'fullName',
  'phone',
  'jobAd',
  'appliedDate',
  'contactStatus',
  'contactDate',
  'assignedManager',
  'lectureAttendance',
  'lectureDate',
  'activationStatus',
  'activationDate',
  'equipmentStatus',
  'equipmentDate',
  'notes',
  'pipelineStatus',
  'previousEndDate',
  'interestLoggedAt',
  'isLegacy',
  'vehicleType',
  'workedBefore',
  'governorate',
  'zone',
  'hiringDecision',
  'notHiredReason',
  'lecturePlannedDate',
  'lectureConfirmed',
  'activationConfirmed',
  'equipmentNotReceivedReason',
  'equipmentExpectedDate',
  'dataSource',
  'assignedSupervisorCode',
];

/** تسجيل الفروقات بين المرشح القديم والجديد */
export async function logCandidateChanges(
  before: Candidate,
  after: Candidate,
  changedBy: string,
  changedByName: string
): Promise<void> {
  const now = new Date().toISOString();
  const rows: string[][] = [];

  for (const field of TRACKED_FIELDS) {
    const oldV = String(before[field] ?? '');
    const newV = String(after[field] ?? '');
    if (oldV !== newV) {
      rows.push([
        after.id,
        field,
        oldV,
        newV,
        changedBy,
        changedByName,
        now,
      ]);
    }
  }

  if (rows.length > 0) {
    await appendToSheet(SHEET_ACTIVITY_LOG, rows, false);
  }
}

/** جلب سجل نشاط مرشح */
export async function getActivityLogForCandidate(candidateId: string): Promise<ActivityLogEntry[]> {
  let data: unknown[][] = [];
  try {
    data = await getSheetData(SHEET_ACTIVITY_LOG, false);
  } catch {
    return [];
  }

  const entries: ActivityLogEntry[] = [];
  const start = data.length > 0 && isActivityHeader(data[0]) ? 1 : 0;

  for (let i = start; i < data.length; i++) {
    const row = data[i];
    if (!row?.length) continue;
    const cid = String(row[0] ?? '').trim();
    if (cid !== candidateId) continue;
    entries.push({
      candidateId: cid,
      field: String(row[1] ?? ''),
      oldValue: String(row[2] ?? ''),
      newValue: String(row[3] ?? ''),
      changedBy: String(row[4] ?? ''),
      changedByName: String(row[5] ?? ''),
      timestamp: String(row[6] ?? ''),
    });
  }

  return entries.sort((a, b) => b.timestamp.localeCompare(a.timestamp));
}

function isActivityHeader(row: unknown[]): boolean {
  const a = String(row[0] ?? '').toLowerCase();
  return a === 'candidateid' || a === 'معرف_المرشح';
}

export async function ensureActivityLogSheet(): Promise<void> {
  const { ensureSheetExists } = await import('@/lib/googleSheets');
  await ensureSheetExists(SHEET_ACTIVITY_LOG, [...ACTIVITY_LOG_HEADERS]);
}
