import { createWorkbook } from '@/lib/excelAdapter';

export const GHOST_RIDERS_SHEET = 'Ghost Riders';
export const GHOST_SUMMARY_SHEET = 'ملخص';

export const GHOST_RIDERS_COLUMNS = [
  'كود المندوب (في ملف الأداء)',
  'الاسم (إن وُجد)',
  'عدد أيام العمل',
  'إجمالي الساعات',
  'إجمالي الأوردرات',
  'متوسط يومي (ساعات)',
  'الفئة',
  'السبب',
  'الحالة',
  'كود في القائمة الرسمية',
  'ملاحظات',
] as const;

export const GHOST_RIDERS_COL_WIDTHS = [30, 35, 18, 18, 20, 22, 30, 50, 30, 25, 60];
export const GHOST_SUMMARY_COLUMNS = ['المقياس', 'القيمة'] as const;
export const GHOST_SUMMARY_COL_WIDTHS = [30, 50];

export async function buildGhostRidersExcelBuffer(
  excelData: Record<string, unknown>[],
  summaryData: Record<string, unknown>[]
): Promise<Buffer> {
  const wb = createWorkbook();
  wb.addJsonSheet(GHOST_RIDERS_SHEET, excelData, {
    columns: [...GHOST_RIDERS_COLUMNS],
    colWidths: GHOST_RIDERS_COL_WIDTHS,
  });
  wb.addJsonSheet(GHOST_SUMMARY_SHEET, summaryData, {
    columns: [...GHOST_SUMMARY_COLUMNS],
    colWidths: GHOST_SUMMARY_COL_WIDTHS,
  });
  return wb.writeBuffer();
}
