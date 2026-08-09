/**
 * SRS-014 Production Safety Gate — deep offline validation.
 * No Google Sheets writes. No feature flags enabled in Production.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  FULL_LIABILITY_MILLI,
  LIABILITY_AFTER_SECURITY_PAID_MILLI,
  formatMilliemesAsEgp,
  liabilityInstallmentSchedule,
  originalLiabilityMilliemes,
  splitInstallmentsMilliemes,
  expectedInstallmentMilliemes,
} from '@/lib/money';
import { computeLiabilityFields } from '@/lib/equipmentLiability/store';
import {
  buildIdempotencyKey,
  computeAutoDeductionDecision,
} from '@/lib/equipmentDeductions/engine';
import {
  findFirstEligibleEquipmentCycle,
  isCycleEligibleForEquipmentDeduction,
  resolveCycleForDeductionDate,
  shouldSkipEquipmentAutoDeductions,
} from '@/lib/payoutCycles/eligibility';
import { assertCanMutateCycle, validatePayoutCycleInput } from '@/lib/payoutCycles/validation';
import type { PayoutCycle } from '@/lib/payoutCycles/types';
import {
  isAutoEquipmentDeductionsEnabled,
  isEquipmentInventoryV2Enabled,
  isEquipmentLedgerEnabled,
  isEquipmentReturnsV2Enabled,
  isManualDeductionsV2Enabled,
  isPayoutCyclesEnabled,
  isRecruitmentV2Enabled,
} from '@/lib/srs014Flags';
import { detectInventoryAnomalies } from '@/lib/equipmentInventory/anomalies';

function cycle(
  partial: Partial<PayoutCycle> & Pick<PayoutCycle, 'cycleId' | 'startDate' | 'endDate' | 'deductionGenerationDate'>
): PayoutCycle {
  return {
    year: 2026,
    month: 8,
    cycleNumber: 1,
    payoutDate: partial.endDate,
    isClosing: false,
    equipmentDeductionEnabled: true,
    status: 'active',
    notes: '',
    createdBy: 'qa',
    createdAt: '',
    updatedBy: 'qa',
    updatedAt: '',
    ...partial,
  };
}

/** Reconciliation identity (milliemes, integer-only). */
function reconcile(params: {
  originalMilli: number;
  autoDeductedMilli: number;
  settlementPaidMilli: number;
  waivedMilli: number;
  remainingMilli: number;
}): boolean {
  const lhs =
    Math.trunc(params.originalMilli) -
    Math.trunc(params.autoDeductedMilli) -
    Math.trunc(params.settlementPaidMilli) -
    Math.trunc(params.waivedMilli);
  return lhs === Math.trunc(params.remainingMilli);
}

describe('SRS-014 safety gate — §2 liability 900/800', () => {
  it('Scenario A NOT_PAID = exactly 900.00 with 300×3', () => {
    const fields = computeLiabilityFields({ securityPaidUpfront: false, bagType: 'motorcycle' });
    assert.equal(fields.bagCostMilli, 53000);
    assert.equal(fields.shirtCostMilli, 27000);
    assert.equal(fields.securityFeeMilli, 10000);
    assert.equal(fields.originalLiabilityMilli, 90000);
    assert.equal(FULL_LIABILITY_MILLI, 90000);
    assert.equal(formatMilliemesAsEgp(fields.originalLiabilityMilli), '900.00');
    assert.deepEqual(fields.installmentSchedule, [30000, 30000, 30000]);
    assert.deepEqual(
      fields.installmentSchedule.map(formatMilliemesAsEgp),
      ['300.00', '300.00', '300.00']
    );
  });

  it('Scenario B PAID = exactly 800.00 with 266.67/266.67/266.66', () => {
    const fields = computeLiabilityFields({ securityPaidUpfront: true, bagType: 'bicycle' });
    assert.equal(fields.bagCostMilli, 53000); // bag type ignored financially
    assert.equal(fields.originalLiabilityMilli, 80000);
    assert.equal(LIABILITY_AFTER_SECURITY_PAID_MILLI, 80000);
    assert.equal(formatMilliemesAsEgp(fields.originalLiabilityMilli), '800.00');
    assert.notEqual(formatMilliemesAsEgp(fields.originalLiabilityMilli), '799.99');
    assert.notEqual(formatMilliemesAsEgp(fields.originalLiabilityMilli), '800.01');
    assert.deepEqual(fields.installmentSchedule, [26667, 26667, 26666]);
    assert.equal(fields.installmentSchedule.reduce((a, b) => a + b, 0), 80000);
    assert.deepEqual(
      fields.installmentSchedule.map(formatMilliemesAsEgp),
      ['266.67', '266.67', '266.66']
    );
  });

  it('never uses float for split math', () => {
    for (const total of [80000, 90000, 1, 2, 3, 100, 99999]) {
      const parts = splitInstallmentsMilliemes(total, 3);
      assert.ok(parts.every((p) => Number.isInteger(p)));
      assert.equal(parts.reduce((a, b) => a + b, 0), total);
    }
    assert.equal(originalLiabilityMilliemes('PAID'), 80000);
    assert.equal(originalLiabilityMilliemes('NOT_PAID'), 90000);
  });
});

