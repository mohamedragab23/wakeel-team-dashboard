/**
 * 4D.5.4.8 — Equipment eligibility / Recruitment→Phase-C readiness (no money).
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { defaultCandidateFields, type Candidate } from '@/lib/recruitment/types';
import {
  assessEquipmentWorkflowEligibility,
  resolveSecurityStatusExplicit,
} from '@/lib/recruitment/equipmentEligibility';
import { validateActivationPatch } from '@/lib/recruitment/phaseB';
import { isSrs014FinancialApplyEnabled } from '@/lib/srs014Flags';

function candidate(over: Partial<Candidate> = {}): Candidate {
  return {
    id: 'c_test',
    ...defaultCandidateFields({ fullName: 'Test Rider', phone: '01000000000' }, 't'),
    ...over,
  };
}

describe('4D.5.4.8 security status explicit', () => {
  it('UNKNOWN is not silently converted to PAID or NOT_PAID', () => {
    assert.equal(resolveSecurityStatusExplicit(''), 'UNKNOWN');
    assert.equal(resolveSecurityStatusExplicit(undefined), 'UNKNOWN');
    assert.equal(resolveSecurityStatusExplicit('maybe'), 'UNKNOWN');
    assert.equal(resolveSecurityStatusExplicit('PAID'), 'PAID');
    assert.equal(resolveSecurityStatusExplicit('NOT_PAID'), 'NOT_PAID');
    assert.equal(resolveSecurityStatusExplicit('UNPAID'), 'NOT_PAID');
  });
});

describe('4D.5.4.8 activation requires authoritative riderCode', () => {
  it('cannot activate via status without riderCode', () => {
    const existing = candidate({ activationStatus: 'غير مفعل' });
    assert.match(
      String(validateActivationPatch(existing, { activationStatus: 'مفعل - تم القبول' })),
      /كود المندوب/
    );
  });

  it('cannot activate via confirmation-only without riderCode', () => {
    const existing = candidate({
      activationStatus: 'غير مفعل',
      activationConfirmed: 'غير مؤكد',
    });
    assert.match(
      String(validateActivationPatch(existing, { activationConfirmed: 'مؤكد' })),
      /كود المندوب/
    );
  });

  it('allows activation when legitimate riderCode + activation date provided', () => {
    const existing = candidate({ activationStatus: 'غير مفعل' });
    assert.equal(
      validateActivationPatch(existing, {
        activationStatus: 'مفعل - تم القبول',
        riderCode: '4821034',
        activationDate: '2026-08-03',
      }),
      null
    );
  });
});

describe('4D.5.4.8 equipment eligibility checklist', () => {
  it('blocks when candidate missing (CANDIDATE_NOT_FOUND)', () => {
    const r = assessEquipmentWorkflowEligibility(null, '4821034');
    assert.equal(r.equipmentWorkflowEligible, false);
    assert.equal(r.phaseCCode, 'CANDIDATE_NOT_FOUND');
    assert.equal(r.securityStatus, 'UNKNOWN');
    assert.ok(r.missing.includes('candidate_linked_by_riderCode'));
  });

  it('requires ops supervisor before eligibility', () => {
    const c = candidate({
      activationStatus: 'مفعل - تم القبول',
      activationConfirmed: 'مؤكد',
      riderCode: '4821034',
      securityInquiryPayment: 'PAID',
      finalAssignedSupervisorCode: '',
      activationDate: '2026-08-09',
    });
    const r = assessEquipmentWorkflowEligibility(c, '4821034');
    assert.equal(r.equipmentWorkflowEligible, false);
    assert.equal(r.phaseCCode, 'ADMIN_ASSIGNMENT_REQUIRED');
    assert.ok(r.missing.includes('finalAssignedSupervisorCode'));
  });

  it('UNKNOWN security blocks eligibility (no silent NOT_PAID)', () => {
    const c = candidate({
      activationStatus: 'مفعل - تم القبول',
      riderCode: '4821034',
      securityInquiryPayment: '',
      finalAssignedSupervisorCode: 'WA-015',
      activationDate: '2026-08-09',
    });
    const r = assessEquipmentWorkflowEligibility(c, '4821034');
    assert.equal(r.securityStatus, 'UNKNOWN');
    assert.equal(r.equipmentWorkflowEligible, false);
    assert.equal(r.phaseCCode, 'SECURITY_FEE_INVALID');
  });

  it('ready only when activation + riderCode + security + ops present', () => {
    const c = candidate({
      activationStatus: 'مفعل - تم القبول',
      activationConfirmed: 'مؤكد',
      riderCode: '4821034',
      securityInquiryPayment: 'NOT_PAID',
      finalAssignedSupervisorCode: 'WA-015',
      activationDate: '2026-08-09',
    });
    const r = assessEquipmentWorkflowEligibility(c, '4821034');
    assert.equal(r.equipmentWorkflowEligible, true);
    assert.equal(r.phaseCReady, true);
    assert.equal(r.securityStatus, 'NOT_PAID');
    assert.deepEqual(r.missing, []);
  });

  it('does not create liability / financial apply remains OFF in this unit', () => {
    assert.equal(isSrs014FinancialApplyEnabled(), false);
    // Eligibility assess is pure — no liability side effects by construction.
    const r = assessEquipmentWorkflowEligibility(null, '4821034');
    assert.equal(r.equipmentWorkflowEligible, false);
  });
});
