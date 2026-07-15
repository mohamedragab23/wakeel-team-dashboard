import { NextRequest, NextResponse } from 'next/server';
import { verifyToken } from '@/lib/auth';
import { assertAdminApiAccess } from '@/lib/adminFeatureAccess';
import { extractBearerToken } from '@/lib/requestAuth';
import { getSheetData } from '@/lib/googleSheets';

export const dynamic = 'force-dynamic';

interface RiderDayRecord {
  date: string;
  riderId: string;
  riderName: string;
  supervisor: string;
  orders: number;
  workedHours: number;
  breakHours: number;
  lateHours: number;
}

interface AnalyticsResult {
  // Basic stats
  totalRiders: number;
  uniqueRiders: number;
  totalRecords: number;
  dateRange: { from: string; to: string } | null;
  
  // Active/Absent analytics
  avgActiveRiders: number;
  avgAbsentRiders: number;
  activeRidersPercentage: number;
  
  // Work hours analytics
  avgWorkHours: number;
  avgBreakHours: number;
  totalWorkHours: number;
  
  // Segments
  workHoursSegments: {
    lessThan4: { count: number; riders: Array<{ id: string; name: string; avgHours: number }> };
    from4To6: { count: number; riders: Array<{ id: string; name: string; avgHours: number }> };
    from6To8: { count: number; riders: Array<{ id: string; name: string; avgHours: number }> };
    above8: { count: number; riders: Array<{ id: string; name: string; avgHours: number }> };
  };
  
  // Inactive riders
  inactive3DaysPlus: Array<{ id: string; name: string; lastActiveDate: string; daysInactive: number }>;
  
  // Top performers/issues
  topBreakTakers: Array<{ id: string; name: string; avgBreakHours: number; totalBreakHours: number }>;
  topAbsentRiders: Array<{ id: string; name: string; absentDays: number; totalDays: number }>;
  
  // Supervisor analytics
  supervisorStats: Array<{
    supervisor: string;
    totalRiders: number;
    avgActiveRiders: number;
    avgWorkHours: number;
    avgBreakHours: number;
    absentRate: number;
    activeRate: number;
  }>;
  
  // Daily breakdown
  dailyStats: Array<{
    date: string;
    activeRiders: number;
    absentRiders: number;
    avgWorkHours: number;
    avgBreakHours: number;
    totalWorkHours: number;
  }>;
}

function parseDate(dateStr: any): Date | null {
  if (!dateStr) return null;
  try {
    // Try parsing different date formats
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return null;
    return d;
  } catch {
    return null;
  }
}

function formatDate(date: Date): string {
  return date.toISOString().split('T')[0];
}

