/**
 * خدمة CRUD وإحصائيات مرشحي التعيين (Google Sheets)
 */
import {
  appendToSheet,
  getSheetData,
  updateSheetRow,
  deleteSheetRow,
  ensureSheetExists,
} from '@/lib/googleSheets';
import type {
  Candidate,
  CandidateFilters,
  CandidateInput,
  OutreachLead,
  OutreachLeadInput,
  RecruitmentStats,
} from './types';
import {
  CANDIDATE_HEADERS,
  OFFICE_MANAGER_ASSIGNMENT_OPTION,
  SHEET_ACTIVITY_LOG,
  SHEET_CANDIDATES,
  SHEET_NOTIFICATIONS,
  SHEET_OUTREACH_LEADS,
  OUTREACH_LEAD_HEADERS,
  defaultCandidateFields,
} from './types';
import {
  candidateToRow,
  isCandidateHeaderRow,
  rowToCandidate,
} from './recruitmentSheetParser';
import { logCandidateChanges } from './recruitmentActivityLog';
import { notifyNewCandidate } from './recruitmentNotifications';

function randomCandidateId(): string {
  return `c_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`;
}

function randomOutreachId(): string {
  return `o_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`;
}

function rowToOutreachLead(row: unknown[], sheetRow1Based: number): OutreachLead | null {
  const id = String(row[0] ?? '').trim();
  if (!id) return null;
  return {
    id,
    sheetRow: sheetRow1Based,
    fullName: String(row[1] ?? '').trim(),
    phone: String(row[2] ?? '').trim(),
    vehicleType: String(row[3] ?? '').trim() === 'عجلة' ? 'عجلة' : 'موتوسيكل',
    workedBefore: String(row[4] ?? '').trim() === 'نعم' ? 'نعم' : 'لا',
    governorate: String(row[5] ?? '').trim(),
    zone: String(row[6] ?? '').trim(),
    jobAd: String(row[7] ?? '').trim(),
    hiringDecision:
      String(row[8] ?? '').trim() === 'هيشتغل' || String(row[8] ?? '').trim() === 'لن يشتغل'
        ? (String(row[8] ?? '').trim() as OutreachLead['hiringDecision'])
        : 'قيد المراجعة',
    notHiredReason: String(row[9] ?? '').trim(),
    lecturePlannedDate: String(row[10] ?? '').trim(),
    notes: String(row[11] ?? '').trim(),
    assignedSupervisorCode: String(row[12] ?? '').trim(),
    createdBy: String(row[13] ?? '').trim(),
    createdAt: String(row[14] ?? '').trim(),
    convertedToCandidateId: String(row[15] ?? '').trim(),
    convertedAt: String(row[16] ?? '').trim(),
  };
}

function outreachLeadToRow(lead: OutreachLead): string[] {
  return [
    lead.id,
    lead.fullName,
    lead.phone,
    lead.vehicleType,
    lead.workedBefore,
    lead.governorate,
    lead.zone,
    lead.jobAd,
    lead.hiringDecision,
    lead.notHiredReason,
    lead.lecturePlannedDate,
    lead.notes,
    lead.assignedSupervisorCode,
    lead.createdBy,
    lead.createdAt,
    lead.convertedToCandidateId,
    lead.convertedAt,
  ];
}

function parseDate(s: string): Date | null {
  if (!s?.trim()) return null;
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? null : d;
}

