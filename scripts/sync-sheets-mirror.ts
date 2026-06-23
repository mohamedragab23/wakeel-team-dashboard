/**
 * Incremental Sheets → Neon mirror sync (read-only on Sheets).
 * Usage: npm run sync:mirror
 * Requires: MIRROR_SYNC_ENABLED=true (safety gate)
 */
import { config } from 'dotenv';
import path from 'path';
import { isMirrorSyncEnabled } from '../lib/mirror/config';
import { closeMirrorDb } from '../lib/mirror/db/client';
import { syncSheetsToMirror } from '../lib/mirror/sync/syncSheetsToMirror';

config({ path: path.resolve('.env.local') });
config({ path: path.resolve('.env.vercel.prod') });

async function main() {
  if (!isMirrorSyncEnabled()) {
    console.log(
      JSON.stringify({
        success: false,
        error: 'MIRROR_SYNC_ENABLED is not true — sync blocked by design',
        hint: 'Set MIRROR_SYNC_ENABLED=true to run sync',
      })
    );
    process.exit(1);
  }

  const summary = await syncSheetsToMirror();
  console.log(JSON.stringify(summary, null, 2));
  await closeMirrorDb();
  process.exit(summary.allOk ? 0 : 1);
}

main().catch((e) => {
  console.error('[sync-sheets-mirror] failed:', e);
  process.exit(1);
});
