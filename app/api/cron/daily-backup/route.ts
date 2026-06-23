import { NextRequest, NextResponse } from 'next/server';
import { runDailyBackups } from '@/lib/backup/dailyBackupService';
import { isCronAuthorized } from '@/lib/cronAuth';
import { logStructured } from '@/lib/requestTrace';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

/**
 * Daily read-only backup cron — Sheets export + Neon inventory + R2 inventory.
 * Archives to R2 under backups/daily/{timestamp}/ (does not modify ticketing objects).
 */
export async function GET(req: NextRequest) {
  try {
    if (!isCronAuthorized(req)) {
      logStructured('warn', 'cron_unauthorized', { route: 'daily-backup' });
      return NextResponse.json({ success: false, error: 'Unauthorized cron' }, { status: 401 });
    }

    logStructured('info', 'daily_backup_started', { route: 'daily-backup' });
    const summary = await runDailyBackups({ uploadToR2: true });

    const status = summary.allOk ? 200 : 207;
    logStructured(summary.allOk ? 'info' : 'warn', 'daily_backup_finished', {
      route: 'daily-backup',
      allOk: summary.allOk,
      stamp: summary.stamp,
    });

    return NextResponse.json({ success: summary.allOk, ...summary }, { status });
  } catch (error: unknown) {
    console.error('[api/cron/daily-backup]', error);
    const msg = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}
