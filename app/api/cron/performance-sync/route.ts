import { NextRequest, NextResponse } from 'next/server';
import { runDailyPerformanceSync } from '@/lib/performanceSyncService';
import { isCronAuthorized } from '@/lib/cronAuth';
import { logStructured } from '@/lib/requestTrace';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

export async function GET(req: NextRequest) {
  try {
    if (!isCronAuthorized(req)) {
      logStructured('warn', 'cron_unauthorized', { route: 'performance-sync' });
      return NextResponse.json({ success: false, error: 'Unauthorized cron' }, { status: 401 });
    }

    const result = await runDailyPerformanceSync();

    return NextResponse.json({
      success: true,
      yesterday: result.yesterday,
      backlog: result.backlog,
    });
  } catch (error: unknown) {
    console.error('[api/cron/performance-sync]', error);
    const msg = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}
