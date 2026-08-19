import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { readWorkbook } from '@/lib/excelAdapter';
import {
  candidatesToExcelBuffer,
  EXPORT_HEADERS_AR,
} from '@/lib/recruitment/recruitmentExport';
import type { Candidate } from '@/lib/recruitment/types';

function sampleCandidate(): Candidate {
  return {
    id: 'c-1',
    fullName: 'مرشح تجريبي',
    phone: '01000000000',
    jobAd: 'إعلان 1',
    appliedDate: '2026-01-01',
    contactStatus: 'تم التواصل',
    contactDate: '2026-01-02',
    assignedManager: 'مدير',
    lectureAttendance: 'حضر',
    lectureDate: '2026-01-03',
    activationStatus: 'مفعل - تم القبول',
    activationDate: '2026-01-04',
    equipmentStatus: 'تم الاستلام',
    equipmentDate: '2026-01-05',
    notes: 'ملاحظة',
    pipelineStatus: 'active',
    previousEndDate: '',
    interestLoggedAt: '2026-01-01',
    isLegacy: false,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-02T00:00:00.000Z',
    createdBy: 'admin',
    vehicleType: 'موتوسيكل',
    workedBefore: 'لا',
    governorate: 'القاهرة',
    zone: 'المعادي',
    hiringDecision: 'هيشتغل',
    notHiredReason: '',
    lecturePlannedDate: '2026-01-03',
    lectureConfirmed: 'مؤكد',
    activationConfirmed: 'مؤكد',
    equipmentNotReceivedReason: '',
    equipmentExpectedDate: '',
    dataSource: 'direct',
    assignedSupervisorCode: 'S1',
    assignmentStatus: 'تم التعيين',
    finalAssignedSupervisorCode: 'S1',
    assignedAt: '2026-01-06',
    assignmentNote: '',
    securityInquiryPayment: '',
    riderCode: '',
    contactsExceptionApproved: false,
    contactsExceptionBy: '',
    contactsExceptionReason: '',
    phoneSecondary: '',
    nationalId: '',
    detailedAddress: '',
    age: '',
    studentStatus: '',
    lectureAbsenceReason: '',
    activationNotActivatedReason: '',
    contactsExceptionAt: '',
  };
}

describe('recruitmentExport', () => {
  it('writes المرشحين with Arabic headers and candidate rows', async () => {
    const loaded = await readWorkbook(await candidatesToExcelBuffer([sampleCandidate()]));
    assert.deepEqual(loaded.sheetNames, ['المرشحين']);
    const matrix = loaded.sheetToMatrix('المرشحين', { raw: true, defval: '' });
    assert.deepEqual(matrix[0], [...EXPORT_HEADERS_AR]);
    assert.equal(matrix.length, 2);
    assert.equal(matrix[1][0], 'c-1');
    assert.equal(matrix[1][1], 'مرشح تجريبي');
    assert.equal(matrix[1][25], 'نشط');
    assert.equal(matrix[1][28], 'لا');
    assert.equal(matrix[1][32], 'مباشر');
  });
});
