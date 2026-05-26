/** Google Sheets tab names (main spreadsheet) */
export const SHEET_MAIN_INVENTORY = 'المخزون_الرئيسي';
export const SHEET_EQUIPMENT_DELIVERY = 'تسليم_المعدات';
/** تخزين أجزاء صور التسليم (نفس ملف الشيت — بدون Drive) */
export const SHEET_EQUIPMENT_PHOTOS = 'مخزن_صور_المعدات';
export const SHEET_EQUIPMENT_RETURN = 'استرجاع_المعدات';
export const SHEET_DEDUCTIONS_IMPORT = 'الاستقطاعات';
/** صف واحد لكل عملية رفع Excel استقطاعات (لإشعار المدير في اللوحة). */
export const SHEET_DEDUCTIONS_UPLOAD_LOG = 'سجل_رفع_الاستقطاعات';
/** نتائج مقارنة استقطاع المشرفين مع شيت المحفظة/المدير */
export const SHEET_DEDUCTIONS_ACTUAL = 'الاستقطاعات_الفعلية';

/** صف رأس ورقة المقارنة (ثابت مع أعمدة تفاصيل شيت المدير) */
export const DEDUCTIONS_ACTUAL_HEADERS = [
  'تاريخ_المقارنة',
  'دورة_الاستقطاع',
  'شهر',
  'سنة',
  'كود_المندوب',
  'مجموع_قيمة_الاستقطاع_مشرف',
  'خصم_المحفظة_شيت_المدير',
  'الفرق_محفظة_ناقص_مشرف',
  'حالة_المقارنة',
  'عدد_صفوف_مشرف',
  'عدد_صفوف_مدير',
  'مدير_Rider_Name',
  'مدير_3PL',
  'مدير_City',
  'مدير_Starting_Point',
  'مدير_Vehicle',
  'مدير_Salaries',
  'مدير_Deduction',
  'مدير_Salaries_Compensation',
  'مدير_Cancelled_orders',
  'مدير_Cancelled_orders_Compensation',
  'مدير_Net_Salary',
  'مدير_Type_of_Payment',
  'مدير_3Pl_Internal_Deductions',
  'مدير_Salaries_Tips_Applied_Wallet',
  'مدير_Applied_Deduction_on_Wallet',
  'مدير_Net_After_Deduction',
  'مدير_Transfer_Type',
  'مشرف_اسم_مندوب',
  'مشرف_ملخص_سبب',
  'مشرف_ملخص_زون',
  'مشرف_أكواد_ومشرفين',
] as const;

/** أعمدة ورقة «الاستقطاعات» بعد الاستيراد من Excel */
export const DEDUCTION_IMPORT_HEADERS = [
  'تاريخ_الرفع',
  'كود_المشرف',
  'اسم_المشرف',
  'كود_المندوب',
  'اسم_المندوب',
  'قيمة_الاستقطاع',
  'السبب',
  'الزون',
  'دورة_الاستقطاع',
  'شهر',
  'سنة',
] as const;

/** أعمدة «سجل_رفع_الاستقطاعات» */
export const DEDUCTION_UPLOAD_LOG_HEADERS = [
  'تاريخ_الوقت',
  'كود_المشرف',
  'اسم_المشرف',
  'دورة_الاستقطاع',
  'شهر',
  'سنة',
  'عدد_الصفوف_المستوردة',
] as const;

export type DeductionCycleKey = 'first' | 'second' | 'third' | 'fourth' | 'closing';

/** تسمية الدورة كما تُكتب في الشيت (الأولى … التقفيلة) */
export const DEDUCTION_CYCLE_LABELS: Record<DeductionCycleKey, string> = {
  first: 'الأولى',
  second: 'الثانية',
  third: 'الثالثة',
  fourth: 'الرابعة',
  closing: 'التقفيلة',
};

export const ARABIC_MONTH_NAMES = [
  'يناير',
  'فبراير',
  'مارس',
  'أبريل',
  'مايو',
  'يونيو',
  'يوليو',
  'أغسطس',
  'سبتمبر',
  'أكتوبر',
  'نوفمبر',
  'ديسمبر',
] as const;

export function arabicMonthName(month1to12: number): string {
  if (month1to12 < 1 || month1to12 > 12) return '';
  return ARABIC_MONTH_NAMES[month1to12 - 1];
}
