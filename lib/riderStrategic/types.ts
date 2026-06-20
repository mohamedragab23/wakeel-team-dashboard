export const SHEET_STRATEGIC_RIDERS = 'بيانات_المناديب_الاستراتيجية';
export const SHEET_STRATEGIC_AUDIT = 'سجل_بيانات_المناديب_الاستراتيجية';

export const STRATEGIC_RIDER_HEADERS = [
  'كود_الطيار',
  'الاسم',
  'تاريخ_الانضمام_الفعلي',
  'نوع_الطيار',
  'التارجت_اليومي',
  'حالة_الطيار',
  'ملاحظات_المشرف',
  'تاريخ_آخر_نشاط',
  'أيام_منذ_آخر_نشاط',
  'سبب_الإقالة',
  'تاريخ_الإقالة',
  'مستوى_الخطورة',
  'كود_المشرف',
  'اسم_المشرف',
  'تاريخ_آخر_متابعة',
  'تاريخ_التحديث',
  'محدث_بواسطة',
] as const;

export const AUDIT_LOG_HEADERS = [
  'كود_الطيار',
  'الحقل',
  'القيمة_القديمة',
  'القيمة_الجديدة',
  'كود_المعدّل',
  'اسم_المعدّل',
  'التاريخ',
  'المصدر',
] as const;

export const RIDER_TYPE_OPTIONS = [
  'Full Time',
  'Part Time',
  'Weekend Only',
  'Seasonal',
] as const;

export type RiderTypeOption = (typeof RIDER_TYPE_OPTIONS)[number];

export const RIDER_STATUS_OPTIONS = [
  'نشط',
  'غير نشط',
  'موقوف',
  'إجازة',
  'تحت المتابعة',
] as const;

export type RiderStatusOption = (typeof RIDER_STATUS_OPTIONS)[number];

export type RiskLevel = 'green' | 'yellow' | 'red' | 'unknown';

export const RISK_LABELS_AR: Record<RiskLevel, string> = {
  green: 'أخضر — نشط خلال ٣ أيام',
  yellow: 'أصفر — ٤–٧ أيام بدون نشاط',
  red: 'أحمر — أكثر من ٧ أيام بدون نشاط',
  unknown: 'غير معروف — لا يوجد نشاط مسجل',
};

export type RiderStrategicProfile = {
  riderCode: string;
  name: string;
  actualJoinDate: string;
  riderType: RiderTypeOption | '';
  dailyTargetHours: number;
  currentStatus: RiderStatusOption | '';
  supervisorNotes: string;
  lastActivityDate: string | null;
  daysSinceLastActivity: number | null;
  resignationReason: string;
  resignationDate: string;
  riskLevel: RiskLevel;
  activationOwnerCode: string;
  activationOwnerName: string;
  lastFollowUpDate: string;
  updatedAt: string;
  updatedBy: string;
  sheetRow: number | null;
  missingJoinDate: boolean;
  canEdit: boolean;
};

export type RiderStrategicEditableFields = {
  actualJoinDate?: string;
  riderType?: RiderTypeOption | '';
  dailyTargetHours?: number;
  currentStatus?: RiderStatusOption | '';
  supervisorNotes?: string;
  lastFollowUpDate?: string;
};

export type StrategicAuditEntry = {
  riderCode: string;
  field: string;
  oldValue: string;
  newValue: string;
  changedBy: string;
  changedByName: string;
  timestamp: string;
  source: string;
};

export type RiderStrategicAnalytics = {
  averageRiderLifetimeDays: number;
  lifetimeSampleCount: number;
  riderTypeDistribution: Array<{ type: string; count: number; percent: number }>;
  riskRiders: Array<{
    riderCode: string;
    name: string;
    riskLevel: RiskLevel;
    daysSinceLastActivity: number | null;
    supervisorCode: string;
    supervisorName: string;
  }>;
  inactiveRiders: Array<{
    riderCode: string;
    name: string;
    currentStatus: string;
    daysSinceLastActivity: number | null;
    supervisorCode: string;
  }>;
  upcomingAttrition: Array<{
    riderCode: string;
    name: string;
    resignationDate: string;
    resignationReason: string;
    supervisorCode: string;
  }>;
  supervisorFollowUpCompliance: Array<{
    supervisorCode: string;
    supervisorName: string;
    assignedRiders: number;
    followedUpWithin7Days: number;
    compliancePercent: number;
    overdueRiders: number;
  }>;
};
