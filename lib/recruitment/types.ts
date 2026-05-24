/**
 * نماذج بيانات نظام إدارة مرشحي التعيين (Recruitment Pipeline)
 */

/** حالات التواصل مع المرشح */
export const CONTACT_STATUS_VALUES = [
  'لم يتم التواصل',
  'تم التواصل',
  'تم الرد',
  'لم يتم الرد',
] as const;
export type ContactStatus = (typeof CONTACT_STATUS_VALUES)[number];

/** حضور المحاضرة */
export const LECTURE_ATTENDANCE_VALUES = ['لم يحضر', 'حضر', 'غائب'] as const;
export type LectureAttendance = (typeof LECTURE_ATTENDANCE_VALUES)[number];

/** حالة التفعيل / القبول */
export const ACTIVATION_STATUS_VALUES = ['غير مفعل', 'مفعل - تم القبول', 'مرفوض'] as const;
export type ActivationStatus = (typeof ACTIVATION_STATUS_VALUES)[number];

/** استلام المعدات */
export const EQUIPMENT_STATUS_VALUES = ['لم يستلم', 'تم الاستلام', 'مستحق للاستلام'] as const;
export type EquipmentStatus = (typeof EQUIPMENT_STATUS_VALUES)[number];

/** نوع المركبة */
export const VEHICLE_TYPE_VALUES = ['موتوسيكل', 'عجلة'] as const;
export type VehicleType = (typeof VEHICLE_TYPE_VALUES)[number];

/** قرار التشغيل الأولي */
export const HIRING_DECISION_VALUES = ['قيد المراجعة', 'هيشتغل', 'لن يشتغل'] as const;
export type HiringDecision = (typeof HIRING_DECISION_VALUES)[number];

/** تأكيد الحالة بواسطة الأدمن/مسؤول التعيينات */
export const CONFIRMATION_VALUES = ['غير مؤكد', 'مؤكد'] as const;
export type ConfirmationStatus = (typeof CONFIRMATION_VALUES)[number];

export const ASSIGNMENT_STATUS_VALUES = [
  'غير محدد',
  'مؤجل لمدير المكتب',
  'جاهز للتعيين',
  'تم التعيين',
] as const;
export type AssignmentStatus = (typeof ASSIGNMENT_STATUS_VALUES)[number];

export const OFFICE_MANAGER_ASSIGNMENT_OPTION = '__OFFICE_MANAGER_LATER__';

/** نشط أو مؤرشف */
export const PIPELINE_STATUS_VALUES = ['active', 'archived'] as const;
export type PipelineStatus = (typeof PIPELINE_STATUS_VALUES)[number];

export const SHEET_CANDIDATES = 'مرشحين_التعيين';
export const SHEET_ACTIVITY_LOG = 'سجل_نشاط_المرشحين';
export const SHEET_NOTIFICATIONS = 'إشعارات_التعيين';
export const SHEET_OUTREACH_LEADS = 'داتا_العروض_للمشرف';

/** أعمدة شيت المرشحين */
export const CANDIDATE_HEADERS = [
  'id',
  'fullName',
  'phone',
  'jobAd',
  'appliedDate',
  'contactStatus',
  'contactDate',
  'assignedManager',
  'lectureAttendance',
  'lectureDate',
  'activationStatus',
  'activationDate',
  'equipmentStatus',
  'equipmentDate',
  'notes',
  'pipelineStatus',
  'previousEndDate',
  'interestLoggedAt',
  'isLegacy',
  'createdAt',
  'updatedAt',
  'createdBy',
  'vehicleType',
  'workedBefore',
  'governorate',
  'zone',
  'hiringDecision',
  'notHiredReason',
  'lecturePlannedDate',
  'lectureConfirmed',
  'activationConfirmed',
  'equipmentNotReceivedReason',
  'equipmentExpectedDate',
  'dataSource',
  'assignedSupervisorCode',
  'assignmentStatus',
  'finalAssignedSupervisorCode',
  'assignedAt',
  'assignmentNote',
] as const;

export const OUTREACH_LEAD_HEADERS = [
  'id',
  'fullName',
  'phone',
  'vehicleType',
  'workedBefore',
  'governorate',
  'zone',
  'jobAd',
  'hiringDecision',
  'notHiredReason',
  'lecturePlannedDate',
  'notes',
  'assignedSupervisorCode',
  'createdBy',
  'createdAt',
  'convertedToCandidateId',
  'convertedAt',
] as const;

export const ACTIVITY_LOG_HEADERS = [
  'candidateId',
  'field',
  'oldValue',
  'newValue',
  'changedBy',
  'changedByName',
  'timestamp',
] as const;

export const NOTIFICATION_HEADERS = [
  'id',
  'targetRole',
  'targetUserCode',
  'message',
  'read',
  'createdAt',
] as const;

export interface Candidate {
  id: string;
  sheetRow?: number;
  fullName: string;
  phone: string;
  jobAd: string;
  appliedDate: string;
  contactStatus: ContactStatus;
  contactDate: string;
  assignedManager: string;
  lectureAttendance: LectureAttendance;
  lectureDate: string;
  activationStatus: ActivationStatus;
  activationDate: string;
  equipmentStatus: EquipmentStatus;
  equipmentDate: string;
  notes: string;
  pipelineStatus: PipelineStatus;
  previousEndDate: string;
  interestLoggedAt: string;
  isLegacy: boolean;
  createdAt: string;
  updatedAt: string;
  createdBy: string;
  vehicleType: VehicleType;
  workedBefore: 'نعم' | 'لا';
  governorate: string;
  zone: string;
  hiringDecision: HiringDecision;
  notHiredReason: string;
  lecturePlannedDate: string;
  lectureConfirmed: ConfirmationStatus;
  activationConfirmed: ConfirmationStatus;
  equipmentNotReceivedReason: string;
  equipmentExpectedDate: string;
  dataSource: 'direct' | 'outreach';
  assignedSupervisorCode: string;
  assignmentStatus: AssignmentStatus;
  finalAssignedSupervisorCode: string;
  assignedAt: string;
  assignmentNote: string;
}

