import { NextRequest, NextResponse } from 'next/server';
import { buildStrategicOpsReport } from '@/lib/strategicOps/buildReport';
import { buildDigitalTwinSnapshot } from '@/lib/strategicOps/digitalTwin';
import {
  parseStrategicOpsFilters,
  requireStrategicOpsAdmin,
} from '@/lib/strategicOps/apiAuth';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 120;

export async function GET(request: NextRequest) {
  try {
    const auth = requireStrategicOpsAdmin(request, 'dt-snapshot');
    if (!auth.ok) return auth.response;

    const parsed = parseStrategicOpsFilters(request);
    if (!parsed.ok) return parsed.response;

    const report = await buildStrategicOpsReport(parsed.filters);
    const twin = buildDigitalTwinSnapshot(report, parsed.filters);
    return NextResponse.json({ success: true, data: twin });
  } catch (error: unknown) {
    console.error('[Digital Twin Snapshot]', error);
    const msg = error instanceof Error ? error.message : 'حدث خطأ';
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}
