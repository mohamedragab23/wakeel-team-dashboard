import { NextRequest, NextResponse } from 'next/server';
import { buildStrategicOpsReport } from '@/lib/strategicOps/buildReport';
import { buildCooModeReport } from '@/lib/strategicOps/cooMode';
import { CACHE_KEYS } from '@/lib/cache';
import { tieredCacheGet, tieredCacheSet } from '@/lib/tieredCache';
import {
  parseStrategicOpsFilters,
  requireStrategicOpsAdmin,
} from '@/lib/strategicOps/apiAuth';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 120;

const COO_MODE_TTL_MS = 5 * 60 * 1000;

export async function GET(request: NextRequest) {
  try {
    const auth = await requireStrategicOpsAdmin(request, 'strategic-ops-coo-mode');
    if (!auth.ok) return auth.response;

    const parsed = parseStrategicOpsFilters(request);
    if (!parsed.ok) return parsed.response;
    const { filters } = parsed;

    const cacheKey = `${CACHE_KEYS.strategicOpsTrustScore(filters)}::coo-mode`;
    const cached = await tieredCacheGet<ReturnType<typeof buildCooModeReport>>(
      cacheKey,
      COO_MODE_TTL_MS
    );
    if (cached) {
      return NextResponse.json({ success: true, data: cached, cached: true });
    }

    const report = await buildStrategicOpsReport(filters);
    const cooMode = buildCooModeReport(report);

    await tieredCacheSet(cacheKey, cooMode, COO_MODE_TTL_MS);

    return NextResponse.json({ success: true, data: cooMode, cached: false });
  } catch (error: unknown) {
    console.error('[Strategic Ops COO Mode]', error);
    const msg = error instanceof Error ? error.message : 'حدث خطأ';
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}
