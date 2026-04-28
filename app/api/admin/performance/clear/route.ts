import { NextRequest, NextResponse } from 'next/server';
import { verifyToken } from '@/lib/auth';
import { clearSheetData } from '@/lib/googleSheets';
import { invalidateSupervisorCaches, notifySupervisorsOfChange } from '@/lib/realtimeSync';
import { cache } from '@/lib/cache';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  try {
    const token = request.headers.get('authorization')?.replace('Bearer ', '');

    if (!token) {
      return NextResponse.json({ success: false, error: 'غير مصرح' }, { status: 401 });
    }

    const decoded = verifyToken(token);
    if (!decoded || decoded.role !== 'admin') {
      return NextResponse.json({ success: false, error: 'غير مصرح - المدير فقط' }, { status: 401 });
    }

    console.log(`[ClearPerformance] Admin ${decoded.code} requested to clear all performance data`);

    // Clear all data from 'البيانات اليومية' sheet (keep header row)
    const cleared = await clearSheetData('البيانات اليومية', true);

    if (!cleared) {
      return NextResponse.json(
        { success: false, error: 'فشل تصفير بيانات الأداء' },
        { status: 500 }
      );
    }

    // Clear all caches
    console.log(`[ClearPerformance] Clearing all caches...`);
    
    // Clear all supervisor caches
    invalidateSupervisorCaches();
    
    // Clear all performance-related caches
    const cacheKeys = cache.keys();
    let clearedCount = 0;
    for (const key of cacheKeys) {
      if (
        key.includes('performance') ||
        key.includes('dashboard') ||
        key.includes('riders-data') ||
        key.includes('sheet:البيانات اليومية')
      ) {
        cache.clear(key);
        clearedCount++;
      }
    }
    
    console.log(`[ClearPerformance] Cleared ${clearedCount} cache keys`);

    // Notify all supervisors of the change
    notifySupervisorsOfChange('performance');

    console.log(`[ClearPerformance] Successfully cleared all performance data`);

    return NextResponse.json({
      success: true,
      message: 'تم تصفير جميع بيانات الأداء بنجاح',
    });
  } catch (error: any) {
    console.error('[ClearPerformance] Error:', error);
    return NextResponse.json(
      { success: false, error: error.message || 'حدث خطأ في تصفير البيانات' },
      { status: 500 }
    );
  }
}

