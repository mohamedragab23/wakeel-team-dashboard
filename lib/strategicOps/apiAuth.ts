import { NextRequest, NextResponse } from 'next/server';
import { extractBearerToken } from '@/lib/requestAuth';
import { verifyToken } from '@/lib/auth';
import { assertAdminApiAccess } from '@/lib/adminFeatureAccess';
import { checkApiRateLimit, rateLimitResponse } from '@/lib/apiRateLimit';

export type StrategicOpsAuth =
  | { ok: true; code: string; name: string | null }
  | { ok: false; response: NextResponse };

export function requireStrategicOpsAdmin(request: NextRequest, rateBucket: string): StrategicOpsAuth {
  const token = extractBearerToken(request);
  if (!token) {
    return { ok: false, response: NextResponse.json({ success: false, error: 'غير مصرح' }, { status: 401 }) };
  }

  const decoded = verifyToken(token) as {
    role?: string;
    code?: string;
    name?: string;
  } | null;

  if (!decoded || decoded.role !== 'admin') {
    return { ok: false, response: NextResponse.json({ success: false, error: 'غير مصرح' }, { status: 401 }) };
  }

  const denied = assertAdminApiAccess(decoded, 'strategic_ops');
  if (denied) return { ok: false, response: denied };

  const rateKey = String(decoded.code ?? decoded.role ?? 'admin');
  const limited = checkApiRateLimit(rateBucket, rateKey, 20, 60_000);
  if (!limited.allowed) {
    return { ok: false, response: NextResponse.json(rateLimitResponse(limited.retryAfterSec), { status: 429 }) };
  }

  return { ok: true, code: rateKey, name: decoded.name ?? null };
}

export function parseStrategicOpsFilters(request: NextRequest):
  | { ok: true; filters: { startDate: string; endDate: string; zone: string; supervisorCode: string } }
  | { ok: false; response: NextResponse } {
  const { searchParams } = new URL(request.url);
  const startDate = searchParams.get('startDate');
  const endDate = searchParams.get('endDate');
  const zone = searchParams.get('zone') || 'all';
  const supervisorCode = searchParams.get('supervisorCode') || 'all';

  if (!startDate || !endDate) {
    return {
      ok: false,
      response: NextResponse.json(
        { success: false, error: 'المطلوب: startDate و endDate (YYYY-MM-DD)' },
        { status: 400 }
      ),
    };
  }

  const start = new Date(startDate + 'T00:00:00');
  const end = new Date(endDate + 'T23:59:59');
  if (isNaN(start.getTime()) || isNaN(end.getTime()) || start > end) {
    return {
      ok: false,
      response: NextResponse.json({ success: false, error: 'نطاق تاريخ غير صالح' }, { status: 400 }),
    };
  }

  return { ok: true, filters: { startDate, endDate, zone, supervisorCode } };
}
