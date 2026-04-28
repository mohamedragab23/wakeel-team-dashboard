/**
 * Dashboard API - Read from Google Sheets
 * Server-side compatible, client can cache in IndexedDB
 */

import { NextRequest, NextResponse } from 'next/server';
import { verifyToken } from '@/lib/auth';
import { getDashboardData } from '@/lib/dataService';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    const token = request.headers.get('authorization')?.replace('Bearer ', '');

    if (!token) {
      return NextResponse.json({ success: false, error: 'غير مصرح' }, { status: 401 });
    }

    const decoded = verifyToken(token);
    if (!decoded || decoded.role !== 'supervisor') {
      return NextResponse.json({ success: false, error: 'غير مصرح' }, { status: 401 });
    }

    // Get dashboard data from Google Sheets (filtered by supervisor)
    const dashboardData = await getDashboardData(decoded.code);

    return NextResponse.json({
      success: true,
      data: dashboardData,
    });
  } catch (error: any) {
    console.error('Get dashboard error:', error);
    return NextResponse.json({ success: false, error: error.message || 'حدث خطأ' }, { status: 500 });
  }
}
