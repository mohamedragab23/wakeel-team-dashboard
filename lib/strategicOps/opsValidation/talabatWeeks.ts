/**
 * Talabat month-bound weeks (SRS-008 Test Group 003).
 * Week 1: month start → first Sunday
 * Then full Mon–Sun weeks until month end (last week may be partial).
 */

export type TalabatWeek = {
  weekIndex: number;
  startDate: string;
  endDate: string;
  days: string[];
};

function iso(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function addDays(d: Date, n: number): Date {
  const x = new Date(d);
  x.setUTCDate(x.getUTCDate() + n);
  return x;
}

/** Sunday = 0 … Saturday = 6 (UTC) */
function utcDay(d: Date): number {
  return d.getUTCDay();
}

/**
 * Build Talabat weeks for a calendar month (1–12).
 * Matches SRS-008 July 2026 example:
 * W1 1–5, W2 6–12, W3 13–19, W4 20–26, W5 27–31.
 */
export function getTalabatWeeksInMonth(year: number, month1to12: number): TalabatWeek[] {
  const first = new Date(Date.UTC(year, month1to12 - 1, 1));
  const lastDay = new Date(Date.UTC(year, month1to12, 0)).getUTCDate();
  const last = new Date(Date.UTC(year, month1to12 - 1, lastDay));

  const weeks: TalabatWeek[] = [];
  let cursor = first;
  let weekIndex = 1;

  while (cursor <= last) {
    let end: Date;
    if (weekIndex === 1) {
      // First week ends on the first Sunday on/after the 1st
      const dow = utcDay(cursor);
      const daysToSunday = dow === 0 ? 0 : 7 - dow;
      end = addDays(cursor, daysToSunday);
    } else {
      // Full Mon–Sun (6 days ahead from Monday)
      end = addDays(cursor, 6);
    }
    if (end > last) end = last;

    const days: string[] = [];
    for (let d = new Date(cursor); d <= end; d = addDays(d, 1)) {
      days.push(iso(d));
    }
    weeks.push({
      weekIndex,
      startDate: iso(cursor),
      endDate: iso(end),
      days,
    });

    cursor = addDays(end, 1);
    weekIndex++;
  }

  return weeks;
}

/** Dates belonging to a week that crosses month boundary (no dup / no loss). */
export function splitCrossMonthWeek(
  weekStart: string,
  weekEnd: string
): { juneDates: string[]; julyDates: string[] } {
  const juneDates: string[] = [];
  const julyDates: string[] = [];
  let d = new Date(weekStart + 'T00:00:00Z');
  const end = new Date(weekEnd + 'T00:00:00Z');
  while (d <= end) {
    const s = iso(d);
    if (s.startsWith('2026-06')) juneDates.push(s);
    else if (s.startsWith('2026-07')) julyDates.push(s);
    d = addDays(d, 1);
  }
  return { juneDates, julyDates };
}