export interface OutreachLead {
  id: string;
  sheetRow?: number;
  fullName: string;
  phone: string;
  vehicleType: VehicleType;
  workedBefore: 'نعم' | 'لا';
  governorate: string;
  zone: string;
  jobAd: string;
  hiringDecision: HiringDecision;
  notHiredReason: string;
  lecturePlannedDate: string;
  notes: string;
  assignedSupervisorCode: string;
  createdBy: string;
  createdAt: string;
  convertedToCandidateId: string;
  convertedAt: string;
}

export type CandidateInput = Partial<
  Omit<Candidate, 'id' | 'sheetRow' | 'createdAt' | 'updatedAt' | 'createdBy'>
> & {
  fullName: string;
  phone: string;
  jobAd: string;
};

export type OutreachLeadInput = Partial<Omit<OutreachLead, 'id' | 'sheetRow' | 'createdAt' | 'createdBy'>> & {
  fullName: string;
  phone: string;
  vehicleType: VehicleType;
  workedBefore: 'نعم' | 'لا';
  governorate: string;
  zone: string;
  assignedSupervisorCode: string;
};

export interface CandidateFilters {
  q?: string;
  contactStatus?: string;
  lectureAttendance?: string;
  activationStatus?: string;
  equipmentStatus?: string;
  assignmentStatus?: string;
  finalAssignedSupervisorCode?: string;
  pipelineStatus?: PipelineStatus;
  dateFrom?: string;
  dateTo?: string;
  appliedDateFrom?: string;
  appliedDateTo?: string;
  zone?: string;
  governorate?: string;
  hiringDecision?: string;
}

export interface RecruitmentStats {
  newThisWeek: number;
  contacted: number;
  notContacted: number;
  attendedLecture: number;
  equipmentReceived: number;
  totalActive: number;
}

export interface RecruitmentNotification {
  id: string;
  targetRole: string;
  targetUserCode: string;
  message: string;
  read: boolean;
  createdAt: string;
}

export interface ActivityLogEntry {
  candidateId: string;
  field: string;
  oldValue: string;
  newValue: string;
  changedBy: string;
  changedByName: string;
  timestamp: string;
}

/** القيم الافتراضية لمرشح جديد */
export function defaultCandidateFields(
  partial: CandidateInput,
  createdBy: string
): Omit<Candidate, 'id' | 'sheetRow'> {
  const now = new Date().toISOString().slice(0, 10);
  return {
    fullName: partial.fullName?.trim() ?? '',
    phone: partial.phone?.trim() ?? '',
    jobAd: partial.jobAd?.trim() ?? '',
    appliedDate: partial.appliedDate?.trim() || now,
    contactStatus: (partial.contactStatus as ContactStatus) ?? 'لم يتم التواصل',
    contactDate: partial.contactDate?.trim() ?? '',
    assignedManager: partial.assignedManager?.trim() ?? '',
    lectureAttendance: (partial.lectureAttendance as LectureAttendance) ?? 'لم يحضر',
    lectureDate: partial.lectureDate?.trim() ?? '',
    activationStatus: (partial.activationStatus as ActivationStatus) ?? 'غير مفعل',
    activationDate: partial.activationDate?.trim() ?? '',
    equipmentStatus: (partial.equipmentStatus as EquipmentStatus) ?? 'لم يستلم',
    equipmentDate: partial.equipmentDate?.trim() ?? '',
    notes: partial.notes?.trim() ?? '',
    pipelineStatus: (partial.pipelineStatus as PipelineStatus) ?? 'active',
    previousEndDate: partial.previousEndDate?.trim() ?? '',
    interestLoggedAt: partial.interestLoggedAt?.trim() ?? '',
    isLegacy: partial.isLegacy ?? false,
    createdAt: now,
    updatedAt: now,
    createdBy,
    vehicleType: (partial.vehicleType as VehicleType) ?? 'موتوسيكل',
    workedBefore: partial.workedBefore ?? 'لا',
    governorate: partial.governorate?.trim() ?? '',
    zone: partial.zone?.trim() ?? '',
    hiringDecision: (partial.hiringDecision as HiringDecision) ?? 'قيد المراجعة',
    notHiredReason: partial.notHiredReason?.trim() ?? '',
    lecturePlannedDate: partial.lecturePlannedDate?.trim() ?? '',
    lectureConfirmed: (partial.lectureConfirmed as ConfirmationStatus) ?? 'غير مؤكد',
    activationConfirmed: (partial.activationConfirmed as ConfirmationStatus) ?? 'غير مؤكد',
    equipmentNotReceivedReason: partial.equipmentNotReceivedReason?.trim() ?? '',
    equipmentExpectedDate: partial.equipmentExpectedDate?.trim() ?? '',
    dataSource: partial.dataSource ?? 'direct',
    assignedSupervisorCode: partial.assignedSupervisorCode?.trim() ?? '',
    assignmentStatus: (partial.assignmentStatus as AssignmentStatus) ?? 'غير محدد',
    finalAssignedSupervisorCode: partial.finalAssignedSupervisorCode?.trim() ?? '',
    assignedAt: partial.assignedAt?.trim() ?? '',
    assignmentNote: partial.assignmentNote?.trim() ?? '',
  };
}
