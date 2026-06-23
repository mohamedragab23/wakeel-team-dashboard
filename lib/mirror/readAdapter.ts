import { getMirrorSql } from '@/lib/mirror/db/client';
import { isMirrorDbConfigured, isMirrorReadEnabled, type MirrorSheetName } from '@/lib/mirror/config';
import { loadMirrorSheetRowsAggregated } from '@/lib/mirror/validation/loadMirrorRows';

/** Reconstruct sheet matrix from mirror rows (read-only). Returns null if empty or DB off. */
export async function tryGetMirrorSheetData(
  sheetName: string,
  rangeOverride?: string
): Promise<any[][] | null> {
  if (!isMirrorReadEnabled() || !isMirrorDbConfigured()) return null;
  if (rangeOverride) return null; // mirror stores full tab only

  try {
    const db = getMirrorSql();
    const state = await db<{ row_count: number }[]>`
      SELECT row_count FROM mirror_sync_state WHERE sheet_name = ${sheetName} LIMIT 1
    `;
    if (!state[0]?.row_count) return null;

    const rows = await loadMirrorSheetRowsAggregated(sheetName);
    if (!rows || rows.length === 0) return null;

    return rows;
  } catch (e) {
    console.warn('[mirror/readAdapter] read failed, falling back to Sheets:', e);
    return null;
  }
}

export async function getMirrorSyncStatus(): Promise<
  Array<{ sheet_name: string; row_count: number; last_sync_at: string | null }>
> {
  if (!isMirrorDbConfigured()) return [];
  try {
    const db = getMirrorSql();
    return await db`
      SELECT sheet_name, row_count, last_sync_at::text
      FROM mirror_sync_state
      ORDER BY sheet_name
    `;
  } catch (e: unknown) {
    const code = (e as { code?: string })?.code;
    if (code === '42P01') return [];
    throw e;
  }
}

export function mirrorSupportsSheet(sheetName: string): sheetName is MirrorSheetName {
  return ['المناديب', 'المشرفين', 'البيانات اليومية', 'إعدادات_الرواتب'].includes(sheetName);
}
