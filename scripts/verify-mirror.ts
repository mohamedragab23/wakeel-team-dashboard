/**
 * Verify Neon mirror status (read-only).
 * Usage: npm run verify:mirror
 */
import { config } from 'dotenv';
import path from 'path';
import {
  getMirrorDatabaseUrl,
  isMirrorDbConfigured,
  isMirrorReadEnabled,
  isMirrorSyncEnabled,
  MIRROR_SHEET_NAMES,
} from '../lib/mirror/config';
import { closeMirrorDb } from '../lib/mirror/db/client';
import { getMirrorSyncStatus } from '../lib/mirror/readAdapter';

config({ path: path.resolve('.env.local') });
config({ path: path.resolve('.env.vercel.prod') });

async function main() {
  const report = {
    verifiedAt: new Date().toISOString(),
    flags: {
      NEON_READ_REPLICA_ENABLED: isMirrorReadEnabled(),
      MIRROR_SYNC_ENABLED: isMirrorSyncEnabled(),
    },
    database: {
      configured: isMirrorDbConfigured(),
      urlPresent: Boolean(getMirrorDatabaseUrl()),
    },
    supportedSheets: MIRROR_SHEET_NAMES,
    syncState: [] as Awaited<ReturnType<typeof getMirrorSyncStatus>>,
    activated: false,
    verdict: 'NOT_ACTIVATED',
  };

  if (isMirrorDbConfigured()) {
    report.syncState = await getMirrorSyncStatus();
    report.activated = isMirrorReadEnabled() && report.syncState.some((s) => s.row_count > 0);
    report.verdict = report.activated
      ? 'ACTIVE'
      : report.syncState.length > 0
        ? 'SYNCED_READS_OFF'
        : 'SCHEMA_ONLY_OR_EMPTY';
  }

  console.log(JSON.stringify(report, null, 2));
  await closeMirrorDb();
}

main().catch((e) => {
  console.error('[verify-mirror] failed:', e);
  process.exit(1);
});
