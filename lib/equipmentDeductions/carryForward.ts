/**
 * Carry-forward shortfall from REQUEST vs ACTUAL history (pure + sheet parsers).
 */
import {
  DEDUCTIONS_ACTUAL_HEADERS,
  DEDUCTION_IMPORT_HEADERS,
} from '@/lib/equipmentSheetConstants';
import {
  computeCycleRequestMilli,
  cycleShortfallMilli,
  normalizeRiderCodeKey,
  sumCarryForwardShortfall,
  type CycleRequestActual,
} from '@/lib/equipmentDeductions/equipmentFinancialModel';
import { egpToMilliemes } from '@/lib/money';

const REQ = DEDUCTION_IMPORT_HEADERS;
const ACT = DEDUCTIONS_ACTUAL_HEADERS;

function reqIdx(name: (typeof REQ)[number]): number {
  return REQ.indexOf(name);
}

function actIdx(name: (typeof ACT)[number]): number {
  return ACT.indexOf(name);
}

function parseMoney(v: unknown): number {
  if (v === undefined || v === null || v === '') return 0;
  const s = String(v).replace(/,/g, '').replace(/[^\d.-]/g, '');
  const n = Number(s);
  return Number.isFinite(n) ? n : 0;
}

export function cycleKeyFromParts(cycleLabel: string, monthLabel: string, year: number): string {
  return `${String(year).trim()}|${String(monthLabel).trim()}|${String(cycleLabel).trim()}`;
}

export function aggregateRequestedByRiderCycle(
  requestRows: unknown[][],
  cycleLabel: string,
  monthLabel: string,
  year: number
): Map<string, number> {
  const key = cycleKeyFromParts(cycleLabel, monthLabel, year);
  const map = new Map<string, number>();
  for (let i = 1; i < requestRows.length; i++) {
    const row = requestRows[i];
    if (!row) continue;
    const c = String(row[reqIdx('دورة_الاستقطاع')] ?? '').trim();
    const m = String(row[reqIdx('شهر')] ?? '').trim();
    const y = String(row[reqIdx('سنة')] ?? '').trim();
    if (c !== cycleLabel || m !== monthLabel) continue;
    if (y && String(year) !== y.replace(/,/g, '')) continue;
    const rider = normalizeRiderCodeKey(row[reqIdx('كود_المندوب')]);
    if (!rider) continue;
    const amt = parseMoney(row[reqIdx('قيمة_الاستقطاع')]);
    map.set(rider, (map.get(rider) || 0) + egpToMilliemes(amt));
  }
  void key;
  return map;
}

/** Actual Talabat payroll from الاستقطاعات_الفعلية. */
export function aggregateActualPayrollByRiderCycle(
  actualRows: unknown[][],
  cycleLabel: string,
  monthLabel: string,
  year: number
): Map<string, number> {
  const map = new Map<string, number>();
  for (let i = 1; i < actualRows.length; i++) {
    const row = actualRows[i];
    if (!row) continue;
    const c = String(row[actIdx('دورة_الاستقطاع')] ?? '').trim();
    const m = String(row[actIdx('شهر')] ?? '').trim();
    const yRaw = row[actIdx('سنة')];
    const yNum = Number(String(yRaw ?? '').replace(/,/g, ''));
    if (c !== cycleLabel || m !== monthLabel) continue;
    if (Number.isFinite(yNum) && Math.round(yNum) !== year) continue;
    const rider = normalizeRiderCodeKey(row[actIdx('كود_المندوب')]);
    if (!rider) continue;
    const wallet = parseMoney(row[actIdx('خصم_المحفظة_شيت_المدير')]);
    map.set(rider, (map.get(rider) || 0) + egpToMilliemes(wallet));
  }
  return map;
}

export function buildRiderCycleHistory(params: {
  riderCode: string;
  orderedCycles: Array<{ cycleKey: string; cycleLabel: string; monthLabel: string; year: number }>;
  requestRows: unknown[][];
  actualRows: unknown[][];
}): CycleRequestActual[] {
  const rider = normalizeRiderCodeKey(params.riderCode);
  const out: CycleRequestActual[] = [];
  for (const cycle of params.orderedCycles) {
    const reqMap = aggregateRequestedByRiderCycle(
      params.requestRows,
      cycle.cycleLabel,
      cycle.monthLabel,
      cycle.year
    );
    const actMap = aggregateActualPayrollByRiderCycle(
      params.actualRows,
      cycle.cycleLabel,
      cycle.monthLabel,
      cycle.year
    );
    out.push({
      cycleKey: cycle.cycleKey,
      requestedMilli: reqMap.get(rider) || 0,
      actualMilli: actMap.get(rider) || 0,
    });
  }
  return out;
}

export function carryForwardForCycle(
  history: CycleRequestActual[],
  targetCycleKey: string
): number {
  return sumCarryForwardShortfall(history, targetCycleKey);
}

export function nextRequestForRider(params: {
  payrollOutstandingMilli: number;
  history: CycleRequestActual[];
  targetCycleKey: string;
}): { requestMilli: number; carryForwardMilli: number } {
  const carry = carryForwardForCycle(params.history, params.targetCycleKey);
  const requestMilli = computeCycleRequestMilli({
    payrollOutstandingMilli: params.payrollOutstandingMilli,
    carryForwardShortfallMilli: carry,
  });
  return { requestMilli, carryForwardMilli: carry };
}

export { cycleShortfallMilli, sumCarryForwardShortfall };
