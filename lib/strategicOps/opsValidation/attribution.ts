/**
 * SRS-008 §6 — Day-level attribution model (reference correctness).
 * Production buildReport currently uses master supervisor assignment;
 * these helpers define the REQUIRED correct behavior for certification.
 */

export type DayAttribution = {
  date: string;
  supervisorCode: string;
  zone: string;
  hours: number;
  orders: number;
};

export type AttributionBucket = {
  key: string;
  hours: number;
  orders: number;
  days: number;
};

/** Distribute hours by the supervisor of record ON THAT DAY. */
export function attributeByDaySupervisor(days: DayAttribution[]): AttributionBucket[] {
  const map = new Map<string, AttributionBucket>();
  for (const d of days) {
    const cur = map.get(d.supervisorCode) ?? {
      key: d.supervisorCode,
      hours: 0,
      orders: 0,
      days: 0,
    };
    cur.hours += d.hours;
    cur.orders += d.orders;
    cur.days += 1;
    map.set(d.supervisorCode, cur);
  }
  return [...map.values()].map((b) => ({
    ...b,
    hours: Math.round(b.hours * 100) / 100,
  }));
}

export function attributeByDayZone(days: DayAttribution[]): AttributionBucket[] {
  const map = new Map<string, AttributionBucket>();
  for (const d of days) {
    const cur = map.get(d.zone) ?? { key: d.zone, hours: 0, orders: 0, days: 0 };
    cur.hours += d.hours;
    cur.orders += d.orders;
    cur.days += 1;
    map.set(d.zone, cur);
  }
  return [...map.values()];
}

/** Wrong model: assign ALL period hours to current supervisor only. */
export function attributeAllToCurrentSupervisor(
  days: DayAttribution[],
  currentSupervisor: string
): AttributionBucket[] {
  const hours = days.reduce((s, d) => s + d.hours, 0);
  const orders = days.reduce((s, d) => s + d.orders, 0);
  return [
    {
      key: currentSupervisor,
      hours: Math.round(hours * 100) / 100,
      orders,
      days: days.length,
    },
  ];
}

export function totalsMatch(days: DayAttribution[], buckets: AttributionBucket[]): boolean {
  const th = Math.round(days.reduce((s, d) => s + d.hours, 0) * 100) / 100;
  const bh = Math.round(buckets.reduce((s, b) => s + b.hours, 0) * 100) / 100;
  return th === bh;
}
