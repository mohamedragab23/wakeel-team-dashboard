/**
 * Checks if a code is a supervisor code (starts with WA-, e.g., WA-001, WA-016).
 */
export function isSupervisorCode(code: unknown): boolean {
  const str = String(code ?? '').trim().toUpperCase();
  return str.startsWith('WA-');
}

/**
 * Checks if a code is a rider code (numeric only, e.g., 877614, 2520149).
 */
export function isRiderCode(code: unknown): boolean {
  const str = String(code ?? '').trim();
  // Remove common quotes/formatting
  const cleaned = str
    .replace(/^[''`]+/, '')
    .replace(/^"(.*)"$/, '$1')
    .replace(/\s+/g, '')
    .trim();
  // Check if it's purely numeric (may have leading zeros)
  return /^\d+$/.test(cleaned);
}

/**
 * Normalizes a code for matching purposes.
 * - If the code is a supervisor code (WA-xxx), returns it as-is (uppercase, trimmed).
 * - If the code is a rider code (numeric), normalizes it by removing leading zeros.
 * - Otherwise, attempts numeric normalization.
 */
export function normalizeRiderCodeForPerformance(code: unknown): string {
  const raw = String(code ?? '')
    .replace(/\uFEFF/g, '')
    .trim();
  if (!raw) return '';

  // If it's a supervisor code, return it normalized (uppercase, trimmed) but NOT stripped
  if (isSupervisorCode(raw)) {
    return raw.toUpperCase().trim();
  }

  const cleaned = raw
    .replace(/^[''`]+/, '')
    .replace(/^"(.*)"$/, '$1')
    .replace(/\s+/g, '')
    .trim();
  if (!cleaned) return '';

  const westernDigits = cleaned
    .replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x0660))
    .replace(/[۰-۹]/g, (d) => String(d.charCodeAt(0) - 0x06f0));

  const compactNumeric = westernDigits.replace(/,/g, '');
  const decimalLike = compactNumeric.match(/^(\d+)\.0+$/);
  if (decimalLike) {
    return decimalLike[1].replace(/^0+/, '') || '0';
  }
  if (/^\d+(?:\.\d+)?e[+\-]?\d+$/i.test(compactNumeric)) {
    const n = Number(compactNumeric);
    if (Number.isFinite(n)) {
      const asInt = Math.trunc(n).toString();
      return asInt.replace(/^0+/, '') || '0';
    }
  }
  if (/^\d+$/.test(compactNumeric)) {
    return compactNumeric.replace(/^0+/, '') || '0';
  }

  return westernDigits.replace(/^0+/, '') || '0';
}

export function riderCodesMatch(a: unknown, b: unknown): boolean {
  const na = normalizeRiderCodeForPerformance(a);
  const nb = normalizeRiderCodeForPerformance(b);
  return na !== '' && nb !== '' && na === nb;
}

export interface RiderSheetMatch {
  dataRowIndex: number;
  sheetRowIndex: number;
  actualCode: string;
  row: unknown[];
}

/** Find all rider rows matching code (handles duplicate sheet rows). */
export function findAllRidersInSheet(ridersSheet: unknown[][], riderCode: string): RiderSheetMatch[] {
  const target = riderCode?.toString().trim();
  if (!target || ridersSheet.length < 2) return [];

  const matches: RiderSheetMatch[] = [];
  for (let i = 1; i < ridersSheet.length; i++) {
    const row = ridersSheet[i] || [];
    const sheetCode = row[0]?.toString().trim() || '';
    if (!sheetCode) continue;
    if (sheetCode === target || riderCodesMatch(sheetCode, target)) {
      matches.push({
        dataRowIndex: i,
        sheetRowIndex: i + 1,
        actualCode: sheetCode,
        row,
      });
    }
  }
  return matches;
}

/** Find rider row in المناديب sheet — exact or normalized code match. */
export function findRiderInSheet(ridersSheet: unknown[][], riderCode: string): RiderSheetMatch | null {
  return findAllRidersInSheet(ridersSheet, riderCode)[0] ?? null;
}
