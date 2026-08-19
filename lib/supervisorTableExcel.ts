import { createWorkbook } from '@/lib/excelAdapter';

export async function buildSupervisorTableExcelBuffer(
  rows: Record<string, string | number | null | undefined>[],
  sheetName: string
): Promise<Buffer> {
  const wb = createWorkbook();
  const columns = rows.length ? Object.keys(rows[0]) : [];
  wb.addJsonSheet(sheetName.slice(0, 31) || 'Sheet1', rows, { columns });
  return wb.writeBuffer();
}