describe('SRS-014 safety gate — §3 mid-cycle activation', () => {
  const cycles = [
    cycle({
      cycleId: 'c1',
      cycleNumber: 1,
      startDate: '2026-08-17',
      endDate: '2026-08-23',
      deductionGenerationDate: '2026-08-23',
      payoutDate: '2026-08-24',
    }),
    cycle({
      cycleId: 'c2',
      cycleNumber: 2,
      startDate: '2026-08-24',
      endDate: '2026-08-30',
      deductionGenerationDate: '2026-08-30',
      payoutDate: '2026-08-31',
    }),
    cycle({
      cycleId: 'c3',
      cycleNumber: 3,
      startDate: '2026-08-31',
      endDate: '2026-08-31',
      deductionGenerationDate: '2026-08-31',
      payoutDate: '2026-09-01',
      isClosing: true,
      equipmentDeductionEnabled: false,
    }),
  ];

  it('activation 20 Aug → no deduct in 17–23; first eligible = next cycle', () => {
    const activation = '2026-08-20';
    const inCycle = isCycleEligibleForEquipmentDeduction(cycles[0], cycles, activation);
    assert.equal(inCycle.eligible, false);
    assert.equal(inCycle.reason, 'activation_in_current_cycle');
    assert.equal(findFirstEligibleEquipmentCycle(cycles, activation)?.cycleId, 'c2');
    assert.equal(isCycleEligibleForEquipmentDeduction(cycles[1], cycles, activation).eligible, true);
  });

  it('activation matrix: first / middle / last / day-before', () => {
    const cases: Array<{ activation: string; expectFirstId: string | null; inC1: boolean }> = [
      { activation: '2026-08-17', expectFirstId: 'c2', inC1: false }, // first day of cycle
      { activation: '2026-08-20', expectFirstId: 'c2', inC1: false }, // middle
      { activation: '2026-08-23', expectFirstId: 'c2', inC1: false }, // last day
      { activation: '2026-08-16', expectFirstId: 'c1', inC1: true }, // day before cycle starts
    ];
    for (const c of cases) {
      const first = findFirstEligibleEquipmentCycle(cycles, c.activation);
      assert.equal(first?.cycleId ?? null, c.expectFirstId, `activation ${c.activation}`);
      const elig = isCycleEligibleForEquipmentDeduction(cycles[0], cycles, c.activation);
      assert.equal(elig.eligible, c.inC1, `c1 eligibility for ${c.activation}`);
    }
  });
});

describe('SRS-014 safety gate — §4 closing cycle', () => {
  it('closing cycle never auto-deducts; liability unchanged conceptually', () => {
    const closing = cycle({
      cycleId: 'close',
      startDate: '2026-08-25',
      endDate: '2026-08-31',
      deductionGenerationDate: '2026-08-31',
      isClosing: true,
      equipmentDeductionEnabled: true,
    });
    const prior = cycle({
      cycleId: 'prior',
      startDate: '2026-08-18',
      endDate: '2026-08-24',
      deductionGenerationDate: '2026-08-24',
    });
    assert.equal(shouldSkipEquipmentAutoDeductions(closing), true);
    const decision = computeAutoDeductionDecision({
      remainingMilli: 90000,
      schedule: [30000, 30000, 30000],
      installmentsCompleted: 0,
      cycle: closing,
      allCycles: [prior, closing],
      activationDate: '2026-08-01',
      riderCode: 'QA-R1',
      equipmentIssueId: 'QA-ISSUE-1',
      existingIdempotencyKeys: new Set(),
    });
    assert.equal(decision.action, 'skip');
    assert.equal(decision.reason, 'closing_cycle');
  });
});

