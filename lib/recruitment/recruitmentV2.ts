/**
 * SRS-014 Phase B — Recruitment V2 validation and security-fee updates.
 */
import { appendAuditLog } from '@/lib/auditLog';
import { isRecruitmentV2Enabled } from '@/lib/srs014Flags';
import { normalizeRiderCodeForPerformance } from '@/lib/riderCodeUtils';
import { assertMinContacts } from './contactsStore';
import {
  normalizeSecurityFeeInput,
  validateActivationPatch,
  validateLectureAttendancePatch,
  validateRiderCodeForActivation,
} from './phaseB';
import { getCandidateById, updateCandidate } from './recruitmentService';
import type { Candidate } from './types';

const ACTIVATED = 'مفعل - تم القبول' as const;

/** Validate Phase B rules when V2 flag is ON (activation, lecture, rider code, contacts). */
export async function validateRecruitmentV2Activation(
  candidateId: string,
  existing: Candidate,
  patch: Partial<Candidate>
): Promise<string | null> {
  if (!isRecruitmentV2Enabled()) return null;

  const lectureErr = validateLectureAttendancePatch(existing, patch);
  if (lectureErr) return lectureErr;

  const activationErr = validateActivationPatch(existing, patch);
  if (activationErr) return activationErr;

  const nextStatus = patch.activationStatus ?? existing.activationStatus;
  const becomingActivated =
    nextStatus === ACTIVATED && existing.activationStatus !== ACTIVATED;

  if (!becomingActivated) return null;

  const riderCode = (patch.riderCode ?? existing.riderCode).trim();
  const codeErr = validateRiderCodeForActivation(riderCode);
  if (codeErr) return codeErr;

  // Normalize rider code into the patch for persistence
  patch.riderCode = normalizeRiderCodeForPerformance(riderCode);

  const exceptionApproved =
    patch.contactsExceptionApproved ?? existing.contactsExceptionApproved;
  try {
    await assertMinContacts(candidateId, exceptionApproved);
  } catch (e: unknown) {
    return e instanceof Error ? e.message : String(e);
  }

  return null;
}

/**
 * When V2 ON, recruitment managers must not set Ops supervisor assignment fields.
 * Returns an error message or null.
 */
export function assertOpsAssignmentPermission(
  actorRole: string,
  patch: Partial<Candidate>,
  existing: Candidate
): string | null {
  if (!isRecruitmentV2Enabled()) return null;
  if (actorRole === 'admin') return null;

  const touchingFinal =
    patch.finalAssignedSupervisorCode !== undefined &&
    String(patch.finalAssignedSupervisorCode).trim() !==
      String(existing.finalAssignedSupervisorCode || '').trim();
  const touchingAssignedAt =
    patch.assignedAt !== undefined &&
    String(patch.assignedAt).trim() !== String(existing.assignedAt || '').trim();
  const touchingStatus =
    patch.assignmentStatus !== undefined &&
    patch.assignmentStatus !== existing.assignmentStatus &&
    (patch.assignmentStatus === 'تم التعيين' || existing.assignmentStatus === 'تم التعيين');
  const touchingPreferredOps =
    patch.assignedSupervisorCode !== undefined &&
    String(patch.assignedSupervisorCode).trim() !==
      String(existing.assignedSupervisorCode || '').trim();

  if (touchingFinal || touchingAssignedAt || touchingStatus || touchingPreferredOps) {
    return 'تعيين مشرف العمليات متاح للأدمن فقط';
  }
  return null;
}

/** Managers cannot approve contacts exception. */
export function assertContactsExceptionPermission(
  actorRole: string,
  patch: Partial<Candidate>,
  existing: Candidate
): string | null {
  if (!isRecruitmentV2Enabled()) return null;
  if (actorRole === 'admin') return null;

  if (
    patch.contactsExceptionApproved === true &&
    !existing.contactsExceptionApproved
  ) {
    return 'اعتماد استثناء جهات الاتصال متاح للأدمن فقط';
  }
  if (
    patch.contactsExceptionApproved !== undefined ||
    patch.contactsExceptionBy !== undefined ||
    patch.contactsExceptionReason !== undefined ||
    patch.contactsExceptionAt !== undefined
  ) {
    return 'اعتماد استثناء جهات الاتصال متاح للأدمن فقط';
  }
  return null;
}

export async function updateSecurityInquiryPayment(
  candidateId: string,
  rawValue: unknown,
  actor: { code: string; name: string; role: string }
): Promise<Candidate> {
  const value = normalizeSecurityFeeInput(rawValue);
  if (!value) {
    throw new Error('حالة رسوم الاستعلام يجب أن تكون PAID أو UNPAID/NOT_PAID');
  }

  const existing = await getCandidateById(candidateId);
  if (!existing) throw new Error('المرشح غير موجود');

  const current = existing.securityInquiryPayment;
  const frozen = current === 'PAID' || current === 'NOT_PAID';

  if (frozen) {
    if (value === current) return existing;
    if (actor.role !== 'admin') {
      throw new Error('لا يمكن تغيير حالة رسوم الاستعلام الأمني بعد تثبيتها');
    }
  }

  const updated = await updateCandidate(
    candidateId,
    { securityInquiryPayment: value },
    actor,
    { logActivity: true }
  );
  if (!updated) throw new Error('فشل تحديث المرشح');

  void appendAuditLog({
    domain: 'recruitment',
    action: frozen ? 'security_inquiry_payment_correction' : 'security_fee_status_changed',
    entityType: 'candidate',
    entityCode: candidateId,
    actorCode: actor.code,
    actorName: actor.name,
    before: { securityInquiryPayment: current || '' },
    after: { securityInquiryPayment: value },
  }).catch((err) => console.error('[recruitmentV2] audit log failed', err));

  return updated;
}
