/**
 * SRS-014 Phase 4D.5.4.4 — Controlled ONE-rider test preparation (READ-ONLY).
 *
 * Pure calculation / report artifact.
 * Does NOT:
 * - enable financial flags
 * - call updateBalance / Financial Apply
 * - append ledger
 * - mutate obligations in production stores
 * - write Google Sheets / Redis
 */

import { buildExpectedDeductionSnapshot } from '@/lib/equipmentDeductions/expectedSnapshot';
import { allocateActualToObligations } from '@/lib/equipmentDeductions/allocate';
import {
  createRequestObligation,
  type DeductionObligation,
} from '@/lib/equipmentDeductions/obligations';
import { stableEquipmentInstallmentDeductionId } from '@/lib/equipmentDeductions/requestPersistence';
import { financialApplyEconomicKey } from '@/lib/equipmentDeductions/financialApply';
import { proposePayoutCyclesForMonth } from '@/lib/payoutCycles/monthProposal';
import { findFirstEligibleEquipmentCycle } from '@/lib/payoutCycles/eligibility';
import type { PayoutCycle } from '@/lib/payoutCycles/types';
import { APPROVED_ADMIN_EQUIPMENT_PRICING_EGP } from '@/lib/equipmentPricing/approvedDefaults';
import {
  computeAssignmentLiabilityFields,
  pricingSnapshotFromEgpForTests,
} from '@/lib/equipmentPricing';
import { isSrs014FinancialApplyEnabled } from '@/lib/srs014Flags';

export type ControlledTestMatch = 'PASS' | 'FAIL';

export type ControlledTestPackReport = {
  phase: '4D.5.4.4';
  mode: 'READ_ONLY_PREPARATION';
  financialApplyEnabled: false;
  financialMutation: false;
  firstTransactionExecuted: false;
  rider: {
    riderCode: string;
    riderName: string;
    zone: string;
    supervisor: string;
    activationDate: string;
  };
  equipment: {
    bagType: 'motorcycle' | 'bicycle';
    issueDate: string;
    priceSnapshot: {
      source: 'ADMIN_EQUIPMENT_PRICES';
      motorcycleBagMilli: number;
      bicycleBagMilli: number;
      shirtMilli: number;
      securityFeeMilli: number;
      capturedAt: string;
    };
    securityPaidUpfront: boolean;
  };
  liability: {
    equipmentIssueId: string;
    originalMilli: number;
    alreadyPaidMilli: number;
    remainingBeforeMilli: number;
    status: string;
    pricingSource: 'ADMIN_EQUIPMENT_PRICES';
  };
  cycle: {
    month: string;
    cycleId: string;
    cycleStart: string;
    cycleEnd: string;
    isClosing: boolean;
    payday: string;
  };
  eligibility: {
    activationDate: string;
    firstEligibleCycleId: string;
    excludedCycles: string[];
    expectedDeductionScheduleMilli: number[];
  };
  payroll: {
    expectedDeductionMilli: number;
    actualDeductionMilli: number;
    carryForwardMilli: number;
    allocatedMilli: number;
  };
  evidence: {
    evidenceIdentityKey: string;
    fileValidationStatus: 'FILE_VALID';
    completeCycleConfirmed: true;
    lifecycleStatus: 'PREP_ONLY_NOT_PERSISTED';
  };
  allocation: {
    deductionId: string;
    allocatedMilli: number;
    economicKey: string;
    allocationStatus: string;
  };
  match: {
    expectedEqualsActual: boolean;
    actualEqualsAllocated: boolean;
    expectedEqualsAllocated: boolean;
    result: ControlledTestMatch;
    reasonIfFail: string;
  };
  safety: {
    updateBalanceCalled: false;
    ledgerAppendCalled: false;
    financialApplyCalled: false;
    obligationMutatedInStore: false;
  };
};

function proposedToCycles(year: number, month: number): PayoutCycle[] {
  return proposePayoutCyclesForMonth(year, month).map((p) => ({
    cycleId: `${year}-${String(month).padStart(2, '0')}-C${p.cycleNumber}${p.isClosing ? '-CL' : ''}`,
    year,
    month,
    cycleNumber: p.cycleNumber,
    startDate: p.startDate,
    endDate: p.endDate,
    payoutDate: p.payoutDate || '',
    deductionGenerationDate: p.deductionGenerationDate || p.endDate,
    isClosing: p.isClosing,
    equipmentDeductionEnabled: p.equipmentDeductionEnabled,
    status: 'active' as const,
    notes: 'controlled-test-pack-proposal',
    createdBy: 'prep',
    createdAt: '',
    updatedBy: '',
    updatedAt: '',
  }));
}

/**
 * Canonical ONE-rider / ONE-cycle preparation scenario (injectable fakes only).
 *
 * Rider activated Aug 1 during Cycle 1 → first equipment deduction = Cycle 2.
 * Security paid → original 800; installment 1 expected = 26667 milli.
 * Actual from Manager file simulated equal to Expected → Allocation match.
 */
