import { NextRequest, NextResponse } from 'next/server';
import { requireStrategicOpsAdmin } from '@/lib/strategicOps/apiAuth';
import { runOpsValidationFull } from '@/lib/strategicOps/opsValidation';
import { listValidationHistory } from '@/lib/strategicOps/opsValidation/historyStore';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 300;

export async function GET(request: NextRequest) {
  try {
    const auth = requireStrategicOpsAdmin(request, 'ops-validation');
    if (!auth.ok) return auth.response;

    const historyOnly = request.nextUrl.searchParams.get('history') === '1';
    if (historyOnly) {
      return NextResponse.json({
        success: true,
        data: { history: listValidationHistory(40) },
      });
    }

    const includeLive = request.nextUrl.searchParams.get('live') !== '0';
    const report = await runOpsValidationFull({
      schedule: 'manual',
      includeLive,
      persistHistory: true,
    });
    return NextResponse.json({ success: true, data: report });
  } catch (error: unknown) {
    console.error('[Ops Validation]', error);
    const msg = error instanceof Error ? error.message : 'حدث خطأ';
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  return GET(request);
}
