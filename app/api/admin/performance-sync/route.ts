import { NextRequest, NextResponse } from 'next/server';
import { verifyToken } from '@/lib/auth';
import { assertAdminApiAccess } from '@/lib/adminFeatureAccess';
import {
  approvePendingSync,
  runPerformanceSyncForDate,
  getPendingForDashboard,
  getYesterdayCairoIso,
} from '@/lib/performanceSyncService';
import { listSyncQueueEntries } from '@/lib/performanceSyncQueue';
import { isCloudflareAccessConfigured } from '@/lib/cloudflareAccess';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

export async function GET(request: NextRequest) {
  try {
    const token = request.headers.get('authorization')?.replace('Bearer ', '');
    if (!token) return NextResponse.json({ success: false, error: 'غير مصرح' }, { status: 401 });

    const decoded = verifyToken(token);
    if (!decoded || decoded.role !== 'admin') {
      return NextResponse.json({ success: false, error: 'غير مصرح' }, { status: 401 });
    }

    const deny = assertAdminApiAccess(decoded, 'performance_upload');
    if (deny) return deny;

    const pending = await getPendingForDashboard();
    const recent = (await listSyncQueueEntries()).slice(-14).reverse();

    return NextResponse.json({
      success: true,
      data: {
        pending,
        recent,
        suggestedDate: getYesterdayCairoIso(),
        tableauConfigured: !!(process.env.TABLEAU_PAT_NAME && process.env.TABLEAU_PAT_SECRET),
        cloudflareAccessConfigured: isCloudflareAccessConfigured(),
      },
    });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const token = request.headers.get('authorization')?.replace('Bearer ', '');
    if (!token) return NextResponse.json({ success: false, error: 'غير مصرح' }, { status: 401 });

    const decoded = verifyToken(token);
    if (!decoded || decoded.role !== 'admin') {
      return NextResponse.json({ success: false, error: 'غير مصرح' }, { status: 401 });
    }

    const deny = assertAdminApiAccess(decoded, 'performance_upload');
    if (deny) return deny;

    const body = await request.json().catch(() => ({}));
    const action = String(body?.action ?? 'sync').trim();
    const targetDate = String(body?.date ?? getYesterdayCairoIso()).trim();

    if (action === 'approve') {
      const result = await approvePendingSync(targetDate);
      return NextResponse.json({ success: result.status === 'done', result });
    }

    if (action === 'skip') {
      const { upsertSyncQueueEntry } = await import('@/lib/performanceSyncQueue');
      await upsertSyncQueueEntry({
        targetDate,
        status: 'skipped',
        reason: String(body?.reason ?? 'تخطي يدوي من الأدمن'),
        wakeelRows: 0,
        zeroRatio: 0,
      });
      return NextResponse.json({ success: true, message: 'تم التخطي' });
    }

    const result = await runPerformanceSyncForDate(targetDate, {
      forceApply: action === 'force',
      skipIfDone: action !== 'force',
    });

    return NextResponse.json({
      success: result.status === 'done' || result.status === 'pending',
      result,
    });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}