export function buildCanonicalControlledTestPack(params?: {
  /** Override Actual to force MATCH FAIL (still read-only). */
  actualDeductionMilli?: number;
}): ControlledTestPackReport {
  const year = 2026;
  const month = 8;
  const allCycles = proposedToCycles(year, month);
  const target = allCycles.find((c) => c.cycleNumber === 2 && !c.isClosing);
  if (!target) {
    throw new Error('August 2026 proposal missing Cycle 2 — controlled pack cannot build');
  }

  const riderCode = 'CTRL001';
  const equipmentIssueId = 'eq-ctrl-prep-001';
  const activationDate = '2026-08-01';
  const issueDate = '2026-08-01';
  const securityPaidUpfront = true;

  const { snapshot } = pricingSnapshotFromEgpForTests(
    APPROVED_ADMIN_EQUIPMENT_PRICING_EGP,
    '2026-08-01T08:00:00.000Z'
  );
  const liabilityFields = computeAssignmentLiabilityFields({
    snapshot,
    bagType: 'motorcycle',
    securityPaidUpfront,
  });

  const firstEligible = findFirstEligibleEquipmentCycle(allCycles, activationDate);
  const excludedCycles = allCycles
    .filter((c) => c.isClosing || c.cycleId === allCycles.find((x) => x.cycleNumber === 1)?.cycleId)
    .map((c) => c.cycleId);

  const expectedSnap = buildExpectedDeductionSnapshot({
    asOfDate: target.endDate,
    cycle: target,
    allCycles,
    openIssues: [
      {
        equipmentIssueId,
        riderCode,
        riderNameSnapshot: 'Controlled Prep Rider',
        activationDate,
        originalLiabilityMilli: liabilityFields.originalLiabilityMilli,
        outstandingMilli: liabilityFields.outstandingMilli,
        amountDeductedMilli: 0,
        installmentsCompleted: 0,
        securityPaidUpfront,
        status: 'open',
        bagCostMilli: liabilityFields.bagCostMilli,
        shirtCostMilli: liabilityFields.shirtCostMilli,
        securityFeeMilli: liabilityFields.securityFeeMilli,
      },
    ],
  });

  const line = expectedSnap.lines[0]!;
  const expectedDeductionMilli = line.expectedDeductionMilli;
  const actualDeductionMilli =
    params?.actualDeductionMilli != null
      ? Math.max(0, Math.trunc(params.actualDeductionMilli))
      : expectedDeductionMilli;

  const installmentNumber = 1;
  const deductionId = stableEquipmentInstallmentDeductionId(equipmentIssueId, installmentNumber);
  const evidenceIdentityKey = `prep:evidence:${riderCode}:${target.cycleId}:FILE_VALID`;
  const economicKey = financialApplyEconomicKey(evidenceIdentityKey, deductionId);

  const obligation: DeductionObligation = createRequestObligation({
    deductionId,
    source: 'auto_equipment',
    riderCode,
    reason: 'معدات',
    originalCycleId: target.cycleId,
    currentCycleId: target.cycleId,
    originalAmount: expectedDeductionMilli,
    obligationAgeKey: `${target.startDate}|${deductionId}`,
    equipmentIssueId,
    installmentNumber,
  });

  const alloc = allocateActualToObligations({
    actualTotalMilli: actualDeductionMilli,
    obligations: [obligation],
  });
  const allocatedMilli = alloc.lines[0]?.allocatedAmount ?? 0;
  const allocationStatus = alloc.lines[0]
    ? alloc.lines[0].fullyPaid
      ? 'fully_allocated_projection'
      : allocatedMilli > 0
        ? 'partially_allocated_projection'
        : 'zero_allocated_projection'
    : 'no_line';

  const expectedEqualsActual = expectedDeductionMilli === actualDeductionMilli;
  const actualEqualsAllocated = actualDeductionMilli === allocatedMilli;
  const expectedEqualsAllocated = expectedDeductionMilli === allocatedMilli;
  const matchPass =
    expectedEqualsActual &&
    actualEqualsAllocated &&
    expectedEqualsAllocated &&
    expectedDeductionMilli > 0 &&
    line.eligible === true;

  // Hard safety: never interpret prep as apply enablement.
  void isSrs014FinancialApplyEnabled();

  return {
    phase: '4D.5.4.4',
    mode: 'READ_ONLY_PREPARATION',
    financialApplyEnabled: false,
    financialMutation: false,
    firstTransactionExecuted: false,
    rider: {
      riderCode,
      riderName: 'Controlled Prep Rider',
      zone: 'شرق',
      supervisor: 'WA-PREP',
      activationDate,
    },
    equipment: {
      bagType: 'motorcycle',
      issueDate,
      priceSnapshot: {
        source: 'ADMIN_EQUIPMENT_PRICES',
        motorcycleBagMilli: snapshot.motorcycleBagMilli,
        bicycleBagMilli: snapshot.bicycleBagMilli,
        shirtMilli: snapshot.shirtMilli,
        securityFeeMilli: snapshot.securityFeeMilli,
        capturedAt: snapshot.capturedAt,
      },
      securityPaidUpfront,
    },
    liability: {
      equipmentIssueId,
      originalMilli: liabilityFields.originalLiabilityMilli,
      alreadyPaidMilli: 0,
      remainingBeforeMilli: liabilityFields.outstandingMilli,
      status: 'open',
      pricingSource: 'ADMIN_EQUIPMENT_PRICES',
    },
    cycle: {
      month: `${year}-${String(month).padStart(2, '0')}`,
      cycleId: target.cycleId,
      cycleStart: target.startDate,
      cycleEnd: target.endDate,
      isClosing: Boolean(target.isClosing),
      payday: target.payoutDate || '(admin-blank-proposal)',
    },
    eligibility: {
      activationDate,
      firstEligibleCycleId: firstEligible?.cycleId || '',
      excludedCycles,
      expectedDeductionScheduleMilli: liabilityFields.installmentSchedule,
    },
    payroll: {
      expectedDeductionMilli,
      actualDeductionMilli,
      carryForwardMilli: line.carriedRemainderMilli,
      allocatedMilli,
    },
    evidence: {
      evidenceIdentityKey,
      fileValidationStatus: 'FILE_VALID',
      completeCycleConfirmed: true,
      lifecycleStatus: 'PREP_ONLY_NOT_PERSISTED',
    },
    allocation: {
      deductionId,
      allocatedMilli,
      economicKey,
      allocationStatus,
    },
    match: {
      expectedEqualsActual,
      actualEqualsAllocated,
      expectedEqualsAllocated,
      result: matchPass ? 'PASS' : 'FAIL',
      reasonIfFail: matchPass
        ? ''
        : !line.eligible
          ? `not_eligible:${line.reasonIfZero}`
          : expectedDeductionMilli <= 0
            ? 'expected_zero'
            : !expectedEqualsActual
              ? `expected(${expectedDeductionMilli})!=actual(${actualDeductionMilli})`
              : !actualEqualsAllocated
                ? `actual(${actualDeductionMilli})!=allocated(${allocatedMilli})`
                : 'match_failed',
    },
    safety: {
      updateBalanceCalled: false,
      ledgerAppendCalled: false,
      financialApplyCalled: false,
      obligationMutatedInStore: false,
    },
  };
}

