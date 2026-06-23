import { getMirrorSql } from '@/lib/mirror/db/client';
import { isMirrorDbConfigured } from '@/lib/mirror/config';

function parseRowData(data: unknown): any[] {
  if (Array.isArray(data)) return data as any[];
  if (typeof data === 'string') {
    try {
      const parsed = JSON.parse(data);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }
  return [];
}

/** Row-by-row load (validation / audit). */
export async function loadMirrorSheetRows(sheetName: string): Promise<any[][] | null> {
  if (!isMirrorDbConfigured()) return null;
  const db = getMirrorSql();
  const rows = await db<{ row_index: number; row_data: unknown }[]>`
    SELECT row_index, row_data
    FROM mirror_sheet_rows
    WHERE sheet_name = ${sheetName}
    ORDER BY row_index ASC
  `;
  if (rows.length === 0) return null;
  return rows.map((r) => parseRowData(r.row_data));
}

/**
 * Single-round-trip aggregated read (optimized path for preview/production mirror reads).
 * Additive — same data as loadMirrorSheetRows when sync is consistent.
 */
export async function loadMirrorSheetRowsAggregated(sheetName: string): Promise<any[][] | null> {
  if (!isMirrorDbConfigured()) return null;
  const db = getMirrorSql();
  const res = await db<{ rows: unknown }[]>`
    SELECT COALESCE(
      jsonb_agg(row_data ORDER BY row_index),
      '[]'::jsonb
    ) AS rows
    FROM mirror_sheet_rows
    WHERE sheet_name = ${sheetName}
  `;
  const agg = res[0]?.rows;
  if (!agg || !Array.isArray(agg) || agg.length === 0) return null;
  return (agg as unknown[]).map((r) => parseRowData(r));
}

export async function getMirrorRowCount(sheetName: string): Promise<number> {
  if (!isMirrorDbConfigured()) return 0;
  const db = getMirrorSql();
  const res = await db<{ c: number }[]>`
    SELECT COUNT(*)::int AS c FROM mirror_sheet_rows WHERE sheet_name = ${sheetName}
  `;
  return Number(res[0]?.c ?? 0);
}
