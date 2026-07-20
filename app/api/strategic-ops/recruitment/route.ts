/**
 * API Route: Recruitment Metrics
 * 
 * GET /api/strategic-ops/recruitment
 * 
 * Returns hiring, termination, and reactivation metrics.
 */

import { NextRequest, NextResponse } from 'next/server';
import { calculateRecruitmentMetrics } from '@/lib/strategicOps/integration';
import { verifyAuth } from '@/lib/auth';

export async function GET(request: NextRequest) {
  try {
    // Verify authentication
    const user = await verifyAuth(request);
    if (!user) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }
    
    // Get query parameters
    const { searchParams } = new URL(request.url);
    const startDate = searchParams.get('startDate') || getDefaultStartDate();
    const endDate = searchParams.get('endDate') || getDefaultEndDate();
    const totalRiders = parseInt(searchParams.get('totalRiders') || '0');
    
    // Calculate metrics
    const metrics = await calculateRecruitmentMetrics(
      startDate,
      endDate,
      totalRiders
    );
    
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
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

function getDefaultStartDate() {
  const date = new Date();
  date.setMonth(date.getMonth() - 3); // 3 months ago
  return date.toISOString().split('T')[0];
}

function getDefaultEndDate() {
  return new Date().toISOString().split('T')[0];
}
