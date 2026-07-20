/**
 * SRS-008 §7 — In-memory filter pipeline (mirrors buildReport scoping rules).
 * Enables Filter × KPI validation without Google Sheets.
 */

export type PipelineRider = {
  code: string;
  zone: string;
  supervisorCode: string;
  contractType: string;
  status: string;
};

export type PipelineDay = {
  riderCode: string;
  date: string;
  zone: string;
  supervisorCode: string;
  hours: number;
  orders: number;
  contractType: string;
};

export type PipelineFilters = {
  zone?: string;
  supervisorCode?: string;
  startDate?: string;
  endDate?: string;
  contractType?: string;
};

export function applyRiderFilters(
  riders: PipelineRider[],
  f: PipelineFilters
): PipelineRider[] {
  return riders.filter((r) => {
    if (f.zone && f.zone !== 'all' && r.zone !== f.zone) return false;
    if (f.supervisorCode && f.supervisorCode !== 'all' && r.supervisorCode !== f.supervisorCode)
      return false;
    if (f.contractType && f.contractType !== 'all' && r.contractType !== f.contractType)
      return false;
    return true;
  });
}

/** Day-level filter — uses day attribution fields, not master-only. */
export function applyDayFilters(days: PipelineDay[], f: PipelineFilters): PipelineDay[] {
  return days.filter((d) => {
    if (f.zone && f.zone !== 'all' && d.zone !== f.zone) return false;
    if (f.supervisorCode && f.supervisorCode !== 'all' && d.supervisorCode !== f.supervisorCode)
      return false;
    if (f.contractType && f.contractType !== 'all' && d.contractType !== f.contractType)
      return false;
    if (f.startDate && d.date < f.startDate) return false;
    if (f.endDate && d.date > f.endDate) return false;
    return true;
  });
}

export function kpiFromDays(days: PipelineDay[]): {
  hours: number;
  orders: number;
  activeRiders: number;
  achievement: number;
  lostHoursProxy: number;
} {
  const hours = Math.round(days.reduce((s, d) => s + d.hours, 0) * 100) / 100;
  const orders = days.reduce((s, d) => s + d.orders, 0);
  const active = new Set(
    days.filter((d) => d.hours > 0 && d.orders > 0).map((d) => d.riderCode)
  ).size;
  const target = active * 5 * Math.max(1, new Set(days.map((d) => d.date)).size);
  const achievement = target > 0 ? Math.round((hours / target) * 10000) / 100 : 0;
  const lostHoursProxy = Math.max(0, Math.round((target - hours) * 100) / 100);
  return { hours, orders, activeRiders: active, achievement, lostHoursProxy };
}

export function buildDemoFleet(): { riders: PipelineRider[]; days: PipelineDay[] } {
  const riders: PipelineRider[] = [
    { code: 'R1', zone: 'Alexandria', supervisorCode: 'SA', contractType: 'freelance', status: 'active' },
    { code: 'R2', zone: 'Alexandria', supervisorCode: 'SA', contractType: 'company', status: 'active' },
    { code: 'R3', zone: 'Cairo', supervisorCode: 'SC', contractType: 'freelance', status: 'active' },
    { code: 'R4', zone: 'Cairo', supervisorCode: 'SC', contractType: 'freelance', status: 'inactive' },
    { code: 'R5', zone: 'Alexandria', supervisorCode: 'SB', contractType: 'company', status: 'active' },
  ];

  const days: PipelineDay[] = [
    { riderCode: 'R1', date: '2026-07-13', zone: 'Alexandria', supervisorCode: 'SA', hours: 8, orders: 16, contractType: 'freelance' },
    { riderCode: 'R1', date: '2026-07-14', zone: 'Alexandria', supervisorCode: 'SA', hours: 8, orders: 16, contractType: 'freelance' },
    { riderCode: 'R1', date: '2026-07-15', zone: 'Alexandria', supervisorCode: 'SB', hours: 8, orders: 16, contractType: 'freelance' }, // supervisor change
    { riderCode: 'R2', date: '2026-07-13', zone: 'Alexandria', supervisorCode: 'SA', hours: 6, orders: 12, contractType: 'company' },
    { riderCode: 'R3', date: '2026-07-13', zone: 'Cairo', supervisorCode: 'SC', hours: 10, orders: 20, contractType: 'freelance' },
    { riderCode: 'R3', date: '2026-07-14', zone: 'Alexandria', supervisorCode: 'SC', hours: 9, orders: 18, contractType: 'freelance' }, // zone change
    { riderCode: 'R5', date: '2026-07-13', zone: 'Alexandria', supervisorCode: 'SB', hours: 7, orders: 14, contractType: 'company' },
    { riderCode: 'R4', date: '2026-07-13', zone: 'Cairo', supervisorCode: 'SC', hours: 0, orders: 0, contractType: 'freelance' },
  ];

  return { riders, days };
}
