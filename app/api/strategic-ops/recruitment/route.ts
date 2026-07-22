/**
 * API Route: Recruitment Metrics
 *
 * GET /api/strategic-ops/recruitment
 *
 * Returns hiring, termination, and reactivation metrics.
 */

import { NextRequest, NextResponse } from 'next/server';
import { calculateRecruitmentMetrics } from '@/lib/strategicOps/integration';
import { requireStrategicOpsAdmin } from '@/lib/strategicOps/apiAuth';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET(request: NextRequest) {
  try {
    const auth = requireStrategicOpsAdmin(request, 'recruitment-metrics');
    if (!auth.ok) return auth.response;

    const { searchParams } = new URL(request.url);
    const startDate = searchParams.get('startDate') || getDefaultStartDate();
    const endDate = searchParams.get('endDate') || getDefaultEndDate();
    const totalRiders = parseInt(searchParams.get('totalRiders') || '0', 10);

    const metrics = await calculateRecruitmentMetrics(startDate, endDate, totalRiders);

    return NextResponse.json({
      success: true,
      data: metrics,
      meta: {
        startDate,
        endDate,
        totalRiders,
      },
    });
  } catch (error) {
    console.error('Error in recruitment metrics API:', error);
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    );
  }
}

function getDefaultStartDate() {
  const date = new Date();
  date.setMonth(date.getMonth() - 3);
  return date.toISOString().split('T')[0];
}

function getDefaultEndDate() {
  return new Date().toISOString().split('T')[0];
}
