/**
 * SPIKE ONLY — supervisor/deductions-upload Excel read
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import * as XLSX from 'xlsx';
import { readFirstSheetObjects } from '@/lib/excelAdapter';

function productionObjects(buf: Buffer): Record<string, unknown>[] {
  const workbook = XLSX.read(buf, { type: 'buffer', cellDates: true });
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  return XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: '' });
}

function normalizeHeader(h: string): string {
  return h.toString().trim().replace(/\s+/g, ' ').toLowerCase();
}

function mapRowFromObject(obj: Record<string, unknown>) {
  const keys = Object.keys(obj);
  const norm: Record<string, string> = {};
  for (const k of keys) norm[normalizeHeader(k)] = k;
  const pick = (...candidates: string[]): string => {
    for (const c of candidates) {
      const n = normalizeHeader(c);
      if (norm[n] !== undefined) {
        const v = obj[norm[n]];
        return v !== undefined && v !== null ? String(v).trim() : '';
      }
    }
    return '';
  };
  const riderCode = pick('كود المندوب', 'كود_المندوب', 'code', 'rider code', 'rider_code');
  const amountStr = pick('قيمة الاستقطاع', 'قيمة_الاستقطاع', 'amount', 'value', 'القيمة');
  if (!riderCode) return null;
  const amount = Number(String(amountStr).replace(/,/g, ''));
  if (Number.isNaN(amount)) return null;
  return { riderCode, amount };
}

function writeSupervisorGolden(): Buffer {
  const ws = XLSX.utils.aoa_to_sheet([
    ['كود المندوب', 'اسم المندوب', 'قيمة الاستقطاع', 'سبب الاستقطاع', 'الزون'],
    ['4802535', 'Ali', 150.5, 'equipment', 'Cairo'],
    ['4801001', 'Omar', '1,234.50', 'bag', 'Giza'],
  ]);
  const book = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(book, ws, 'deductions');
  return Buffer.from(XLSX.write(book, { type: 'buffer', bookType: 'xlsx' }) as Buffer);
}

describe('SPIKE: supervisor deductions-upload cellDates:true vs adapter native', () => {
  it('native dateMode: mapRowFromObject parity row-by-row', async () => {
    const buf = writeSupervisorGolden();
    const prod = productionObjects(buf);
    const adapter = await readFirstSheetObjects(buf, {
      raw: true,
      dateMode: 'native',
      defval: '',
      legacyXlsFallback: true,
    });
    const prodMapped = prod.map(mapRowFromObject);
    const adapterMapped = adapter.map(mapRowFromObject);
    assert.deepEqual(adapterMapped, prodMapped);
    assert.equal(prodMapped[0]?.amount, 150.5);
    assert.equal(prodMapped[1]?.amount, 1234.5);
  });
});
