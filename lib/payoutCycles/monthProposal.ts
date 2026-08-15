/**
 * SRS-014 — Propose Talabat-style payout cycles for a calendar month.
 *
 * PROPOSAL ONLY — does not write Sheets or enable flags.
 * Payday / deductionGenerationDate left blank for Admin.
 *
 * Rules:
 * - Cycle 1: day 1 → first Sunday on/after day 1.
 *   If span ≤2 days (Sat–Sun stub), extend through the following Sunday.
 * - Middle: Monday→Sunday full weeks fully inside the month.
 * - Closing: day after last middle Sunday → month end; equipment off.
 *
 * Note: Admin may mark an extra trailing week as closing (e.g. Aug 24–31)
 * when payday is manual — proposal remains editable via existing CRUD.
 */

export type ProposedPayoutCycle = {
  cycleNumber: number;
  startDate: string;
  endDate: string;
  isClosing: boolean;
  equipmentDeductionEnabled: boolean;
  payoutDate: string;
  deductionGenerationDate: string;
  labelAr: string;
};

function pad2(n: number): string {
  return String(n).padStart(2, '0');
}

function ymd(year: number, month: number, day: number): string {
  return `${year}-${pad2(month)}-${pad2(day)}`;
}

function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

function weekdaySun0(year: number, month: number, day: number): number {
  return new Date(Date.UTC(year, month - 1, day)).getUTCDay();
}

function addDays(
  year: number,
  month: number,
  day: number,
  delta: number
): { year: number; month: number; day: number } {
  const dt = new Date(Date.UTC(year, month - 1, day + delta));
  return {
    year: dt.getUTCFullYear(),
    month: dt.getUTCMonth() + 1,
    day: dt.getUTCDate(),
  };
}

function lastSundayOfMonth(year: number, month: number): number {
  const last = daysInMonth(year, month);
  const wd = weekdaySun0(year, month, last);
  return last - wd;
}

export function proposePayoutCyclesForMonth(
  year: number,
  month: number
): ProposedPayoutCycle[] {
  const y = Math.trunc(year);
  const m = Math.trunc(month);
  if (!Number.isFinite(y) || m < 1 || m > 12) {
    throw new Error('year and month (1-12) required');
  }

  const lastDay = daysInMonth(y, m);
  const lastSun = lastSundayOfMonth(y, m);
  const daysAfterLastSun = lastDay - lastSun;
  // If only a stub remains after the last Sunday (< 3 days), absorb the last
  // Mon–Sun week into Closing (Aug 2026 → 24–31). Else Closing starts after
  // last Sunday (Jul 2026 → 27–31).
  const absorbLastWeekIntoClosing = daysAfterLastSun > 0 && daysAfterLastSun < 3;
  const out: ProposedPayoutCycle[] = [];

  const wd1 = weekdaySun0(y, m, 1);
  const daysToSunday = (7 - wd1) % 7;
  let c1End = addDays(y, m, 1, daysToSunday);
  const c1Len = c1End.day;
  if (c1Len <= 2 && c1End.month === m) {
    c1End = addDays(c1End.year, c1End.month, c1End.day, 7);
  }
  if (c1End.month !== m || c1End.day > lastDay) {
    c1End = { year: y, month: m, day: lastDay };
  }

  let cycleNumber = 1;
  const c1IsWholeMonth = c1End.day >= lastDay;
  out.push({
    cycleNumber,
    startDate: ymd(y, m, 1),
    endDate: ymd(c1End.year, c1End.month, c1End.day),
    isClosing: c1IsWholeMonth,
    equipmentDeductionEnabled: !c1IsWholeMonth,
    payoutDate: '',
    deductionGenerationDate: '',
    labelAr: c1IsWholeMonth ? 'الدورة الختامية' : `الدورة ${cycleNumber}`,
  });
  if (c1IsWholeMonth) return out;
  cycleNumber += 1;

  let cursor = addDays(c1End.year, c1End.month, c1End.day, 1);

  while (cursor.month === m && cursor.day <= lastDay) {
    const weekEnd = addDays(cursor.year, cursor.month, cursor.day, 6);
    const weekEndsOnLastSunday =
      weekEnd.month === m && weekEnd.day === lastSun;

    if (
      weekEnd.month !== m ||
      weekEnd.day > lastDay ||
      (absorbLastWeekIntoClosing && weekEndsOnLastSunday)
    ) {
      out.push({
        cycleNumber,
        startDate: ymd(cursor.year, cursor.month, cursor.day),
        endDate: ymd(y, m, lastDay),
        isClosing: true,
        equipmentDeductionEnabled: false,
        payoutDate: '',
        deductionGenerationDate: '',
        labelAr: 'الدورة الختامية',
      });
      break;
    }

    out.push({
      cycleNumber,
      startDate: ymd(cursor.year, cursor.month, cursor.day),
      endDate: ymd(weekEnd.year, weekEnd.month, weekEnd.day),
      isClosing: false,
      equipmentDeductionEnabled: true,
      payoutDate: '',
      deductionGenerationDate: '',
      labelAr: `الدورة ${cycleNumber}`,
    });
    cycleNumber += 1;

    const next = addDays(weekEnd.year, weekEnd.month, weekEnd.day, 1);
    if (next.month !== m) break;
    cursor = next;
  }

  return out;
}
