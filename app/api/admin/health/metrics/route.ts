/**
 * SRS-013 §13 — admin-only telemetry/health viewer.
 *
 * Purely additive, net-new route: reads only the new Redis telemetry keys
 * written by `lib/telemetry.ts#recordMetric`. Zero impact on any existing
 * route/page/tab. No specific admin feature-key is required (this is a
 * cross-cutting observability tool, not tied to one of the six new
 * features' own RBAC) — any authenticated admin can view it, matching the
 * existing 3-role model exactly (no new privilege tier introduced).
 */
import { NextRequest, NextResponse } from 'next/server';
import { extractBearerToken } from '@/lib/requestAuth';
import { verifyToken } from '@/lib/auth';
import { ALL_TELEMETRY_FEATURES, getFeatureHealthSnapshot } from '@/lib/telemetry';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    const token = extractBearerToken(request);
    if (!token) {
      return NextResponse.json({ success: false, error: 'غير مصرح' }, { status: 401 });
    }

    const decoded = verifyToken(token);
    if (!decoded || decoded.role !== 'admin') {
      return NextResponse.json({ success: false, error: 'غير مصرح' }, { status: 401 });
    }

    const features = await Promise.all(ALL_TELEMETRY_FEATURES.map((f) => getFeatureHealthSnapshot(f)));

    return NextResponse.json({
      success: true,
      windowHours: 48,
      features,
    });
  } catch (error: any) {
    console.error('[health/metrics] error:', error);
    return NextResponse.json({ success: false, error: 'خطأ في السيرفر' }, { status: 500 });
  }
}
