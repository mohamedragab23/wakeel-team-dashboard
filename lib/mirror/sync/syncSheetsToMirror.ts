import { randomUUID } from 'crypto';
import { getSheetData } from '@/lib/googleSheets';
import { hashRow, hashTab } from '@/lib/mirror/hash';
import {
  isMirrorDbConfigured,
  isMirrorSheetName,
  MIRROR_SHEET_NAMES,
  type MirrorSheetName,
} from '@/lib/mirror/config';
import { getMirrorSql } from '@/lib/mirror/db/client';
import { tieredCacheDeleteByPrefix } from '@/lib/tieredCache';

export type MirrorSyncResult = {
  runId: string;
  sheetName: MirrorSheetName;
  ok: boolean;
  rowsUpserted: number;
  rowsDeleted: number;
  rowCount: number;
  error?: string;
};

async function syncOneSheet(
  runId: string,
  sheetName: MirrorSheetName,
  force = false
): Promise<MirrorSyncResult> {
  const db = getMirrorSql();
  let rowsUpserted = 0;
  let rowsDeleted = 0;

  try {
    const rows = await getSheetData(sheetName, false);
    const tabHash = hashTab(rows);

    if (!force) {
      const state = await db<{ tab_hash: string | null }[]>`
        SELECT tab_hash FROM mirror_sync_state WHERE sheet_name = ${sheetName} LIMIT 1
      `;
      if (state[0]?.tab_hash === tabHash && rows.length > 0) {
        await db`
          UPDATE mirror_sync_state
          SET last_sync_at = NOW(), last_run_id = ${runId}::uuid
          WHERE sheet_name = ${sheetName}
        `;
        return { runId, sheetName, ok: true, rowsUpserted: 0, rowsDeleted: 0, rowCount: rows.length };
      }
    }

    const BATCH = 500;
    for (let start = 0; start < rows.length; start += BATCH) {
      const chunk = rows.slice(start, start + BATCH);
      const payload = chunk.map((row, j) => {
        const i = start + j;
        const r = row as unknown[];
        return {
          sheet_name: sheetName,
          row_index: i,
          row_data: r as (string | number | boolean | null)[],
          row_hash: hashRow(r),
        };
      });

      await db`
        INSERT INTO mirror_sheet_rows ${db(payload, 'sheet_name', 'row_index', 'row_data', 'row_hash')}
        ON CONFLICT (sheet_name, row_index)
        DO UPDATE SET
          row_data = EXCLUDED.row_data,
          row_hash = EXCLUDED.row_hash,
          synced_at = NOW()
      `;
      rowsUpserted += chunk.length;
    }

    const del = await db`
      DELETE FROM mirror_sheet_rows
      WHERE sheet_name = ${sheetName} AND row_index >= ${rows.length}
    `;
    rowsDeleted = del.count ?? 0;

    await db`
      INSERT INTO mirror_sync_state (sheet_name, last_sync_at, row_count, tab_hash, last_run_id)
      VALUES (${sheetName}, NOW(), ${rows.length}, ${tabHash}, ${runId}::uuid)
      ON CONFLICT (sheet_name)
      DO UPDATE SET
        last_sync_at = NOW(),
        row_count = EXCLUDED.row_count,
        tab_hash = EXCLUDED.tab_hash,
        last_run_id = EXCLUDED.last_run_id
    `;

    await db`
      INSERT INTO mirror_audit_log (run_id, sheet_name, action, rows_upserted, rows_deleted, finished_at, ok)
      VALUES (${runId}::uuid, ${sheetName}, 'sync', ${rowsUpserted}, ${rowsDeleted}, NOW(), true)
    `;

    return { runId, sheetName, ok: true, rowsUpserted, rowsDeleted, rowCount: rows.length };
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    await db`
      INSERT INTO mirror_audit_log (run_id, sheet_name, action, rows_upserted, rows_deleted, finished_at, ok, error)
      VALUES (${runId}::uuid, ${sheetName}, 'sync', ${rowsUpserted}, ${rowsDeleted}, NOW(), false, ${msg})
    `;
    return {
      runId,
      sheetName,
      ok: false,
      rowsUpserted,
      rowsDeleted,
      rowCount: 0,
      error: msg,
    };
  }
}

export type MirrorSyncSummary = {
  runId: string;
  startedAt: string;
  finishedAt: string;
  readOnly: true;
  sheets: MirrorSyncResult[];
  allOk: boolean;
};

/** Read-only pull from Google Sheets → upsert Neon mirror. Never writes to Sheets. */
export async function syncSheetsToMirror(
  sheetNames?: MirrorSheetName[],
  options?: { force?: boolean }
): Promise<MirrorSyncSummary> {
  if (!isMirrorDbConfigured()) {
    throw new Error('Mirror database not configured (MIRROR_DATABASE_URL or POSTGRES_URL)');
  }

  const runId = randomUUID();
  const startedAt = new Date().toISOString();
  const targets = sheetNames ?? [...MIRROR_SHEET_NAMES];
  const sheets: MirrorSyncResult[] = [];

  for (const name of targets) {
    if (!isMirrorSheetName(name)) continue;
    sheets.push(await syncOneSheet(runId, name, options?.force === true));
  }

  if (sheets.some((s) => s.ok)) {
    await tieredCacheDeleteByPrefix('sheet:');
    await tieredCacheDeleteByPrefix('dashboard:');
    await tieredCacheDeleteByPrefix('riders:');
    await tieredCacheDeleteByPrefix('performance:');
    await tieredCacheDeleteByPrefix('strategic-ops:');
    await tieredCacheDeleteByPrefix('salary:');
  }

  return {
    runId,
    startedAt,
    finishedAt: new Date().toISOString(),
    readOnly: true,
    sheets,
    allOk: sheets.every((s) => s.ok),
  };
}
