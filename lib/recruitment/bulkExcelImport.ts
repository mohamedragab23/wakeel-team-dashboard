import { readFirstSheetObjects } from '@/lib/excelAdapter';
import type { CandidateInput } from './types';

export function sheetRowsToCandidates(rows: Record<string, unknown>[]): CandidateInput[] {
  return rows.map((row) => {
    const keys = Object.keys(row);
    const find = (...names: string[]) => {
      for (const n of names) {
        const k = keys.find((key) => key.toLowerCase().includes(n.toLowerCase()));
        if (k && row[k] != null) return String(row[k]).trim();
      }
      return '';
    };
    return {
      fullName: find('اسم', 'name', 'full') || String(row[keys[0]] ?? ''),
      phone: find('هاتف', 'phone', 'mobile') || String(row[keys[1]] ?? ''),
      jobAd: find('إعلان', 'job', 'ad') || 'غير محدد',
      appliedDate: find('تاريخ', 'date') || '',
    };
  });
}

/** SheetJS equivalent: XLSX.read + sheet_to_json({ defval: '' }) with raw serial dates. */
export async function readRecruitmentExcelRows(
  input: ArrayBuffer | Buffer | Uint8Array,
  filename?: string
): Promise<Record<string, unknown>[]> {
  return readFirstSheetObjects(input, {
    filename,
    raw: true,
    defval: '',
    dateMode: 'excel-serial',
    legacyXlsFallback: true,
  });
}
