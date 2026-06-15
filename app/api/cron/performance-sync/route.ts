import { NextRequest, NextResponse } from 'next/server';
import { runDailyPerformanceSync } from '@/lib/performanceSyncService';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

function isAuthorizedCron(req: NextRequest): boolean {
  const vercelCron = req.headers.get('x-vercel-cron');
  if (vercelCron) return true;
  const secret = process.env.CRON_SECRET?.trim();
  if (!secret) return false;
  const headerSecret = req.headers.get('x-cron-secret')?.trim();
  return headerSecret === secret;
}

export async function GET(req: NextRequest) {
  try {
    if (!isAuthorizedCron(req)) {
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