export async function GET(request: NextRequest) {
  try {
    const token = extractBearerToken(request);
    if (!token) {
      return NextResponse.json({ 
        success: false, 
        error: 'غير مصرح - لم يتم توفير رمز المصادقة.' 
      }, { status: 401 });
    }

    const decoded = verifyToken(token);
    if (!decoded || decoded.role !== 'admin') {
      return NextResponse.json({ 
        success: false, 
        error: 'غير مصرح - يجب أن تكون مسجلاً كمدير.' 
      }, { status: 401 });
    }

    const ps = assertAdminApiAccess(decoded, 'performance_upload');
    if (ps) return ps;

    // Get query parameters
    const { searchParams } = new URL(request.url);
    const fromDate = searchParams.get('from');
    const toDate = searchParams.get('to');

    // Fetch data from Google Sheets
    const dailyData = await getSheetData('البيانات اليومية');
    
    if (dailyData.length <= 1) {
      return NextResponse.json({
        success: true,
        data: {
          totalRiders: 0,
          uniqueRiders: 0,
          totalRecords: 0,
          message: 'لا توجد بيانات متاحة. يرجى رفع ملفات الأداء أولاً.',
        } as Partial<AnalyticsResult>,
      });
    }

    // Parse headers
    const headers = dailyData[0];
    const dateIdx = headers.findIndex((h: string) => h && h.toString().toLowerCase().includes('تاريخ') || h.toString().toLowerCase().includes('date'));
    const riderIdIdx = headers.findIndex((h: string) => h && (h.toString().toLowerCase().includes('كود') || h.toString().toLowerCase().includes('id')));
    const riderNameIdx = headers.findIndex((h: string) => h && (h.toString().toLowerCase().includes('اسم') || h.toString().toLowerCase().includes('name')));
    const supervisorIdx = headers.findIndex((h: string) => h && h.toString().toLowerCase().includes('مشرف') || h.toString().toLowerCase().includes('supervisor'));
    const ordersIdx = headers.findIndex((h: string) => h && (h.toString().toLowerCase().includes('أوردر') || h.toString().toLowerCase().includes('order')));
    const workedHoursIdx = headers.findIndex((h: string) => h && (h.toString().toLowerCase().includes('ساعات') || h.toString().toLowerCase().includes('hour')) && !h.toString().toLowerCase().includes('استراحة') && !h.toString().toLowerCase().includes('break'));
    const breakHoursIdx = headers.findIndex((h: string) => h && (h.toString().toLowerCase().includes('استراحة') || h.toString().toLowerCase().includes('break')));
    const lateHoursIdx = headers.findIndex((h: string) => h && (h.toString().toLowerCase().includes('تأخير') || h.toString().toLowerCase().includes('late')));

    // Parse records
    const records: RiderDayRecord[] = [];
    for (let i = 1; i < dailyData.length; i++) {
      const row = dailyData[i];
      const dateObj = dateIdx >= 0 ? parseDate(row[dateIdx]) : null;
      if (!dateObj) continue;

      const dateStr = formatDate(dateObj);
      
      // Filter by date range if provided
      if (fromDate && dateStr < fromDate) continue;
      if (toDate && dateStr > toDate) continue;

      const record: RiderDayRecord = {
        date: dateStr,
        riderId: riderIdIdx >= 0 ? String(row[riderIdIdx] || '').trim() : '',
        riderName: riderNameIdx >= 0 ? String(row[riderNameIdx] || '').trim() : '',
        supervisor: supervisorIdx >= 0 ? String(row[supervisorIdx] || '').trim() : '',
        orders: ordersIdx >= 0 ? parseFloat(String(row[ordersIdx] || 0)) : 0,
        workedHours: workedHoursIdx >= 0 ? parseFloat(String(row[workedHoursIdx] || 0)) : 0,
        breakHours: breakHoursIdx >= 0 ? parseFloat(String(row[breakHoursIdx] || 0)) : 0,
        lateHours: lateHoursIdx >= 0 ? parseFloat(String(row[lateHoursIdx] || 0)) : 0,
      };

      if (record.riderId) {
        records.push(record);
      }
    }

    // Perform analytics
    const analytics = performAnalytics(records);

    return NextResponse.json({
      success: true,
      data: analytics,
    });
  } catch (error: any) {
    console.error('[Performance Analytics API] Error:', error);
    return NextResponse.json({ 
      success: false, 
      error: error.message || 'حدث خطأ أثناء تحليل البيانات' 
    }, { status: 500 });
  }
}

