import { NextRequest, NextResponse } from 'next/server';
import { isCronAuthorized } from '@/lib/cronAuth';
import { runOpsValidationFull } from '@/lib/strategicOps/opsValidation';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 300;

/**
 * SRS-008 §17 — Scheduled validation runner (daily / weekly via vercel.json).
 * Query: ?cadence=daily|weekly|monthly
 */
export async function GET(request: NextRequest) {
  if (!isCronAuthorized(request)) {
    return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
  }

  const cadenceParam = request.nextUrl.searchParams.get('cadence');
  const day = new Date().getUTCDay(); // 0=Sun … 1=Mon
  const date = new Date().getUTCDate();
  const schedule =
    cadenceParam === 'weekly' || cadenceParam === 'monthly' || cadenceParam === 'daily'
      ? cadenceParam
      : date === 1
        ? 'monthly'
        : day === 1
          ? 'weekly'
          : 'daily';

  try {
    const report = await runOpsValidationFull({
      schedule,
      includeLive: true,
      persistHistory: true,
    });

    return NextResponse.json({
      success: true,
      data: {
        schedule,
        verdict: report.certificate.verdict,
        level: report.certificate.level,
        readinessPercent: report.certificate.readinessPercent,
        totalTests: report.certificate.totalTests,
        passed: report.certificate.passed,
        failed: report.certificate.failed,
        openIssues: report.certificate.openIssues.slice(0, 10),
        generatedAt: report.certificate.generatedAt,
      },
    });
  } catch (error: unknown) {
    console.error('[cron/ops-validation]', error);
    const msg = error instanceof Error ? error.message : 'خطأ';
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}
