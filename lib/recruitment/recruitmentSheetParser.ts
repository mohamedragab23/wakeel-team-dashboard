/**
 * تحويل صفوف Google Sheets ↔ كائن Candidate
 */
import type {
  ActivationStatus,
  AssignmentStatus,
  Candidate,
  ConfirmationStatus,
  ContactStatus,
  EquipmentStatus,
  HiringDecision,
  LectureAttendance,
  PipelineStatus,
  VehicleType,
} from './types';
import {
  ACTIVATION_STATUS_VALUES,
  ASSIGNMENT_STATUS_VALUES,
  CONFIRMATION_VALUES,
  CONTACT_STATUS_VALUES,
  EQUIPMENT_STATUS_VALUES,
  HIRING_DECISION_VALUES,
  LECTURE_ATTENDANCE_VALUES,
  PIPELINE_STATUS_VALUES,
  VEHICLE_TYPE_VALUES,
} from './types';

function cell(row: unknown[], i: number): string {
  const v = row[i];
  if (v == null) return '';
  return String(v).trim();
}

function asEnum<T extends string>(value: string, allowed: readonly T[], fallback: T): T {
  if (allowed.includes(value as T)) return value as T;
  return fallback;
}

/** تحويل صف شيت إلى مرشح (صف 0 = عناوين) */
export function rowToCandidate(row: unknown[], sheetRow1Based: number): Candidate | null {
  const id = cell(row, 0);
  if (!id) return null;

  return {
    id,
    sheetRow: sheetRow1Based,
    fullName: cell(row, 1),
    phone: cell(row, 2),
    jobAd: cell(row, 3),
    appliedDate: cell(row, 4),
    contactStatus: asEnum(cell(row, 5), CONTACT_STATUS_VALUES, 'لم يتم التواصل'),
    contactDate: cell(row, 6),
    assignedManager: cell(row, 7),
    lectureAttendance: asEnum(cell(row, 8), LECTURE_ATTENDANCE_VALUES, 'لم يحضر'),
    lectureDate: cell(row, 9),
    activationStatus: asEnum(cell(row, 10), ACTIVATION_STATUS_VALUES, 'غير مفعل'),
    activationDate: cell(row, 11),
    equipmentStatus: asEnum(cell(row, 12), EQUIPMENT_STATUS_VALUES, 'لم يستلم'),
    equipmentDate: cell(row, 13),
    notes: cell(row, 14),
    pipelineStatus: asEnum(cell(row, 15), PIPELINE_STATUS_VALUES, 'active'),
    previousEndDate: cell(row, 16),
    interestLoggedAt: cell(row, 17),
    isLegacy: cell(row, 18).toLowerCase() === 'true' || cell(row, 18) === '1',
    createdAt: cell(row, 19),
    updatedAt: cell(row, 20),
    createdBy: cell(row, 21),
    vehicleType: asEnum(cell(row, 22), VEHICLE_TYPE_VALUES, 'موتوسيكل'),
    workedBefore: cell(row, 23) === 'نعم' ? 'نعم' : 'لا',
    governorate: cell(row, 24),
    zone: cell(row, 25),
    hiringDecision: asEnum(cell(row, 26), HIRING_DECISION_VALUES, 'قيد المراجعة'),
    notHiredReason: cell(row, 27),
    lecturePlannedDate: cell(row, 28),
    lectureConfirmed: asEnum(cell(row, 29), CONFIRMATION_VALUES, 'غير مؤكد'),
    activationConfirmed: asEnum(cell(row, 30), CONFIRMATION_VALUES, 'غير مؤكد'),
    equipmentNotReceivedReason: cell(row, 31),
    equipmentExpectedDate: cell(row, 32),
    dataSource: cell(row, 33) === 'outreach' ? 'outreach' : 'direct',
    assignedSupervisorCode: cell(row, 34),
    assignmentStatus: asEnum(cell(row, 35), ASSIGNMENT_STATUS_VALUES, 'غير محدد'),
    finalAssignedSupervisorCode: cell(row, 36),
    assignedAt: cell(row, 37),
    assignmentNote: cell(row, 38),
  };
}

/** تحويل مرشح إلى صف للكتابة في الشيت */
export function candidateToRow(c: Candidate): string[] {
  return [
    c.id,
    c.fullName,
    c.phone,
    c.jobAd,
    c.appliedDate,
    c.contactStatus,
    c.contactDate,
    c.assignedManager,
    c.lectureAttendance,
    c.lectureDate,
    c.activationStatus,
    c.activationDate,
    c.equipmentStatus,
    c.equipmentDate,
    c.notes,
    c.pipelineStatus,
    c.previousEndDate,
    c.interestLoggedAt,
    c.isLegacy ? 'true' : 'false',
    c.createdAt,
    c.updatedAt,
    c.createdBy,
    c.vehicleType,
    c.workedBefore,
    c.governorate,
    c.zone,
    c.hiringDecision,
    c.notHiredReason,
    c.lecturePlannedDate,
    c.lectureConfirmed,
    c.activationConfirmed,
    c.equipmentNotReceivedReason,
    c.equipmentExpectedDate,
    c.dataSource,
    c.assignedSupervisorCode,
    c.assignmentStatus,
    c.finalAssignedSupervisorCode,
    c.assignedAt,
    c.assignmentNote,
  ];
}

/** هل الصف الأول عناوين؟ */
export function isCandidateHeaderRow(row: unknown[] | undefined): boolean {
  if (!row?.length) return false;
  const a = cell(row, 0).toLowerCase();
  return a === 'id' || a === 'معرف';
}