function performAnalytics(records: RiderDayRecord[]): AnalyticsResult {
  if (records.length === 0) {
    return {
      totalRiders: 0,
      uniqueRiders: 0,
      totalRecords: 0,
      dateRange: null,
      avgActiveRiders: 0,
      avgAbsentRiders: 0,
      activeRidersPercentage: 0,
      avgWorkHours: 0,
      avgBreakHours: 0,
      totalWorkHours: 0,
      workHoursSegments: {
        lessThan4: { count: 0, riders: [] },
        from4To6: { count: 0, riders: [] },
        from6To8: { count: 0, riders: [] },
        above8: { count: 0, riders: [] },
      },
      inactive3DaysPlus: [],
      topBreakTakers: [],
      topAbsentRiders: [],
      supervisorStats: [],
      dailyStats: [],
    };
  }

  // Basic stats
  const uniqueRiderIds = new Set(records.map(r => r.riderId));
  const dates = [...new Set(records.map(r => r.date))].sort();
  const dateRange = dates.length > 0 ? { from: dates[0], to: dates[dates.length - 1] } : null;

  // Daily stats
  const dailyStatsMap = new Map<string, { activeCount: number; absentCount: number; totalHours: number; totalBreak: number; riderCount: number }>();
  
  for (const record of records) {
    if (!dailyStatsMap.has(record.date)) {
      dailyStatsMap.set(record.date, { activeCount: 0, absentCount: 0, totalHours: 0, totalBreak: 0, riderCount: 0 });
    }
    const dayStats = dailyStatsMap.get(record.date)!;
    
    const isActive = record.orders > 0 && record.workedHours > 0;
    const isAbsent = record.orders === 0 && record.workedHours === 0;
    
    if (isActive) dayStats.activeCount++;
    if (isAbsent) dayStats.absentCount++;
    
    dayStats.totalHours += record.workedHours;
    dayStats.totalBreak += record.breakHours;
    dayStats.riderCount++;
  }

  const dailyStats = Array.from(dailyStatsMap.entries())
    .map(([date, stats]) => ({
      date,
      activeRiders: stats.activeCount,
      absentRiders: stats.absentCount,
      avgWorkHours: stats.riderCount > 0 ? stats.totalHours / stats.riderCount : 0,
      avgBreakHours: stats.riderCount > 0 ? stats.totalBreak / stats.riderCount : 0,
      totalWorkHours: stats.totalHours,
    }))
    .sort((a, b) => a.date.localeCompare(b.date));

  // Average active/absent
  const avgActiveRiders = dailyStats.length > 0 
    ? dailyStats.reduce((sum, d) => sum + d.activeRiders, 0) / dailyStats.length 
    : 0;
  const avgAbsentRiders = dailyStats.length > 0 
    ? dailyStats.reduce((sum, d) => sum + d.absentRiders, 0) / dailyStats.length 
    : 0;

  // Per-rider analytics
  const riderMap = new Map<string, { name: string; records: RiderDayRecord[] }>();
  for (const record of records) {
    if (!riderMap.has(record.riderId)) {
      riderMap.set(record.riderId, { name: record.riderName, records: [] });
    }
    riderMap.get(record.riderId)!.records.push(record);
  }

  // Work hours segments
  const workHoursSegments = {
    lessThan4: { count: 0, riders: [] as Array<{ id: string; name: string; avgHours: number }> },
    from4To6: { count: 0, riders: [] as Array<{ id: string; name: string; avgHours: number }> },
    from6To8: { count: 0, riders: [] as Array<{ id: string; name: string; avgHours: number }> },
    above8: { count: 0, riders: [] as Array<{ id: string; name: string; avgHours: number }> },
  };

  for (const [riderId, riderData] of riderMap.entries()) {
    const avgHours = riderData.records.reduce((sum, r) => sum + r.workedHours, 0) / riderData.records.length;
    const riderInfo = { id: riderId, name: riderData.name, avgHours: Math.round(avgHours * 10) / 10 };

    if (avgHours < 4) {
      workHoursSegments.lessThan4.count++;
      workHoursSegments.lessThan4.riders.push(riderInfo);
    } else if (avgHours < 6) {
      workHoursSegments.from4To6.count++;
      workHoursSegments.from4To6.riders.push(riderInfo);
    } else if (avgHours < 8) {
      workHoursSegments.from6To8.count++;
      workHoursSegments.from6To8.riders.push(riderInfo);
    } else {
      workHoursSegments.above8.count++;
      workHoursSegments.above8.riders.push(riderInfo);
    }
  }

  // Sort riders in each segment by avgHours
  workHoursSegments.lessThan4.riders.sort((a, b) => a.avgHours - b.avgHours);
  workHoursSegments.from4To6.riders.sort((a, b) => a.avgHours - b.avgHours);
  workHoursSegments.from6To8.riders.sort((a, b) => a.avgHours - b.avgHours);
  workHoursSegments.above8.riders.sort((a, b) => b.avgHours - a.avgHours);

  // Inactive 3+ days
  const inactive3DaysPlus: Array<{ id: string; name: string; lastActiveDate: string; daysInactive: number }> = [];
  const today = new Date();
  
  for (const [riderId, riderData] of riderMap.entries()) {
    const sortedRecords = riderData.records.sort((a, b) => b.date.localeCompare(a.date));
    let consecutiveInactiveDays = 0;
    let lastActiveDate = '';

    for (const record of sortedRecords) {
      const isActive = record.orders > 0 && record.workedHours > 0;
      if (isActive) {
        lastActiveDate = record.date;
        break;
      }
      consecutiveInactiveDays++;
    }

    if (consecutiveInactiveDays >= 3) {
      inactive3DaysPlus.push({
        id: riderId,
        name: riderData.name,
        lastActiveDate,
        daysInactive: consecutiveInactiveDays,
      });
    }
  }

  // Top break takers
  const topBreakTakers = Array.from(riderMap.entries())
    .map(([riderId, riderData]) => {
      const totalBreak = riderData.records.reduce((sum, r) => sum + r.breakHours, 0);
      const avgBreak = totalBreak / riderData.records.length;
      return {
        id: riderId,
        name: riderData.name,
        avgBreakHours: Math.round(avgBreak * 10) / 10,
        totalBreakHours: Math.round(totalBreak * 10) / 10,
      };
    })
    .sort((a, b) => b.avgBreakHours - a.avgBreakHours)
    .slice(0, 20);

  // Top absent riders
  const topAbsentRiders = Array.from(riderMap.entries())
    .map(([riderId, riderData]) => {
      const absentDays = riderData.records.filter(r => r.orders === 0 && r.workedHours === 0).length;
      const totalDays = riderData.records.length;
      return {
        id: riderId,
        name: riderData.name,
        absentDays,
        totalDays,
      };
    })
    .filter(r => r.absentDays > 0)
    .sort((a, b) => b.absentDays - a.absentDays)
    .slice(0, 20);

  // Supervisor stats
  const supervisorMap = new Map<string, RiderDayRecord[]>();
  for (const record of records) {
    const sup = record.supervisor || 'غير محدد';
    if (!supervisorMap.has(sup)) {
      supervisorMap.set(sup, []);
    }
    supervisorMap.get(sup)!.push(record);
  }

  const supervisorStats = Array.from(supervisorMap.entries())
    .map(([supervisor, supRecords]) => {
      const uniqueSupRiders = new Set(supRecords.map(r => r.riderId));
      const dailySupStats = new Map<string, { active: number; absent: number; totalHours: number; totalBreak: number }>();
      
      for (const record of supRecords) {
        if (!dailySupStats.has(record.date)) {
          dailySupStats.set(record.date, { active: 0, absent: 0, totalHours: 0, totalBreak: 0 });
        }
        const dayStats = dailySupStats.get(record.date)!;
        
        if (record.orders > 0 && record.workedHours > 0) dayStats.active++;
        if (record.orders === 0 && record.workedHours === 0) dayStats.absent++;
        dayStats.totalHours += record.workedHours;
        dayStats.totalBreak += record.breakHours;
      }

      const avgActive = dailySupStats.size > 0 
        ? Array.from(dailySupStats.values()).reduce((sum, d) => sum + d.active, 0) / dailySupStats.size 
        : 0;
      const avgHours = supRecords.length > 0 
        ? supRecords.reduce((sum, r) => sum + r.workedHours, 0) / supRecords.length 
        : 0;
      const avgBreak = supRecords.length > 0 
        ? supRecords.reduce((sum, r) => sum + r.breakHours, 0) / supRecords.length 
        : 0;
      const absentCount = supRecords.filter(r => r.orders === 0 && r.workedHours === 0).length;
      const absentRate = supRecords.length > 0 ? (absentCount / supRecords.length) * 100 : 0;
      const activeRate = supRecords.length > 0 ? ((supRecords.length - absentCount) / supRecords.length) * 100 : 0;

      return {
        supervisor,
        totalRiders: uniqueSupRiders.size,
        avgActiveRiders: Math.round(avgActive * 10) / 10,
        avgWorkHours: Math.round(avgHours * 10) / 10,
        avgBreakHours: Math.round(avgBreak * 10) / 10,
        absentRate: Math.round(absentRate * 10) / 10,
        activeRate: Math.round(activeRate * 10) / 10,
      };
    })
    .sort((a, b) => b.avgWorkHours - a.avgWorkHours);

  // Overall averages
  const totalWorkHours = records.reduce((sum, r) => sum + r.workedHours, 0);
  const avgWorkHours = records.length > 0 ? totalWorkHours / records.length : 0;
  const avgBreakHours = records.length > 0 
    ? records.reduce((sum, r) => sum + r.breakHours, 0) / records.length 
    : 0;
  const activeRidersPercentage = uniqueRiderIds.size > 0 
    ? (avgActiveRiders / uniqueRiderIds.size) * 100 
    : 0;

  return {
    totalRiders: uniqueRiderIds.size,
    uniqueRiders: uniqueRiderIds.size,
    totalRecords: records.length,
    dateRange,
    avgActiveRiders: Math.round(avgActiveRiders * 10) / 10,
    avgAbsentRiders: Math.round(avgAbsentRiders * 10) / 10,
    activeRidersPercentage: Math.round(activeRidersPercentage * 10) / 10,
    avgWorkHours: Math.round(avgWorkHours * 10) / 10,
    avgBreakHours: Math.round(avgBreakHours * 10) / 10,
    totalWorkHours: Math.round(totalWorkHours * 10) / 10,
    workHoursSegments,
    inactive3DaysPlus: inactive3DaysPlus.sort((a, b) => b.daysInactive - a.daysInactive),
    topBreakTakers,
    topAbsentRiders,
    supervisorStats,
    dailyStats,
  };
}
