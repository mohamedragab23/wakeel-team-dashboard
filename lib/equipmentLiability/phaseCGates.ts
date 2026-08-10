/**
 * SRS-014 Phase C — server-side preconditions for equipment liability creation.
 * Pure validation against an already-loaded candidate (no Sheets I/O here).
 */
import { normalizeSecurityFeeInput } from '@/lib/recruitment/phaseB';
import {
  isRiderCode,
  normalizeRiderCodeForPerformance,
} from '@/lib/riderCodeUtils';
import type { Candidate } from '@/lib/recruitment/types';

export const PHASE_C_ERROR = {
  CANDIDATE_NOT_FOUND: 'CANDIDATE_NOT_FOUND',
  CANDIDATE_NOT_ACTIVATED: 'CANDIDATE_NOT_ACTIVATED',
  RIDER_CODE_MISSING: 'RIDER_CODE_MISSING',
  RIDER_CODE_INVALID: 'RIDER_CODE_INVALID',
  RIDER_CODE_MISMATCH: 'RIDER_CODE_MISMATCH',
  ADMIN_ASSIGNMENT_REQUIRED: 'ADMIN_ASSIGNMENT_REQUIRED',
  SECURITY_FEE_INVALID: 'SECURITY_FEE_INVALID',
  EQUIPMENT_LIABILITY_ALREADY_EXISTS: 'EQUIPMENT_LIABILITY_ALREADY_EXISTS',
  LOCK_BUSY: 'LOCK_BUSY',
  LIABILITY_CREATE_FAILED: 'LIABILITY_CREATE_FAILED',
} as const;

export type PhaseCErrorCode = (typeof PHASE_C_ERROR)[keyof typeof PHASE_C_ERROR];

export const PHASE_C_ERROR_AR: Record<PhaseCErrorCode, string> = {
  CANDIDATE_NOT_FOUND: 'لا يمكن إنشاء عهدة المعدات: المرشح غير موجود',
  CANDIDATE_NOT_ACTIVATED: 'لا يمكن إنشاء عهدة المعدات: المرشح غير مفعّل',
  RIDER_CODE_MISSING: 'لا يمكن إنشاء عهدة المعدات: كود المندوب مطلوب',
  RIDER_CODE_INVALID: 'لا يمكن إنشاء عهدة المعدات: كود المندوب غير صالح',
  RIDER_CODE_MISMATCH: 'لا يمكن إنشاء عهدة المعدات: كود المندوب لا يطابق المرشح',
  ADMIN_ASSIGNMENT_REQUIRED:
    'لا يمكن إنشاء عهدة المعدات: يلزم تعيين مشرف التشغيل بواسطة الأدمن أولاً',
  SECURITY_FEE_INVALID:
    'لا يمكن إنشاء عهدة المعدات: حالة الاستعلام الأمني غير معروفة أو ناقصة (يجب PAID أو NOT_PAID)',
  EQUIPMENT_LIABILITY_ALREADY_EXISTS: 'EQUIPMENT_LIABILITY_ALREADY_EXISTS',
  LOCK_BUSY: 'عملية موافقة أخرى قيد التنفيذ على نفس التسليم — أعد المحاولة بعد لحظات',
  LIABILITY_CREATE_FAILED: 'فشل إنشاء سجل عهدة المعدات',
};

export function isCandidateActivatedForPhaseC(c: Pick<Candidate, 'activationStatus' | 'activationConfirmed'>): boolean {
  return (
    c.activationStatus === 'مفعل - تم القبول' || c.activationConfirmed === 'مؤكد'
  );
}

export function normalizeAndValidateRiderCode(raw: unknown):
  | { ok: true; riderCode: string }
  | { ok: false; code: PhaseCErrorCode } {
  const trimmed = String(raw ?? '').trim();
  if (!trimmed) return { ok: false, code: PHASE_C_ERROR.RIDER_CODE_MISSING };
  const normalized = normalizeRiderCodeForPerformance(trimmed);
  if (!normalized || !isRiderCode(normalized)) {
    return { ok: false, code: PHASE_C_ERROR.RIDER_CODE_INVALID };
  }
  return { ok: true, riderCode: normalized };
}

/**
 * Validates candidate readiness for Phase C liability.
 * Never defaults security fee — missing/invalid → SECURITY_FEE_INVALID.
 */
export function assertPhaseCCandidateReady(
  candidate: Candidate | null | undefined,
  deliveryRiderCodeRaw: unknown
):
  | {
      ok: true;
      riderCode: string;
      securityPaidUpfront: boolean;
      activationDate: string;
      finalAssignedSupervisorCode: string;
    }
  | { ok: false; code: PhaseCErrorCode } {
  const rider = normalizeAndValidateRiderCode(deliveryRiderCodeRaw);
  if (!rider.ok) return rider;

  if (!candidate) return { ok: false, code: PHASE_C_ERROR.CANDIDATE_NOT_FOUND };

  if (!isCandidateActivatedForPhaseC(candidate)) {
    return { ok: false, code: PHASE_C_ERROR.CANDIDATE_NOT_ACTIVATED };
  }

  const candidateRider = normalizeAndValidateRiderCode(candidate.riderCode);
  if (!candidateRider.ok) return { ok: false, code: candidateRider.code };
  if (candidateRider.riderCode !== rider.riderCode) {
    return { ok: false, code: PHASE_C_ERROR.RIDER_CODE_MISMATCH };
  }

  const ops = String(candidate.finalAssignedSupervisorCode || '').trim();
  if (!ops) {
    return { ok: false, code: PHASE_C_ERROR.ADMIN_ASSIGNMENT_REQUIRED };
  }

  const fee = normalizeSecurityFeeInput(candidate.securityInquiryPayment);
  if (!fee) {
    return { ok: false, code: PHASE_C_ERROR.SECURITY_FEE_INVALID };
  }

  return {
    ok: true,
    riderCode: rider.riderCode,
    securityPaidUpfront: fee === 'PAID',
    activationDate:
      String(candidate.activationDate || '').trim() ||
      new Date().toISOString().slice(0, 10),
    finalAssignedSupervisorCode: ops,
  };
}
