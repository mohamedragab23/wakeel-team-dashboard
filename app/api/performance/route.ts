/**
 * Performance API - Read from Google Sheets
 * Server-side compatible, client can cache in IndexedDB
 */

import { NextRequest, NextResponse } from 'next/server';
import { verifyToken } from '@/lib/auth';
import { getPerformanceData } from '@/lib/dataService';

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

    const { searchParams } = new URL(request.url);
    const startDate = searchParams.get('startDate');
    const endDate = searchParams.get('endDate');

    // Log request for debugging
    console.log(`[Performance API] Request from supervisor ${decoded.code}, Date Range: ${startDate} to ${endDate}`);
    
    // Validate dates
    if (startDate && isNaN(new Date(startDate).getTime())) {
      console.error(`[Performance API] Invalid startDate: ${startDate}`);
      return NextResponse.json({
        success: false,
        error: 'تاريخ البداية غير صحيح',
        data: { labels: [], orders: [], hours: [] },
      });
    }
    
    if (endDate && isNaN(new Date(endDate).getTime())) {
      console.error(`[Performance API] Invalid endDate: ${endDate}`);
      return NextResponse.json({
        success: false,
        error: 'تاريخ النهاية غير صحيح',
        data: { labels: [], orders: [], hours: [] },
      });
    }

    // Normalize dates - handle timezone issues
    let normalizedStartDate: Date | undefined;
    let normalizedEndDate: Date | undefined;
    
    if (startDate) {
      // Add time to avoid timezone issues
      normalizedStartDate = new Date(startDate + 'T00:00:00');
      normalizedStartDate.setHours(0, 0, 0, 0);
    }
    
    if (endDate) {
      // Add time to avoid timezone issues
      normalizedEndDate = new Date(endDate + 'T23:59:59');
      normalizedEndDate.setHours(23, 59, 59, 999);
    }
    
    // If dates are not provided, use default range (last 7 days)
    if (!normalizedStartDate || !normalizedEndDate) {
      const today = new Date();
      normalizedEndDate = new Date(today);
      normalizedEndDate.setHours(23, 59, 59, 999);
      normalizedStartDate = new Date(today);
      normalizedStartDate.setDate(today.getDate() - 6);
      normalizedStartDate.setHours(0, 0, 0, 0);
    }

    // Get performance data from Google Sheets (filtered by supervisor)
    const performanceResult = await getPerformanceData(
      decoded.code,
      normalizedStartDate,
      normalizedEndDate
    );

    // Enhanced logging
    if (!performanceResult.success) {
      const errorMessage = 'error' in performanceResult ? performanceResult.error : 'فشل تحميل البيانات';
      console.error(`[Performance API] ❌ Failed for supervisor ${decoded.code}:`, errorMessage);
      return NextResponse.json({
        success: false,
        error: errorMessage,
        data: {
          labels: [],
          orders: [],
          hours: [],
        },
      });
    }

    // getPerformanceData returns { success, labels, orders, hours, avgAcceptance?, totalAbsences?, totalBreaks? }
    const { success, labels, orders, hours } = performanceResult;
    const avgAcceptance = 'avgAcceptance' in performanceResult ? performanceResult.avgAcceptance : 0;
    const totalAbsences = 'totalAbsences' in performanceResult ? performanceResult.totalAbsences : 0;
    const totalBreaks = 'totalBreaks' in performanceResult ? performanceResult.totalBreaks : 0;
    
    // Calculate totals
    const totalHours = (hours || []).reduce((a: number, b: number) => a + b, 0);
    const totalOrders = (orders || []).reduce((a: number, b: number) => a + b, 0);
    
    // Find best performance day
    const ordersArray: number[] = Array.isArray(orders) ? orders : [];
    const maxOrders = ordersArray.length > 0 ? Math.max(...ordersArray, 0) : 0;
    const bestDayIndex = ordersArray.length > 0 ? ordersArray.indexOf(maxOrders) : -1;
    const bestDay = bestDayIndex >= 0 && labels?.[bestDayIndex] ? {
      date: labels[bestDayIndex],
      orders: ordersArray[bestDayIndex],
      hours: (hours || [])[bestDayIndex] || 0,
    } : null;
    
    console.log(`[Performance API] ✅ Success for supervisor ${decoded.code}, Labels: ${labels?.length || 0}, Orders: ${orders?.length || 0}, TotalOrders: ${totalOrders}, TotalHours: ${totalHours}, Absences: ${totalAbsences}, Breaks: ${totalBreaks}`);

    return NextResponse.json({
      success: true,
      data: {
        labels: labels || [],
        orders: orders || [],
        hours: hours || [],
        // New metrics
        totalHours,
        totalOrders,
        avgAcceptance: avgAcceptance || 0,
        totalAbsences: totalAbsences || 0,
        totalBreaks: totalBreaks || 0,
        bestDay,
      },
    });
  } catch (error: any) {
    console.error('Get performance error:', error);
    return NextResponse.json(
      { success: false, error: 'حدث خطأ: ' + error.message },
      { status: 500 }
    );
  }
}

