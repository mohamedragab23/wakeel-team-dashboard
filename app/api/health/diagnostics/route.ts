import { NextRequest, NextResponse } from 'next/server';
import { extractBearerToken } from '@/lib/requestAuth';
import { verifyToken } from '@/lib/auth';
import { isCronAuthorized } from '@/lib/cronAuth';
import { runHealthDiagnostics } from '@/lib/healthDiagnostics';
import { REQUEST_ID_HEADER } from '@/lib/requestTrace';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

function isDiagnosticsAuthorized(request: NextRequest): boolean {
  if (isCronAuthorized(request)) return true;

  const token = extractBearerToken(request);
  if (!token) return false;
  const decoded = verifyToken(token);
  return !!(decoded && decoded.role === 'admin');
}

/** Safe dependency diagnostics — read-only probes, no automatic recovery. */
export async function GET(request: NextRequest) {
  if (!isDiagnosticsAuthorized(request)) {
    return NextResponse.json({ success: false, error: 'غير مصرح' }, { status: 401 });
  }

  const report = await runHealthDiagnostics();
  const status = report.ok ? 200 : 503;

  return NextResponse.json(
    {
      success: report.ok,
      traceId: request.headers.get(REQUEST_ID_HEADER),
      ...report,
    },
    { status }
  );
}
