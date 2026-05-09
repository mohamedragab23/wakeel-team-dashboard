/** Client-safe pivot helpers (no xlsx). Mirrors lib/shiftAutomationLegacy computeCityPivotForDate. */

export type LegacyEmployeeRow = {
  employee_id: string;
  employee_name: string;
  contract_name: string;
  city: string;
  supervisors: string;
};

export type LegacyJoinedRow = LegacyEmployeeRow & {
  planned_start_date: string;
  planned_start_time: string;
  planned_end_time: string;
  shift_hours: number;
};

export type LegacyCityPivotRow = {
  city: string;
  HQ: number;
  assigned: number;
  unassigned: number;
  pct: number;
};

export function normShiftId(s: unknown): string {
  return String(s ?? '').trim();
}

export function computeCityPivotForDate(
  employees: LegacyEmployeeRow[],
  joinedForDate: LegacyJoinedRow[]
): LegacyCityPivotRow[] {
  const hqByCity = new Map<string, number>();
  const idsByCity = new Map<string, Set<string>>();
  for (const e of employees) {
    const city = normShiftId(e.city) || '—';
    hqByCity.set(city, (hqByCity.get(city) || 0) + 1);
    if (!idsByCity.has(city)) idsByCity.set(city, new Set<string>());
    idsByCity.get(city)!.add(normShiftId(e.employee_id));
  }

  const assignedSet = new Set(joinedForDate.map((r) => normShiftId(r.employee_id)).filter(Boolean));
  const out: LegacyCityPivotRow[] = [];
  for (const [city, HQ] of Array.from(hqByCity.entries()).sort((a, b) => a[0].localeCompare(b[0]))) {
    const ids = idsByCity.get(city) || new Set<string>();
    let assigned = 0;
    for (const id of assignedSet) if (ids.has(id)) assigned += 1;
    const unassigned = Math.max(0, HQ - assigned);
    const pct = HQ > 0 ? (assigned / HQ) * 100 : 0;
    out.push({ city, HQ, assigned, unassigned, pct: Math.round(pct * 100) / 100 });
  }
  return out;
}
