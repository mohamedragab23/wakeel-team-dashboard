/**
 * SRS-014 Phase B — pure validation / pipeline helpers (flag-aware callers).
 */
import { isRiderCode, normalizeRiderCodeForPerformance } from '@/lib/riderCodeUtils';
import {
  CONTACT_RELATIONSHIP_VALUES,
  type Candidate,
  type ContactRelationship,
  type RecruitmentPipelineStage,
} from './types';

/** User-facing activation block when contacts < 2 and no Admin exception. */
export const ACTIVATION_CONTACTS_BLOCKED_AR =
  'لا يمكن تفعيل المندوب قبل تسجيل جهتي اتصال على الأقل، أو الحصول على موافقة الإدارة على الاستثناء.';

export function normalizeSecurityFeeInput(
  value: unknown
): 'PAID' | 'NOT_PAID' | null {
  const v = String(value ?? '')
    .trim()
    .toUpperCase();
  if (v === 'PAID') return 'PAID';
  if (v === 'NOT_PAID' || v === 'UNPAID') return 'NOT_PAID';
  return null;
}

/** Digits-only phone for duplicate checks (not for display). */
export function normalizeIdentityPhone(phone: string): string {
  return String(phone ?? '').replace(/\D/g, '');
}

/** Sheets may strip a leading 0 when a phone is stored as a number. */
export function phonesMatchForDuplicate(a: string, b: string): boolean {
  const da = normalizeIdentityPhone(a);
  const db = normalizeIdentityPhone(b);
  if (da.length < 8 || db.length < 8) return false;
  if (da === db) return true;
  return da.replace(/^0+/, '') === db.replace(/^0+/, '');
}

export function normalizeNationalId(id: string): string {
  return String(id ?? '').replace(/\D/g, '');
}

export function isValidContactRelationship(value: string): value is ContactRelationship {
  return (CONTACT_RELATIONSHIP_VALUES as readonly string[]).includes(value);
}

export function validateContactInput(input: {
  name: string;
  relationship: string;
  relationshipOther?: string;
  phone: string;
}): string | null {
  if (!input.name.trim() || !input.phone.trim()) {
    return 'الاسم ورقم الهاتف مطلوبان';
  }
  if (!isValidContactRelationship(input.relationship.trim())) {
    return 'صلة القرابة غير صالحة';
  }
  if (input.relationship.trim() === 'أخرى' && !String(input.relationshipOther ?? '').trim()) {
    return 'يجب توضيح صلة القرابة عند اختيار "أخرى"';
  }
  return null;
}

/** Rider codes are numeric (existing system); reject supervisor WA- codes. */
export function validateRiderCodeForActivation(raw: string): string | null {
  const trimmed = raw.trim();
  if (!trimmed) return 'كود المندوب مطلوب عند التفعيل';
  const normalized = normalizeRiderCodeForPerformance(trimmed);
  if (!normalized || !isRiderCode(normalized)) {
    return 'كود المندوب غير صالح (يجب أن يكون رقماً فقط حسب النظام الحالي)';
  }
  return null;
}

export function validateLectureAttendancePatch(
  existing: Candidate,
  patch: Partial<Candidate>
): string | null {
  const nextAttendance = patch.lectureAttendance ?? existing.lectureAttendance;
  const attendanceTouched = patch.lectureAttendance !== undefined;

  if (attendanceTouched && nextAttendance === 'حضر') {
    // Explicit present only — never silent
    return null;
  }

  const isAbsent = nextAttendance === 'لم يحضر' || nextAttendance === 'غائب';
  if (attendanceTouched && isAbsent) {
    const hadPlanned =
      Boolean((patch.lecturePlannedDate ?? existing.lecturePlannedDate).trim()) ||
      Boolean(existing.lectureDate.trim());
    // Require reason when recording absence after a lecture was scheduled/held
    if (hadPlanned) {
      const reason = (patch.lectureAbsenceReason ?? existing.lectureAbsenceReason).trim();
      if (!reason) {
        return 'سبب الغياب مطلوب عند تسجيل عدم الحضور';
      }
    }
  }

  // Reschedule: new planned date while absent clears confirmation expectation
  if (
    patch.lecturePlannedDate !== undefined &&
    patch.lecturePlannedDate !== existing.lecturePlannedDate &&
    existing.lectureAttendance !== 'حضر'
  ) {
    // allowed — caller may also reset attendance
  }

  return null;
}

