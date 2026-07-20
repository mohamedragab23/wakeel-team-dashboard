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
  analyzeSupervisorResponseQuality 
} from '@/lib/strategicOps/integration';
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
    const includeSupervisorQuality = searchParams.get('includeSupervisorQuality') === 'true';
    
    // Calculate analytics
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
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

function getDefaultStartDate() {
  const date = new Date();
  date.setDate(date.getDate() - 30); // 30 days ago
  return date.toISOString().split('T')[0];
}

function getDefaultEndDate() {
  return new Date().toISOString().split('T')[0];
}
