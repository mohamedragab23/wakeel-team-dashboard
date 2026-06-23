import { NextRequest, NextResponse } from 'next/server';
import { extractBearerToken } from '@/lib/requestAuth';
import { verifyToken } from '@/lib/auth';
import { assertAdminApiAccess } from '@/lib/adminFeatureAccess';
import { assertLimitedAdminGlobalWriteDenied } from '@/lib/adminZoneScope';
import { clearSheetData } from '@/lib/googleSheets';
import { invalidateAfterPerformanceSync } from '@/lib/cacheInvalidation';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  try {
    const token = extractBearerToken(request);

    if (!token) {
      return NextResponse.json({ success: false, error: 'غير مصرح' }, { status: 401 });
    }

    const decoded = verifyToken(token);
    if (!decoded || decoded.role !== 'admin') {
      return NextResponse.json({ success: false, error: 'غير مصرح - المدير فقط' }, { status: 401 });
    }

    const pc = assertAdminApiAccess(decoded, 'performance_upload');
    if (pc) return pc;
    const globalDeny = assertLimitedAdminGlobalWriteDenied(decoded);
    if (globalDeny) return globalDeny;

    console.log(`[ClearPerformance] Admin ${decoded.code} requested to clear all performance data`);

    // Clear all data from 'البيانات اليومية' sheet (keep header row)
    const cleared = await clearSheetData('البيانات اليومية', true);

    if (!cleared) {
      return NextResponse.json(
        { success: false, error: 'فشل تصفير بيانات الأداء' },
        { status: 500 }
      );
    }

    await invalidateAfterPerformanceSync();

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

