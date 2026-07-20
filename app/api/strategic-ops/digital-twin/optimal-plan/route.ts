import { NextRequest, NextResponse } from 'next/server';
import { buildStrategicOpsReport } from '@/lib/strategicOps/buildReport';
import {
  buildDigitalTwinSnapshot,
  generateOptimalPlan,
} from '@/lib/strategicOps/digitalTwin';
import { requireStrategicOpsAdmin } from '@/lib/strategicOps/apiAuth';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 120;

export async function POST(request: NextRequest) {
  try {
    const auth = requireStrategicOpsAdmin(request, 'dt-optimal-plan');
    if (!auth.ok) return auth.response;

    const body = (await request.json()) as {
      startDate?: string;
      endDate?: string;
      zone?: string;
      supervisorCode?: string;
    };

    if (!body.startDate || !body.endDate) {
      return NextResponse.json(
        { success: false, error: 'المطلوب: startDate و endDate' },
        { status: 400 }
      );
    }

    const filters = {
      startDate: body.startDate,
      endDate: body.endDate,
      zone: body.zone || 'all',
      supervisorCode: body.supervisorCode || 'all',
    };

    const report = await buildStrategicOpsReport(filters);
    const twin = buildDigitalTwinSnapshot(report, filters);
    const plan = generateOptimalPlan(twin);

    return NextResponse.json({ success: true, data: plan });
  } catch (error: unknown) {
    console.error('[Digital Twin Optimal Plan]', error);
    const msg = error instanceof Error ? error.message : 'حدث خطأ';
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}
