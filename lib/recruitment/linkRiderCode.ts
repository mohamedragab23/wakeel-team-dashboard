/**
 * Safe Admin workflow: link an EXISTING Candidate to an authoritative live riderCode.
 * Never fuzzy-merges. Never invents Security / Ops / activation.
 * Never creates Liability / wallet / ledger mutations.
 */
import { getSheetData } from '@/lib/googleSheets';
import { appendAuditLog } from '@/lib/auditLog';
import { normalizeRiderCodeForPerformance } from '@/lib/riderCodeUtils';
import { findRiderInSheet } from '@/lib/riderCodeUtils';
import { validateRiderCodeForActivation } from '@/lib/recruitment/phaseB';
import {
  findIdentityDuplicate,
  getCandidateById,
  updateCandidate,
} from '@/lib/recruitment/recruitmentService';
import type { Candidate } from '@/lib/recruitment/types';

export type LinkRiderCodeInput = {
  candidateId: string;
  riderCode: string;
  /** Must exactly equal riderCode — explicit human confirmation. */
  confirmRiderCode: string;
  /** Must be true — human asserts they verified the live rider row. */
  confirmLiveRiderExists: boolean;
  /**
   * Required only when Candidate already has a different non-empty riderCode.
   * Prevents silent overwrite.
   */
  confirmOverwriteExistingCode?: boolean;
  actor: { code: string; name: string; role: string };
};

export type LinkRiderCodeResult =
  | {
      ok: true;
      candidate: Candidate;
      liveRiderNameSnapshot: string;
      previousRiderCode: string;
      financialSideEffects: {
        liabilityCreated: false;
        walletMutated: false;
        ledgerMutated: false;
        financialApply: false;
      };
    }
  | { ok: false; code: string; error: string };

export async function linkCandidateToAuthoritativeRiderCode(
  input: LinkRiderCodeInput
): Promise<LinkRiderCodeResult> {
  if (input.actor.role !== 'admin') {
    return {
      ok: false,
      code: 'FORBIDDEN',
      error: 'ربط كود المندوب بمرشح موجود متاح للأدمن فقط',
    };
  }

  const codeErr = validateRiderCodeForActivation(input.riderCode);
  if (codeErr) {
    return { ok: false, code: 'RIDER_CODE_INVALID', error: codeErr };
  }

  const normalized = normalizeRiderCodeForPerformance(input.riderCode)!;
  const confirmNorm = normalizeRiderCodeForPerformance(input.confirmRiderCode || '');
  if (!confirmNorm || confirmNorm !== normalized) {
    return {
      ok: false,
      code: 'CONFIRMATION_MISMATCH',
      error: 'تأكيد كود المندوب غير مطابق — أعد إدخال الكود للتأكيد الصريح',
    };
  }

  if (input.confirmLiveRiderExists !== true) {
    return {
      ok: false,
      code: 'LIVE_CONFIRM_REQUIRED',
      error: 'يجب تأكيد وجود المندوب في ورقة المناديب قبل الربط',
    };
  }

  const candidate = await getCandidateById(input.candidateId);
  if (!candidate) {
    return { ok: false, code: 'CANDIDATE_NOT_FOUND', error: 'المرشح غير موجود' };
  }

  const previous = String(candidate.riderCode || '').trim();
  const previousNorm = previous ? normalizeRiderCodeForPerformance(previous) : '';
  if (previousNorm && previousNorm !== normalized) {
    if (input.confirmOverwriteExistingCode !== true) {
      return {
        ok: false,
        code: 'EXISTING_CODE_CONFLICT',
        error: `المرشح مرتبط بالفعل بكود آخر (${previousNorm}). يلزم confirmOverwriteExistingCode=true`,
      };
    }
  }
  if (previousNorm === normalized) {
    return {
      ok: true,
      candidate,
      liveRiderNameSnapshot: '',
      previousRiderCode: previousNorm,
      financialSideEffects: {
        liabilityCreated: false,
        walletMutated: false,
        ledgerMutated: false,
        financialApply: false,
      },
    };
  }

  const riders = await getSheetData('المناديب', false);
  const live = findRiderInSheet(riders, normalized);
  if (!live) {
    return {
      ok: false,
      code: 'LIVE_RIDER_NOT_FOUND',
      error: 'كود المندوب غير موجود في ورقة المناديب — لا يمكن الربط',
    };
  }

    const liveName = String(live.row?.[1] ?? '');

  const dup = await findIdentityDuplicate({
    riderCode: normalized,
    excludeId: candidate.id,
  });
  if (dup) {
    return { ok: false, code: 'DUPLICATE_RIDER_CODE', error: dup };
  }

  const updated = await updateCandidate(
    candidate.id,
    { riderCode: normalized },
    { code: input.actor.code, name: input.actor.name }
  );
  if (!updated) {
    return { ok: false, code: 'UPDATE_FAILED', error: 'فشل تحديث المرشح' };
  }

  try {
    void appendAuditLog({
      domain: 'recruitment',
      action: 'rider_code_linked_to_live_rider',
      entityType: 'candidate',
      entityCode: candidate.id,
      actorCode: input.actor.code,
      actorName: input.actor.name,
      before: { riderCode: previous || '' },
      after: {
        riderCode: normalized,
        liveRiderName: liveName.slice(0, 80),
        liveSheetRow: live.sheetRowIndex,
      },
    });
  } catch {
    /* non-fatal */
  }

  return {
    ok: true,
    candidate: updated,
    liveRiderNameSnapshot: liveName,
    previousRiderCode: previousNorm || '',
    financialSideEffects: {
      liabilityCreated: false,
      walletMutated: false,
      ledgerMutated: false,
      financialApply: false,
    },
  };
}
