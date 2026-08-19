import { readFirstSheetMatrix } from '@/lib/excelAdapter';

/** SheetJS equivalent: XLSX.read(type array) + sheet_to_json({ header: 1 }) with raw serial dates. */
export async function readStrategicBulkMatrix(
  input: ArrayBuffer | Buffer | Uint8Array,
  filename?: string
): Promise<unknown[][]> {
  return readFirstSheetMatrix(input, {
    filename,
    raw: true,
    defval: '',
    dateMode: 'excel-serial',
    legacyXlsFallback: true,
  });
}
