import { NextRequest, NextResponse } from 'next/server';
import {
  computeLearningMetrics,
  type PredictionRecord,
} from '@/lib/strategicOps/digitalTwin';
import {
  isSimulationDbConfigured,
  listScenarios,
} from '@/lib/strategicOps/digitalTwin/persistence/neonStore';
import { requireStrategicOpsAdmin } from '@/lib/strategicOps/apiAuth';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 60;

export async function GET(request: NextRequest) {
  try {
    const auth = requireStrategicOpsAdmin(request, 'dt-learning');
    if (!auth.ok) return auth.response;

    if (!isSimulationDbConfigured()) {
      return NextResponse.json({
        success: true,
        data: {
          metrics: computeLearningMetrics([]),
          records: [] as PredictionRecord[],
        },
      });
    }

    const scenarios = await listScenarios(100);
    const records: PredictionRecord[] = scenarios.map((s) => {
      const actual = s.actualResult as
        | { hours?: number; orders?: number; achievement?: number; recordedAt?: string }
        | null
        | undefined;
      return {
        scenarioId: s.id,
        predictedAt: s.createdAt,
        predictedHours: s.impact?.projected?.actualHours ?? 0,
        predictedOrders: s.impact?.projected?.orders ?? 0,
        predictedAchievement: s.impact?.projected?.achievement ?? 0,
        actualHours: actual?.hours ?? null,
        actualOrders: actual?.orders ?? null,
        actualAchievement: actual?.achievement ?? null,
        recordedAt: actual?.recordedAt ?? null,
      };
    });

    return NextResponse.json({
      success: true,
      data: {
        metrics: computeLearningMetrics(records),
        records,
      },
    });
  } catch (error: unknown) {
    console.error('[Digital Twin Learning]', error);
    const msg = error instanceof Error ? error.message : 'حدث خطأ';
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}
