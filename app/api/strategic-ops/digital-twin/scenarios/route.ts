import { NextRequest, NextResponse } from 'next/server';
import { buildStrategicOpsReport } from '@/lib/strategicOps/buildReport';
import {
  buildDigitalTwinSnapshot,
  runSimulation,
  type ScenarioLevers,
} from '@/lib/strategicOps/digitalTwin';
import {
  createScenario,
  isSimulationDbConfigured,
  listScenarios,
} from '@/lib/strategicOps/digitalTwin/persistence/neonStore';
import { requireStrategicOpsAdmin } from '@/lib/strategicOps/apiAuth';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 120;

export async function GET(request: NextRequest) {
  try {
    const auth = requireStrategicOpsAdmin(request, 'dt-scenarios-list');
    if (!auth.ok) return auth.response;

    if (!isSimulationDbConfigured()) {
      return NextResponse.json({
        success: true,
        data: [],
        warning: 'Neon غير مُعد — استخدم المسودات المحلية',
      });
    }

    const data = await listScenarios(50);
    return NextResponse.json({ success: true, data });
  } catch (error: unknown) {
    console.error('[Digital Twin Scenarios GET]', error);
    const msg = error instanceof Error ? error.message : 'حدث خطأ';
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const auth = requireStrategicOpsAdmin(request, 'dt-scenarios-create');
    if (!auth.ok) return auth.response;

    if (!isSimulationDbConfigured()) {
      return NextResponse.json(
        { success: false, error: 'TICKETING_DATABASE_URL غير مُعد لحفظ السيناريوهات' },
        { status: 503 }
      );
    }

    const body = (await request.json()) as {
      title?: string;
      startDate?: string;
      endDate?: string;
      zone?: string;
      supervisorCode?: string;
      levers?: ScenarioLevers;
    };

    if (!body.title?.trim() || !body.startDate || !body.endDate) {
      return NextResponse.json(
        { success: false, error: 'المطلوب: title و startDate و endDate' },
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

    const saved = await createScenario({
      authorCode: auth.code,
      authorName: auth.name,
      title: body.title.trim(),
      filters,
      levers: body.levers ?? {},
      baseline: result.baseline,
      impact: result.impact,
      decision: result.decision,
    });

    return NextResponse.json({ success: true, data: saved });
  } catch (error: unknown) {
    console.error('[Digital Twin Scenarios POST]', error);
    const msg = error instanceof Error ? error.message : 'حدث خطأ';
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}
