import { NextRequest, NextResponse } from 'next/server';
import { verifyToken } from '@/lib/auth';
import { assertAdminApiAccess } from '@/lib/adminFeatureAccess';
import { extractBearerToken } from '@/lib/requestAuth';
import { getSheetData } from '@/lib/googleSheets';

export const dynamic = 'force-dynamic';

interface DeltaResult {
  newHires: number;
  reactivations: number;
  terminations: number;
  delta: number;
  netGrowth: string;
  period: { from: string; to: string } | null;
  breakdown: {
    newHires: Array<{ code: string; name: string; date: string }>;
    reactivations: Array<{ code: string; name: string; date: string }>;
    terminations: Array<{ code: string; name: string; date: string; reason: string }>;
  };
}

export async function GET(request: NextRequest) {
  try {
    const token = extractBearerToken(request);
    if (!token) {
      return NextResponse.json({ 
        success: false, 
        error: 'غير مصرح' 
      }, { status: 401 });
    }

    const decoded = verifyToken(token);
    if (!decoded || decoded.role !== 'admin') {
      return NextResponse.json({ 
        success: false, 
        error: 'غير مصرح' 
      }, { status: 401 });
    }

    const ps = assertAdminApiAccess(decoded, 'assignment_requests');
    if (ps) return ps;

    const { searchParams } = new URL(request.url);
    const fromDate = searchParams.get('from');
    const toDate = searchParams.get('to');
    const zone = searchParams.get('zone');

    // Fetch data from Google Sheets
    const [assignmentData, reactivationData, terminationData] = await Promise.all([
      getSheetData('طلبات التعيين'),
      getSheetData('طلبات إعادة التفعيل'),
      getSheetData('طلبات الإقالة'),
    ]);

    // Parse assignment requests (new hires)
    const newHires = parseRequests(assignmentData, fromDate, toDate, zone, 'approved');
    
    // Parse reactivation requests
    const reactivations = parseRequests(reactivationData, fromDate, toDate, zone, 'approved');
    
    // Parse termination requests
    const terminations = parseTerminations(terminationData, fromDate, toDate, zone);

    // Calculate delta
    const delta = (newHires.length + reactivations.length) - terminations.length;
    
    // Determine net growth description
    let netGrowth = '';
    if (delta > 0) {
      netGrowth = `نمو إيجابي: +${delta} مندوب`;
    } else if (delta < 0) {
      netGrowth = `انخفاض: ${delta} مندوب`;
    } else {
      netGrowth = 'ثابت: لا تغيير';
    }

    // Determine period
    const allDates = [
      ...newHires.map(h => h.date),
      ...reactivations.map(r => r.date),
      ...terminations.map(t => t.date),
    ].filter(Boolean).sort();
    
    const period = allDates.length > 0 
      ? { from: allDates[0], to: allDates[allDates.length - 1] }
      : null;

    const result: DeltaResult = {
      newHires: newHires.length,
      reactivations: reactivations.length,
      terminations: terminations.length,
      delta,
      netGrowth,
      period,
      breakdown: {
        newHires: newHires.slice(0, 50), // Limit to 50 for performance
        reactivations: reactivations.slice(0, 50),
        terminations: terminations.slice(0, 50),
      },
    };

    return NextResponse.json({
      success: true,
      data: result,
    });
  } catch (error: any) {
    console.error('[Delta API] Error:', error);
    return NextResponse.json({ 
      success: false, 
      error: error.message || 'حدث خطأ' 
    }, { status: 500 });
  }
}