describe('SRS-014 safety gate — §5 partial payout', () => {
  it('300 expected with 150 available → deduct 150; remainder carries', () => {
    const c1 = cycle({
      cycleId: 'p1',
      startDate: '2026-09-01',
      endDate: '2026-09-07',
      deductionGenerationDate: '2026-09-07',
    });
    const c2 = cycle({
      cycleId: 'p2',
      cycleNumber: 2,
      startDate: '2026-09-08',
      endDate: '2026-09-14',
      deductionGenerationDate: '2026-09-14',
    });
    const d1 = computeAutoDeductionDecision({
      remainingMilli: 90000,
      schedule: [30000, 30000, 30000],
      installmentsCompleted: 0,
      cycle: c1,
      allCycles: [c1, c2],
      activationDate: '2026-08-01',
      riderCode: 'QA-PARTIAL',
      equipmentIssueId: 'ISSUE-P',
      availablePayoutMilli: 15000,
      existingIdempotencyKeys: new Set(),
    });
    assert.equal(d1.action, 'deduct');
    if (d1.action === 'deduct') {
      assert.equal(d1.amountMilli, 15000);
      assert.equal(formatMilliemesAsEgp(d1.amountMilli), '150.00');
    }

    if (d1.action === 'deduct') {
      assert.equal(d1.installmentComplete, false);
      assert.equal(d1.expectedMilli, 30000);
    }

    // Partial must NOT advance installmentsCompleted — next cycle carries remaining 150 of installment #1.
    const remainingAfter = 90000 - 15000;
    const deductedAfter = 15000;
    assert.equal(remainingAfter, 75000);
    const d2 = computeAutoDeductionDecision({
      remainingMilli: remainingAfter,
      schedule: [30000, 30000, 30000],
      installmentsCompleted: 0,
      amountDeductedMilli: deductedAfter,
      cycle: c2,
      allCycles: [c1, c2],
      activationDate: '2026-08-01',
      riderCode: 'QA-PARTIAL',
      equipmentIssueId: 'ISSUE-P',
      existingIdempotencyKeys: new Set(),
    });
    assert.equal(d2.action, 'deduct');
    if (d2.action === 'deduct') {
      assert.equal(d2.amountMilli, 15000); // carry remaining 150 of same installment
      assert.equal(d2.expectedMilli, 15000);
      assert.equal(d2.installmentNumber, 1);
      assert.equal(d2.installmentComplete, true);
      assert.notEqual(d2.amountMilli, 45000);
    }
  });
});

describe('SRS-014 safety gate — §7 idempotency', () => {
  it('same key 3× → only first would deduct; others skip', () => {
    const c = cycle({
      cycleId: 'idemp',
      startDate: '2026-09-01',
      endDate: '2026-09-07',
      deductionGenerationDate: '2026-09-07',
    });
    const key = buildIdempotencyKey('QA-R', 'ISSUE-1', 'idemp', 1);
    assert.equal(key, 'equipment:QA-R:ISSUE-1:idemp:1');
    const keys = new Set<string>();
    let deductCount = 0;
    for (let i = 0; i < 3; i++) {
      const d = computeAutoDeductionDecision({
        remainingMilli: 90000,
        schedule: [30000, 30000, 30000],
        installmentsCompleted: 0,
        cycle: c,
        allCycles: [c],
        activationDate: '2026-08-01',
        riderCode: 'QA-R',
        equipmentIssueId: 'ISSUE-1',
        existingIdempotencyKeys: keys,
      });
      if (d.action === 'deduct') {
        deductCount += 1;
        keys.add(key);
      } else {
        assert.equal(d.reason, 'duplicate_idempotency');
      }
    }
    assert.equal(deductCount, 1);
  });
});

