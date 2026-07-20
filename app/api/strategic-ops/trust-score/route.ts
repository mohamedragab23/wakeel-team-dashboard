import { NextRequest, NextResponse } from 'next/server';
import { buildStrategicOpsReport } from '@/lib/strategicOps/buildReport';
import { calculateTrustScore } from '@/lib/strategicOps/trust';
import { runLiveAudit } from '@/lib/strategicOps/audit/liveAuditEngine';
import { CACHE_KEYS } from '@/lib/cache';
import { tieredCacheGet, tieredCacheSet } from '@/lib/tieredCache';
import {
  parseStrategicOpsFilters,
  requireStrategicOpsAdmin,
} from '@/lib/strategicOps/apiAuth';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 120;

const TRUST_TTL_MS = 5 * 60 * 1000;
const HISTORY_TTL_MS = 24 * 60 * 60 * 1000;

export async function GET(request: NextRequest) {
  try {
    const auth = requireStrategicOpsAdmin(request, 'strategic-ops-trust');
    if (!auth.ok) return auth.response;

    const parsed = parseStrategicOpsFilters(request);
    if (!parsed.ok) return parsed.response;
    const { filters } = parsed;

    const cacheKey = CACHE_KEYS.strategicOpsTrustScore(filters);
    const cached = await tieredCacheGet<{ trustScore: unknown; generatedAt: string }>(
      cacheKey,
      TRUST_TTL_MS
    );
    if (cached) {
      return NextResponse.json({ success: true, data: cached.trustScore, cached: true });
    }

    const t0 = Date.now();
    const report = await buildStrategicOpsReport(filters);

    // Prefer cached live audit if present (do not force heavy recompute)
    const auditKey = CACHE_KEYS.strategicOpsLiveAudit(filters);
    let liveAudit = await tieredCacheGet<Awaited<ReturnType<typeof runLiveAudit>>>(
      auditKey,
      10 * 60 * 1000
    );

    const includeAudit = new URL(request.url).searchParams.get('includeAudit') === '1';
    if (!liveAudit && includeAudit) {
      liveAudit = await runLiveAudit(filters, report);
      await tieredCacheSet(auditKey, liveAudit, 10 * 60 * 1000);
    }

    const historyKey = CACHE_KEYS.strategicOpsTrustHistory(filters);
    const previousScores =
      (await tieredCacheGet<number[]>(historyKey, HISTORY_TTL_MS)) ?? [];

    const trustScore = calculateTrustScore({
      report,
      liveAudit,
      apiHealthScore:
        Date.now() - t0 < 3000 ? 100 : Date.now() - t0 < 8000 ? 80 : 55,
      previousScores,
    });

    const nextHistory = [...previousScores, trustScore.overall].slice(-5);
    await tieredCacheSet(historyKey, nextHistory, HISTORY_TTL_MS);
    await tieredCacheSet(cacheKey, { trustScore, generatedAt: trustScore.lastCalculated }, TRUST_TTL_MS);

    return NextResponse.json({ success: true, data: trustScore, cached: false });
  } catch (error: unknown) {
    console.error('[Strategic Ops Trust Score]', error);
    const msg = error instanceof Error ? error.message : 'حدث خطأ';
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}
