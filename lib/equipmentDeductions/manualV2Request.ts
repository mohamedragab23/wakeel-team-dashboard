/**
 * Manual Deductions V2 — map UI reasons + emit REQUEST on الاستقطاعات (source=manual_v2).
 * REQUEST ≠ collection. No Financial Apply / wallet / ledger_native paid semantics.
 */
import {
  arabicMonthName,
  DEDUCTION_CYCLE_LABELS,
  type DeductionCycleKey,
} from '@/lib/equipmentSheetConstants';
import {
  createSheetsObligationLedgerStore,
  emitRequestObligation,
} from '@/lib/equipmentDeductions/requestPersistence';
import type { FrozenDeductionReason } from '@/lib/equipmentDeductions/obligations';
import {
  appendToSheet,
  ensureHeaderRow,
  ensureSheetExists,
  getSheetDataOrThrow,
  updateSheetRow,
} from '@/lib/googleSheets';
import { egpToMilliemes } from '@/lib/money';
import { listPayoutCycles } from '@/lib/payoutCycles/store';
import { isAllowedZone } from '@/lib/zones';

export const MANUAL_V2_UI_REASONS = [
  'سلفة',
  'خصم تشغيلي',
  'مديونية سابقة',
  'أخرى',
] as const;

export type ManualV2UiReason = (typeof MANUAL_V2_UI_REASONS)[number];

export const MANUAL_V2_CYCLE_KEYS = ['first', 'second', 'third'] as const;
export type ManualV2CycleKey = (typeof MANUAL_V2_CYCLE_KEYS)[number];

export function isManualV2UiReason(v: unknown): v is ManualV2UiReason {
  return (MANUAL_V2_UI_REASONS as readonly string[]).includes(String(v || '').trim());
}

export function isManualV2CycleKey(v: unknown): v is ManualV2CycleKey {
  return (MANUAL_V2_CYCLE_KEYS as readonly string[]).includes(String(v || '').trim());
}

/** Map UI reason → frozen sheet reason (أخرى keeps free-text in السبب, never معدات). */
export function mapManualV2ReasonToLedger(
  uiReason: ManualV2UiReason,
  reasonOther: string
): { ok: true; reason: FrozenDeductionReason | string; reasonOther: string } | { ok: false; error: string } {
  if (uiReason === 'سلفة') return { ok: true, reason: 'سلفة', reasonOther: '' };
  if (uiReason === 'خصم تشغيلي') return { ok: true, reason: 'خصم تشغيل', reasonOther: '' };
  if (uiReason === 'مديونية سابقة') return { ok: true, reason: 'مديونية سابقة', reasonOther: '' };
  const other = String(reasonOther || '').trim();
  if (!other) {
    return { ok: false, error: 'سبب «أخرى» يتطلب كتابة السبب' };
  }
  return { ok: true, reason: `أخرى: ${other}`, reasonOther: other };
}

export function resolveManualV2CycleId(params: {
  year: number;
  month: number;
  cycleKey: ManualV2CycleKey;
  payoutCycleId?: string | null;
}): string {
  const explicit = String(params.payoutCycleId || '').trim();
  if (explicit) return explicit;
  const n =
    params.cycleKey === 'first' ? 1 : params.cycleKey === 'second' ? 2 : 3;
  return `manual:${params.year}-${String(params.month).padStart(2, '0')}:c${n}`;
}

export async function resolvePayoutCycleForManualV2(params: {
  year: number;
  month: number;
  cycleKey: ManualV2CycleKey;
}): Promise<{ cycleId: string; cycleNumber: number; matched: boolean }> {
  const cycleNumber =
    params.cycleKey === 'first' ? 1 : params.cycleKey === 'second' ? 2 : 3;
  try {
    const cycles = await listPayoutCycles({
      year: params.year,
      month: params.month,
    });
    const hit = cycles.find((c) => c.cycleNumber === cycleNumber);
    if (hit) {
      return { cycleId: hit.cycleId, cycleNumber, matched: true };
    }
  } catch {
    /* payout sheet may be empty / flag off — synthetic id is fine for REQUEST */
  }
  return {
    cycleId: resolveManualV2CycleId({
      year: params.year,
      month: params.month,
      cycleKey: params.cycleKey,
    }),
    cycleNumber,
    matched: false,
  };
}