export function validateActivationPatch(
  existing: Candidate,
  patch: Partial<Candidate>
): string | null {
  const nextStatus = patch.activationStatus ?? existing.activationStatus;
  const nextConfirmed = patch.activationConfirmed ?? existing.activationConfirmed;
  const becomingActivated =
    nextStatus === 'مفعل - تم القبول' && existing.activationStatus !== 'مفعل - تم القبول';
  /** Confirm-only path must also require an authoritative riderCode (never invent one). */
  const becomingConfirmedActivated =
    nextConfirmed === 'مؤكد' && existing.activationConfirmed !== 'مؤكد';
  const becomingRejected =
    nextStatus === 'مرفوض' && existing.activationStatus !== 'مرفوض';

  if (becomingActivated || becomingConfirmedActivated) {
    const codeErr = validateRiderCodeForActivation(patch.riderCode ?? existing.riderCode);
    if (codeErr) return codeErr;
  }

  if (becomingRejected) {
    const reason = (patch.activationNotActivatedReason ?? existing.activationNotActivatedReason).trim();
    if (!reason) {
      return 'سبب عدم التفعيل مطلوب';
    }
  }

  return null;
}

export function deriveRecruitmentPipelineStage(c: Candidate): RecruitmentPipelineStage {
  const activated = c.activationStatus === 'مفعل - تم القبول' || c.activationConfirmed === 'مؤكد';
  const notActivated = c.activationStatus === 'مرفوض';
  const attended = c.lectureAttendance === 'حضر' || c.lectureConfirmed === 'مؤكد';
  const absent = c.lectureAttendance === 'لم يحضر' || c.lectureAttendance === 'غائب';
  const planned = Boolean(c.lecturePlannedDate.trim());
  const today = new Date().toISOString().slice(0, 10);
  const lectureDue = planned && c.lecturePlannedDate <= today;
  const hasOps = Boolean(c.finalAssignedSupervisorCode.trim());

  if (activated && !hasOps) return 'activated_awaiting_ops_assignment';
  if (activated) return 'activated';
  if (notActivated) return 'not_activated';
  if (attended) return 'attended_awaiting_activation';
  if (absent && planned && Boolean(c.lectureAbsenceReason.trim()) && c.lecturePlannedDate > (c.lectureDate || '')) {
    // new planned date after absence → rescheduled
    if (c.lecturePlannedDate && c.lectureDate && c.lecturePlannedDate > c.lectureDate) {
      return 'rescheduled';
    }
  }
  if (absent && lectureDue && c.lectureConfirmed !== 'مؤكد') return 'absent';
  if (planned && !attended) {
    if (lectureDue) return 'absent'; // awaiting confirmation after due date
    return 'awaiting_lecture';
  }
  if (c.hiringDecision === 'هيشتغل' && planned) return 'awaiting_lecture';
  return 'other';
}

export const PIPELINE_STAGE_LABELS_AR: Record<RecruitmentPipelineStage, string> = {
  awaiting_lecture: 'مستني المحاضرة',
  absent: 'غاب — يحتاج تأكيد أو إعادة محاضرة',
  rescheduled: 'محاضرة معاد جدولتها',
  attended_awaiting_activation: 'حضر — مستني التفعيل وكود المندوب',
  activated: 'اكتمل التعيين',
  not_activated: 'مرفوض / غير مفعّل',
  activated_awaiting_ops_assignment: 'اتفعّل — مستني تعيين مشرف التشغيل (Admin)',
  other: 'مقدم / بيانات أولية',
};