/** Human-readable summary lines for gate review. */
export function formatControlledTestPackReport(report: ControlledTestPackReport): string {
  const lines = [
    '# CONTROLLED ONE-RIDER READ-ONLY TEST PACK',
    `MATCH = ${report.match.result}`,
    '',
    `Rider: ${report.rider.riderCode} / ${report.rider.riderName}`,
    `Zone: ${report.rider.zone} | Supervisor: ${report.rider.supervisor}`,
    `Activation: ${report.rider.activationDate}`,
    '',
    `Equipment: ${report.equipment.bagType} + 2 shirts | securityPaid=${report.equipment.securityPaidUpfront}`,
    `Price snapshot: bag=${report.equipment.priceSnapshot.motorcycleBagMilli} shirtUnit=${report.equipment.priceSnapshot.shirtMilli} security=${report.equipment.priceSnapshot.securityFeeMilli}`,
    '',
    `Liability original=${report.liability.originalMilli} remainingBefore=${report.liability.remainingBeforeMilli} status=${report.liability.status}`,
    '',
    `Cycle: ${report.cycle.cycleId} ${report.cycle.cycleStart}→${report.cycle.cycleEnd} closing=${report.cycle.isClosing} payday=${report.cycle.payday}`,
    `First eligible: ${report.eligibility.firstEligibleCycleId}`,
    `Schedule: ${report.eligibility.expectedDeductionScheduleMilli.join('+')}`,
    '',
    `Expected=${report.payroll.expectedDeductionMilli}`,
    `Actual=${report.payroll.actualDeductionMilli}`,
    `Allocated=${report.payroll.allocatedMilli}`,
    `Carry=${report.payroll.carryForwardMilli}`,
    '',
    `evidenceIdentityKey=${report.evidence.evidenceIdentityKey}`,
    `deductionId=${report.allocation.deductionId}`,
    `economicKey=${report.allocation.economicKey}`,
    '',
    `Financial Apply enabled: ${report.financialApplyEnabled}`,
    `Financial mutation: ${report.financialMutation}`,
    `First transaction executed: ${report.firstTransactionExecuted}`,
  ];
  if (report.match.result === 'FAIL') {
    lines.push(`FAIL reason: ${report.match.reasonIfFail}`);
  }
  return lines.join('\n');
}
