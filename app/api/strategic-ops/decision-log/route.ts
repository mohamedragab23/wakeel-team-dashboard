import { NextRequest, NextResponse } from 'next/server';
import { requireStrategicOpsAdmin } from '@/lib/strategicOps/apiAuth';
import { buildRecommendationPerformance, getDecisionLog, markDecisionExecuted } from '@/lib/strategicOps/decisionLearning/store';
import { checkApiRateLimit, rateLimitResponse } from '@/lib/apiRateLimit';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 60;

/** SRS-011 Part 11 — Decision Effectiveness & Learning.
 *  GET  → the full decision log + the aggregated "AI Recommendation Performance" dashboard.
 *  POST → manual check-in: { id, executed: boolean } marks whether a recommendation was executed. */
export async function GET(request: NextRequest) {
  try {
    const auth = await requireStrategicOpsAdmin(request, 'strategic-ops-decision-log');
    if (!auth.ok) return auth.response;

    const log = await getDecisionLog();
    const performance = buildRecommendationPerformance(log);

    return NextResponse.json({ success: true, data: { log, performance } });
  } catch (error: unknown) {
    console.error('[Strategic Ops Decision Log]', error);
    const msg = error instanceof Error ? error.message : 'حدث خطأ';
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const auth = await requireStrategicOpsAdmin(request, 'strategic-ops-decision-log-write');
    if (!auth.ok) return auth.response;

    const limited = checkApiRateLimit('strategic-ops-decision-log-write', auth.code, 30, 60_000);
    if (!limited.allowed) {
      return NextResponse.json(rateLimitResponse(limited.retryAfterSec), { status: 429 });
    }

    const body = await request.json().catch(() => null);
    const id = typeof body?.id === 'string' ? body.id : null;
    const executed = typeof body?.executed === 'boolean' ? body.executed : null;
    if (!id || executed === null) {
      return NextResponse.json({ success: false, error: 'المطلوب: id و executed (boolean)' }, { status: 400 });
    }

    const result = await markDecisionExecuted(id, executed, auth.code);
    if (!result.success) {
      return NextResponse.json({ success: false, error: result.error ?? 'فشل التحديث' }, { status: 404 });
    }

    return NextResponse.json({ success: true });
  } catch (error: unknown) {
    console.error('[Strategic Ops Decision Log POST]', error);
    const msg = error instanceof Error ? error.message : 'حدث خطأ';
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}
