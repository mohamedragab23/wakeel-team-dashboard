import { getShiftsSheetData } from '@/lib/googleSheets';
import {
  buildEmployeesFromAllSheet,
  computeCityPivotForDate,
  filterEmployeesForViewer,
  filterEmployeesWakeel3Cities,
  joinShiftsWithEmployees,
  listAvailableDates,
  parseCsvToObjects,
  parseXlsxToObjects,
  pickDatesUsed,
  preprocessShiftsLikeLegacy,
  sanitizeShiftObjectsLikeLegacy,
} from '@/lib/shiftAutomationLegacy';

type Viewer = { role: 'supervisor' | 'admin'; name: string };

export type AnalyzeLegacyShiftsInput = {
  viewer: Viewer;
  files: Array<{ name: string; bytes: ArrayBuffer }>;
  rangeStart: string; // YYYY-MM-DD
  rangeEnd: string; // YYYY-MM-DD
  selectedDates: string[]; // YYYY-MM-DD
};

function norm(v: any): string {
  return String(v ?? '').trim();
}

function uniqStrings(xs: string[]): string[] {
  return Array.from(new Set(xs.map((x) => norm(x)).filter(Boolean))).sort((a, b) => a.localeCompare(b));
}

function detectFileKind(name: string): 'csv' | 'xlsx' | 'unknown' {
  const n = norm(name).toLowerCase();
  if (n.endsWith('.csv')) return 'csv';
  if (n.endsWith('.xlsx') || n.endsWith('.xls')) return 'xlsx';
  return 'unknown';
}

export async function analyzeLegacyShifts(input: AnalyzeLegacyShiftsInput) {
  const shiftsAllMatrix = await getShiftsSheetData('all', false);
  if (!shiftsAllMatrix?.length) {
    throw new Error('تعذر قراءة تبويب all من ملف الشفتات (GOOGLE_SHEETS_SHIFTS_SPREADSHEET_ID).');
  }

  // HQ source: shifts sheet tab "all"
  let employees = buildEmployeesFromAllSheet(shiftsAllMatrix);
  employees = filterEmployeesWakeel3Cities(employees);
  employees = filterEmployeesForViewer(employees, input.viewer);

  if (!employees.length) {
    return {
      availableDates: [],
      datesUsed: [],
      metrics: { totalEmployees: 0, booked: 0, notBooked: 0 },
      metricsByDate: {},
      reports: {
        pivotByDate: {},
        pivotCombined: [],
        assignedRowsByDate: {},
        unassignedRowsByDate: {},
        supervisorOptions: [],
        supervisorSummaryByDate: {},
      },
    };
  }

  // Parse shift files
  const allShiftObjects: Array<{ headers: string[]; rows: Record<string, any>[] }> = [];
  for (const f of input.files || []) {
    const kind = detectFileKind(f.name);
    if (kind === 'csv') {
      const text = new TextDecoder('utf-8').decode(new Uint8Array(f.bytes));
      allShiftObjects.push(parseCsvToObjects(text));
    } else if (kind === 'xlsx') {
      allShiftObjects.push(parseXlsxToObjects(f.bytes));
    } else {
      // Try as CSV best-effort
      const text = new TextDecoder('utf-8').decode(new Uint8Array(f.bytes));
      allShiftObjects.push(parseCsvToObjects(text));
    }
  }

  const shiftRows = preprocessShiftsLikeLegacy(
    allShiftObjects.flatMap((obj) => sanitizeShiftObjectsLikeLegacy(obj))
  );

  const availableDates = listAvailableDates(shiftRows);
  const datesUsed = pickDatesUsed({
    availableDates,
    selectedDates: input.selectedDates || [],
    rangeStart: norm(input.rangeStart),
    rangeEnd: norm(input.rangeEnd),
  });

  const employeeById = new Map(employees.map((e) => [norm(e.employee_id), e]));
  const supervisorOptions = uniqStrings(employees.map((e) => norm(e.supervisors)));

  const assignedRowsByDate: Record<string, any[]> = {};
  const unassignedRowsByDate: Record<string, any[]> = {};
  const pivotByDate: Record<string, Array<{ city: string; HQ: number; assigned: number; unassigned: number; pct: number }>> = {};
  const metricsByDate: Record<string, { totalEmployees: number; booked: number; notBooked: number }> = {};
  const supervisorSummaryByDate: Record<
    string,
    Array<{ supervisor: string; total: number; booked: number; notBooked: number; pct: number; totalBookedHours: number }>
  > = {};

  const totalEmployees = employees.length;

  for (const d of datesUsed) {
    const shiftsForDate = shiftRows.filter((r) => norm(r.planned_start_date) === d);
    const joined = joinShiftsWithEmployees(shiftsForDate, employees);
    const assignedSet = new Set(joined.map((r) => norm(r.employee_id)).filter(Boolean));

    const unassigned = employees
      .filter((e) => !assignedSet.has(norm(e.employee_id)))
      .map((e) => ({ ...e }));

    assignedRowsByDate[d] = joined;
    unassignedRowsByDate[d] = unassigned;

    const booked = joined.length;
    const notBooked = unassigned.length;
    metricsByDate[d] = { totalEmployees, booked, notBooked };

    pivotByDate[d] = computeCityPivotForDate(employees, joined);

    // Supervisor summary (per day)
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
        .filter((e) => norm(e.supervisors) === sup)
        .map((e) => norm(e.employee_id))
        .filter(Boolean);
      const idSet = new Set(empIdsForSup);

      const bookedRows = joined.filter((r) => idSet.has(norm(r.employee_id)));
      const bookedCount = bookedRows.length;
      const total = empIdsForSup.length;
      const notBookedCount = Math.max(0, total - bookedCount);
      const pct = total > 0 ? (bookedCount / total) * 100 : 0;
      const totalBookedHours = bookedRows.reduce((sum, r) => sum + (Number(r.shift_hours) || 0), 0);

      supSummary.push({
        supervisor: sup,
        total,
        booked: bookedCount,
        notBooked: notBookedCount,
        pct: Math.round(pct * 10) / 10,
        totalBookedHours: Math.round(totalBookedHours * 100) / 100,
      });
    }

    supervisorSummaryByDate[d] = supSummary.sort((a, b) => a.supervisor.localeCompare(b.supervisor));
  }

  // Combined metrics (matches UI need for "all" view; keep simple)
  const combinedBooked = datesUsed.reduce((s, d) => s + (metricsByDate[d]?.booked || 0), 0);
  const combinedNotBooked = datesUsed.reduce((s, d) => s + (metricsByDate[d]?.notBooked || 0), 0);

  const metrics = { totalEmployees, booked: combinedBooked, notBooked: combinedNotBooked };

  const pivotCombined = datesUsed.map((d) => ({
    date: d,
    ...(metricsByDate[d] || {}),
  }));

  // Ensure we don't accidentally leak employees not in HQ list
  for (const d of datesUsed) {
    assignedRowsByDate[d] = (assignedRowsByDate[d] || []).filter((r: any) => employeeById.has(norm(r.employee_id)));
    unassignedRowsByDate[d] = (unassignedRowsByDate[d] || []).filter((r: any) => employeeById.has(norm(r.employee_id)));
  }

  return {
    availableDates,
    datesUsed,
    metrics,
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

