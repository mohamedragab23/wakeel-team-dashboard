import { NextRequest, NextResponse } from 'next/server';
import { verifyToken } from '@/lib/auth';
import { getSheetData } from '@/lib/googleSheets';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    // Get token from header
    const authHeader = request.headers.get('authorization');
    console.log('[Performance Stats API] Authorization header:', authHeader ? 'Present' : 'Missing');
    
    const token = authHeader?.replace('Bearer ', '').trim();

    if (!token) {
      console.error('[Performance Stats API] ❌ No token provided');
      return NextResponse.json({ 
        success: false, 
        error: 'غير مصرح - لم يتم توفير رمز المصادقة. يرجى تسجيل الدخول مرة أخرى.' 
      }, { status: 401 });
    }

    console.log('[Performance Stats API] Token received, length:', token.length);
    
    const decoded = verifyToken(token);
    
    if (!decoded) {
      console.error('[Performance Stats API] ❌ Token verification failed - invalid or expired token');
      return NextResponse.json({ 
        success: false, 
        error: 'غير مصرح - رمز المصادقة غير صحيح أو منتهي الصلاحية. يرجى تسجيل الدخول مرة أخرى.' 
      }, { status: 401 });
    }

    console.log('[Performance Stats API] Token decoded:', { code: decoded.code, role: decoded.role, name: decoded.name });

    if (decoded.role !== 'admin') {
      console.error('[Performance Stats API] ❌ Access denied - user role is not admin:', decoded.role);
      return NextResponse.json({ 
        success: false, 
        error: 'غير مصرح - يجب أن تكون مسجلاً كمدير للوصول إلى هذه الصفحة.' 
      }, { status: 401 });
    }

    const dailyData = await getSheetData('البيانات اليومية');
    
    // Calculate stats
    const totalRecords = dailyData.length > 1 ? dailyData.length - 1 : 0;
    const uniqueRiders = new Set();
    
    if (dailyData.length > 1) {
      for (let i = 1; i < dailyData.length; i++) {
        if (dailyData[i][1]) {
          uniqueRiders.add(dailyData[i][1].toString().trim());
        }
      }
    }

    // Get last update date (from last row)
    let lastUpdate = null;
    if (dailyData.length > 1) {
      const lastRow = dailyData[dailyData.length - 1];
      if (lastRow[0]) {
        try {
          lastUpdate = new Date(lastRow[0]).toISOString();
        } catch (e) {
          // Invalid date
        }
      }
    }

    return NextResponse.json({
      success: true,
      data: {
        totalRecords,
        uniqueRiders: uniqueRiders.size,
        lastUpdate,
      },
    });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