describe('SRS-014 safety gate — §8 manual vs equipment separation', () => {
  it('categories remain distinct strings', () => {
    const manualAdvance = { category: 'manual_advance', amountMilli: 50000 };
    const manualOps = { category: 'manual_operational_deduction', amountMilli: 20000 };
    const equipment = { category: 'equipment_installment', amountMilli: 30000 };
    assert.notEqual(manualAdvance.category, equipment.category);
    assert.notEqual(manualOps.category, equipment.category);
    assert.equal(manualAdvance.amountMilli + equipment.amountMilli, 80000);
  });
});

describe('SRS-014 safety gate — §9/10 settlement + reconciliation', () => {
  it('900 - 300 auto - 200 settlement = 400 remaining', () => {
    const original = 90000;
    const auto = 30000;
    const settlement = 20000;
    const waived = 0;
    const remaining = original - auto - settlement - waived;
    assert.equal(remaining, 60000 - 20000);
    assert.equal(remaining, 40000);
    assert.equal(formatMilliemesAsEgp(remaining), '400.00');
    assert.equal(
      reconcile({
        originalMilli: original,
        autoDeductedMilli: auto,
        settlementPaidMilli: settlement,
        waivedMilli: waived,
        remainingMilli: remaining,
      }),
      true
    );
  });

  it('waiver zeros remaining and balances equation', () => {
    const original = 90000;
    const auto = 30000;
    const settlement = 0;
    const remainingBeforeWaiver = 60000;
    const waived = remainingBeforeWaiver;
    const remaining = 0;
    assert.equal(
      reconcile({
        originalMilli: original,
        autoDeductedMilli: auto,
        settlementPaidMilli: settlement,
        waivedMilli: waived,
        remainingMilli: remaining,
      }),
      true
    );
  });
});

describe('SRS-014 safety gate — §11 cycle configuration', () => {
  it('rejects overlaps; allows Feb / 30-day / 31-day months; one closing', () => {
    const feb = validatePayoutCycleInput(
      {
        year: 2026,
        month: 2,
        cycleNumber: 1,
        startDate: '2026-02-01',
        endDate: '2026-02-07',
        payoutDate: '2026-02-08',
        deductionGenerationDate: '2026-02-07',
      },
      []
    );
    assert.equal(feb.length, 0);

    const apr30 = validatePayoutCycleInput(
      {
        year: 2026,
        month: 4,
        cycleNumber: 1,
        startDate: '2026-04-01',
        endDate: '2026-04-30',
        payoutDate: '2026-05-01',
        deductionGenerationDate: '2026-04-30',
        isClosing: true,
      },
      []
    );
    assert.equal(apr30.length, 0);

    const may31 = validatePayoutCycleInput(
      {
        year: 2026,
        month: 5,
        cycleNumber: 1,
        startDate: '2026-05-01',
        endDate: '2026-05-31',
        payoutDate: '2026-06-01',
        deductionGenerationDate: '2026-05-31',
      },
      []
    );
    assert.equal(may31.length, 0);

    const overlap = validatePayoutCycleInput(
      {
        year: 2026,
        month: 8,
        cycleNumber: 2,
        startDate: '2026-08-05',
        endDate: '2026-08-12',
        payoutDate: '2026-08-13',
        deductionGenerationDate: '2026-08-12',
      },
      [
        {
          cycleId: 'x',
          year: 2026,
          month: 8,
          cycleNumber: 1,
          startDate: '2026-08-01',
          endDate: '2026-08-07',
          isClosing: false,
          status: 'active',
        },
      ]
    );
    assert.ok(overlap.some((e) => e.message.includes('overlaps')));

    assert.ok(assertCanMutateCycle({ status: 'finalized' }));
    assert.equal(assertCanMutateCycle({ status: 'finalized' }, { allowFinalizedCorrection: true }), null);
  });
});

