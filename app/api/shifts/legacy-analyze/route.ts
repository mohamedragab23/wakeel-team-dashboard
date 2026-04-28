import { NextRequest, NextResponse } from 'next/server';
import { verifyToken } from '@/lib/auth';
import { getShiftsSheetData } from '@/lib/googleSheets';
import {
  buildEmployeesFromAllSheet,
  filterEmployeesForViewer,
  filterEmployeesWakeel3Cities,
  joinShiftsWithEmployees,
  listAvailableDates,
  parseCsvToObjects,
  parseXlsxToObjects,
  pickDatesUsed,
  preprocessShiftsLikeLegacy,
  sanitizeShiftObjectsLikeLegacy,
  computeCityPivotForDate,
  type LegacyJoinedRow,
} from '@/lib/shiftAutomationLegacy';

export const dynamic = 'force-dynamic';

const MAX_BYTES = 12 * 1024 * 1024;

export async function POST(request: NextRequest) {
  try {
    const token = request.headers.get('authorization')?.replace('Bearer ', '').trim();
    if (!token) return NextResponse.json({ success: false, error: 'غير مصرح' }, { status: 401 });

    const decoded = verifyToken(token) as { role?: string; name?: string } | null;
    if (!decoded || (decoded.role !== 'supervisor' && decoded.role !== 'admin')) {
      return NextResponse.json({ success: false, error: 'غير مصرح' }, { status: 401 });
    }

    const formData = await request.formData();
    const files = formData.getAll('files');
    const fileList = files.filter((f) => f instanceof File) as File[];
    if (!fileList.length) return NextResponse.json({ success: false, error: 'لم يُرفع ملف' }, { status: 400 });

    const { searchParams } = new URL(request.url);
    const rangeStart = String(searchParams.get('start') || '').trim(); // YYYY-MM-DD
    const rangeEnd = String(searchParams.get('end') || '').trim(); // YYYY-MM-DD
    const selectedDates = (searchParams.getAll('dates') || []).map((d) => String(d || '').trim()).filter(Boolean);

    // Employees master (Google Sheets tab "all") -> Wakeel + 3 cities -> viewer scope.
    const employeesMatrix = await getShiftsSheetData('all', true);
    const employeesAll = buildEmployeesFromAllSheet(employeesMatrix);
    const employeesTarget = filterEmployeesWakeel3Cities(employeesAll);
    const employeesForViewer = filterEmployeesForViewer(employeesTarget, decoded);
    const employeeIdSet = new Set(employeesForViewer.map((e) => e.employee_id).filter(Boolean));

    // Parse and sanitize shift files like legacy, then preprocess (EVALUATED/PUBLISHED only, dedupe).
    const debugFiles: any[] = [];
    let allShiftRows: any[] = [];
    for (const f of fileList) {
      const buf = await f.arrayBuffer();
      if (buf.byteLength > MAX_BYTES) {
        return NextResponse.json({ success: false, error: `حجم الملف كبير جداً: ${f.name}` }, { status: 400 });
      }
      const lower = f.name.toLowerCase();
      const parsed =
        lower.endsWith('.xlsx') || lower.endsWith('.xls')
          ? parseXlsxToObjects(buf)
          : parseCsvToObjects(new TextDecoder('utf-8').decode(buf));

      const sanitized = sanitizeShiftObjectsLikeLegacy(parsed);
      debugFiles.push({
        name: f.name,
        size: buf.byteLength,
        headersCount: parsed.headers.length,
        rowsParsed: parsed.rows.length,
        sanitized: sanitized.length,
      });
      allShiftRows.push(...sanitized);
    }

    const sanitizedCount = allShiftRows.length;
    let shifts = preprocessShiftsLikeLegacy(allShiftRows);
    const preprocessedCount = shifts.length;

    // Only shifts for employees in "all" after Wakeel+3 cities (+ viewer scope)
    const shiftIdSetAll = new Set(shifts.map((s) => String(s.employee_id || '').trim()).filter(Boolean));
    const unmatchedShiftIds: string[] = [];
    for (const id of shiftIdSetAll) {
      if (!employeeIdSet.has(id)) unmatchedShiftIds.push(id);
      if (unmatchedShiftIds.length >= 25) break;
    }
    shifts = shifts.filter((s) => employeeIdSet.has(String(s.employee_id || '').trim()));
    const afterEmployeeFilterCount = shifts.length;

    const availableDates = listAvailableDates(shifts);
    const datesUsed = pickDatesUsed({ availableDates, selectedDates, rangeStart, rangeEnd });
    const datesSet = new Set(datesUsed);
    shifts = shifts.filter((s) => datesSet.has(s.planned_start_date));
    const afterDateFilterCount = shifts.length;

    // Join with employee master (step 9 in your doc)
    const joined = joinShiftsWithEmployees(shifts, employeesForViewer);
    const joinedCount = joined.length;

    // Group by date
    const joinedByDate: Record<string, LegacyJoinedRow[]> = {};
    for (const d of datesUsed) joinedByDate[d] = [];
    for (const r of joined) {
      if (!joinedByDate[r.planned_start_date]) joinedByDate[r.planned_start_date] = [];
      joinedByDate[r.planned_start_date].push(r);
    }

    // Per-date metrics (matches legacy "scope" behavior in overview)
    const metricsByDate: Record<
      string,
      { totalEmployees: number; booked: number; notBooked: number; bookedPct: number; totalBookedHours: number }
    > = {};
    for (const d of datesUsed) {
      const dayRows = joinedByDate[d] || [];
      const bookedSet = new Set(dayRows.map((r) => r.employee_id).filter(Boolean));
      const totalEmployeesDay = employeesForViewer.length;
      const bookedDay = bookedSet.size;
      const notBookedDay = Math.max(0, totalEmployeesDay - bookedDay);
      const bookedPctDay = totalEmployeesDay > 0 ? (bookedDay / totalEmployeesDay) * 100 : 0;
      const totalBookedHoursDay = dayRows.reduce((s, r) => s + (Number(r.shift_hours) || 0), 0);
      metricsByDate[d] = {
        totalEmployees: totalEmployeesDay,
        booked: bookedDay,
        notBooked: notBookedDay,
        bookedPct: Math.round(bookedPctDay * 100) / 100,
        totalBookedHours: Math.round(totalBookedHoursDay * 100) / 100,
      };
    }

    // Pivot per date (HQ/Assigned/Unassigned/% by city)
    const pivotByDate: Record<string, any[]> = {};
    for (const d of datesUsed) {
      pivotByDate[d] = computeCityPivotForDate(employeesForViewer, joinedByDate[d] || []);
    }

    // Combined pivot table (step 11): City + HQ + columns per date
    const cities = Array.from(new Set(employeesForViewer.map((e) => e.city).filter(Boolean))).sort((a, b) => a.localeCompare(b));
    const hqByCity = new Map<string, number>();
    for (const e of employeesForViewer) hqByCity.set(e.city, (hqByCity.get(e.city) || 0) + 1);

    const combined: Array<Record<string, any>> = [];
    for (const city of cities) {
      const row: Record<string, any> = { city, HQ: hqByCity.get(city) || 0 };
      for (const d of datesUsed) {
        const p = (pivotByDate[d] || []).find((x: any) => x.city === city);
        row[`${d} Assigned`] = p?.assigned ?? 0;
        row[`${d} Unassigned`] = p?.unassigned ?? row.HQ;
        row[`${d} %`] = p?.pct ?? 0;
      }
      combined.push(row);
    }

    // “Assigned” table per date (step 8 output after join)
    const assignedRowsByDate: Record<string, any[]> = {};
    const unassignedRowsByDate: Record<string, any[]> = {};
    for (const d of datesUsed) {
      const assignedIds = new Set((joinedByDate[d] || []).map((r) => r.employee_id));
      assignedRowsByDate[d] = (joinedByDate[d] || []).map((r) => ({
        employee_id: r.employee_id,
        employee_name: r.employee_name,
        contract_name: r.contract_name,
        city: r.city,
        supervisors: r.supervisors,
        planned_start_time: r.planned_start_time,
        planned_end_time: r.planned_end_time,
        shift_hours: r.shift_hours,
      }));

      unassignedRowsByDate[d] = employeesForViewer
        .filter((e) => !assignedIds.has(e.employee_id))
        .map((e) => ({
          employee_id: e.employee_id,
          employee_name: e.employee_name,
          contract_name: e.contract_name,
          city: e.city,
          supervisors: e.supervisors,
        }));
    }

    const totalEmployees = employeesForViewer.length;
    const bookedEmployees = new Set(joined.map((r) => r.employee_id)).size;
    const notBooked = Math.max(0, totalEmployees - bookedEmployees);

    // Supervisors summary (admin view) + options list
    const supervisorOptionsSet = new Set<string>();
    for (const e of employeesForViewer) {
      const s = String(e.supervisors || '').trim();
      if (s) supervisorOptionsSet.add(s);
    }
    const supervisorOptions = Array.from(supervisorOptionsSet).sort((a, b) => a.localeCompare(b));

    // Admin needs a table like Streamlit "ملخص حسب المشرف" (per day scope)
    // Use employeesTarget (not viewer-filtered) so admin sees all Wakeel+3 cities.
    let supervisorSummaryByDate: Record<
      string,
      Array<{
        supervisor: string;
        total: number;
        booked: number;
        notBooked: number;
        pct: number;
        totalBookedHours: number;
      }>
    > = {};

    if (decoded.role === 'admin') {
      // Build employee groups by supervisor from employeesTarget
      const groups = new Map<string, { ids: Set<string>; total: number }>();
      for (const e of employeesTarget) {
        const sup = String(e.supervisors || '').trim() || '—';
        const id = String(e.employee_id || '').trim();
        if (!id) continue;
        if (!groups.has(sup)) groups.set(sup, { ids: new Set<string>(), total: 0 });
        const g = groups.get(sup)!;
        if (!g.ids.has(id)) {
          g.ids.add(id);
          g.total += 1;
        }
      }

      for (const d of datesUsed) {
        const dayRows = joinedByDate[d] || [];
        const bookedIds = new Set(dayRows.map((r) => r.employee_id).filter(Boolean));
        const hoursById = new Map<string, number>();
        for (const r of dayRows) hoursById.set(r.employee_id, (hoursById.get(r.employee_id) || 0) + (Number(r.shift_hours) || 0));

        const rowsOut: any[] = [];
        for (const [sup, g] of groups.entries()) {
          let booked = 0;
          let hours = 0;
          for (const id of g.ids) {
            if (bookedIds.has(id)) {
              booked += 1;
              hours += hoursById.get(id) || 0;
            }
          }
          const notBooked = Math.max(0, g.total - booked);
          const pct = g.total > 0 ? (booked / g.total) * 100 : 0;
          rowsOut.push({
            supervisor: sup,
            total: g.total,
            booked,
            notBooked,
            pct: Math.round(pct * 10) / 10,
            totalBookedHours: Math.round(hours * 100) / 100,
          });
        }
        rowsOut.sort((a, b) => b.totalBookedHours - a.totalBookedHours || b.booked - a.booked);
        supervisorSummaryByDate[d] = rowsOut;
      }
    }

    return NextResponse.json({
      success: true,
      viewerRole: decoded.role === 'admin' ? 'admin' : 'supervisor',
      viewerName: decoded.name || '',
      debug: {
        serverBuild: { legacy: true, wakeelOnly: true, cities: ['Alexandria', 'Mansoura', 'Cairo'] },
        files: debugFiles,
        counts: {
          employeesAll: employeesAll.length,
          employeesTarget: employeesTarget.length,
          employeesForViewer: employeesForViewer.length,
          sanitized: sanitizedCount,
          preprocessed: preprocessedCount,
          afterEmployeeFilter: afterEmployeeFilterCount,
          afterDateFilter: afterDateFilterCount,
          joined: joinedCount,
        },
        samples: {
          employeeIdsAll: Array.from(employeeIdSet).slice(0, 10),
          shiftEmployeeIds: Array.from(shiftIdSetAll).slice(0, 10),
          unmatchedShiftIds,
          shiftDates: Array.from(new Set(allShiftRows.map((r: any) => String(r?.planned_start_date || '').trim()).filter(Boolean))).slice(0, 10),
        },
      },
      availableDates,
      datesUsed,
      metrics: {
        totalEmployees,
        booked: bookedEmployees,
        notBooked,
      },
      metricsByDate,
      reports: {
        pivotByDate,
        pivotCombined: combined,
        assignedRowsByDate,
        unassignedRowsByDate,
        supervisorOptions,
        supervisorSummaryByDate,
      },
    });
  } catch (error: any) {
    console.error('[api/shifts/legacy-analyze]', error);
    return NextResponse.json({ success: false, error: error?.message || 'حدث خطأ' }, { status: 500 });
  }
}

