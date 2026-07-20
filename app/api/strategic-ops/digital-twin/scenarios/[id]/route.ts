import { NextRequest, NextResponse } from 'next/server';
import {
  deleteScenario,
  getScenario,
  isSimulationDbConfigured,
  updateScenario,
} from '@/lib/strategicOps/digitalTwin/persistence/neonStore';
import type { ExecutiveDecision, ScenarioLevers, SimulationImpact } from '@/lib/strategicOps/digitalTwin';
import { requireStrategicOpsAdmin } from '@/lib/strategicOps/apiAuth';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 60;

type Ctx = { params: { id: string } };

export async function GET(request: NextRequest, context: Ctx) {
  try {
    const auth = requireStrategicOpsAdmin(request, 'dt-scenario-get');
    if (!auth.ok) return auth.response;
    if (!isSimulationDbConfigured()) {
      return NextResponse.json({ success: false, error: 'قاعدة البيانات غير مُعدة' }, { status: 503 });
    }
    const { id } = context.params;
    const row = await getScenario(id);
    if (!row) return NextResponse.json({ success: false, error: 'غير موجود' }, { status: 404 });
    return NextResponse.json({ success: true, data: row });
  } catch (error: unknown) {
    console.error('[Digital Twin Scenario GET]', error);
    const msg = error instanceof Error ? error.message : 'حدث خطأ';
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest, context: Ctx) {
  try {
    const auth = requireStrategicOpsAdmin(request, 'dt-scenario-patch');
    if (!auth.ok) return auth.response;
    if (!isSimulationDbConfigured()) {
      return NextResponse.json({ success: false, error: 'قاعدة البيانات غير مُعدة' }, { status: 503 });
    }
    const { id } = context.params;
    const body = (await request.json()) as {
      title?: string;
      levers?: ScenarioLevers;
      impact?: SimulationImpact;
      decision?: ExecutiveDecision | null;
      actualResult?: unknown;
      variance?: unknown;
    };
    const updated = await updateScenario(id, body);
    if (!updated) return NextResponse.json({ success: false, error: 'غير موجود' }, { status: 404 });
    return NextResponse.json({ success: true, data: updated });
  } catch (error: unknown) {
    console.error('[Digital Twin Scenario PATCH]', error);
    const msg = error instanceof Error ? error.message : 'حدث خطأ';
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest, context: Ctx) {
  try {
    const auth = requireStrategicOpsAdmin(request, 'dt-scenario-delete');
    if (!auth.ok) return auth.response;
    if (!isSimulationDbConfigured()) {
      return NextResponse.json({ success: false, error: 'قاعدة البيانات غير مُعدة' }, { status: 503 });
    }
    const { id } = context.params;
    const ok = await deleteScenario(id);
    if (!ok) return NextResponse.json({ success: false, error: 'غير موجود' }, { status: 404 });
    return NextResponse.json({ success: true });
  } catch (error: unknown) {
    console.error('[Digital Twin Scenario DELETE]', error);
    const msg = error instanceof Error ? error.message : 'حدث خطأ';
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}
