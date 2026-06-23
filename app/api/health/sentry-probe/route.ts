import { NextRequest, NextResponse } from 'next/server';
import * as Sentry from '@sentry/nextjs';
import { extractBearerToken } from '@/lib/requestAuth';
import { verifyToken } from '@/lib/auth';
import { isCronAuthorized } from '@/lib/cronAuth';
import { REQUEST_ID_HEADER } from '@/lib/requestTrace';

export const dynamic = 'force-dynamic';

const PROBE_FINGERPRINT = 'wakeel-sentry-production-verify';

function isSentryConfigured(): boolean {
  return Boolean(
    process.env.NEXT_PUBLIC_SENTRY_DSN?.trim() || process.env.SENTRY_DSN?.trim()
  );
}

function isProbeAuthorized(request: NextRequest): boolean {
  if (isCronAuthorized(request)) return true;
  const token = extractBearerToken(request);
  if (!token) return false;
  const decoded = verifyToken(token);
  return !!(decoded && decoded.role === 'admin');
}

/**
 * Cron-only Sentry probe — sends a tagged test exception and sample spans.
 * No Google Sheets access. No business logic.
 */
export async function GET(request: NextRequest) {
  if (!isProbeAuthorized(request)) {
    return NextResponse.json({ success: false, error: 'غير مصرح' }, { status: 401 });
  }

  if (!isSentryConfigured()) {
    return NextResponse.json(
      { success: false, error: 'Sentry DSN not configured' },
      { status: 503 }
    );
  }

  await Sentry.startSpan({ name: 'strategic-ops.buildReport', op: 'function' }, async () => {
    await Sentry.startSpan({ name: 'ticketing.listTickets', op: 'db.query' }, async () => {
      // Span structure mirrors production API routes for tracing verification.
    });
  });

  const err = new Error(`[${PROBE_FINGERPRINT}] Sentry production verification probe`);
  const eventId = Sentry.captureException(err, {
    tags: { verify: PROBE_FINGERPRINT, source: 'health-sentry-probe' },
    fingerprint: [PROBE_FINGERPRINT],
  });

  await Sentry.flush(3000);

  return NextResponse.json({
    success: true,
    probe: PROBE_FINGERPRINT,
    eventId: eventId || null,
    traceId: request.headers.get(REQUEST_ID_HEADER),
    environment: process.env.VERCEL_ENV || process.env.NODE_ENV,
  });
}