function computeAssignmentState(
  next: Candidate,
  prev?: Candidate
): Pick<Candidate, 'assignmentStatus' | 'finalAssignedSupervisorCode' | 'assignedAt'> {
  const today = new Date().toISOString().slice(0, 10);
  const result = {
    assignmentStatus: next.assignmentStatus || 'غير محدد',
    finalAssignedSupervisorCode: next.finalAssignedSupervisorCode || '',
    assignedAt: next.assignedAt || '',
  } as Pick<Candidate, 'assignmentStatus' | 'finalAssignedSupervisorCode' | 'assignedAt'>;

  const chosen = String(next.assignedSupervisorCode || '').trim();
  const activationDone =
    next.activationConfirmed === 'مؤكد' || next.activationStatus === 'مفعل - تم القبول';
  const fullyDone = activationDone && next.equipmentStatus === 'تم الاستلام';

  if (chosen === OFFICE_MANAGER_ASSIGNMENT_OPTION) {
    if (result.finalAssignedSupervisorCode) {
      result.assignmentStatus = 'تم التعيين';
      if (!result.assignedAt) result.assignedAt = today;
    } else if (activationDone) {
      result.assignmentStatus = 'مؤجل لمدير المكتب';
    } else {
      result.assignmentStatus = 'غير محدد';
    }
    return result;
  }

  if (chosen) {
    if (fullyDone) {
      result.finalAssignedSupervisorCode = chosen;
      result.assignmentStatus = 'تم التعيين';
      if (!result.assignedAt) result.assignedAt = today;
    } else if (activationDone) {
      result.assignmentStatus = 'جاهز للتعيين';
    } else {
      result.assignmentStatus = 'غير محدد';
    }
    return result;
  }

  if (result.finalAssignedSupervisorCode) {
    result.assignmentStatus = 'تم التعيين';
    if (!result.assignedAt) result.assignedAt = today;
  } else {
    result.assignmentStatus = 'غير محدد';
    result.assignedAt = '';
  }
  return result;
}

function inDateRange(value: string, from?: string, to?: string): boolean {
  const d = parseDate(value);
  if (!d) return !from && !to;
  if (from) {
    const f = parseDate(from);
    if (f && d < f) return false;
  }
  if (to) {
    const t = parseDate(to);
    if (t) {
      const end = new Date(t);
      end.setHours(23, 59, 59, 999);
      if (d > end) return false;
    }
  }
  return true;
}

/** تحميل كل المرشحين من الشيت */
export async function loadAllCandidates(useCache = true): Promise<Candidate[]> {
  let data: unknown[][] = [];
  try {
    data = await getSheetData(SHEET_CANDIDATES, useCache);
  } catch {
    return [];
  }

  const list: Candidate[] = [];
  let start = 0;
  if (data.length > 0 && isCandidateHeaderRow(data[0])) start = 1;

  for (let i = start; i < data.length; i++) {
    const c = rowToCandidate(data[i], i + 1);
    if (c) list.push(c);
  }
  return list;
}

/** فلترة وبحث */
export function filterCandidates(candidates: Candidate[], filters: CandidateFilters): Candidate[] {
  let out = [...candidates];
  const q = filters.q?.trim().toLowerCase();
  if (q) {
    out = out.filter(
      (c) =>
        c.fullName.toLowerCase().includes(q) ||
        c.phone.includes(q) ||
        c.jobAd.toLowerCase().includes(q)
    );
  }
  if (filters.contactStatus) {
    out = out.filter((c) => c.contactStatus === filters.contactStatus);
  }
  if (filters.lectureAttendance) {
    out = out.filter((c) => c.lectureAttendance === filters.lectureAttendance);
  }
  if (filters.activationStatus) {
    out = out.filter((c) => c.activationStatus === filters.activationStatus);
  }
  if (filters.equipmentStatus) {
    out = out.filter((c) => c.equipmentStatus === filters.equipmentStatus);
  }
  if (filters.assignmentStatus) {
    out = out.filter((c) => c.assignmentStatus === filters.assignmentStatus);
  }
  if (filters.finalAssignedSupervisorCode) {
    out = out.filter((c) => c.finalAssignedSupervisorCode === filters.finalAssignedSupervisorCode);
  }
  if (filters.zone) {
    out = out.filter((c) => c.zone === filters.zone);
  }
  if (filters.governorate) {
    out = out.filter((c) => c.governorate === filters.governorate);
  }
  if (filters.hiringDecision) {
    out = out.filter((c) => c.hiringDecision === filters.hiringDecision);
  }
  if (filters.pipelineStatus) {
    out = out.filter((c) => c.pipelineStatus === filters.pipelineStatus);
  }
  if (filters.appliedDateFrom || filters.appliedDateTo) {
    out = out.filter((c) =>
      inDateRange(c.appliedDate, filters.appliedDateFrom, filters.appliedDateTo)
    );
  }
  if (filters.dateFrom || filters.dateTo) {
    out = out.filter(
      (c) =>
        inDateRange(c.contactDate, filters.dateFrom, filters.dateTo) ||
        inDateRange(c.updatedAt, filters.dateFrom, filters.dateTo)
    );
  }
  return out;
}

