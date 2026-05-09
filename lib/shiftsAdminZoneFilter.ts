import {
  computeCityPivotForDate,
  normShiftId,
  type LegacyEmployeeRow,
  type LegacyJoinedRow,
} from '@/lib/shiftsPivot';

export type ShiftsReportsBundle = {
  pivotByDate?: Record<string, Array<{ city: string; HQ: number; assigned: number; unassigned: number; pct: number }>>;
  pivotCombined?: Array<Record<string, unknown>>;
  assignedRowsByDate?: Record<string, any[]>;
  unassignedRowsByDate?: Record<string, any[]>;
  supervisorOptions?: string[];
  supervisorSummaryByDate?: Record<
    string,
    Array<{
      supervisor: string;
      total: number;
      booked: number;
      notBooked: number;
      pct: number;
      totalBookedHours: number;
    }>
  >;
};

function buildEmployeesFromDayRows(assigned: any[], unassigned: any[]): LegacyEmployeeRow[] {
  const m = new Map<string, LegacyEmployeeRow>();
  for (const r of [...assigned, ...unassigned]) {
    const id = normShiftId(r?.employee_id);
    if (!id) continue;
    if (!m.has(id)) {
      m.set(id, {
        employee_id: id,
        employee_name: String(r?.employee_name ?? ''),
        contract_name: String(r?.contract_name ?? ''),
        city: String(r?.city ?? ''),
        supervisors: String(r?.supervisors ?? ''),
      });
    }
  }
  return Array.from(m.values());
}

function uniqStrings(xs: string[]): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const x of xs) {
    const s = normShiftId(x);
    if (!s || seen.has(s)) continue;
    seen.add(s);
    out.push(s);
  }
  return out.sort((a, b) => a.localeCompare(b));
}

/** Filter legacy-analyze reports to riders supervised by names in the given set. */
export function filterShiftsReportsBySupervisorNames(
  reports: ShiftsReportsBundle,
  datesUsed: string[],
  supervisorNames: Set<string>
): {
  metrics: { totalEmployees: number; booked: number; notBooked: number };
  metricsByDate: Record<string, { totalEmployees: number; booked: number; notBooked: number }>;
  reports: ShiftsReportsBundle;
} {
  const assignedRowsByDate: Record<string, any[]> = {};
  const unassignedRowsByDate: Record<string, any[]> = {};
  const pivotByDate: Record<string, Array<{ city: string; HQ: number; assigned: number; unassigned: number; pct: number }>> =
    {};
  const metricsByDate: Record<string, { totalEmployees: number; booked: number; notBooked: number }> = {};
  const supervisorSummaryByDate: Record<
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

  const supervisorOptions = uniqStrings(
    (reports.supervisorOptions || []).filter((s) => supervisorNames.has(normShiftId(s)))
  );

  for (const d of datesUsed) {
    const a = (reports.assignedRowsByDate?.[d] || []).filter((r) =>
      supervisorNames.has(normShiftId(r?.supervisors))
    );
    const u = (reports.unassignedRowsByDate?.[d] || []).filter((r) =>
      supervisorNames.has(normShiftId(r?.supervisors))
    );
    assignedRowsByDate[d] = a;
    unassignedRowsByDate[d] = u;

    const employees = buildEmployeesFromDayRows(a, u);
    metricsByDate[d] = {
      totalEmployees: employees.length,
      booked: a.length,
      notBooked: u.length,
    };
    pivotByDate[d] = computeCityPivotForDate(employees, a as LegacyJoinedRow[]);

    const supSummary: Array<{
      supervisor: string;
      total: number;
      booked: number;
      notBooked: number;
      pct: number;
      totalBookedHours: number;
    }> = [];

    for (const sup of supervisorOptions) {
      const empIdsForSup = employees
        .filter((e) => normShiftId(e.supervisors) === sup)
        .map((e) => normShiftId(e.employee_id))
        .filter(Boolean);
      const idSet = new Set(empIdsForSup);
      const bookedRows = a.filter((r) => idSet.has(normShiftId(r?.employee_id)));
      const bookedCount = bookedRows.length;
      const total = empIdsForSup.length;
      const notBookedCount = Math.max(0, total - bookedCount);
      const pct = total > 0 ? (bookedCount / total) * 100 : 0;
      const totalBookedHours = bookedRows.reduce((sum, r) => sum + (Number(r?.shift_hours) || 0), 0);
      supSummary.push({
        supervisor: sup,
        total,
        booked: bookedCount,
        notBooked: notBookedCount,
        pct: Math.round(pct * 10) / 10,
        totalBookedHours: Math.round(totalBookedHours * 100) / 100,
      });
    }
    supervisorSummaryByDate[d] = supSummary.sort((x, y) => x.supervisor.localeCompare(y.supervisor));
  }

  const combinedBooked = datesUsed.reduce((s, d) => s + (metricsByDate[d]?.booked || 0), 0);
  const combinedNotBooked = datesUsed.reduce((s, d) => s + (metricsByDate[d]?.notBooked || 0), 0);
  const pivotCombined = datesUsed.map((d) => ({
    date: d,
    ...(metricsByDate[d] || {}),
  }));

  const firstDay = datesUsed[0];
  const totalEmployees = firstDay ? metricsByDate[firstDay]?.totalEmployees || 0 : 0;

  return {
    metrics: {
      totalEmployees,
      booked: combinedBooked,
      notBooked: combinedNotBooked,
    },
    metricsByDate,
    reports: {
      pivotByDate,
      pivotCombined,
      assignedRowsByDate,
      unassignedRowsByDate,
      supervisorOptions,
      supervisorSummaryByDate,
    },
  };
}
