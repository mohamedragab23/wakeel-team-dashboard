/**
 * SRS-014 Phase 4A — pure allocation waterfall.
 * No I/O, Sheets, Redis, ledger, wallet, flags, or API calls.
 */

import {
  EQUIPMENT_REASON,
  NON_EQUIPMENT_REASON_ORDER,
  compareAgeKeys,
  isOpenForAllocation,
  projectAfterAllocation,
  type DeductionObligation,
  type FrozenDeductionReason,
} from '@/lib/equipmentDeductions/obligations';

export type AllocationLineResult = {
  deductionId: string;
  reason: FrozenDeductionReason;
  allocatedAmount: number;
  paidAfter: number;
  remainingAfter: number;
  fullyPaid: boolean;
  /** H-1 pure signal only — persistence of installmentsCompleted is a later phase. */
  installmentCompleted: boolean;
  /** True when reason is معدات and allocatedAmount > 0 (future wallet path candidate). */
  wouldAffectEquipmentWallet: boolean;
  equipmentIssueId?: string;
  installmentNumber?: number;
};

export type AllocateInput = {
  actualTotalMilli: number;
  obligations: readonly DeductionObligation[];
};

export type AllocateResult = {
  lines: AllocationLineResult[];
  allocatedTotalMilli: number;
  surplusMilli: number;
  /** Projected obligation states after this allocate (no persistence). */
  obligationsAfter: DeductionObligation[];
};

function truncNonNeg(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.trunc(n));
}

function sortEquipment(a: DeductionObligation, b: DeductionObligation): number {
  const age = compareAgeKeys(a.obligationAgeKey, b.obligationAgeKey);
  if (age !== 0) return age;
  const idA = String(a.equipmentIssueId || '');
  const idB = String(b.equipmentIssueId || '');
  if (idA < idB) return -1;
  if (idA > idB) return 1;
  // Stable final key
  return a.deductionId < b.deductionId ? -1 : a.deductionId > b.deductionId ? 1 : 0;
}

function sortNonEquipment(a: DeductionObligation, b: DeductionObligation): number {
  const age = compareAgeKeys(a.obligationAgeKey, b.obligationAgeKey);
  if (age !== 0) return age;
  return a.deductionId < b.deductionId ? -1 : a.deductionId > b.deductionId ? 1 : 0;
}

function cloneMap(obligations: readonly DeductionObligation[]): Map<string, DeductionObligation> {
  const m = new Map<string, DeductionObligation>();
  for (const o of obligations) {
    m.set(o.deductionId, { ...o });
  }
  return m;
}

/**
 * Pure Equipment-First waterfall allocation against an Actual total (milliemes).
 * Surplus is audit-only and never creates a new obligation.
 */
export function allocateActualToObligations(input: AllocateInput): AllocateResult {
  const actualTotalMilli = truncNonNeg(input.actualTotalMilli);
  const state = cloneMap(input.obligations);
  let remainingActual = actualTotalMilli;
  const lines: AllocationLineResult[] = [];

  const openList = () => [...state.values()].filter(isOpenForAllocation);

  const applyOne = (o: DeductionObligation) => {
    if (remainingActual <= 0) return;
    const current = state.get(o.deductionId);
    if (!current || !isOpenForAllocation(current)) return;

    const take = Math.min(remainingActual, truncNonNeg(current.remainingAmount));
    if (take <= 0) return;

    const projected = projectAfterAllocation(current, take);
    state.set(o.deductionId, projected.obligation);
    remainingActual -= projected.allocatedAmount;

    lines.push({
      deductionId: o.deductionId,
      reason: current.reason,
      allocatedAmount: projected.allocatedAmount,
      paidAfter: projected.obligation.paidAmount,
      remainingAfter: projected.obligation.remainingAmount,
      fullyPaid: projected.obligation.remainingAmount === 0,
      installmentCompleted: projected.installmentCompleted,
      wouldAffectEquipmentWallet:
        current.reason === EQUIPMENT_REASON && projected.allocatedAmount > 0,
      equipmentIssueId: current.equipmentIssueId,
      installmentNumber: current.installmentNumber,
    });
  };

  // 1) Equipment First
  const equipment = openList()
    .filter((o) => o.reason === EQUIPMENT_REASON)
    .sort(sortEquipment);
  for (const o of equipment) applyOne(o);

  // 2) Non-equipment in locked reason order, FIFO within reason
  for (const reason of NON_EQUIPMENT_REASON_ORDER) {
    const group = openList()
      .filter((o) => o.reason === reason)
      .sort(sortNonEquipment);
    for (const o of group) applyOne(o);
  }

  const allocatedTotalMilli = lines.reduce((s, l) => s + l.allocatedAmount, 0);
  const surplusMilli = Math.max(0, actualTotalMilli - allocatedTotalMilli);

  return {
    lines,
    allocatedTotalMilli,
    surplusMilli,
    obligationsAfter: [...state.values()],
  };
}