function newDeductionId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return `man_v2_${crypto.randomUUID()}`;
  }
  return `man_v2_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}

export type EmitManualV2RequestInput = {
  riderCode: string;
  riderName: string;
  zone: string;
  amountEgp: number;
  uiReason: ManualV2UiReason;
  reasonOther?: string;
  year: number;
  month: number;
  cycleKey: ManualV2CycleKey;
  notes?: string;
  supervisorCode: string;
  supervisorName: string;
};

export type EmitManualV2RequestResult = {
  ok: true;
  deductionId: string;
  cycleId: string;
  cycleLabel: string;
  reason: string;
  outcome: string;
  financialSideEffects: {
    walletMutated: false;
    ledgerNativeWritten: false;
    amountDeductedMilliDelta: 0;
    paidAmountIncremented: false;
  };
};

export async function emitManualV2RequestObligation(
  input: EmitManualV2RequestInput
): Promise<EmitManualV2RequestResult | { ok: false; error: string }> {
  if (!isAllowedZone(input.zone)) {
    return { ok: false, error: 'الزون غير صالح' };
  }
  if (!Number.isFinite(input.amountEgp) || input.amountEgp <= 0) {
    return { ok: false, error: 'المبلغ يجب أن يكون أكبر من صفر' };
  }
  if (
    !Number.isInteger(input.year) ||
    input.year < 2020 ||
    !Number.isInteger(input.month) ||
    input.month < 1 ||
    input.month > 12
  ) {
    return { ok: false, error: 'الشهر والسنة غير صالحين' };
  }
  if (!isManualV2CycleKey(input.cycleKey)) {
    return { ok: false, error: 'دورة الاستقطاع يجب أن تكون الأولى أو الثانية أو الثالثة' };
  }

  const mapped = mapManualV2ReasonToLedger(input.uiReason, String(input.reasonOther || ''));
  if (!mapped.ok) return mapped;

  const cycle = await resolvePayoutCycleForManualV2({
    year: input.year,
    month: input.month,
    cycleKey: input.cycleKey,
  });
  const cycleLabel = DEDUCTION_CYCLE_LABELS[input.cycleKey as DeductionCycleKey];
  const monthLabel = arabicMonthName(input.month);
  const amountMilli = egpToMilliemes(input.amountEgp);
  const deductionId = newDeductionId();
  const now = new Date().toISOString();
  const notes = String(input.notes || '').trim();
  const reasonForSheet = mapped.reasonOther
    ? mapped.reason
    : notes
      ? `${mapped.reason} — ${notes}`
      : mapped.reason;

  const store = await createSheetsObligationLedgerStore({
    ensureSheetExists,
    ensureHeaderRow,
    getSheetDataOrThrow,
    appendToSheet,
    updateSheetRow,
  });

  const result = await emitRequestObligation(store, {
    deductionId,
    source: 'manual_v2',
    riderCode: String(input.riderCode || '').trim(),
    reason: reasonForSheet as FrozenDeductionReason,
    originalCycleId: cycle.cycleId,
    currentCycleId: cycle.cycleId,
    originalAmount: amountMilli,
    obligationAgeKey: now,
    uploadedAt: now,
    riderName: String(input.riderName || '').trim(),
    supervisorCode: input.supervisorCode,
    supervisorName: input.supervisorName,
    zone: input.zone,
    cycleLabel,
    monthLabel,
    year: input.year,
  });

  return {
    ok: true,
    deductionId,
    cycleId: cycle.cycleId,
    cycleLabel,
    reason: reasonForSheet,
    outcome: result.outcome,
    financialSideEffects: result.financialSideEffects,
  };
}
