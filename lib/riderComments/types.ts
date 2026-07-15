// Rider Daily Comments System
// For supervisors to log daily rider status and reasons

export type CommentCategory =
  | 'accident' // حادث
  | 'medical_leave' // إجازة مرضية
  | 'family_emergency' // عذر عائلي
  | 'equipment_issue' // مشكلة في المعدات
  | 'frequent_absences' // إجازات متكررة
  | 'vacation' // إجازة عادية
  | 'poor_performance' // أداء ضعيف
  | 'terminated' // تم إقالته
  | 'other'; // أخرى

export type RiderDailyComment = {
  id: string;
  riderCode: string;
  riderName: string;
  supervisorCode: string;
  supervisorName: string;
  date: string; // YYYY-MM-DD
  category: CommentCategory;
  expectedReturnDate?: string; // For accidents/medical - expected return date
  estimatedReturnDays?: number; // Number of days until return
  notes: string; // Free text notes
  createdAt: string; // ISO timestamp
  updatedAt: string; // ISO timestamp
};

export const COMMENT_CATEGORY_LABELS_AR: Record<CommentCategory, string> = {
  accident: 'حادث',
  medical_leave: 'إجازة مرضية',
  family_emergency: 'عذر عائلي',
  equipment_issue: 'مشكلة في المعدات',
  frequent_absences: 'إجازات متكررة',
  vacation: 'إجازة عادية',
  poor_performance: 'أداء ضعيف',
  terminated: 'تم إقالته',
  other: 'أخرى',
};

export const COMMENT_CATEGORY_ICONS: Record<CommentCategory, string> = {
  accident: '🚑',
  medical_leave: '🏥',
  family_emergency: '👨‍👩‍👧‍👦',
  equipment_issue: '🛠️',
  frequent_absences: '📅',
  vacation: '🏖️',
  poor_performance: '📉',
  terminated: '❌',
  other: '📝',
};

export const COMMENT_CATEGORY_COLORS: Record<CommentCategory, string> = {
  accident: 'red',
  medical_leave: 'orange',
  family_emergency: 'amber',
  equipment_issue: 'blue',
  frequent_absences: 'yellow',
  vacation: 'green',
  poor_performance: 'red',
  terminated: 'gray',
  other: 'slate',
};
