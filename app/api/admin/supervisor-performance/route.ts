/**
 * لوحة أداء المشرفين للمدير
 * يعرض أداء كل مشرف بناءً على أداء مناديبه خلال الفترة المحددة
 */

import { NextRequest, NextResponse } from 'next/server';
import { verifyToken } from '@/lib/auth';
import { getAllSupervisors } from '@/lib/adminService';
import { getSupervisorRiders } from '@/lib/dataService';
import { getSupervisorPerformanceFiltered } from '@/lib/dataFilter';

export const dynamic = 'force-dynamic';

function diffDaysInclusive(start: Date, end: Date): number {
  const s = new Date(start);
  const e = new Date(end);
  s.setHours(0, 0, 0, 0);
  e.setHours(0, 0, 0, 0);
  const ms = e.getTime() - s.getTime();
  if (!Number.isFinite(ms) || ms < 0) return 0;
  return Math.floor(ms / (24 * 60 * 60 * 1000)) + 1;
}

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
    const startDateStr = searchParams.get('start_date');
    const endDateStr = searchParams.get('end_date');

    if (!startDateStr || !endDateStr) {
      return NextResponse.json(
        { success: false, error: 'المطلوب: start_date و end_date (YYYY-MM-DD)' },
        { status: 400 }
      );
    }

    const startDate = new Date(startDateStr + 'T00:00:00');
    const endDate = new Date(endDateStr + 'T23:59:59');
    if (isNaN(startDate.getTime()) || isNaN(endDate.getTime())) {
      return NextResponse.json({ success: false, error: 'تاريخ غير صحيح' }, { status: 400 });
    }
    if (startDate > endDate) {
      return NextResponse.json({ success: false, error: 'تاريخ البداية يجب أن يكون قبل تاريخ النهاية' }, { status: 400 });
    }

    const supervisors = await getAllSupervisors(false);
    const results: Array<{
      code: string;
      name: string;
      region: string;
      subordinate_count: number;
      total_orders: number;
      total_hours: number;
      avg_acceptance: number;
      records_count: number;
      orders_per_rider: number;
      target_hours_daily: number;
      target_hours_total: number;
      achievement_percent: number;
    }> = [];

    let grandTotalOrders = 0;
    let grandTotalHours = 0;
    let grandAcceptanceSum = 0;
    let grandAcceptanceCount = 0;

    for (const sup of supervisors) {
      const riders = await getSupervisorRiders(sup.code, false);
      const performance = await getSupervisorPerformanceFiltered(sup.code, startDate, endDate);

      let totalOrders = 0;
      let totalHours = 0;
      let acceptanceSum = 0;
      let acceptanceCount = 0;

      for (const record of performance) {
        totalOrders += record.orders || 0;
        totalHours += record.hours || 0;
        const acc = typeof record.acceptance === 'string'
          ? parseFloat(String(record.acceptance).replace('%', '')) || 0
          : Number(record.acceptance) || 0;
        acceptanceSum += acc;
        acceptanceCount += 1;
      }

      grandTotalOrders += totalOrders;
      grandTotalHours += totalHours;
      grandAcceptanceSum += acceptanceSum;
      grandAcceptanceCount += acceptanceCount;

      const avgAcceptance = acceptanceCount > 0 ? Math.round((acceptanceSum / acceptanceCount) * 100) / 100 : 0;
      const ordersPerRider = riders.length > 0 ? Math.round((totalOrders / riders.length) * 100) / 100 : 0;
      const days = diffDaysInclusive(startDate, endDate);
      const targetDaily = Number.isFinite(Number(sup.target)) ? Number(sup.target) : 0;
      const targetTotal = days > 0 && targetDaily > 0 ? targetDaily * days : 0;
      const achievementPercent =
        targetTotal > 0 ? Math.round((totalHours / targetTotal) * 10000) / 100 : 0;

      results.push({
        code: sup.code,
        name: sup.name || sup.code,
        region: sup.region || '',
        subordinate_count: riders.length,
        total_orders: totalOrders,
        total_hours: Math.round(totalHours * 100) / 100,
        avg_acceptance: avgAcceptance,
        records_count: performance.length,
        orders_per_rider: ordersPerRider,
        target_hours_daily: Math.round(targetDaily * 100) / 100,
        target_hours_total: Math.round(targetTotal * 100) / 100,
        achievement_percent: achievementPercent,
      });
    }

    const grandAvgAcceptance = grandAcceptanceCount > 0
      ? Math.round((grandAcceptanceSum / grandAcceptanceCount) * 100) / 100
      : 0;

    // Best supervisor by achievement %, tie-breakers: total_hours desc, total_orders desc
    const bestSupervisor =
      results.length === 0
        ? null
        : [...results]
            .sort((a, b) => {
              if (b.achievement_percent !== a.achievement_percent) return b.achievement_percent - a.achievement_percent;
              if (b.total_hours !== a.total_hours) return b.total_hours - a.total_hours;
              return b.total_orders - a.total_orders;
            })[0];

    return NextResponse.json({
      success: true,
      data: {
        start_date: startDateStr,
        end_date: endDateStr,
        summary: {
          total_supervisors: results.length,
          total_orders: grandTotalOrders,
          total_hours: Math.round(grandTotalHours * 100) / 100,
          avg_acceptance: grandAvgAcceptance,
          total_records: results.reduce((s, r) => s + r.records_count, 0),
        },
        comparison: {
          days: diffDaysInclusive(startDate, endDate),
          best_supervisor: bestSupervisor
            ? {
                code: bestSupervisor.code,
                name: bestSupervisor.name,
                achievement_percent: bestSupervisor.achievement_percent,
                total_hours: bestSupervisor.total_hours,
                total_orders: bestSupervisor.total_orders,
                target_hours_daily: bestSupervisor.target_hours_daily,
                target_hours_total: bestSupervisor.target_hours_total,
              }
            : null,
        },
        supervisors: results,
      },
    });
  } catch (error: any) {
    console.error('[Supervisor Performance API]', error);
    return NextResponse.json({ success: false, error: error?.message || 'حدث خطأ' }, { status: 500 });
  }
}
