/**
 * تصدير المرشحين إلى Excel
 */
import * as XLSX from 'xlsx';
import type { Candidate } from './types';

const EXPORT_HEADERS_AR = [
  'المعرف',
  'الاسم الكامل',
  'رقم الهاتف',
  'وسيلة العمل',
  'اشتغل قبل كده',
  'المحافظة',
  'الزون',
  'الإعلان',
  'تاريخ التقديم',
  'قرار التعيين',
  'سبب عدم التشغيل',
  'ميعاد المحاضرة المخطط',
  'حالة التواصل',
  'تاريخ التواصل',
  'المشرف المسؤول',
  'حضور المحاضرة',
  'تاريخ المحاضرة',
  'حالة التفعيل',
  'تاريخ التفعيل',
  'تأكيد التفعيل',
  'استلام المعدات',
  'تاريخ استلام المعدات',
  'سبب عدم استلام المعدات',
  'ميعاد الاستلام المتوقع',
  'ملاحظات',
  'حالة القائمة',
  'تاريخ الانتهاء السابق',
  'تاريخ تسجيل الاهتمام',
  'مرشح قديم',
  'تاريخ الإنشاء',
  'آخر تحديث',
  'أنشئ بواسطة',
  'مصدر الداتا',
  'كود المشرف المسؤول',
  'حالة الإسناد',
  'المشرف النهائي',
  'تاريخ الإسناد',
  'ملاحظة الإسناد',
];

function candidateToExportRow(c: Candidate): (string | boolean)[] {
  return [
    c.id,
    c.fullName,
    c.phone,
    c.vehicleType,
    c.workedBefore,
    c.governorate,
    c.zone,
    c.jobAd,
    c.appliedDate,
    c.hiringDecision,
    c.notHiredReason,
    c.lecturePlannedDate,
    c.contactStatus,
    c.contactDate,
    c.assignedManager,
    c.lectureAttendance,
    c.lectureDate,
    c.activationStatus,
    c.activationDate,
    c.activationConfirmed,
    c.equipmentStatus,
    c.equipmentDate,
    c.equipmentNotReceivedReason,
    c.equipmentExpectedDate,
    c.notes,
    c.pipelineStatus === 'active' ? 'نشط' : 'مؤرشف',
    c.previousEndDate,
    c.interestLoggedAt,
    c.isLegacy ? 'نعم' : 'لا',
    c.createdAt,
    c.updatedAt,
    c.createdBy,
    c.dataSource === 'outreach' ? 'داتا عروض' : 'مباشر',
    c.assignedSupervisorCode,
    c.assignmentStatus,
    c.finalAssignedSupervisorCode,
    c.assignedAt,
    c.assignmentNote,
  ];
}

export function candidatesToExcelBuffer(candidates: Candidate[]): Buffer {
  const rows = [EXPORT_HEADERS_AR, ...candidates.map(candidateToExportRow)];
  const ws = XLSX.utils.aoa_to_sheet(rows);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'المرشحين');
  return Buffer.from(XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }));
}
