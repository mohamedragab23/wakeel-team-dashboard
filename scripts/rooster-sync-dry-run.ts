/**
 * Runs the REAL `runRoosterLiveSync()` production function locally against
 * `.env.local` credentials — the exact same code the deployed
 * `/api/cron/rooster-live-sync` route calls. Useful to verify a cookie
 * change (Sheet or env) actually works end-to-end, including the dhh_token
 * mint and, if needed, the deep session-refresh self-heal, without waiting
 * for the next scheduled cron tick — and it writes a real snapshot to
 * production Redis/KV, so it also refreshes `/live-riders` immediately.
 *
 * Usage: npx tsx scripts/rooster-sync-dry-run.ts
 * (Set ROOSTER_CITY_ID as an env var first if it's not in your .env.local.)
 */
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

import { runRoosterLiveSync } from '@/lib/roosterLive/syncService';

async function main() {
  const result = await runRoosterLiveSync();
  console.log('=== runRoosterLiveSync result ===');
  console.log(JSON.stringify(result, null, 2));
  process.exit(result.success ? 0 : 1);
}

main().catch((e) => {
  console.error('FATAL', e);
  process.exit(1);
});
