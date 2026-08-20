/**
 * Narrow OOXML metadata: first worksheet `<dimension ref="..."/>`.
 * Used only for SheetJS-equivalent matrix shape (preserveSheetJsRefShape).
 * Does not parse cell values — ExcelJS remains the OOXML value reader.
 */
import JSZip from 'jszip';

export type SheetRefBox = {
  /** 1-based inclusive */
  r1: number;
  c1: number;
  r2: number;
  c2: number;
  ref: string;
};

function colLettersToNumber(letters: string): number {
  let n = 0;
  const up = letters.toUpperCase();
  for (let i = 0; i < up.length; i++) {
    n = n * 26 + (up.charCodeAt(i) - 64);
  }
  return n;
}

/** Parse A1 or A1:B5 into an inclusive box. */
export function parseSheetRef(ref: string): SheetRefBox | null {
  const trimmed = ref.trim();
  const range = trimmed.match(/^([A-Z]+)(\d+)(?::([A-Z]+)(\d+))?$/i);
  if (!range) return null;
  const c1 = colLettersToNumber(range[1]);
  const r1 = parseInt(range[2], 10);
  const c2 = range[3] ? colLettersToNumber(range[3]) : c1;
  const r2 = range[4] ? parseInt(range[4], 10) : r1;
  if (![c1, r1, c2, r2].every((n) => Number.isFinite(n) && n >= 1)) return null;
  return {
    c1: Math.min(c1, c2),
    r1: Math.min(r1, r2),
    c2: Math.max(c1, c2),
    r2: Math.max(r1, r2),
    ref: trimmed,
  };
}

function normalizeZipPath(p: string): string {
  return p.replace(/^\/+/, '').replace(/\\/g, '/');
}

function resolveRelTarget(baseDir: string, target: string): string {
  const t = normalizeZipPath(target);
  if (t.startsWith('xl/')) return t;
  // Targets are often "worksheets/sheet1.xml" relative to xl/
  const base = baseDir.replace(/\/+$/, '');
  const joined = normalizeZipPath(`${base}/${t}`);
  // Collapse "xl/../xl/..." if any
  const parts: string[] = [];
  for (const part of joined.split('/')) {
    if (!part || part === '.') continue;
    if (part === '..') parts.pop();
    else parts.push(part);
  }
  return parts.join('/');
}

/**
 * Read the first workbook sheet's OOXML dimension (SheetJS !ref equivalent).
 * Returns null if the package is not OOXML or dimension is missing.
 */
export async function readFirstSheetOoxmlDimension(
  input: ArrayBuffer | Buffer | Uint8Array
): Promise<SheetRefBox | null> {
  const bytes =
    input instanceof Uint8Array ? input : new Uint8Array(input as ArrayBuffer);
  let zip: JSZip;
  try {
    zip = await JSZip.loadAsync(bytes);
  } catch {
    return null;
  }

  const workbookXml = await zip.file('xl/workbook.xml')?.async('string');
  if (!workbookXml) return null;

  const sheetMatch = workbookXml.match(/<sheet\b[^>]*\/>|<sheet\b[^>]*>/i);
  if (!sheetMatch) return null;
  const ridMatch =
    sheetMatch[0].match(/r:id="([^"]+)"/i) ||
    sheetMatch[0].match(/ns2:id="([^"]+)"/i) ||
    sheetMatch[0].match(/\bid="([^"]+)"/i);
  if (!ridMatch) {
    // Fallback: first worksheets/sheet*.xml by name
    return dimensionFromSheetPath(zip, 'xl/worksheets/sheet1.xml');
  }
  const rid = ridMatch[1];

  const relsXml = await zip.file('xl/_rels/workbook.xml.rels')?.async('string');
  if (!relsXml) return dimensionFromSheetPath(zip, 'xl/worksheets/sheet1.xml');

  const relRe = /<Relationship\b[^>]*>/gi;
  let rel: RegExpExecArray | null;
  let target: string | null = null;
  while ((rel = relRe.exec(relsXml))) {
    const tag = rel[0];
    if (!tag.includes(`Id="${rid}"`) && !tag.includes(`Id='${rid}'`)) continue;
    const t = tag.match(/Target="([^"]+)"/i) || tag.match(/Target='([^']+)'/i);
    if (t) {
      target = t[1];
      break;
    }
  }
  if (!target) return dimensionFromSheetPath(zip, 'xl/worksheets/sheet1.xml');

  const sheetPath = resolveRelTarget('xl', target);
  return dimensionFromSheetPath(zip, sheetPath);
}

async function dimensionFromSheetPath(
  zip: JSZip,
  sheetPath: string
): Promise<SheetRefBox | null> {
  const path = normalizeZipPath(sheetPath);
  const xml = await zip.file(path)?.async('string');
  if (!xml) return null;
  const dim =
    xml.match(/<dimension\b[^>]*\bref="([^"]+)"[^>]*\/>/i) ||
    xml.match(/<dimension\b[^>]*\bref='([^']+)'[^>]*\/>/i);
  if (!dim) return null;
  return parseSheetRef(dim[1]);
}

/** Expand/clip matrix to an inclusive A1-style box using defval for empties. */
export function applySheetRefShape(
  matrix: unknown[][],
  box: SheetRefBox,
  defval: unknown
): unknown[][] {
  const targetRows = box.r2;
  const targetCols = box.c2;
  let out = matrix.map((row) => {
    const next = row.slice(0, targetCols);
    while (next.length < targetCols) next.push(defval);
    return next;
  });
  while (out.length < targetRows) {
    out.push(Array.from({ length: targetCols }, () => defval));
  }
  if (out.length > targetRows) out = out.slice(0, targetRows);
  return out;
}
