import { NextRequest, NextResponse } from 'next/server';
import { verifyToken } from '@/lib/auth';
import { buildStrategicOpsReport, type StrategicOpsFilters } from '@/lib/strategicOps/buildReport';
import * as XLSX from 'xlsx';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 300;

export async function GET(request: NextRequest) {
  try {
    const token = request.cookies.get('token')?.value;
    if (!token) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const decoded = verifyToken(token);
    if (!decoded || decoded.role !== 'admin') {
      return NextResponse.json({ error: 'Forbidden - Admins only' }, { status: 403 });
    }

    const { searchParams } = new URL(request.url);
    const startDate = searchParams.get('startDate') || new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
    const endDate = searchParams.get('endDate') || new Date().toISOString().split('T')[0];
    const zone = searchParams.get('zone') || 'all';
    const supervisorCode = searchParams.get('supervisorCode') || 'all';

    // Build report
    const filters: StrategicOpsFilters = {
      startDate,
      endDate,
      zone,
      supervisorCode,
    };

    const report = await buildStrategicOpsReport(filters);

    // Extract Ghost Riders data
    const ghostRiders = report.ghostRiderAudit.ghostRiderListFull || [];

    if (ghostRiders.length === 0) {
      return NextResponse.json(
        { error: 'No ghost riders found for the selected period' },
        { status: 404 }
      );
    }

    // Prepare data for Excel
    const excelData = ghostRiders.map((ghost) => ({
      'كود المندوب (في ملف الأداء)': ghost.codeInPerformanceSheet,
      'الاسم (إن وُجد)': ghost.name || '-',
      'عدد الأيام في الفترة': ghost.daysInPeriod,
      'إجمالي الساعات': ghost.totalHours,
      'إجمالي الأوردرات': ghost.totalOrders,
      'متوسط يومي (ساعات)': ghost.avgDailyHours,
      'الحالة': ghost.found ? 'موجود في قائمة المناديب' : 'غير موجود (شبح)',
      'ملاحظات': ghost.found
        ? 'هذا المندوب موجود في القائمة الرسمية'
        : 'هذا المندوب غير موجود في قائمة المناديب - يجب إضافته أو تصحيح الكود',
    }));

    // Create workbook
    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.json_to_sheet(excelData);

    // Set column widths
    ws['!cols'] = [
      { wch: 30 }, // كود المندوب
      { wch: 35 }, // الاسم
      { wch: 20 }, // عدد الأيام
      { wch: 18 }, // إجمالي الساعات
      { wch: 20 }, // إجمالي الأوردرات
      { wch: 22 }, // متوسط يومي
      { wch: 30 }, // الحالة
      { wch: 60 }, // ملاحظات
    ];

    XLSX.utils.book_append_sheet(wb, ws, 'Ghost Riders');

    // Add summary sheet
    const summaryData = [
      { 'المقياس': 'إجمالي المناديب الأشباح', 'القيمة': ghostRiders.length },
      { 'المقياس': 'نسبة التسرب', 'القيمة': `${report.dataIntegrity.ghostLeakagePercent}%` },
      { 'المقياس': 'الفترة', 'القيمة': `${startDate} إلى ${endDate}` },
      { 'المقياس': 'المنطقة', 'القيمة': zone === 'all' ? 'جميع المناطق' : zone },
      { 'المقياس': 'تاريخ التصدير', 'القيمة': new Date().toLocaleString('ar-EG') },
    ];

    const wsSummary = XLSX.utils.json_to_sheet(summaryData);
    wsSummary['!cols'] = [{ wch: 30 }, { wch: 50 }];
    XLSX.utils.book_append_sheet(wb, wsSummary, 'ملخص');

    // Generate buffer
    const buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });

    // Return as download
    return new NextResponse(buffer, {
      status: 200,
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename="Ghost_Riders_${startDate}_to_${endDate}.xlsx"`,
      },
    });
  } catch (error) {
    console.error('[GET /api/admin/ghost-riders-export] Error:', error);
    return NextResponse.json(
      { error: 'Internal server error', details: String(error) },
      { status: 500 }
    );
  }
}
