import { NextRequest, NextResponse } from 'next/server';
import { buildStrategicOpsReport } from '@/lib/strategicOps/buildReport';
import { gatherSystemHealthMetrics } from '@/lib/strategicOps/systemHealth';
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

const HEALTH_TTL_MS = 2 * 60 * 1000;
const APP_VERSION = process.env.npm_package_version || process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7) || '1.0.0';

export async function GET(request: NextRequest) {
  try {
    const auth = requireStrategicOpsAdmin(request, 'strategic-ops-health');
    if (!auth.ok) return auth.response;

    const parsed = parseStrategicOpsFilters(request);
    if (!parsed.ok) return parsed.response;
    const { filters } = parsed;

    const cacheKey = CACHE_KEYS.strategicOpsSystemHealth(filters);
    const cached = await tieredCacheGet<unknown>(cacheKey, HEALTH_TTL_MS);
    if (cached) {
      return NextResponse.json({ success: true, data: cached, cached: true });
    }

    const t0 = Date.now();
    const report = await buildStrategicOpsReport(filters);
    const apiResponseTimeMs = Date.now() - t0;

    const auditKey = CACHE_KEYS.strategicOpsLiveAudit(filters);
    const liveAudit = await tieredCacheGet<Awaited<ReturnType<typeof runLiveAudit>>>(
      auditKey,
      10 * 60 * 1000
    );

    const health = await gatherSystemHealthMetrics({
      report,
      liveAudit,
      filters,
      apiResponseTimeMs,
      version: APP_VERSION,
    });

    await tieredCacheSet(cacheKey, health, HEALTH_TTL_MS);
    return NextResponse.json({ success: true, data: health, cached: false });
  } catch (error: unknown) {
    console.error('[Strategic Ops System Health]', error);
    const msg = error instanceof Error ? error.message : 'حدث خطأ';
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}
