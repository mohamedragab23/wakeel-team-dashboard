import { NextRequest, NextResponse } from 'next/server';
import { verifyToken } from '@/lib/auth';
import { assertAdminApiAccess } from '@/lib/adminFeatureAccess';
import { getSheetData } from '@/lib/googleSheets';
import { SHEET_DEDUCTIONS_UPLOAD_LOG } from '@/lib/equipmentSheetConstants';

export const dynamic = 'force-dynamic';

/** آخر عمليات رفع ملف الاستقطاعات (للمدير — إشعار دون تعديل منطق الاستقطاعات). */
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

    const di = assertAdminApiAccess(decoded, 'deductions_reconcile');
    if (di) return di;

    const { searchParams } = new URL(request.url);
    const limit = Math.min(50, Math.max(1, parseInt(searchParams.get('limit') || '15', 10)));

    let data: any[][] = [];
    try {
      data = await getSheetData(SHEET_DEDUCTIONS_UPLOAD_LOG, false);
    } catch {
      data = [];
    }

    const items: {
      at: string;
      supervisorCode: string;
      supervisorName: string;
      cycle: string;
      month: string;
      year: string;
      rowCount: number;
    }[] = [];
    for (let i = data.length - 1; i >= 1 && items.length < limit; i--) {
      const row = data[i];
      if (!row?.[0]) continue;
      const extended = row.length >= 7;
      items.push({
        at: row[0]?.toString() ?? '',
        supervisorCode: row[1]?.toString().trim() ?? '',
        supervisorName: row[2]?.toString().trim() ?? '',
        cycle: extended ? (row[3]?.toString().trim() ?? '') : '—',
        month: extended ? (row[4]?.toString().trim() ?? '') : '—',
        year: extended ? (row[5]?.toString().trim() ?? '') : '—',
        rowCount: Number(extended ? row[6] : row[3]) || 0,
      });
    }

    return NextResponse.json({ success: true, data: items });
  } catch (error: any) {
    console.error('[deductions-import-log]', error);
    return NextResponse.json({ success: false, error: error.message || 'حدث خطأ' }, { status: 500 });
  }
}
