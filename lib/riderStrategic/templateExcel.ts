import { createWorkbook } from '@/lib/excelAdapter';
import { BULK_TEMPLATE_HEADERS } from '@/lib/riderStrategic/bulkImport';

export const RIDER_STRATEGIC_TEMPLATE_SHEET = 'قالب';
export const RIDER_STRATEGIC_TEMPLATE_FILENAME = 'rider-strategic-template.xlsx';

export async function buildRiderStrategicTemplateBuffer(): Promise<Buffer> {
  const wb = createWorkbook();
  wb.addAoASheet(RIDER_STRATEGIC_TEMPLATE_SHEET, [BULK_TEMPLATE_HEADERS]);
  return wb.writeBuffer();
}
