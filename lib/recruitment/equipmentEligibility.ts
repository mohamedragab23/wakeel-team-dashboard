/**
 * SRS-014 — READ-ONLY equipment workflow eligibility from Candidate state.
 * Pure helpers. Never invent riderCode / Security / Ops supervisor.
 * Never creates liabilities or financial mutations.
 */

import {
  assertPhaseCCandidateReady,
  normalizeAndValidateRiderCode,
} from '@/lib/equipmentLiability/phaseCGates';
import { normalizeSecurityFeeInput, deriveRecruitmentPipelineStage } from '@/lib/recruitment/phaseB';
import type { Candidate, RecruitmentPipelineStage } from '@/lib/recruitment/types';

export type SecurityStatusExplicit = 'PAID' | 'NOT_PAID' | 'UNKNOWN';

/** Explicit Security state — NEVER infers UNKNOWN → PAID/NOT_PAID. */
export function resolveSecurityStatusExplicit(value: unknown): SecurityStatusExplicit {
  const n = normalizeSecurityFeeInput(value);
  if (n === 'PAID') return 'PAID';
  if (n === 'NOT_PAID') return 'NOT_PAID';
  return 'UNKNOWN';
}

export type EquipmentEligibilityChecklist = {
  hasCandidate: boolean;
  activated: boolean;
  riderCodePresent: boolean;
  riderCodeValidForDelivery: boolean;
  securityStatus: SecurityStatusExplicit;
  opsSupervisorAssigned: boolean;
  pipelineStage: RecruitmentPipelineStage | null;
  phaseCReady: boolean;
  phaseCCode: string | null;
  missing: string[];
  /** True only when Phase C would allow liability create for this delivery riderCode. */
  equipmentWorkflowEligible: boolean;
};

/**
 * Assess whether a Candidate may enter the normal equipment → liability path.
 * deliveryRiderCode: code on the equipment delivery row (must match Candidate.riderCode).
 */
export function assessEquipmentWorkflowEligibility(
  candidate: Candidate | null | undefined,
  deliveryRiderCode: unknown
): EquipmentEligibilityChecklist {
  const missing: string[] = [];
  if (!candidate) {
    return {
      hasCandidate: false,
      activated: false,
      riderCodePresent: false,
      riderCodeValidForDelivery: false,
      securityStatus: 'UNKNOWN',
      opsSupervisorAssigned: false,
      pipelineStage: null,
      phaseCReady: false,
      phaseCCode: 'CANDIDATE_NOT_FOUND',
      missing: ['candidate_linked_by_riderCode'],
      equipmentWorkflowEligible: false,
    };
  }

  const activated =
    candidate.activationStatus === 'مفعل - تم القبول' ||
    candidate.activationConfirmed === 'مؤكد';
  const riderCodePresent = Boolean(String(candidate.riderCode || '').trim());
  const securityStatus = resolveSecurityStatusExplicit(candidate.securityInquiryPayment);
  const opsSupervisorAssigned = Boolean(
    String(candidate.finalAssignedSupervisorCode || '').trim()
  );
  const pipelineStage = deriveRecruitmentPipelineStage(candidate);
  const candCode = normalizeAndValidateRiderCode(candidate.riderCode);
  const delCode = normalizeAndValidateRiderCode(deliveryRiderCode);
  const riderCodeValidForDelivery =
    candCode.ok && delCode.ok && candCode.riderCode === delCode.riderCode;

  const gate = assertPhaseCCandidateReady(candidate, deliveryRiderCode);

  if (!activated) missing.push('activation');
  if (!riderCodePresent) missing.push('riderCode');
  if (securityStatus === 'UNKNOWN') missing.push('securityInquiryPayment');
  if (!opsSupervisorAssigned) missing.push('finalAssignedSupervisorCode');
  if (riderCodePresent && delCode.ok && !riderCodeValidForDelivery) {
    missing.push('riderCode_matches_delivery');
  }

  return {
    hasCandidate: true,
    activated,
    riderCodePresent,
    riderCodeValidForDelivery,
    securityStatus,
    opsSupervisorAssigned,
    pipelineStage,
    phaseCReady: gate.ok,
    phaseCCode: gate.ok ? null : gate.code,
    missing,
    equipmentWorkflowEligible: gate.ok,
  };
}
