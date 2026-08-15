/**
 * 4D.5.4.10 — READ-ONLY equipment liability workflow readiness.
 * Never creates Liability / Intent / wallet / ledger mutations.
 * Never invents Candidate, Security, or Ops supervisor.
 */

import { resolveSecurityStatusExplicit } from '@/lib/recruitment/equipmentEligibility';
import { normalizeAndValidateRiderCode } from '@/lib/equipmentLiability/phaseCGates';
import { isCandidateActivatedForPhaseC } from '@/lib/equipmentLiability/phaseCGates';
import type { Candidate } from '@/lib/recruitment/types';

export const EQUIPMENT_LIABILITY_BLOCKERS = {
  MISSING_CANDIDATE_LINK: 'MISSING_CANDIDATE_LINK',
  MISSING_RIDER_CODE: 'MISSING_RIDER_CODE',
  RIDER_CODE_INVALID: 'RIDER_CODE_INVALID',
  RIDER_CODE_MISMATCH: 'RIDER_CODE_MISMATCH',
  MISSING_ACTIVATION: 'MISSING_ACTIVATION',
  MISSING_EQUIPMENT_DELIVERY: 'MISSING_EQUIPMENT_DELIVERY',
  SECURITY_STATUS_REQUIRED: 'SECURITY_STATUS_REQUIRED',
  MISSING_OPERATIONS_SUPERVISOR: 'MISSING_OPERATIONS_SUPERVISOR',
  PRICING_NOT_CONFIGURED: 'PRICING_NOT_CONFIGURED',
  MISSING_RIDER_MASTER: 'MISSING_RIDER_MASTER',
} as const;

export type EquipmentLiabilityBlocker =
  (typeof EQUIPMENT_LIABILITY_BLOCKERS)[keyof typeof EQUIPMENT_LIABILITY_BLOCKERS];

export type DeliveryEvidenceInput = {
  deliveryRowRef?: string;
  riderCode?: string;
  deliveryType?: string;
  motorcyclePouch?: number;
  bicyclePouch?: number;
  tshirtQty?: number;
  status?: string;
  issueOrDeliveryDate?: string;
};

export type PricingAvailabilityInput = {
  /** True when Admin أسعار_المعدات loads valid fail-closed pricing (incl. security). */
  adminPricingOk: boolean;
};

export type RiderMasterInput = {
  found: boolean;
  riderCode?: string;
};

export type EquipmentLiabilityReadinessInput = {
  candidate: Candidate | null | undefined;
  /** Delivery rider code (canonical operational key on تسليم_المعدات). */
  deliveryRiderCode?: unknown;
  delivery: DeliveryEvidenceInput | null | undefined;
  riderMaster: RiderMasterInput | null | undefined;
  pricing: PricingAvailabilityInput;
};

export type EquipmentLiabilityReadinessResult = {
  status: 'READY' | 'BLOCKED';
  blockers: EquipmentLiabilityBlocker[];
  securityStatus: 'PAID' | 'NOT_PAID' | 'UNKNOWN';
  /** Diagnostic only — never triggers writes. */
  financialSideEffects: {
    liabilityCreated: false;
    walletMutated: false;
    ledgerMutated: false;
    financialApply: false;
  };
};

/**
 * Can this rider legally/operationally enter the equipment liability workflow?
 * READ-ONLY. Does not create Liability.
 */
export function assessEquipmentLiabilityReadiness(
  input: EquipmentLiabilityReadinessInput
): EquipmentLiabilityReadinessResult {
  const blockers: EquipmentLiabilityBlocker[] = [];
  const candidate = input.candidate;
  const securityStatus = resolveSecurityStatusExplicit(
    candidate?.securityInquiryPayment
  );

  if (!input.riderMaster?.found) {
    blockers.push(EQUIPMENT_LIABILITY_BLOCKERS.MISSING_RIDER_MASTER);
  }

  if (!candidate) {
    blockers.push(EQUIPMENT_LIABILITY_BLOCKERS.MISSING_CANDIDATE_LINK);
  } else {
    const candCode = normalizeAndValidateRiderCode(candidate.riderCode);
    if (!String(candidate.riderCode || '').trim()) {
      blockers.push(EQUIPMENT_LIABILITY_BLOCKERS.MISSING_RIDER_CODE);
    } else if (!candCode.ok) {
      blockers.push(EQUIPMENT_LIABILITY_BLOCKERS.RIDER_CODE_INVALID);
    }

    if (!isCandidateActivatedForPhaseC(candidate)) {
      blockers.push(EQUIPMENT_LIABILITY_BLOCKERS.MISSING_ACTIVATION);
    }

    if (securityStatus === 'UNKNOWN') {
      blockers.push(EQUIPMENT_LIABILITY_BLOCKERS.SECURITY_STATUS_REQUIRED);
    }

    if (!String(candidate.finalAssignedSupervisorCode || '').trim()) {
      blockers.push(EQUIPMENT_LIABILITY_BLOCKERS.MISSING_OPERATIONS_SUPERVISOR);
    }

    const deliveryCodeRaw =
      input.deliveryRiderCode ?? input.delivery?.riderCode ?? candidate.riderCode;
    const delCode = normalizeAndValidateRiderCode(deliveryCodeRaw);
    if (candCode.ok && delCode.ok && candCode.riderCode !== delCode.riderCode) {
      blockers.push(EQUIPMENT_LIABILITY_BLOCKERS.RIDER_CODE_MISMATCH);
    }
  }

  if (!input.delivery) {
    blockers.push(EQUIPMENT_LIABILITY_BLOCKERS.MISSING_EQUIPMENT_DELIVERY);
  }

  if (!input.pricing?.adminPricingOk) {
    blockers.push(EQUIPMENT_LIABILITY_BLOCKERS.PRICING_NOT_CONFIGURED);
  }

  // Deduplicate while preserving order
  const unique = [...new Set(blockers)];

  return {
    status: unique.length === 0 ? 'READY' : 'BLOCKED',
    blockers: unique,
    securityStatus,
    financialSideEffects: {
      liabilityCreated: false,
      walletMutated: false,
      ledgerMutated: false,
      financialApply: false,
    },
  };
}
