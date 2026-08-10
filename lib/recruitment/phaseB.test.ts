/**
 * SRS-014 Phase B — Recruitment V2 acceptance (pure + permission helpers).
 * No Google Sheets writes. Toggle FEATURE_RECRUITMENT_V2_ENABLED in-process only.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  ACTIVATION_CONTACTS_BLOCKED_AR,
  deriveRecruitmentPipelineStage,
  normalizeIdentityPhone,
  normalizeNationalId,
  phonesMatchForDuplicate,
  normalizeSecurityFeeInput,
  validateActivationPatch,
  validateContactInput,
  validateLectureAttendancePatch,
  validateRiderCodeForActivation,
  PIPELINE_STAGE_LABELS_AR,
} from './phaseB';
import {
  assertContactsExceptionPermission,
  assertOpsAssignmentPermission,
} from './recruitmentV2';
import { defaultCandidateFields, type Candidate } from './types';
import { isRecruitmentV2Enabled } from '@/lib/srs014Flags';
import { CANDIDATE_HEADERS, CANDIDATE_CONTACT_HEADERS } from './types';

function baseCandidate(partial: Partial<Candidate> = {}): Candidate {
  const fields = defaultCandidateFields(
    {
      fullName: 'SRS014QA_PhaseB',
      phone: '01000000000',
      jobAd: 'test',
      ...partial,
    },
    'qa'
  );
  return { id: 'cand_test', ...fields, ...partial };
}

describe('SRS-014 Phase B — security fee normalize', () => {
  it('accepts PAID / NOT_PAID / UNPAID alias', () => {
    assert.equal(normalizeSecurityFeeInput('PAID'), 'PAID');
    assert.equal(normalizeSecurityFeeInput('paid'), 'PAID');
    assert.equal(normalizeSecurityFeeInput('NOT_PAID'), 'NOT_PAID');
    assert.equal(normalizeSecurityFeeInput('UNPAID'), 'NOT_PAID');
    assert.equal(normalizeSecurityFeeInput('unpaid'), 'NOT_PAID');
    assert.equal(normalizeSecurityFeeInput('maybe'), null);
  });
});

describe('SRS-014 Phase B — family contacts validation', () => {
  it('requires name and phone', () => {
    assert.ok(validateContactInput({ name: '', relationship: 'أب', phone: '01' }));
    assert.equal(
      validateContactInput({ name: 'أحمد', relationship: 'أب', phone: '01011111111' }),
      null
    );
  });

  it('requires custom relationship when أخرى', () => {
    assert.match(
      String(validateContactInput({ name: 'س', relationship: 'أخرى', phone: '010', relationshipOther: '' })),
      /أخرى/
    );
    assert.equal(
      validateContactInput({
        name: 'س',
        relationship: 'أخرى',
        phone: '010',
        relationshipOther: 'صديق',
      }),
      null
    );
  });

  it('rejects invalid relationship', () => {
    assert.ok(validateContactInput({ name: 'س', relationship: 'جار', phone: '010' }));
  });
});

describe('SRS-014 Phase B — lecture / attendance', () => {
  it('requires absence reason when recording لم يحضر after lecture planned', () => {
    const existing = baseCandidate({
      lecturePlannedDate: '2026-08-01',
      lectureAttendance: 'لم يحضر',
      lectureAbsenceReason: '',
    });
    const err = validateLectureAttendancePatch(existing, {
      lectureAttendance: 'لم يحضر',
    });
    assert.match(String(err), /سبب الغياب/);
  });

  it('allows present when explicitly set', () => {
    const existing = baseCandidate({ lecturePlannedDate: '2026-08-01' });
    assert.equal(
      validateLectureAttendancePatch(existing, { lectureAttendance: 'حضر' }),
      null
    );
  });

  it('allows absence with reason', () => {
    const existing = baseCandidate({ lecturePlannedDate: '2026-08-01' });
    assert.equal(
      validateLectureAttendancePatch(existing, {
        lectureAttendance: 'لم يحضر',
        lectureAbsenceReason: 'مرض',
      }),
      null
    );
  });
});

describe('SRS-014 Phase B — activation + rider code', () => {
  it('rejects invalid / empty rider code on activation', () => {
    assert.ok(validateRiderCodeForActivation(''));
    assert.ok(validateRiderCodeForActivation('WA-001'));
    assert.equal(validateRiderCodeForActivation('12345'), null);
  });

  it('requires rider code when becoming activated', () => {
    const existing = baseCandidate({
      activationStatus: 'غير مفعل',
      lectureAttendance: 'حضر',
      lectureConfirmed: 'مؤكد',
    });
    assert.match(
      String(validateActivationPatch(existing, { activationStatus: 'مفعل - تم القبول' })),
      /كود المندوب/
    );
    assert.equal(
      validateActivationPatch(existing, {
        activationStatus: 'مفعل - تم القبول',
        riderCode: '98765',
      }),
      null
    );
  });

  it('requires reason when not activated / rejected', () => {
    const existing = baseCandidate({ activationStatus: 'غير مفعل' });
    assert.match(
      String(validateActivationPatch(existing, { activationStatus: 'مرفوض' })),
      /سبب عدم التفعيل/
    );
    assert.equal(
      validateActivationPatch(existing, {
        activationStatus: 'مرفوض',
        activationNotActivatedReason: 'لم يكتمل المستندات',
      }),
      null
    );
  });
});

describe('SRS-014 Phase B — pipeline stages', () => {
  it('labels cover all stages', () => {
    for (const stage of Object.keys(PIPELINE_STAGE_LABELS_AR)) {
      assert.ok(PIPELINE_STAGE_LABELS_AR[stage as keyof typeof PIPELINE_STAGE_LABELS_AR]);
    }
  });

  it('derives awaiting_lecture / attended / activated_awaiting_ops', () => {
    const future = '2099-01-01';
    assert.equal(
      deriveRecruitmentPipelineStage(
        baseCandidate({
          hiringDecision: 'هيشتغل',
          lecturePlannedDate: future,
          lectureAttendance: 'لم يحضر',
          lectureConfirmed: 'غير مؤكد',
        })
      ),
      'awaiting_lecture'
    );
    assert.equal(
      deriveRecruitmentPipelineStage(
        baseCandidate({
          lectureAttendance: 'حضر',
          lectureConfirmed: 'مؤكد',
          activationStatus: 'غير مفعل',
        })
      ),
      'attended_awaiting_activation'
    );
    assert.equal(
      deriveRecruitmentPipelineStage(
        baseCandidate({
          activationStatus: 'مفعل - تم القبول',
          activationConfirmed: 'مؤكد',
          finalAssignedSupervisorCode: '',
        })
      ),
      'activated_awaiting_ops_assignment'
    );
    assert.equal(
      deriveRecruitmentPipelineStage(
        baseCandidate({
          activationStatus: 'مفعل - تم القبول',
          finalAssignedSupervisorCode: 'WA-010',
        })
      ),
      'activated'
    );
  });

  it('derives rescheduled after absence + new planned date', () => {
    assert.equal(
      deriveRecruitmentPipelineStage(
        baseCandidate({
          lectureAttendance: 'لم يحضر',
          lectureAbsenceReason: 'سفر',
          lectureDate: '2026-08-01',
          lecturePlannedDate: '2026-08-10',
          lectureConfirmed: 'غير مؤكد',
        })
      ),
      'rescheduled'
    );
  });
});

function withRecruitmentV2Flag<T>(enabled: boolean, fn: () => T): T {
  const prev = process.env.FEATURE_RECRUITMENT_V2_ENABLED;
  try {
    if (enabled) process.env.FEATURE_RECRUITMENT_V2_ENABLED = 'true';
    else delete process.env.FEATURE_RECRUITMENT_V2_ENABLED;
    return fn();
  } finally {
    if (prev === undefined) delete process.env.FEATURE_RECRUITMENT_V2_ENABLED;
    else process.env.FEATURE_RECRUITMENT_V2_ENABLED = prev;
  }
}

describe('SRS-014 Phase B — permissions (flag ON)', () => {
  it('Recruitment Manager cannot assign Ops supervisor', () => {
    withRecruitmentV2Flag(true, () => {
      assert.equal(isRecruitmentV2Enabled(), true);
      const existing = baseCandidate({ finalAssignedSupervisorCode: '' });
      const err = assertOpsAssignmentPermission(
        'recruitment_manager',
        { finalAssignedSupervisorCode: 'WA-010' },
        existing
      );
      assert.match(String(err), /أدمن/);
      const prefErr = assertOpsAssignmentPermission(
        'recruitment_manager',
        { assignedSupervisorCode: 'WA-010' },
        existing
      );
      assert.match(String(prefErr), /أدمن/);
    });
  });

  it('Admin can assign Ops supervisor', () => {
    withRecruitmentV2Flag(true, () => {
      const existing = baseCandidate({ finalAssignedSupervisorCode: '' });
      assert.equal(
        assertOpsAssignmentPermission('admin', { finalAssignedSupervisorCode: 'WA-010' }, existing),
        null
      );
    });
  });

  it('Recruitment Manager cannot approve contacts exception', () => {
    withRecruitmentV2Flag(true, () => {
      const existing = baseCandidate({ contactsExceptionApproved: false });
      const err = assertContactsExceptionPermission(
        'recruitment_manager',
        { contactsExceptionApproved: true },
        existing
      );
      assert.match(String(err), /أدمن/);
    });
  });

  it('Admin can approve contacts exception', () => {
    withRecruitmentV2Flag(true, () => {
      const existing = baseCandidate({ contactsExceptionApproved: false });
      assert.equal(
        assertContactsExceptionPermission(
          'admin',
          { contactsExceptionApproved: true, contactsExceptionReason: 'ظروف خاصة' },
          existing
        ),
        null
      );
    });
  });
});

describe('SRS-014 Phase B — flag OFF regression', () => {
  it('flag defaults OFF and permission helpers are no-ops', () => {
    withRecruitmentV2Flag(false, () => {
      assert.equal(isRecruitmentV2Enabled(), false);
      const existing = baseCandidate();
      assert.equal(
        assertOpsAssignmentPermission(
          'recruitment_manager',
          { finalAssignedSupervisorCode: 'WA-010' },
          existing
        ),
        null
      );
      assert.equal(
        assertContactsExceptionPermission(
          'recruitment_manager',
          { contactsExceptionApproved: true },
          existing
        ),
        null
      );
    });
  });
});

describe('SRS-014 Phase B — identity normalization + activation copy', () => {
  it('normalizes phone/NID digits and exposes activation contacts message', () => {
    assert.equal(normalizeIdentityPhone('010-1234 5678'), '01012345678');
    assert.equal(normalizeNationalId('298-01-011234567'), '29801011234567');
    assert.equal(phonesMatchForDuplicate('01999111001', '1999111001'), true);
    assert.equal(phonesMatchForDuplicate('01999111001', '01999111002'), false);
    assert.match(ACTIVATION_CONTACTS_BLOCKED_AR, /جهتي اتصال/);
    assert.match(ACTIVATION_CONTACTS_BLOCKED_AR, /موافقة الإدارة/);
  });
});

describe('SRS-014 Phase B — sheet header compatibility (additive)', () => {
  it('candidate headers append Phase B columns at the end', () => {
    const idx = CANDIDATE_HEADERS.indexOf('contactsExceptionReason');
    assert.ok(idx >= 0);
    assert.equal(CANDIDATE_HEADERS[idx + 1], 'phoneSecondary');
    assert.ok(CANDIDATE_HEADERS.includes('nationalId'));
    assert.ok(CANDIDATE_HEADERS.includes('lectureAbsenceReason'));
    assert.ok(CANDIDATE_HEADERS.includes('activationNotActivatedReason'));
    assert.ok(CANDIDATE_HEADERS.includes('contactsExceptionAt'));
    // Must not rename securityInquiryPayment storage key
    assert.ok(CANDIDATE_HEADERS.includes('securityInquiryPayment'));
  });

  it('contacts sheet has expected headers', () => {
    assert.deepEqual(
      [...CANDIDATE_CONTACT_HEADERS],
      [
        'contactId',
        'candidateId',
        'name',
        'relationship',
        'relationshipOther',
        'phone',
        'active',
        'createdAt',
        'createdBy',
      ]
    );
  });
});