function parseRequests(
  data: any[][], 
  fromDate: string | null, 
  toDate: string | null,
  zone: string | null,
  statusFilter?: string
): Array<{ code: string; name: string; date: string }> {
  if (data.length <= 1) return [];

  const headers = data[0];
  const codeIdx = headers.findIndex((h: string) => h && (h.toString().toLowerCase().includes('كود') || h.toString().toLowerCase().includes('code')));
  const nameIdx = headers.findIndex((h: string) => h && (h.toString().toLowerCase().includes('اسم') || h.toString().toLowerCase().includes('name')));
  const dateIdx = headers.findIndex((h: string) => h && (h.toString().toLowerCase().includes('تاريخ') || h.toString().toLowerCase().includes('date')));
  const statusIdx = headers.findIndex((h: string) => h && (h.toString().toLowerCase().includes('حالة') || h.toString().toLowerCase().includes('status')));
  const zoneIdx = headers.findIndex((h: string) => h && (h.toString().toLowerCase().includes('منطقة') || h.toString().toLowerCase().includes('zone') || h.toString().toLowerCase().includes('city') || h.toString().toLowerCase().includes('مدينة')));

  const results: Array<{ code: string; name: string; date: string }> = [];

  for (let i = 1; i < data.length; i++) {
    const row = data[i];
    
    // Check status filter
    if (statusFilter && statusIdx >= 0) {
      const status = String(row[statusIdx] || '').trim().toLowerCase();
      if (!status.includes(statusFilter) && !status.includes('موافق') && !status.includes('تم')) {
        continue;
      }
    }

    const dateStr = dateIdx >= 0 ? parseDateString(row[dateIdx]) : '';
    
    // Filter by date range
    if (fromDate && dateStr && dateStr < fromDate) continue;
    if (toDate && dateStr && dateStr > toDate) continue;

    // Filter by zone
    if (zone && zoneIdx >= 0) {
      const rowZone = String(row[zoneIdx] || '').trim();
      if (rowZone && rowZone !== zone) continue;
    }

    const code = codeIdx >= 0 ? String(row[codeIdx] || '').trim() : '';
    const name = nameIdx >= 0 ? String(row[nameIdx] || '').trim() : '';

    if (code || name) {
      results.push({ code, name, date: dateStr });
    }
  }

  return results;
}

function parseTerminations(
  data: any[][],
  fromDate: string | null,
  toDate: string | null,
  zone: string | null
): Array<{ code: string; name: string; date: string; reason: string }> {
  if (data.length <= 1) return [];

  const headers = data[0];
  const codeIdx = headers.findIndex((h: string) => h && (h.toString().toLowerCase().includes('كود') || h.toString().toLowerCase().includes('code')));
  const nameIdx = headers.findIndex((h: string) => h && (h.toString().toLowerCase().includes('اسم') || h.toString().toLowerCase().includes('name')));
  const dateIdx = headers.findIndex((h: string) => h && (h.toString().toLowerCase().includes('تاريخ') || h.toString().toLowerCase().includes('date')));
  const reasonIdx = headers.findIndex((h: string) => h && (h.toString().toLowerCase().includes('سبب') || h.toString().toLowerCase().includes('reason')));
  const statusIdx = headers.findIndex((h: string) => h && (h.toString().toLowerCase().includes('حالة') || h.toString().toLowerCase().includes('status')));
  const zoneIdx = headers.findIndex((h: string) => h && (h.toString().toLowerCase().includes('منطقة') || h.toString().toLowerCase().includes('zone') || h.toString().toLowerCase().includes('city') || h.toString().toLowerCase().includes('مدينة')));

  const results: Array<{ code: string; name: string; date: string; reason: string }> = [];

  for (let i = 1; i < data.length; i++) {
    const row = data[i];
    
    // Only approved terminations
    if (statusIdx >= 0) {
      const status = String(row[statusIdx] || '').trim().toLowerCase();
      if (!status.includes('approved') && !status.includes('موافق') && !status.includes('تم')) {
        continue;
      }
    }

    const dateStr = dateIdx >= 0 ? parseDateString(row[dateIdx]) : '';
    
    // Filter by date range
    if (fromDate && dateStr && dateStr < fromDate) continue;
    if (toDate && dateStr && dateStr > toDate) continue;

    // Filter by zone
    if (zone && zoneIdx >= 0) {
      const rowZone = String(row[zoneIdx] || '').trim();
      if (rowZone && rowZone !== zone) continue;
    }

    const code = codeIdx >= 0 ? String(row[codeIdx] || '').trim() : '';
    const name = nameIdx >= 0 ? String(row[nameIdx] || '').trim() : '';
    const reason = reasonIdx >= 0 ? String(row[reasonIdx] || '').trim() : '';

    if (code || name) {
      results.push({ code, name, date: dateStr, reason });
    }
  }

  return results;
}

function parseDateString(dateValue: any): string {
  if (!dateValue) return '';
  try {
    const d = new Date(dateValue);
    if (isNaN(d.getTime())) return '';
    return d.toISOString().split('T')[0];
  } catch {
    return '';
  }
}
