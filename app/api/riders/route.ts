/**
 * Riders API - Read from Google Sheets
 * Server-side compatible, client can cache in IndexedDB
 */

import { NextRequest, NextResponse } from 'next/server';
import { extractBearerToken } from '@/lib/requestAuth';
import { verifyToken } from '@/lib/auth';
import { getSupervisorRiders, getAllAssignedRiders, getLatestRiderData } from '@/lib/dataService';
import { getSupervisorPerformanceFiltered } from '@/lib/dataFilter';
import { aggregateRidersInDateRange } from '@/lib/riderPerformanceAggregate';
import { parseAdminAllowedZonesList } from '@/lib/zones';
import { getSupervisorCodesInAdminDataScope } from '@/lib/adminZoneScope';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    const token = extractBearerToken(request);

    if (!token) {
      return NextResponse.json({ success: false, error: 'غير مصرح' }, { status: 401 });
    }

    const decoded = verifyToken(token);
    if (!decoded) {
      return NextResponse.json({ success: false, error: 'غير مصرح' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const startDateParam = searchParams.get('startDate');
    const endDateParam = searchParams.get('endDate');
    const dateParam = searchParams.get('date'); // Backward compatibility

    const refresh = searchParams.get('refresh') === 'true';
    const useCache = !refresh;
    let riders =
      decoded.role === 'admin'
        ? await getAllAssignedRiders(useCache)
        : await getSupervisorRiders(decoded.code, useCache);

    if (decoded.role === 'admin') {
      const allowedSup = await getSupervisorCodesInAdminDataScope(decoded as Parameters<typeof getSupervisorCodesInAdminDataScope>[0]);
      if (allowedSup) {
        riders = riders.filter((r) => allowedSup.has(String(r.supervisorCode ?? '').trim()));
      } else {
        const zones = parseAdminAllowedZonesList((decoded as { dataZone?: string }).dataZone);
        if (zones.length > 0) {
          const allow = new Set<string>(zones);
          riders = riders.filter((r) => allow.has((r.region || '').trim()));
        }
      }
    }

    const performanceScope = decoded.role === 'admin' ? null : decoded.code;

    // If date range is provided, get data for that range
    if (startDateParam && endDateParam) {
      // Parse dates properly - handle timezone issues
      const startDate = new Date(startDateParam + 'T00:00:00');
      const endDate = new Date(endDateParam + 'T23:59:59');
      
      console.log(`[Riders API] ========================================`);
      console.log(`[Riders API] Date range requested: ${startDateParam} to ${endDateParam}`);
      console.log(`[Riders API] Parsed dates: ${startDate.toISOString()} to ${endDate.toISOString()}`);
      console.log(`[Riders API] Viewer: ${decoded.role} ${decoded.code}, Riders list size: ${riders.length}`);
      console.log(`[Riders API] Rider codes: ${riders.map(r => r.code).join(', ')}`);

      const performanceData = await getSupervisorPerformanceFiltered(performanceScope, startDate, endDate, {
        useCache: false,
      });

      console.log(`[Riders API] Performance data found: ${performanceData.length} records`);
      
      // Debug: Log sample performance data
      if (performanceData.length > 0) {
        console.log(`[Riders API] Sample performance records:`, performanceData.slice(0, 3).map(p => ({
          date: p.date,
          riderCode: p.riderCode,
          orders: p.orders,
          hours: p.hours
        })));
      } else {
        console.log(`[Riders API] ⚠️ No performance data found for the date range!`);
      }

      const dateLabel =
        startDateParam === endDateParam ? startDateParam : `${startDateParam} - ${endDateParam}`;
      const seeds = riders.map((r) => ({
        code: r.code,
        name: r.name,
        region: r.region,
      }));
      const ridersWithData = aggregateRidersInDateRange(seeds, performanceData, dateLabel);

      const assignedCodes = new Set(riders.map((r) => (r.code ?? '').toString().trim()));
      const recordsProcessed = performanceData.filter((record) =>
        assignedCodes.has((record.riderCode ?? '').toString().trim())
      ).length;

      console.log(
        `[Riders API] Records processed: ${recordsProcessed}, Riders with data: ${ridersWithData.filter((r) => r.orders > 0 || r.hours > 0).length}`
      );
      
      // Always return riders, even if no performance data (so supervisor can see their assigned riders)
      return NextResponse.json({
        success: true,
        data: ridersWithData,
      });
    }

    // Backward compatibility: If single date is provided
    if (dateParam) {
      const selectedDate = new Date(dateParam);
      const startDate = new Date(selectedDate);
      startDate.setHours(0, 0, 0, 0);
      const endDate = new Date(selectedDate);
      endDate.setHours(23, 59, 59, 999);

      const performanceData = await getSupervisorPerformanceFiltered(performanceScope, startDate, endDate, {
        useCache: false,
      });

      const seeds = riders.map((r) => ({
        code: r.code,
        name: r.name,
        region: r.region,
      }));
      const ridersWithData = aggregateRidersInDateRange(seeds, performanceData, dateParam);
      return NextResponse.json({
        success: true,
        data: ridersWithData,
      });
    }

    // Get latest performance data for each rider (no date filter)
    const ridersWithData = await Promise.all(
      riders.map(async (rider) => {
        const latestData = await getLatestRiderData(rider.code);
        return {
          code: rider.code,
          name: rider.name,
          region: rider.region,
          hours: latestData?.hours || 0,
          break: latestData?.break || 0,
          delay: latestData?.delay || 0,
          absence: latestData?.absence || 'لا',
          orders: latestData?.orders || 0,
          acceptance: latestData?.acceptance || 0,
          debt: latestData?.debt || 0,
          date: latestData?.date || null, // Include date for display
          workDays: 0,
        };
      })
    );

    return NextResponse.json({
      success: true,
      data: ridersWithData,
    });
  } catch (error: any) {
    console.error('Get riders error:', error);
    return NextResponse.json({ success: false, error: error.message || 'حدث خطأ' }, { status: 500 });
  }
}
