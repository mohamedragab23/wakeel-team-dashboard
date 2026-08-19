import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { readWorkbook } from '@/lib/excelAdapter';
import { BULK_TEMPLATE_HEADERS } from '@/lib/riderStrategic/bulkImport';
import {
  RIDER_STRATEGIC_TEMPLATE_SHEET,
  buildRiderStrategicTemplateBuffer,
} from '@/lib/riderStrategic/templateExcel';

describe('riderStrategic templateExcel', () => {
  it('writes قالب with only the bulk-template Arabic header row', async () => {
    const loaded = await readWorkbook(await buildRiderStrategicTemplateBuffer());
    assert.deepEqual(loaded.sheetNames, [RIDER_STRATEGIC_TEMPLATE_SHEET]);
    const matrix = loaded.sheetToMatrix(RIDER_STRATEGIC_TEMPLATE_SHEET, { raw: true, defval: '' });
    assert.equal(matrix.length, 1);
    assert.deepEqual(matrix[0], [...BULK_TEMPLATE_HEADERS]);
    assert.equal(matrix[0][0], 'كود الطيار');
  });
});
