/**
 * API Route: Daily Comments Analytics
 *
 * GET /api/strategic-ops/comments-analytics
 *
 * Returns comprehensive analytics of daily rider comments.
 */

import { NextRequest, NextResponse } from 'next/server';
import {
  calculateCommentAnalytics,
  analyzeSupervisorResponseQuality,
} from '@/lib/strategicOps/integration';
import { requireStrategicOpsAdmin } from '@/lib/strategicOps/apiAuth';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET(request: NextRequest) {
  try {
    const auth = requireStrategicOpsAdmin(request, 'comments-analytics');
    if (!auth.ok) return auth.response;

    const { searchParams } = new URL(request.url);
    const startDate = searchParams.get('startDate') || getDefaultStartDate();
    const endDate = searchParams.get('endDate') || getDefaultEndDate();
    const includeSupervisorQuality = searchParams.get('includeSupervisorQuality') === 'true';

    const [analytics, supervisorQuality] = await Promise.all([
      calculateCommentAnalytics(startDate, endDate),
      includeSupervisorQuality
        ? analyzeSupervisorResponseQuality(startDate, endDate)
        : Promise.resolve([]),
    ]);

    return NextResponse.json({
      success: true,
      data: {
        analytics,
        supervisorQuality: includeSupervisorQuality ? supervisorQuality : undefined,
      },
      meta: {
        startDate,
        endDate,
      },
    });
  } catch (error) {
    console.error('Error in comments analytics API:', error);
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    );
  }
}

function getDefaultStartDate() {
  const date = new Date();
  date.setDate(date.getDate() - 30);
  return date.toISOString().split('T')[0];
}

function getDefaultEndDate() {
  return new Date().toISOString().split('T')[0];
}
