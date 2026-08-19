import { createWorkbook } from '@/lib/excelAdapter';

export const RIDERS_PERFORMANCE_SHEET = 'أداء المناديب';

export const RIDERS_PERFORMANCE_COLUMNS = [
  'كود المندوب',
  'اسم المندوب',
  'الحالة التشغيلية',
  'انتهاء العقد',
  'التاريخ/الفترة',
  'عدد أيام العمل',
  'ساعات العمل',
  'البريك',
  'التأخير',
  'الغياب',
  'الطلبات',
  'نسبة القبول %',
  'المديونية',
] as const;

export const RIDERS_PERFORMANCE_COL_WIDTHS = [14, 22, 14, 14, 22, 12, 12, 10, 10, 10, 10, 14, 12];

export async function buildRidersPerformanceExcelBuffer(
  rows: Record<string, unknown>[]
): Promise<Buffer> {
  const wb = createWorkbook();
  wb.addJsonSheet(RIDERS_PERFORMANCE_SHEET, rows, {
    columns: [...RIDERS_PERFORMANCE_COLUMNS],
    colWidths: RIDERS_PERFORMANCE_COL_WIDTHS,
  });
  return wb.writeBuffer();
}

export function ridersPerformanceFileName(startDate?: string, endDate?: string): string {
  const safeStart = (startDate || '').replaceAll(':', '-');
  const safeEnd = (endDate || '').replaceAll(':', '-');
  const suffix =
    safeStart && safeEnd ? `${safeStart}_to_${safeEnd}` : new Date().toISOString().split('T')[0];
  return `riders_performance_${suffix}.xlsx`;
}