export async function listCandidates(filters: CandidateFilters = {}): Promise<Candidate[]> {
  const all = await loadAllCandidates();
  return filterCandidates(all, filters);
}

export async function getCandidateById(id: string): Promise<Candidate | null> {
  const all = await loadAllCandidates(false);
  return all.find((c) => c.id === id) ?? null;
}

export async function ensureCandidatesSheet(): Promise<void> {
  await ensureSheetExists(SHEET_CANDIDATES, [...CANDIDATE_HEADERS]);
}

export async function ensureOutreachLeadsSheet(): Promise<void> {
  await ensureSheetExists(SHEET_OUTREACH_LEADS, [...OUTREACH_LEAD_HEADERS]);
}

export async function listOutreachLeads(): Promise<OutreachLead[]> {
  await ensureOutreachLeadsSheet();
  const rows = await getSheetData(SHEET_OUTREACH_LEADS, false);
  const start = rows.length > 0 && String(rows[0][0] ?? '').trim().toLowerCase() === 'id' ? 1 : 0;
  const out: OutreachLead[] = [];
  for (let i = start; i < rows.length; i++) {
    const lead = rowToOutreachLead(rows[i], i + 1);
    if (lead) out.push(lead);
  }
  return out.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export async function createOutreachLead(
  input: OutreachLeadInput,
  actor: { code: string; name: string }
): Promise<OutreachLead> {
  await ensureOutreachLeadsSheet();
  const lead: OutreachLead = {
    id: randomOutreachId(),
    fullName: input.fullName.trim(),
    phone: input.phone.trim(),
    vehicleType: input.vehicleType,
    workedBefore: input.workedBefore,
    governorate: String(input.governorate ?? '').trim(),
    zone: String(input.zone ?? '').trim(),
    jobAd: String(input.jobAd ?? 'عرض توظيف').trim(),
    hiringDecision: input.hiringDecision ?? 'قيد المراجعة',
    notHiredReason: String(input.notHiredReason ?? '').trim(),
    lecturePlannedDate: String(input.lecturePlannedDate ?? '').trim(),
    notes: String(input.notes ?? '').trim(),
    assignedSupervisorCode: input.assignedSupervisorCode.trim(),
    createdBy: actor.code,
    createdAt: new Date().toISOString().slice(0, 10),
    convertedToCandidateId: '',
    convertedAt: '',
  };
  await appendToSheet(SHEET_OUTREACH_LEADS, [outreachLeadToRow(lead)], false);
  return lead;
}

export async function updateOutreachLead(
  id: string,
  patch: Partial<OutreachLead>
): Promise<OutreachLead | null> {
  const leads = await listOutreachLeads();
  const current = leads.find((x) => x.id === id);
  if (!current?.sheetRow) return null;
  const updated: OutreachLead = {
    ...current,
    ...patch,
    id: current.id,
    sheetRow: current.sheetRow,
    createdBy: current.createdBy,
    createdAt: current.createdAt,
  };
  await updateSheetRow(SHEET_OUTREACH_LEADS, current.sheetRow, outreachLeadToRow(updated));
  return updated;
}

export async function convertOutreachLeadToCandidate(
  id: string,
  actor: { code: string; name: string }
): Promise<Candidate | null> {
  const leads = await listOutreachLeads();
  const lead = leads.find((x) => x.id === id);
  if (!lead) return null;
  const candidate = await createCandidate(
    {
      fullName: lead.fullName,
      phone: lead.phone,
      jobAd: lead.jobAd || 'عرض توظيف',
      vehicleType: lead.vehicleType,
      workedBefore: lead.workedBefore,
      governorate: lead.governorate,
      zone: lead.zone,
      hiringDecision: lead.hiringDecision,
      notHiredReason: lead.notHiredReason,
      lecturePlannedDate: lead.lecturePlannedDate,
      notes: lead.notes,
      assignedSupervisorCode: lead.assignedSupervisorCode,
      dataSource: 'outreach',
    },
    actor.code,
    actor.name
  );
  if (lead.sheetRow) {
    await updateSheetRow(
      SHEET_OUTREACH_LEADS,
      lead.sheetRow,
      outreachLeadToRow({
        ...lead,
        convertedToCandidateId: candidate.id,
        convertedAt: new Date().toISOString().slice(0, 10),
      })
    );
  }
  return candidate;
}

/** إنشاء مرشح */
export async function createCandidate(
  input: CandidateInput,
  createdBy: string,
  createdByName: string,
  options?: { skipNotification?: boolean; isLegacy?: boolean }
): Promise<Candidate> {
  await ensureCandidatesSheet();
  const id = randomCandidateId();
  const fields = defaultCandidateFields(
    { ...input, isLegacy: options?.isLegacy ?? input.isLegacy },
    createdBy
  );
  if (options?.isLegacy) {
    fields.pipelineStatus = 'archived';
    fields.previousEndDate = fields.previousEndDate || new Date().toISOString().slice(0, 10);
  }
  const candidate: Candidate = { id, ...fields };

  await appendToSheet(SHEET_CANDIDATES, [candidateToRow(candidate)], false);

  if (!options?.skipNotification) {
    try {
      await notifyNewCandidate(candidate.fullName, candidate.jobAd);
    } catch (e) {
      console.warn('[recruitment] notify failed', e);
    }
  }

  return candidate;
}

/** تحديث مرشح */
export async function updateCandidate(
  id: string,
  patch: Partial<Candidate>,
  actor: { code: string; name: string },
  options?: { logActivity?: boolean }
): Promise<Candidate | null> {
  const existing = await getCandidateById(id);
  if (!existing?.sheetRow) return null;

  const updated: Candidate = {
    ...existing,
    ...patch,
    id: existing.id,
    sheetRow: existing.sheetRow,
    updatedAt: new Date().toISOString().slice(0, 10),
    createdAt: existing.createdAt,
    createdBy: existing.createdBy,
  };

  const assignmentPatch = computeAssignmentState(updated, existing);
  updated.assignmentStatus = assignmentPatch.assignmentStatus;
  updated.finalAssignedSupervisorCode = assignmentPatch.finalAssignedSupervisorCode;
  updated.assignedAt = assignmentPatch.assignedAt;

  // أرشفة تلقائية عند الرفض
  if (updated.activationStatus === 'مرفوض' && updated.pipelineStatus === 'active') {
    updated.pipelineStatus = 'archived';
    updated.previousEndDate = updated.previousEndDate || new Date().toISOString().slice(0, 10);
  }

  await updateSheetRow(SHEET_CANDIDATES, existing.sheetRow, candidateToRow(updated));

  if (options?.logActivity !== false) {
    try {
      await logCandidateChanges(existing, updated, actor.code, actor.name);
    } catch (e) {
      console.warn('[recruitment] activity log failed', e);
    }
  }

  return updated;
}

/** حذف مرشح */
export async function deleteCandidate(id: string): Promise<boolean> {
  const existing = await getCandidateById(id);
  if (!existing?.sheetRow) return false;
  return deleteSheetRow(SHEET_CANDIDATES, existing.sheetRow);
}

/** أرشفة يدوية */
export async function archiveCandidate(
  id: string,
  actor: { code: string; name: string }
): Promise<Candidate | null> {
  const today = new Date().toISOString().slice(0, 10);
  return updateCandidate(
    id,
    { pipelineStatus: 'archived', previousEndDate: today },
    actor
  );
}

/** إعادة تفعيل من الأرشيف */
export async function reactivateCandidate(
  id: string,
  actor: { code: string; name: string }
): Promise<Candidate | null> {
  return updateCandidate(
    id,
    {
      pipelineStatus: 'active',
      contactStatus: 'لم يتم التواصل',
      activationStatus: 'غير مفعل',
      contactDate: '',
      activationDate: '',
      previousEndDate: '',
      isLegacy: false,
    },
    actor
  );
}

/** تسجيل اهتمام مرشح قديم */
export async function logInterest(
  id: string,
  actor: { code: string; name: string }
): Promise<Candidate | null> {
  const today = new Date().toISOString().slice(0, 10);
  return updateCandidate(id, { interestLoggedAt: today }, actor);
}

/** تسجيل نتيجة تواصل */
export async function logContact(
  id: string,
  payload: {
    contactStatus: Candidate['contactStatus'];
    contactDate?: string;
    assignedManager?: string;
    contactReply?: string;
    hiringDecision?: Candidate['hiringDecision'];
    notHiredReason?: string;
    lecturePlannedDate?: string;
    notes?: string;
  },
  actor: { code: string; name: string }
): Promise<Candidate | null> {
  const today = new Date().toISOString().slice(0, 10);
  const existing = await getCandidateById(id);
  if (!existing) return null;
  const notesParts: string[] = [];
  if (payload.contactReply?.trim()) {
    notesParts.push(`رد التواصل: ${payload.contactReply.trim()}`);
  }
  if (payload.notes?.trim()) {
    notesParts.push(payload.notes.trim());
  }
  const mergedNotes = notesParts.length
    ? [existing.notes?.trim(), ...notesParts].filter(Boolean).join(' | ')
    : undefined;

  return updateCandidate(
    id,
    {
      contactStatus: payload.contactStatus,
      contactDate: payload.contactDate || today,
      assignedManager: payload.assignedManager || actor.name,
      ...(payload.hiringDecision != null ? { hiringDecision: payload.hiringDecision } : {}),
      ...(payload.notHiredReason != null ? { notHiredReason: payload.notHiredReason } : {}),
      ...(payload.lecturePlannedDate != null ? { lecturePlannedDate: payload.lecturePlannedDate } : {}),
      ...(mergedNotes != null ? { notes: mergedNotes } : {}),
    },
    actor
  );
}

/** استيراد جماعي */
export async function bulkImportCandidates(
  rows: CandidateInput[],
  createdBy: string,
  createdByName: string,
  isLegacy: boolean
): Promise<{ created: number; errors: string[] }> {
  await ensureCandidatesSheet();
  const errors: string[] = [];
  let created = 0;

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    if (!row.fullName?.trim() || !row.phone?.trim()) {
      errors.push(`صف ${i + 1}: الاسم والهاتف مطلوبان`);
      continue;
    }
    try {
      await createCandidate(
        { ...row, jobAd: row.jobAd || 'غير محدد' },
        createdBy,
        createdByName,
        { skipNotification: i > 0, isLegacy }
      );
      created++;
    } catch (e: unknown) {
      errors.push(`صف ${i + 1}: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  if (created > 0) {
    try {
      const { notifyNewCandidate: notify } = await import('./recruitmentNotifications');
      await notify(`استيراد جماعي: ${created} مرشح`, isLegacy ? 'مرشحين قدامى' : 'مرشحين جدد');
    } catch {
      /* ignore */
    }
  }

  return { created, errors };
}

/** إحصائيات اللوحة */
export async function getRecruitmentStats(): Promise<RecruitmentStats> {
  const all = await loadAllCandidates();
  const active = all.filter((c) => c.pipelineStatus === 'active');

  const now = new Date();
  const weekAgo = new Date(now);
  weekAgo.setDate(weekAgo.getDate() - 7);

  const newThisWeek = active.filter((c) => {
    const d = parseDate(c.appliedDate);
    return d && d >= weekAgo;
  }).length;

  const contacted = active.filter(
    (c) => c.contactStatus === 'تم التواصل' || c.contactStatus === 'تم الرد'
  ).length;
  const notContacted = active.filter((c) => c.contactStatus === 'لم يتم التواصل').length;
  const attendedLecture = active.filter((c) => c.lectureAttendance === 'حضر').length;
  const equipmentReceived = active.filter((c) => c.equipmentStatus === 'تم الاستلام').length;

  return {
    newThisWeek,
    contacted,
    notContacted,
    attendedLecture,
    equipmentReceived,
    totalActive: active.length,
  };
}

function normCode(v: unknown): string {
  return String(v ?? '')
    .replace(/^\uFEFF/, '')
    .trim()
    .toLowerCase();
}

export async function resetRecruitmentManagerData(options: {
  managerCode?: string;
  clearAll?: boolean;
}): Promise<{
  candidatesDeleted: number;
  outreachDeleted: number;
  activityDeleted: number;
  notificationsDeleted: number;
}> {
  const clearAll = Boolean(options.clearAll);
  const code = normCode(options.managerCode);
  if (!clearAll && !code) throw new Error('كود مسؤول التعيينات مطلوب');

  let candidatesDeleted = 0;
  let outreachDeleted = 0;
  let activityDeleted = 0;
  let notificationsDeleted = 0;

  const candidates = await loadAllCandidates(false);
  const candidateRows = candidates
    .filter((c) => clearAll || normCode(c.createdBy) === code)
    .filter((c) => !!c.sheetRow)
    .map((c) => c.sheetRow as number)
    .sort((a, b) => b - a);
  for (const row of candidateRows) {
    const ok = await deleteSheetRow(SHEET_CANDIDATES, row);
    if (ok) candidatesDeleted++;
  }

  const leads = await listOutreachLeads();
  const outreachRows = leads
    .filter((l) => clearAll || normCode(l.createdBy) === code)
    .filter((l) => !!l.sheetRow)
    .map((l) => l.sheetRow as number)
    .sort((a, b) => b - a);
  for (const row of outreachRows) {
    const ok = await deleteSheetRow(SHEET_OUTREACH_LEADS, row);
    if (ok) outreachDeleted++;
  }

  const activity = await getSheetData(SHEET_ACTIVITY_LOG, false);
  for (let i = activity.length - 1; i >= 1; i--) {
    const row = activity[i] || [];
    const changedBy = normCode(row[4]);
    if (clearAll || changedBy === code) {
      const ok = await deleteSheetRow(SHEET_ACTIVITY_LOG, i + 1);
      if (ok) activityDeleted++;
    }
  }

  const notifications = await getSheetData(SHEET_NOTIFICATIONS, false);
  for (let i = notifications.length - 1; i >= 1; i--) {
    const row = notifications[i] || [];
    const targetUserCode = normCode(row[2]);
    if (clearAll || targetUserCode === code) {
      const ok = await deleteSheetRow(SHEET_NOTIFICATIONS, i + 1);
      if (ok) notificationsDeleted++;
    }
  }

  return { candidatesDeleted, outreachDeleted, activityDeleted, notificationsDeleted };
}

export async function ensureAllRecruitmentSheets(): Promise<string[]> {
  const { ensureActivityLogSheet } = await import('./recruitmentActivityLog');
  const { ensureNotificationsSheet } = await import('./recruitmentNotifications');
  await ensureCandidatesSheet();
  await ensureOutreachLeadsSheet();
  await ensureActivityLogSheet();
  await ensureNotificationsSheet();
  return [SHEET_CANDIDATES, SHEET_OUTREACH_LEADS, 'سجل_نشاط_المرشحين', 'إشعارات_التعيين'];
}
