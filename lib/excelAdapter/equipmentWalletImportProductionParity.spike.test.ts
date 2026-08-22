/**
 * SPIKE ONLY — equipment-wallet-import Talabat Excel read
 *
 * Production:
 *   XLSX.read(buf, { type: 'buffer', cellDates: true })
 *   sheet_to_json(sheet, { defval: '' })
 *   parseTalabatWalletRows(json)
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import * as XLSX from 'xlsx';
import { readFirstSheetObjects } from '@/lib/excelAdapter';
import { parseTalabatWalletRows } from '@/lib/equipmentDeductions/talabatWalletSource';

function productionObjects(buf: Buffer): Record<string, unknown>[] {
  const workbook = XLSX.read(buf, { type: 'buffer', cellDates: true });
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  return XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: '' });
}

function writeTalabatWallet(): Buffer {
  const ws: XLSX.WorkSheet = {
    A1: { t: 's', v: 'Rider ID' },
    B1: { t: 's', v: '3Pl Internal Deductions' },
    C1: { t: 's', v: 'Applaied Deduction on Wallet' },
    A2: { t: 'n', v: 4802535 },
    B2: { t: 'n', v: 200 },
    C2: { t: 'n', v: 150.5 },
    A3: { t: 's', v: '4801001' },
    B3: { t: 's', v: '0' },
    C3: { t: 's', v: '1,234.50' },
    '!ref': 'A1:C3',
  };
  const book = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(book, ws, 'Wallet');
  return Buffer.from(XLSX.write(book, { type: 'buffer', bookType: 'xlsx' }) as Buffer);
}

describe('SPIKE: equipment wallet import cellDates:true vs adapter native', () => {
  it('native dateMode: parseTalabatWalletRows parity', async () => {
    const buf = writeTalabatWallet();
    const prod = productionObjects(buf);
    const adapter = await readFirstSheetObjects(buf, {
      raw: true,
      dateMode: 'native',
      defval: '',
      legacyXlsFallback: true,
    });
    assert.deepEqual(parseTalabatWalletRows(adapter), parseTalabatWalletRows(prod));
    const parsed = parseTalabatWalletRows(prod);
    assert.equal(parsed.rows.length, 2);
    assert.equal(parsed.rows[0].actualWalletDeductionMilli, 15050);
    assert.equal(parsed.rows[1].applaiedDeductionOnWalletEgp, 1234.5);
  });
});