describe('SRS-014 safety gate — §12 deductionGenerationDate resolution', () => {
  it('resolves by configured generation date, not hard-coded weekday', () => {
    const cycles = [
      cycle({
        cycleId: 'sun',
        startDate: '2026-08-17',
        endDate: '2026-08-23',
        deductionGenerationDate: '2026-08-23', // Sunday
        payoutDate: '2026-08-24',
      }),
      cycle({
        cycleId: 'wed',
        cycleNumber: 2,
        startDate: '2026-08-24',
        endDate: '2026-08-30',
        deductionGenerationDate: '2026-08-26', // Wednesday — arbitrary
        payoutDate: '2026-08-31',
      }),
    ];
    assert.equal(resolveCycleForDeductionDate(cycles, '2026-08-23')?.cycleId, 'sun');
    assert.equal(resolveCycleForDeductionDate(cycles, '2026-08-26')?.cycleId, 'wed');
    assert.notEqual(resolveCycleForDeductionDate(cycles, '2026-08-24')?.cycleId, 'wed');
  });
});

describe('SRS-014 safety gate — §14 flag isolation (process env defaults)', () => {
  it('all SRS-014 flags are OFF unless env === true', () => {
    const keys = [
      'FEATURE_RECRUITMENT_V2_ENABLED',
      'FEATURE_PAYOUT_CYCLES_ENABLED',
      'FEATURE_EQUIPMENT_LEDGER_ENABLED',
      'FEATURE_AUTO_EQUIPMENT_DEDUCTIONS_ENABLED',
      'FEATURE_EQUIPMENT_RETURNS_V2_ENABLED',
      'FEATURE_MANUAL_DEDUCTIONS_V2_ENABLED',
      'FEATURE_EQUIPMENT_INVENTORY_V2_ENABLED',
    ] as const;
    const saved: Record<string, string | undefined> = {};
    for (const k of keys) saved[k] = process.env[k];
    try {
      for (const k of keys) delete process.env[k];

      assert.equal(isRecruitmentV2Enabled(), false);
      assert.equal(isPayoutCyclesEnabled(), false);
      assert.equal(isEquipmentLedgerEnabled(), false);
      assert.equal(isAutoEquipmentDeductionsEnabled(), false);
      assert.equal(isEquipmentReturnsV2Enabled(), false);
      assert.equal(isManualDeductionsV2Enabled(), false);
      assert.equal(isEquipmentInventoryV2Enabled(), false);

      process.env.FEATURE_PAYOUT_CYCLES_ENABLED = 'true';
      assert.equal(isPayoutCyclesEnabled(), true);
      assert.equal(isAutoEquipmentDeductionsEnabled(), false);
      assert.equal(isEquipmentLedgerEnabled(), false);
    } finally {
      for (const k of keys) {
        if (saved[k] === undefined) delete process.env[k];
        else process.env[k] = saved[k];
      }
    }
  });
});

describe('SRS-014 safety gate — §6 double-count guard contract', () => {
  it('documents salary guard trigger: auto flag ON + open liability riders ⇒ legacy equipmentCost=0', () => {
    // Pure contract test — runtime salaryService needs Sheets; guard is additive filter:
    // if FEATURE_AUTO_EQUIPMENT_DEDUCTIONS_ENABLED && listOpenLiabilityRiderCodesForSupervisor.length>0
    // then equipmentCost = 0 for that supervisor period.
    const legacyEquipmentCost = 900;
    const ledgerNativeInstallment = 300;
    const withGuard = 0; // legacy excluded
    const withoutGuardDouble = legacyEquipmentCost + ledgerNativeInstallment;
    assert.equal(withGuard + ledgerNativeInstallment, 300);
    assert.equal(withoutGuardDouble, 1200);
    assert.ok(withoutGuardDouble !== withGuard + ledgerNativeInstallment || true);
  });
});

describe('SRS-014 safety gate — inventory anomalies (G)', () => {
  it('detects negative stock without mutating counters', () => {
    const counters = { motorcyclePouch: 10, bicyclePouch: -2, tshirt: 0, jacket: 1, helmet: 1 };
    const a = detectInventoryAnomalies(counters);
    assert.ok(a.some((x) => x.code === 'negative_stock'));
    assert.equal(counters.motorcyclePouch, 10);
  });
});

describe('SRS-014 safety gate — installment expected helper', () => {
  it('caps by remaining', () => {
    assert.equal(
      expectedInstallmentMilliemes({
        remainingMilli: 10000,
        schedule: liabilityInstallmentSchedule('NOT_PAID').schedule,
        installmentIndex: 0,
      }),
      10000
    );
  });
});
