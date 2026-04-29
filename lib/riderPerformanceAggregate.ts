/**
 * Aggregate daily performance rows into per-rider totals for a date range,
 * including "work days" (days with hours > 0 and no absence).
 */

export type PerformanceRecord = {
  date: string;
  riderCode: string;
  hours: number;
  break: number;
  delay: number;
  absence: unknown;
  orders: number;
  acceptance: unknown;
  debt: number;
};

export type RiderSeed = {
  code: string;
  name: string;
  region?: string;
  supervisorCode?: string;
  supervisorName?: string;
};

export type AggregatedRiderRow = {
  code: string;
  name: string;
  region?: string;
  supervisorCode?: string;
  supervisorName?: string;
  hours: number;
  break: number;
  delay: number;
  absence: string;
  orders: number;
  acceptance: number;
  debt: number;
  date: string;
  workDays: number;
};

function isAbsentDay(absenceRaw: unknown): boolean {
  const a = (absenceRaw ?? '').toString().trim();
  return a === 'نعم' || a === '1' || a === 'yes' || a.toLowerCase() === 'yes';
}

/**
 * Per (riderCode, calendar date): counts as one work day if total hours > 0
 * and no row that day is marked absent.
 */
export function computeWorkDaysByRider(
  performanceData: PerformanceRecord[],
  riderCodes: Iterable<string>
): Map<string, number> {
  type DayAgg = { hours: number; anyAbsent: boolean };
  const dayMap = new Map<string, DayAgg>();
  const dayKey = (code: string, date: string) => `${code}###${date}`;

  for (const rec of performanceData) {
    const code = (rec.riderCode ?? '').toString().trim();
    const date = (rec.date ?? '').toString().trim();
    if (!code || !date) continue;
    const k = dayKey(code, date);
    const cur = dayMap.get(k) ?? { hours: 0, anyAbsent: false };
    cur.hours += Number(rec.hours) || 0;
    if (isAbsentDay(rec.absence)) cur.anyAbsent = true;
    dayMap.set(k, cur);
  }

  const counts = new Map<string, number>();
  for (const c of riderCodes) {
    const trimmed = (c ?? '').toString().trim();
    if (trimmed) counts.set(trimmed, 0);
  }

  for (const [k, agg] of dayMap) {
    const sep = k.indexOf('###');
    if (sep < 0) continue;
    const code = k.slice(0, sep);
    if (!counts.has(code)) continue;
    if (agg.hours > 0 && !agg.anyAbsent) {
      counts.set(code, (counts.get(code) ?? 0) + 1);
    }
  }
  return counts;
}

function parseAcceptanceNumber(acceptanceStr: string): number {
  let acceptanceNum = parseFloat(acceptanceStr.replace('%', '').replace('٪', '')) || 0;
  if (acceptanceNum > 0 && acceptanceNum <= 1) {
    acceptanceNum = acceptanceNum * 100;
  }
  return acceptanceNum;
}

type RiderAggInternal = {
  code: string;
  name: string;
  region?: string;
  supervisorCode?: string;
  supervisorName?: string;
  hours: number;
  break: number;
  delay: number;
  orders: number;
  debt: number;
  absenceCount: number;
  acceptanceSum: number;
  acceptanceCount: number;
};

export function aggregateRidersInDateRange(
  seeds: RiderSeed[],
  performanceData: PerformanceRecord[],
  dateLabel: string
): AggregatedRiderRow[] {
  const riderDataMap = new Map<string, RiderAggInternal>();

  seeds.forEach((rider) => {
    const code = (rider.code ?? '').toString().trim();
    if (!code) return;
    riderDataMap.set(code, {
      code,
      name: rider.name ?? '',
      region: rider.region,
      supervisorCode: rider.supervisorCode,
      supervisorName: rider.supervisorName,
      hours: 0,
      break: 0,
      delay: 0,
      orders: 0,
      debt: 0,
      absenceCount: 0,
      acceptanceSum: 0,
      acceptanceCount: 0,
    });
  });

  const codes = Array.from(riderDataMap.keys());
  const workDaysMap = computeWorkDaysByRider(performanceData, codes);

  performanceData.forEach((record) => {
    const rc = (record.riderCode ?? '').toString().trim();
    const riderData = riderDataMap.get(rc);
    if (!riderData) return;

    riderData.hours += record.hours || 0;
    riderData.break += record.break || 0;
    riderData.delay += record.delay || 0;
    riderData.orders += record.orders || 0;
    riderData.debt += record.debt || 0;

    const absenceRaw = record.absence?.toString().trim() || 'لا';
    if (isAbsentDay(absenceRaw)) {
      riderData.absenceCount++;
    }

    const acceptanceStr = record.acceptance?.toString() || '0';
    const acceptanceNum = parseAcceptanceNumber(acceptanceStr);
    if (acceptanceNum > 0) {
      riderData.acceptanceSum += acceptanceNum;
      riderData.acceptanceCount++;
    }
  });

  const result: AggregatedRiderRow[] = [];
  riderDataMap.forEach((r, code) => {
    result.push({
      code: r.code,
      name: r.name,
      region: r.region,
      supervisorCode: r.supervisorCode,
      supervisorName: r.supervisorName,
      hours: r.hours,
      break: r.break,
      delay: r.delay,
      orders: r.orders,
      debt: r.debt,
      date: dateLabel,
      workDays: workDaysMap.get(code) ?? 0,
      // Display 1/0 for absence to match performance uploads that use numeric flags.
      // Keep the underlying detection tolerant (isAbsentDay handles نعم/لا/1/0).
      absence: r.absenceCount > 0 ? '1' : '0',
      acceptance: r.acceptanceCount > 0 ? r.acceptanceSum / r.acceptanceCount : 0,
    });
  });

  return result;
}
