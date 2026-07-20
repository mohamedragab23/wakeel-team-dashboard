import { NextRequest, NextResponse } from 'next/server';
import { buildStrategicOpsReport } from '@/lib/strategicOps/buildReport';
import { runLiveAudit, buildKpiLineageFromAudit } from '@/lib/strategicOps/audit/liveAuditEngine';
import { CACHE_KEYS } from '@/lib/cache';
import { tieredCacheGet, tieredCacheSet } from '@/lib/tieredCache';
import {
  parseStrategicOpsFilters,
  requireStrategicOpsAdmin,
} from '@/lib/strategicOps/apiAuth';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 120;

const AUDIT_TTL_MS = 10 * 60 * 1000;

export async function GET(request: NextRequest) {
  try {
    const auth = requireStrategicOpsAdmin(request, 'strategic-ops-live-audit');
    if (!auth.ok) return auth.response;

    const parsed = parseStrategicOpsFilters(request);
    if (!parsed.ok) return parsed.response;
    const { filters } = parsed;

    const force = new URL(request.url).searchParams.get('force') === '1';
    const stream = new URL(request.url).searchParams.get('stream') === '1';
    const cacheKey = CACHE_KEYS.strategicOpsLiveAudit(filters);

    if (!force) {
      const cached = await tieredCacheGet<Awaited<ReturnType<typeof runLiveAudit>>>(
        cacheKey,
        AUDIT_TTL_MS
      );
      if (cached) {
        return NextResponse.json({ success: true, data: cached, cached: true });
      }
    }

    if (stream) {
      const encoder = new TextEncoder();
      const readable = new ReadableStream({
        async start(controller) {
          const send = (obj: unknown) => {
            controller.enqueue(encoder.encode(`data: ${JSON.stringify(obj)}\n\n`));
          };
          try {
            send({ type: 'status', message: 'building_report' });
            const report = await buildStrategicOpsReport(filters);
            send({ type: 'status', message: 'running_audit' });
            const audit = await runLiveAudit(filters, report);
            await tieredCacheSet(cacheKey, audit, AUDIT_TTL_MS);
            send({ type: 'complete', data: audit });
          } catch (err: unknown) {
            const message = err instanceof Error ? err.message : 'حدث خطأ';
            send({ type: 'error', error: message });
          } finally {
            controller.close();
          }
        },
      });

      return new Response(readable, {
        headers: {
          'Content-Type': 'text/event-stream; charset=utf-8',
          'Cache-Control': 'no-cache, no-transform',
          Connection: 'keep-alive',
        },
      });
    }

    const report = await buildStrategicOpsReport(filters);
    const audit = await runLiveAudit(filters, report);
    await tieredCacheSet(cacheKey, audit, AUDIT_TTL_MS);

    return NextResponse.json({ success: true, data: audit, cached: false });
  } catch (error: unknown) {
    console.error('[Strategic Ops Live Audit]', error);
    const msg = error instanceof Error ? error.message : 'حدث خطأ';
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}

/** Optional: return lineage for a specific audit result id using cached audit + report. */
export async function POST(request: NextRequest) {
  try {
    const auth = requireStrategicOpsAdmin(request, 'strategic-ops-live-audit-lineage');
    if (!auth.ok) return auth.response;

    const body = (await request.json()) as {
      startDate?: string;
      endDate?: string;
      zone?: string;
      supervisorCode?: string;
      resultId?: string;
    };

    if (!body.startDate || !body.endDate || !body.resultId) {
      return NextResponse.json({ success: false, error: 'معاملات ناقصة' }, { status: 400 });
    }

    const filters = {
      startDate: body.startDate,
      endDate: body.endDate,
      zone: body.zone || 'all',
      supervisorCode: body.supervisorCode || 'all',
    };

    const cacheKey = CACHE_KEYS.strategicOpsLiveAudit(filters);
    let audit = await tieredCacheGet<Awaited<ReturnType<typeof runLiveAudit>>>(
      cacheKey,
      AUDIT_TTL_MS
    );
    const report = await buildStrategicOpsReport(filters);
    if (!audit) {
      audit = await runLiveAudit(filters, report);
      await tieredCacheSet(cacheKey, audit, AUDIT_TTL_MS);
    }

    const result = audit.results.find((r) => r.id === body.resultId);
    if (!result) {
      return NextResponse.json({ success: false, error: 'نتيجة التدقيق غير موجودة' }, { status: 404 });
    }

    const lineage = buildKpiLineageFromAudit(result, report);
    return NextResponse.json({ success: true, data: lineage });
  } catch (error: unknown) {
    console.error('[Strategic Ops Lineage]', error);
    const msg = error instanceof Error ? error.message : 'حدث خطأ';
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}
