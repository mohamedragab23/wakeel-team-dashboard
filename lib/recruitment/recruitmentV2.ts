/**
 * SRS-014 Phase B — Recruitment V2 validation and security-fee updates.
 */
import { appendAuditLog } from '@/lib/auditLog';
import { isRecruitmentV2Enabled } from '@/lib/srs014Flags';
import { assertMinContacts } from './contactsStore';
import { getCandidateById, updateCandidate } from './recruitmentService';
import type { Candidate } from './types';

const ACTIVATED = 'مفعل - تم القبول' as const;

/** Validate riderCode + contacts when transitioning to activated (V2 only). */
export async function validateRecruitmentV2Activation(
  candidateId: string,
  existing: Candidate,
  patch: Partial<Candidate>
): Promise<string | null> {
  if (!isRecruitmentV2Enabled()) return null;

  const nextStatus = patch.activationStatus ?? existing.activationStatus;
  const becomingActivated =
    nextStatus === ACTIVATED && existing.activationStatus !== ACTIVATED;

  if (!becomingActivated) return null;

  const riderCode = (patch.riderCode ?? existing.riderCode).trim();
  if (!riderCode) {
    return 'كود المندوب مطلوب عند التفعيل';
  }

  const exceptionApproved =
    patch.contactsExceptionApproved ?? existing.contactsExceptionApproved;
  try {
    await assertMinContacts(candidateId, exceptionApproved);
  } catch (e: unknown) {
    return e instanceof Error ? e.message : String(e);
  }

  return null;
}

export async function updateSecurityInquiryPayment(
  candidateId: string,
  value: 'PAID' | 'NOT_PAID',
  actor: { code: string; name: string; role: string }
): Promise<Candidate> {
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

  if (frozen && value !== current) {
    void appendAuditLog({
      domain: 'recruitment',
      action: 'security_inquiry_payment_correction',
      entityType: 'candidate',
      entityCode: candidateId,
      actorCode: actor.code,
      actorName: actor.name,
      before: { securityInquiryPayment: current },
      after: { securityInquiryPayment: value },
    }).catch((err) => console.error('[recruitmentV2] audit log failed', err));
  }

  return updated;
}
