export type TimeZoneId = 'Africa/Cairo';

function pad2(n: number) {
  return n < 10 ? `0${n}` : String(n);
}

/**
 * Returns YYYY-MM-DD in the provided IANA time zone.
 * Avoids `toISOString()` because that is UTC and can shift the day.
 */
export function formatIsoDateInTimeZone(date: Date, timeZone: TimeZoneId = 'Africa/Cairo'): string {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date);

  const byType = new Map(parts.map((p) => [p.type, p.value]));
  const y = byType.get('year') || '';
  const m = byType.get('month') || '';
  const d = byType.get('day') || '';
  if (y && m && d) return `${y}-${m}-${d}`;

  // Fallback (shouldn't happen, but keep deterministic)
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`;
}

export function addDays(date: Date, days: number): Date {
  const d = new Date(date.getTime());
  d.setDate(d.getDate() + days);
  return d;
}

