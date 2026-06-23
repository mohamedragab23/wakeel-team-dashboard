import { NextResponse } from 'next/server';
import { REQUEST_ID_HEADER } from '@/lib/requestTrace';

export const dynamic = 'force-dynamic';

/** Lightweight liveness check — no external dependencies. */
export async function GET() {
  return NextResponse.json({
    ok: true,
    service: 'next',
    time: new Date().toISOString(),
    traceHeader: REQUEST_ID_HEADER,
  });
}
