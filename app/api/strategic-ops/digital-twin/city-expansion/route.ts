import { NextRequest, NextResponse } from 'next/server';
import { buildStrategicOpsReport } from '@/lib/strategicOps/buildReport';
import {
  buildDigitalTwinSnapshot,
  simulateCityExpansion,
  type CityExpansionAction,
} from '@/lib/strategicOps/digitalTwin';
import { requireStrategicOpsAdmin } from '@/lib/strategicOps/apiAuth';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 120;

export async function POST(request: NextRequest) {
  try {
    const auth = requireStrategicOpsAdmin(request, 'dt-city-expansion');
    if (!auth.ok) return auth.response;

    const body = (await request.json()) as {
      startDate?: string;
      endDate?: string;
      zone?: string;
      supervisorCode?: string;
      action?: CityExpansionAction;
      cityKey?: string;
      seedHeadcount?: number;
      scaleFactor?: number;
    };

    if (!body.startDate || !body.endDate || !body.action || !body.cityKey) {
      return NextResponse.json(
        { success: false, error: 'المطلوب: startDate, endDate, action, cityKey' },
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
    const result = simulateCityExpansion(
      twin.economics,
      {
        action: body.action,
        cityKey: body.cityKey,
        seedHeadcount: body.seedHeadcount,
        scaleFactor: body.scaleFactor,
      },
      {
        headcount: twin.fleet.headcount,
        actualHours: twin.fleet.actualHours,
        orders: twin.fleet.orders,
      }
    );

    return NextResponse.json({ success: true, data: result });
  } catch (error: unknown) {
    console.error('[Digital Twin City Expansion]', error);
    const msg = error instanceof Error ? error.message : 'حدث خطأ';
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}
