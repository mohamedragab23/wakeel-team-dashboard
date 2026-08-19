/**
 * Compatibility decision (Track 3B Phase 1):
 * ExcelJS does not support legacy BIFF `.xls` (OLE Compound File).
 * The adapter rejects those files instead of attempting a silent/partial parse.
 * Production callers still use community `xlsx@0.18.5`, which can read `.xls`.
 * Phase 3A first-sheet readers keep a narrow SheetJS fallback for OLE / `.xls`
 * filenames so UI accept=".xls" is unchanged. `readWorkbook` still rejects .xls.
 */

const OLE_COMPOUND_MAGIC = [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1];

export class UnsupportedLegacyXlsError extends Error {
  readonly code = 'UNSUPPORTED_LEGACY_XLS';

  constructor(detail: string) {
    super(`Legacy .xls is not supported by excelAdapter/ExcelJS: ${detail}`);
    this.name = 'UnsupportedLegacyXlsError';
  }
}

function looksLikeOleCompound(bytes: Uint8Array): boolean {
  if (bytes.length < OLE_COMPOUND_MAGIC.length) return false;
  return OLE_COMPOUND_MAGIC.every((b, i) => bytes[i] === b);
}

function isLegacyXlsFilename(filename: string | undefined): boolean {
  if (!filename) return false;
  const n = filename.trim().toLowerCase();
  if (n.endsWith('.xlsx') || n.endsWith('.xlsm') || n.endsWith('.xlsb')) return false;
  return n.endsWith('.xls');
}

export function isLegacyXlsInput(bytes: Uint8Array, filename?: string): boolean {
  return isLegacyXlsFilename(filename) || looksLikeOleCompound(bytes);
}

export function assertNotLegacyXls(bytes: Uint8Array, filename?: string): void {
  if (isLegacyXlsFilename(filename)) {
    throw new UnsupportedLegacyXlsError(`filename ${filename}`);
  }
  if (looksLikeOleCompound(bytes)) {
    throw new UnsupportedLegacyXlsError('OLE Compound File signature (BIFF .xls)');
  }
}
