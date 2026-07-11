import { NextRequest, NextResponse } from 'next/server';
import { isCronAuthorized } from '@/lib/cronAuth';
import { runRoosterLiveSync } from '@/lib/roosterLive/syncService';
import { logStructured } from '@/lib/requestTrace';

export const dynamic = 'force-dynamic';

/**
 * Triggered every ~60s by an EXTERNAL scheduler (cron-job.org / GitHub
 * Actions / QStash) — Vercel Cron cannot reliably guarantee 60s resolution,
 * so this route is intentionally not (only) wired into vercel.json.
 *
 * Auth: identical mechanism to the existing crons (`lib/cronAuth.ts`,
 * `CRON_SECRET`) — no new auth logic introduced.
 */
export async function GET(req: NextRequest) {
  if (!isCronAuthorized(req)) {
    logStructured('warn', 'cron_unauthorized', { route: 'rooster-live-sync' });
    return NextResponse.json({ success: false, error: 'Unauthorized cron' }, { status: 401 });
  }

  const result = await runRoosterLiveSync();
  return NextResponse.json(result, { status: result.success ? 200 : 502 });
}
