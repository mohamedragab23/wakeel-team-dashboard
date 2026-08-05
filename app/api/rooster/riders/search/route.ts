/**
 * SRS-013 Phase 2 — Rider Search.
 *
 * `GET /api/rooster/riders/search?type=workerId|paperNumber|phone|name|email&q=<value>`
 * Frozen contract: SRS013_DESIGN_FREEZE.md Phase 2 §3.
 *
 * No `type`/`q` supplied -> capability/status check (mirrors Phase 1's
 * `GET /api/rooster/shifts/import` pattern) so the UI can hide the search
 * box entirely while `FEATURE_RIDER_SEARCH_ENABLED` is off.
 *
 * Follows the frozen architecture exactly:
 *   RoosterClient -> Smart Cache -> Request Queue -> Dashboard API -> React UI
 */
import { NextRequest, NextResponse } from 'next/server';
import { extractBearerToken } from '@/lib/requestAuth';
import { verifyToken } from '@/lib/auth';
import { RoosterClient } from '@/lib/rooster/RoosterClient';
import { getAllRiders, type Rider } from '@/lib/adminService';
import { riderCodesMatch } from '@/lib/riderCodeUtils';
import { mergeRiderProfile, type RiderSearchType, type MergedRiderProfile } from '@/lib/rooster/riderMerge';
import { recordMetric } from '@/lib/telemetry';

export const dynamic = 'force-dynamic';
// 120s (not 60s): if the Rooster session is fully dead this can reach Layer
// 3 auth recovery inline, which needs up to ~90s just for the Gmail-OTP
// poll -- see lib/roosterLive/authRecovery/circuitBreaker.ts.
export const maxDuration = 120;

const VALID_TYPES: RiderSearchType[] = ['workerId', 'paperNumber', 'phone', 'name', 'email'];

function isRiderSearchEnabled(): boolean {
  return String(process.env.FEATURE_RIDER_SEARCH_ENABLED || '').trim().toLowerCase() === 'true';
}

type Decoded = { role?: 'supervisor' | 'admin'; name?: string; code?: string };

function authenticate(request: NextRequest): { ok: true; decoded: Decoded } | { ok: false; response: NextResponse } {
  const token = extractBearerToken(request);
  if (!token) {
    return { ok: false, response: NextResponse.json({ success: false, error: 'غير مصرح' }, { status: 401 }) };
  }
  const decoded = verifyToken(token) as Decoded | null;
  if (!decoded || (decoded.role !== 'supervisor' && decoded.role !== 'admin')) {
    return { ok: false, response: NextResponse.json({ success: false, error: 'غير مصرح' }, { status: 401 }) };
  }
  return { ok: true, decoded };
}

export async function GET(request: NextRequest) {
  const startedAt = Date.now();
  const auth = authenticate(request);
  if (!auth.ok) return auth.response;

  const { searchParams } = new URL(request.url);
  const type = String(searchParams.get('type') || '').trim() as RiderSearchType;
  const q = String(searchParams.get('q') || '').trim();

  // Capability/status check -- no search params supplied.
  if (!type && !q) {
    return NextResponse.json({ success: true, enabled: isRiderSearchEnabled(), availableTypes: VALID_TYPES });
  }

  if (!isRiderSearchEnabled()) {
    return NextResponse.json({ success: false, enabled: false, error: 'بحث المناديب غير مفعّل حاليًا' }, { status: 503 });
  }

  if (!VALID_TYPES.includes(type)) {
    return NextResponse.json({ success: false, error: `نوع البحث غير صالح. المتاح: ${VALID_TYPES.join(', ')}` }, { status: 400 });
  }
  if (!q) {
    return NextResponse.json({ success: false, error: 'أدخل قيمة للبحث' }, { status: 400 });
  }

  try {
    const outcome = await RoosterClient.searchRiders({ type, query: q });

    if (!outcome.success) {
      void recordMetric({ feature: 'rider_search', metric: 'api_failure', tags: { reason: outcome.reason } });
      const status = outcome.reason === 'invalid_search_term' ? 400 : 502;
      const message =
        outcome.reason === 'invalid_search_term'
          ? 'قيمة البحث غير صالحة لهذا النوع من البحث'
          : 'تعذر الاتصال بروستر للبحث، حاول مرة أخرى';
      return NextResponse.json({ success: false, reason: outcome.reason, error: message }, { status });
    }

    // Enrich with dashboard (Sheets) data -- dashboard wins on conflicts, per the frozen merge rule.
    const dashboardRiders: Rider[] = outcome.employees.length ? await getAllRiders(true) : [];
    const results: MergedRiderProfile[] = outcome.employees.map((emp) => {
      const dashboardMatch = dashboardRiders.find((r) => riderCodesMatch(r.code, String(emp.id))) || null;
      return mergeRiderProfile(dashboardMatch, emp);
    });

    void recordMetric({ feature: 'rider_search', metric: 'exec_ms', value: Date.now() - startedAt, tags: { type } });
    return NextResponse.json({ success: true, results });
  } catch (error: any) {
    void recordMetric({ feature: 'rider_search', metric: 'api_failure', tags: { reason: 'exception' } });
    console.error('[api/rooster/riders/search]', error);
    return NextResponse.json({ success: false, error: error?.message || 'حدث خطأ' }, { status: 500 });
  }
}
