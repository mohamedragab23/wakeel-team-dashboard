/**
 * 4D.5.4.10 — Equipment liability readiness regression tests.
 * Never creates Liability / wallet / ledger mutations.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { defaultCandidateFields, type Candidate } from '@/lib/recruitment/types';
import {
  assessEquipmentLiabilityReadiness,
  EQUIPMENT_LIABILITY_BLOCKERS,
} from '@/lib/recruitment/equipmentLiabilityReadiness';
import { resolveSecurityStatusExplicit } from '@/lib/recruitment/equipmentEligibility';
import { isSrs014FinancialApplyEnabled } from '@/lib/srs014Flags';

function candidate(over: Partial<Candidate> = {}): Candidate {
  return {
    id: 'c_test',
    ...defaultCandidateFields({ fullName: 'Test Rider', phone: '01000000000' }, 't'),
    ...over,
  };
}

const pricingOk = { adminPricingOk: true };
const masterOk = { found: true, riderCode: '4811093' };
const deliveryOk = {
  deliveryRowRef: '10',
  riderCode: '4811093',
  deliveryType: 'تعيين',
  motorcyclePouch: 1,
  bicyclePouch: 0,
  tshirtQty: 2,
  status: 'pending',
};

describe('4D.5.4.10 equipment liability readiness', () => {
  it('A: Rider without Candidate → BLOCKED MISSING_CANDIDATE_LINK', () => {
    const r = assessEquipmentLiabilityReadiness({
      candidate: null,
      deliveryRiderCode: '4811093',
      delivery: deliveryOk,
      riderMaster: masterOk,
      pricing: pricingOk,
    });
    assert.equal(r.status, 'BLOCKED');
    assert.ok(r.blockers.includes(EQUIPMENT_LIABILITY_BLOCKERS.MISSING_CANDIDATE_LINK));
  });

  it('B: Candidate without riderCode → BLOCKED MISSING_RIDER_CODE', () => {
    const r = assessEquipmentLiabilityReadiness({
      candidate: candidate({
        activationStatus: 'مفعل - تم القبول',
        riderCode: '',
        securityInquiryPayment: 'PAID',
        finalAssignedSupervisorCode: 'WA-016',
      }),
      deliveryRiderCode: '4811093',
      delivery: deliveryOk,
      riderMaster: masterOk,
      pricing: pricingOk,
    });
    assert.equal(r.status, 'BLOCKED');
    assert.ok(r.blockers.includes(EQUIPMENT_LIABILITY_BLOCKERS.MISSING_RIDER_CODE));
  });

  it('C: Candidate + riderCode but no activation → BLOCKED MISSING_ACTIVATION', () => {
    const r = assessEquipmentLiabilityReadiness({
      candidate: candidate({
        activationStatus: 'غير مفعل',
        activationConfirmed: 'غير مؤكد',
        riderCode: '4811093',
        securityInquiryPayment: 'PAID',
        finalAssignedSupervisorCode: 'WA-016',
      }),
      deliveryRiderCode: '4811093',
      delivery: deliveryOk,
      riderMaster: masterOk,
      pricing: pricingOk,
    });
    assert.equal(r.status, 'BLOCKED');
    assert.ok(r.blockers.includes(EQUIPMENT_LIABILITY_BLOCKERS.MISSING_ACTIVATION));
  });

  it('D: Activated but no equipment delivery → BLOCKED MISSING_EQUIPMENT_DELIVERY', () => {
    const r = assessEquipmentLiabilityReadiness({
      candidate: candidate({
        activationStatus: 'مفعل - تم القبول',
        riderCode: '4811093',
        securityInquiryPayment: 'PAID',
        finalAssignedSupervisorCode: 'WA-016',
      }),
      deliveryRiderCode: '4811093',
      delivery: null,
      riderMaster: masterOk,
      pricing: pricingOk,
    });
    assert.equal(r.status, 'BLOCKED');
    assert.ok(
      r.blockers.includes(EQUIPMENT_LIABILITY_BLOCKERS.MISSING_EQUIPMENT_DELIVERY)
    );
  });

  it('E: Security UNKNOWN → BLOCKED SECURITY_STATUS_REQUIRED (no infer)', () => {
    assert.equal(resolveSecurityStatusExplicit(''), 'UNKNOWN');
    const r = assessEquipmentLiabilityReadiness({
      candidate: candidate({
        activationStatus: 'مفعل - تم القبول',
        riderCode: '4811093',
        securityInquiryPayment: '',
        finalAssignedSupervisorCode: 'WA-016',
      }),
      deliveryRiderCode: '4811093',
      delivery: deliveryOk,
      riderMaster: masterOk,
      pricing: pricingOk,
    });
    assert.equal(r.securityStatus, 'UNKNOWN');
    assert.equal(r.status, 'BLOCKED');
    assert.ok(
      r.blockers.includes(EQUIPMENT_LIABILITY_BLOCKERS.SECURITY_STATUS_REQUIRED)
    );
  });

  it('F: Security PAID can satisfy security requirement', () => {
    const r = assessEquipmentLiabilityReadiness({
      candidate: candidate({
        activationStatus: 'مفعل - تم القبول',
        riderCode: '4811093',
        securityInquiryPayment: 'PAID',
        finalAssignedSupervisorCode: 'WA-016',
      }),
      deliveryRiderCode: '4811093',
      delivery: deliveryOk,
      riderMaster: masterOk,
      pricing: pricingOk,
    });
    assert.equal(r.securityStatus, 'PAID');
    assert.equal(
      r.blockers.includes(EQUIPMENT_LIABILITY_BLOCKERS.SECURITY_STATUS_REQUIRED),
      false
    );
  });

  it('G: Security NOT_PAID can satisfy security requirement', () => {
    const r = assessEquipmentLiabilityReadiness({
      candidate: candidate({
        activationStatus: 'مفعل - تم القبول',
        riderCode: '4811093',
        securityInquiryPayment: 'NOT_PAID',
        finalAssignedSupervisorCode: 'WA-016',
      }),
      deliveryRiderCode: '4811093',
      delivery: deliveryOk,
      riderMaster: masterOk,
      pricing: pricingOk,
    });
    assert.equal(r.securityStatus, 'NOT_PAID');
    assert.equal(
      r.blockers.includes(EQUIPMENT_LIABILITY_BLOCKERS.SECURITY_STATUS_REQUIRED),
      false
    );
  });

  it('H: Missing supervisor → BLOCKED', () => {
    const r = assessEquipmentLiabilityReadiness({
      candidate: candidate({
        activationStatus: 'مفعل - تم القبول',
        riderCode: '4811093',
        securityInquiryPayment: 'PAID',
        finalAssignedSupervisorCode: '',
      }),
      deliveryRiderCode: '4811093',
      delivery: deliveryOk,
      riderMaster: masterOk,
      pricing: pricingOk,
    });
    assert.equal(r.status, 'BLOCKED');
    assert.ok(
      r.blockers.includes(EQUIPMENT_LIABILITY_BLOCKERS.MISSING_OPERATIONS_SUPERVISOR)
    );
  });

  it('I: Complete operational prerequisites → READY', () => {
    const r = assessEquipmentLiabilityReadiness({
      candidate: candidate({
        activationStatus: 'مفعل - تم القبول',
        activationConfirmed: 'مؤكد',
        riderCode: '4811093',
        securityInquiryPayment: 'NOT_PAID',
        finalAssignedSupervisorCode: 'WA-016',
        activationDate: '2026-08-06',
      }),
      deliveryRiderCode: '4811093',
      delivery: deliveryOk,
      riderMaster: masterOk,
      pricing: pricingOk,
    });
    assert.equal(r.status, 'READY');
    assert.deepEqual(r.blockers, []);
  });

  it('J–N: readiness never creates Liability; FA OFF; zero money side-effects; UNKNOWN not inferred', () => {
    assert.equal(isSrs014FinancialApplyEnabled(), false);
    assert.equal(resolveSecurityStatusExplicit(undefined), 'UNKNOWN');
    assert.equal(resolveSecurityStatusExplicit('maybe'), 'UNKNOWN');
    const r = assessEquipmentLiabilityReadiness({
      candidate: null,
      delivery: null,
      riderMaster: { found: false },
      pricing: { adminPricingOk: false },
    });
    assert.equal(r.financialSideEffects.liabilityCreated, false);
    assert.equal(r.financialSideEffects.walletMutated, false);
    assert.equal(r.financialSideEffects.ledgerMutated, false);
    assert.equal(r.financialSideEffects.financialApply, false);
    assert.equal(r.status, 'BLOCKED');
  });
});
