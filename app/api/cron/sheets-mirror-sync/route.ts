import { NextRequest, NextResponse } from 'next/server';
import { isCronAuthorized } from '@/lib/cronAuth';
import { isMirrorSyncEnabled } from '@/lib/mirror/config';
import { closeMirrorDb } from '@/lib/mirror/db/client';
import { syncSheetsToMirror } from '@/lib/mirror/sync/syncSheetsToMirror';
import { logStructured } from '@/lib/requestTrace';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

/**
 * Sheets → Neon mirror sync cron. OFF unless MIRROR_SYNC_ENABLED=true.
 * Never writes to Google Sheets. Does not enable dashboard reads (separate flag).
 */
export async function GET(req: NextRequest) {
  if (!isCronAuthorized(req)) {
    return NextResponse.json({ success: false, error: 'Unauthorized cron' }, { status: 401 });
  }

  if (!isMirrorSyncEnabled()) {
    return NextResponse.json(
      {
        success: false,
        error: 'MIRROR_SYNC_ENABLED is not true — cron sync disabled by design',
      },
      { status: 503 }
    );
  }

  try {
    logStructured('info', 'mirror_sync_started', { route: 'sheets-mirror-sync' });
    const summary = await syncSheetsToMirror();
    await closeMirrorDb();
    return NextResponse.json(
      { success: summary.allOk, ...summary },
      { status: summary.allOk ? 200 : 207 }
    );
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}
