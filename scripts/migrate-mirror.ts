/**
 * Apply Neon mirror schema (read-replica tables only).
 * Usage: npm run migrate:mirror
 */
import { config } from 'dotenv';
import path from 'path';
import { closeMirrorDb, isMirrorDbConfigured, runMirrorMigrations } from '../lib/mirror/db/client';

config({ path: path.resolve('.env.local') });
config({ path: path.resolve('.env.vercel.prod') });

async function main() {
  if (!isMirrorDbConfigured()) {
    console.error('Set MIRROR_DATABASE_URL or POSTGRES_URL before running migrations.');
    process.exit(1);
  }
  console.log('[migrate-mirror] Applying mirror schema…');
  await runMirrorMigrations();
  console.log('[migrate-mirror] Done.');
  await closeMirrorDb();
}

main().catch((err) => {
  console.error('[migrate-mirror] failed:', err);
  process.exit(1);
});
