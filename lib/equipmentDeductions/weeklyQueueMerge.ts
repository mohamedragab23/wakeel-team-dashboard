/**
 * Weekly deduction queue merge: EQUIPMENT + Manual V2 with reason breakdown.
 * Pure — no sheet writes.
 */
import { normalizeRiderCodeKey } from '@/lib/equipmentDeductions/equipmentFinancialModel';
import { milliemesToEgp } from '@/lib/money';

export type QueueLineSource =
  | { kind: 'equipment'; baseInstallmentMilli: number; carryForwardMilli: number }
  | { kind: 'manual_v2'; reason: string };

export type WeeklyQueueLine = {
  riderCode: string;
  riderName: string;
  amountMilli: number;
  amountEgp: number;
  source: QueueLineSource;
  label: string;
};

export type WeeklyRiderQueue = {
  riderCode: string;
  riderName: string;
  lines: WeeklyQueueLine[];
  equipmentTotalMilli: number;
  manualTotalMilli: number;
  combinedTotalMilli: number;
};

export function mergeWeeklyDeductionQueue(params: {
  equipment: Array<{
    riderCode: string;
    riderName: string;
    baseInstallmentMilli: number;
    carryForwardMilli: number;
    equipmentRequestMilli: number;
  }>;
  manualV2: Array<{
    riderCode: string;
    riderName: string;
    amountMilli: number;
    reason: string;
  }>;
}): WeeklyRiderQueue[] {
  const byRider = new Map<string, WeeklyRiderQueue>();

  const ensure = (code: string, name: string): WeeklyRiderQueue => {
    const key = normalizeRiderCodeKey(code);
    let cur = byRider.get(key);
    if (!cur) {
      cur = {
        riderCode: code,
        riderName: name,
        lines: [],
        equipmentTotalMilli: 0,
        manualTotalMilli: 0,
        combinedTotalMilli: 0,
      };
      byRider.set(key, cur);
    }
    return cur;
  };

  for (const e of params.equipment) {
    if (e.equipmentRequestMilli <= 0) continue;
    const row = ensure(e.riderCode, e.riderName);
    row.lines.push({
      riderCode: e.riderCode,
      riderName: e.riderName,
      amountMilli: e.equipmentRequestMilli,
      amountEgp: milliemesToEgp(e.equipmentRequestMilli),
      source: {
        kind: 'equipment',
        baseInstallmentMilli: e.baseInstallmentMilli,
        carryForwardMilli: e.carryForwardMilli,
      },
      label: `معدات: قسط ${milliemesToEgp(e.baseInstallmentMilli)} + ترحيل ${milliemesToEgp(e.carryForwardMilli)}`,
    });
    row.equipmentTotalMilli += e.equipmentRequestMilli;
    row.combinedTotalMilli += e.equipmentRequestMilli;
  }

  for (const m of params.manualV2) {
    if (m.amountMilli <= 0) continue;
    const row = ensure(m.riderCode, m.riderName);
    row.lines.push({
      riderCode: m.riderCode,
      riderName: m.riderName,
      amountMilli: m.amountMilli,
      amountEgp: milliemesToEgp(m.amountMilli),
      source: { kind: 'manual_v2', reason: m.reason },
      label: `يدوي: ${m.reason}`,
    });
    row.manualTotalMilli += m.amountMilli;
    row.combinedTotalMilli += m.amountMilli;
  }

  return [...byRider.values()].sort((a, b) => a.riderCode.localeCompare(b.riderCode));
}
