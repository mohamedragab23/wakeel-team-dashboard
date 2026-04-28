import { NextRequest, NextResponse } from 'next/server';
import { verifyToken } from '@/lib/auth';
import { getAllRiders } from '@/lib/adminService';
import { getSupervisorPerformanceFiltered } from '@/lib/dataFilter';
import { aggregateRidersInDateRange, type RiderSeed } from '@/lib/riderPerformanceAggregate';

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
    const startDateParam = searchParams.get('startDate');
    const endDateParam = searchParams.get('endDate');
    if (!startDateParam || !endDateParam) {
      return NextResponse.json(
        { success: false, error: 'يرجى تحديد startDate و endDate' },
        { status: 400 }
      );
    }

    const startDate = new Date(startDateParam + 'T00:00:00');
    const endDate = new Date(endDateParam + 'T23:59:59');
    const refresh = searchParams.get('refresh') === 'true';

    const [allRiders, performanceData] = await Promise.all([
      getAllRiders(!refresh),
      getSupervisorPerformanceFiltered(null, startDate, endDate),
    ]);

    const seedMap = new Map<string, RiderSeed>();
    for (const r of allRiders) {
      const code = (r.code ?? '').toString().trim();
      if (!code) continue;
      seedMap.set(code, {
        code,
        name: r.name ?? '',
        region: r.region,
        supervisorCode: r.supervisorCode,
        supervisorName: r.supervisorName,
      });
    }

    for (const rec of performanceData) {
      const code = (rec.riderCode ?? '').toString().trim();
      if (!code || seedMap.has(code)) continue;
      seedMap.set(code, {
        code,
        name: code,
        region: '',
        supervisorCode: '',
        supervisorName: '',
      });
    }

    const dateLabel =
      startDateParam === endDateParam ? startDateParam : `${startDateParam} - ${endDateParam}`;
    const seeds = Array.from(seedMap.values());
    const data = aggregateRidersInDateRange(seeds, performanceData, dateLabel);

    return NextResponse.json({ success: true, data });
  } catch (error: any) {
    console.error('[admin/riders-performance]', error);
    return NextResponse.json(
      { success: false, error: error.message || 'حدث خطأ' },
      { status: 500 }
    );
  }
}
