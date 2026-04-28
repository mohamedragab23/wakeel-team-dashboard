/**
 * Debug API - Check data in Google Sheets
 * This helps verify that data is being written and read correctly
 */

import { NextRequest, NextResponse } from 'next/server';
import { verifyToken } from '@/lib/auth';
import { getSheetData } from '@/lib/googleSheets';
import { getSupervisorRiders } from '@/lib/dataService';
import { getSupervisorPerformanceFiltered } from '@/lib/dataFilter';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    const token = request.headers.get('authorization')?.replace('Bearer ', '');

    if (!token) {
      return NextResponse.json({ success: false, error: 'غير مصرح' }, { status: 401 });
    }

    const decoded = verifyToken(token);
    if (!decoded || decoded.role !== 'admin') {
      return NextResponse.json({ success: false, error: 'غير مصرح' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const action = searchParams.get('action') || 'all';

    if (action === 'performance') {
      // Get raw data from Google Sheets
      const allData = await getSheetData('البيانات اليومية', false);
      
      // Get first 10 data rows for inspection (skip header row at index 0)
      const sampleRows = allData.slice(1, 11).map((row, index) => {
        let parsedDate: string | null = null;
        if (row[0]) {
          try {
            // Use the same parseDate logic as dataFilter
            const dateStr = row[0].toString().trim();
            
            // Try different formats
            if (/^\d{4}-\d{2}-\d{2}/.test(dateStr)) {
              // ISO format
              const parsed = new Date(dateStr + 'T00:00:00');
              if (!isNaN(parsed.getTime())) {
                parsedDate = parsed.toISOString().split('T')[0];
              }
            } else if (/^\d{1,2}\/\d{1,2}\/\d{4}/.test(dateStr)) {
              // M/D/YYYY or D/M/YYYY format
              const parts = dateStr.split('/');
              if (parts.length === 3) {
                // Try M/D/YYYY first (US format)
                const month = parseInt(parts[0]) - 1;
                const day = parseInt(parts[1]);
                const year = parseInt(parts[2]);
                const parsed = new Date(year, month, day);
                if (!isNaN(parsed.getTime()) && parsed.getDate() === day && parsed.getMonth() === month) {
                  parsedDate = parsed.toISOString().split('T')[0];
                } else {
                  // Try D/M/YYYY (European format)
                  const day2 = parseInt(parts[0]);
                  const month2 = parseInt(parts[1]) - 1;
                  const year2 = parseInt(parts[2]);
                  const parsed2 = new Date(year2, month2, day2);
                  if (!isNaN(parsed2.getTime()) && parsed2.getDate() === day2 && parsed2.getMonth() === month2) {
                    parsedDate = parsed2.toISOString().split('T')[0];
                  }
                }
              }
            } else {
              // Standard Date parsing
              const dateObj = new Date(dateStr);
              if (!isNaN(dateObj.getTime()) && dateObj.getFullYear() > 1900 && dateObj.getFullYear() < 2100) {
                parsedDate = dateObj.toISOString().split('T')[0];
              }
            }
          } catch (e) {
            // Invalid date, leave as null
          }
        }
        
        return {
          rowIndex: index + 1, // Actual row number (1-based, excluding header)
          date: row[0] ? {
            raw: row[0],
            type: typeof row[0],
            string: row[0]?.toString(),
            parsed: parsedDate,
          } : null,
          riderCode: row[1]?.toString(),
          hours: row[2]?.toString(),
          orders: row[6]?.toString(),
        };
      });

      return NextResponse.json({
        success: true,
        totalRows: allData.length - 1, // Exclude header
        sampleRows,
        message: 'تم جلب بيانات الأداء من Google Sheets',
      });
    }

    if (action === 'supervisor') {
      const supervisorCode = searchParams.get('supervisorCode');
      if (!supervisorCode) {
        return NextResponse.json({ success: false, error: 'كود المشرف مطلوب' }, { status: 400 });
      }

      // Get supervisor riders
      const riders = await getSupervisorRiders(supervisorCode);
      
      // Get performance data for a date range
      const startDate = searchParams.get('startDate');
      const endDate = searchParams.get('endDate');
      
      let performanceData: any[] = [];
      if (startDate && endDate) {
        try {
          const start = new Date(startDate);
          const end = new Date(endDate);
          
          // Validate dates
          if (isNaN(start.getTime()) || isNaN(end.getTime())) {
            return NextResponse.json({ 
              success: false, 
              error: 'تاريخ غير صحيح. استخدم تنسيق YYYY-MM-DD' 
            }, { status: 400 });
          }
          
          performanceData = await getSupervisorPerformanceFiltered(
            supervisorCode,
            start,
            end
          );
        } catch (error: any) {
          console.error('Error fetching performance data:', error);
          return NextResponse.json({ 
            success: false, 
            error: `خطأ في جلب البيانات: ${error.message || 'خطأ غير معروف'}` 
          }, { status: 500 });
        }
      }

      return NextResponse.json({
        success: true,
        supervisorCode,
        ridersCount: riders.length,
        riders: riders.map(r => ({ code: r.code, name: r.name })),
        performanceDataCount: performanceData.length,
        performanceData: performanceData.slice(0, 10), // First 10 records
        dateRange: startDate && endDate ? { startDate, endDate } : null,
      });
    }

    // Default: return all info
    const allData = await getSheetData('البيانات اليومية', false);
    const ridersData = await getSheetData('المناديب', false);

    return NextResponse.json({
      success: true,
      performance: {
        totalRows: allData.length - 1,
        firstRow: allData[1] ? {
          date: allData[1][0]?.toString(),
          riderCode: allData[1][1]?.toString(),
        } : null,
        lastRow: allData[allData.length - 1] ? {
          date: allData[allData.length - 1][0]?.toString(),
          riderCode: allData[allData.length - 1][1]?.toString(),
        } : null,
      },
      riders: {
        totalRows: ridersData.length - 1,
      },
    });
  } catch (error: any) {
    console.error('Debug API error:', error);
    return NextResponse.json(
      { success: false, error: error.message || 'حدث خطأ' },
      { status: 500 }
    );
  }
}

