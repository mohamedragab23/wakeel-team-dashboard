import { NextRequest, NextResponse } from 'next/server';
import { buildStrategicOpsReport } from '@/lib/strategicOps/buildReport';
import {
  buildDigitalTwinSnapshot,
  runSimulation,
  type ScenarioLevers,
} from '@/lib/strategicOps/digitalTwin';
import { requireStrategicOpsAdmin } from '@/lib/strategicOps/apiAuth';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 120;

export async function POST(request: NextRequest) {
  try {
    const auth = requireStrategicOpsAdmin(request, 'dt-simulate');
    if (!auth.ok) return auth.response;

    const body = (await request.json()) as {
      startDate?: string;
      endDate?: string;
      zone?: string;
      supervisorCode?: string;
      levers?: ScenarioLevers;
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
    const baseline = buildDigitalTwinSnapshot(report, filters);
    const result = runSimulation(baseline, body.levers ?? {});

    return NextResponse.json({
      success: true,
      data: {
        baseline: result.baseline,
        projected: result.projected,
        impact: result.impact,
        financial: result.impact.financial,
        decision: result.decision,
        timeline: result.timeline,
        optimizationHints: result.optimizationHints,
        levers: result.levers,
        generatedAt: result.generatedAt,
      },
    });
  } catch (error: unknown) {
    console.error('[Digital Twin Simulate]', error);
    const msg = error instanceof Error ? error.message : 'حدث خطأ';
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}
