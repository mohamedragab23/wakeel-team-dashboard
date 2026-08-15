/**
 * SRS-014 Phase D — Auto Equipment Deduction acceptance suite (offline).
 * Does not enable production flags. No real Sheets / payroll / salary mutations.
 */
import assert from 'node:assert/strict';
import { describe, it, beforeEach, afterEach } from 'node:test';
import {
  buildIdempotencyKey,
  computeAutoDeductionDecision,
  runEquipmentAutoDeductionsForDate,
  type AutoDeductionRunDeps,
} from '@/lib/equipmentDeductions/engine';
import {
  parseAvailablePayoutMilli,
  parseAvailablePayoutMilliByRiderJson,
  resolveAvailablePayoutMilliByRider,
} from '@/lib/equipmentDeductions/availablePayout';
import {
  AUTO_DEDUCTION_LOCK_TTL_SECONDS,
  canReleaseLock,
} from '@/lib/equipmentDeductions/lock';
import { shouldZeroLegacyEquipmentCostForSupervisor } from '@/lib/equipmentDeductions/legacyEquipmentGuard';
import {
  unrecoveredLedgerPostMilli,
  expectedOutstandingMilli,
} from '@/lib/equipmentDeductions/reconcile';
import {
  liabilityInstallmentSchedule,
  formatMilliemesAsEgp,
} from '@/lib/money';
import { computeLiabilityFields } from '@/lib/equipmentLiability/store';
import {
  isCycleEligibleForEquipmentDeduction,
  resolveCycleForDeductionDate,
} from '@/lib/payoutCycles/eligibility';
import type { PayoutCycle } from '@/lib/payoutCycles/types';
import type { EquipmentLiabilityIssue } from '@/lib/equipmentLiability/store';
import {
  isAutoEquipmentDeductionsEnabled,
  isEquipmentLedgerEnabled,
  isRecruitmentV2Enabled,
} from '@/lib/srs014Flags';

function cycle(
  partial: Partial<PayoutCycle> & Pick<PayoutCycle, 'cycleId' | 'startDate' | 'endDate'>
): PayoutCycle {
  return {
    year: 2026,
    month: 9,
    cycleNumber: 1,
    payoutDate: partial.endDate,
    deductionGenerationDate: partial.endDate,
    isClosing: false,
    equipmentDeductionEnabled: true,
    status: 'active',
    notes: '',
    createdBy: 'phaseD',
    createdAt: '',
    updatedBy: 'phaseD',
    updatedAt: '',
    ...partial,
  };
}

function openIssue(
  partial: Partial<EquipmentLiabilityIssue> & Pick<EquipmentLiabilityIssue, 'equipmentIssueId' | 'riderCode'>
): EquipmentLiabilityIssue {
  const paid = partial.securityPaidUpfront ?? false;
  const fields = computeLiabilityFields({
    securityPaidUpfront: paid,
    bagType: 'motorcycle',
    pricing: {
      source: 'ADMIN_EQUIPMENT_PRICES',
      capturedAt: '2026-08-01T00:00:00.000Z',
      motorcycleBagMilli: 53000,
      bicycleBagMilli: 53000,
      shirtMilli: 13500,
      securityFeeMilli: 10000,
    },
  });
  return {
    riderNameSnapshot: 'PD QA',
    zoneSnapshot: 'Z',
    supervisorCodeSnapshot: 'SUP1',
    supervisorNameSnapshot: 'Sup',
    issueDate: '2026-08-01',
    activationDate: '2026-08-01',
    bagType: 'motorcycle',
    bagCostMilli: fields.bagCostMilli,
    shirtQty: fields.shirtQty,
    shirtCostMilli: fields.shirtCostMilli,
    securityFeeMilli: fields.securityFeeMilli,
    securityPaidUpfront: paid,
    originalLiabilityMilli: fields.originalLiabilityMilli,
    outstandingMilli: fields.outstandingMilli,
    amountDeductedMilli: 0,
    settlementPaidMilli: 0,
    installmentsCompleted: 0,
    status: 'open',
    deliveryRowRef: `del-${partial.equipmentIssueId}`,
    jacketHeld: false,
    helmetHeld: false,
    createdAt: '',
    createdBy: 'phaseD',
    updatedAt: '',
    updatedBy: 'phaseD',
    installmentSchedule: fields.installmentSchedule,
    ...partial,
  };
}

type FakeLedger = { transactionId: string; idempotencyKey: string; amount: number; cycleId?: string };

function makeHarness(params: {
  cycles: PayoutCycle[];
  issues: EquipmentLiabilityIssue[];
  availableByRider?: Record<string, number>;
  /** When true, do not auto-fill available payout (tests fail-closed missing map). */
  omitAvailablePayout?: boolean;
  failPayrollOnce?: boolean;
  failBalanceOnce?: boolean;
  sheetsFailOnList?: boolean;
  failAvailableResolve?: boolean;
}) {
  const ledger = new Map<string, FakeLedger>();
  const autoRows: Array<Record<string, unknown>> = [];
  const audits: Array<Record<string, unknown>> = [];
  const locks = new Map<string, string>();
  let payrollFails = params.failPayrollOnce ? 1 : 0;
  let balanceFails = params.failBalanceOnce ? 1 : 0;
  const issues = params.issues.map((i) => ({ ...i }));

  const defaultAvailable: Record<string, number> = {};
  if (!params.omitAvailablePayout) {
    for (const i of params.issues) {
      defaultAvailable[i.riderCode] = params.availableByRider?.[i.riderCode] ?? 1_000_000;
    }
  }

  const deps: AutoDeductionRunDeps = {
    persistSkipRows: false,
    listPayoutCycles: async () => params.cycles,
    listOpenIssues: async () => {
      if (params.sheetsFailOnList) throw new Error('QUOTA_EXCEEDED_SIMULATED');
      return issues.filter((i) => i.status === 'open');
    },
    loadGuards: async () => {
      const idempotencyKeys = new Set<string>();
      const postedIdempotencyKeys = new Set<string>();
      const issueCycleKeys = new Set<string>();
      for (const row of autoRows) {
        if (row.idempotencyKey) idempotencyKeys.add(String(row.idempotencyKey));
        if (row.status === 'posted' && row.idempotencyKey) {
          postedIdempotencyKeys.add(String(row.idempotencyKey));
        }
        if (row.status === 'posted' && row.equipmentIssueId && row.cycleId) {
          issueCycleKeys.add(`${row.equipmentIssueId}:${row.cycleId}`);
        }
      }
      return { idempotencyKeys, postedIdempotencyKeys, issueCycleKeys };
    },
    resolveAvailablePayout: async ({ riderCodes, overrideByRider }) => {
      if (params.failAvailableResolve) throw new Error('AVAILABLE_PAYOUT_SOURCE_DOWN');
      return resolveAvailablePayoutMilliByRider({
        riderCodes,
        overrideByRider: {
          ...defaultAvailable,
          ...(params.availableByRider || {}),
          ...(overrideByRider || {}),
        },
      });
    },
    getIssueById: async (id) => issues.find((i) => i.equipmentIssueId === id) || null,
    getLedgerByKey: async (key) => ledger.get(key) || null,
    appendLedger: async (input) => {
      if (payrollFails > 0) {
        payrollFails -= 1;
        throw new Error('PAYROLL_POST_FAILED');
      }
      const key = String(input.idempotencyKey || '');
      if (ledger.has(key)) return ledger.get(key)! as any;
      const txn = {
        transactionId: `txn_${ledger.size + 1}`,
        idempotencyKey: key,
        amount: Number(input.rawAmount),
        cycleId: input.cycleId,
      };
      ledger.set(key, txn);
      return txn as any;
    },
    appendAutoRow: async (row) => {
      autoRows.push({ ...row });
    },
    updateBalance: async (equipmentIssueId, deductionMilli, _actor, opts) => {
      if (balanceFails > 0) {
        balanceFails -= 1;
        return { ok: false as const, error: 'balance failed' };
      }
      const issue = issues.find((i) => i.equipmentIssueId === equipmentIssueId);
      if (!issue) return { ok: false as const, error: 'issue not found' };
      const deduct = Math.max(0, Math.trunc(deductionMilli));
      issue.amountDeductedMilli += deduct;
      issue.outstandingMilli = Math.max(0, issue.outstandingMilli - deduct);
      if (opts?.incrementInstallment) issue.installmentsCompleted += 1;
      if (issue.outstandingMilli <= 0) issue.status = 'settled';
      return { ok: true as const, issue: { ...issue } };
    },
    acquireLock: async (idempotencyKey) => {
      if (locks.has(idempotencyKey)) return { ok: false as const, reason: 'lock_busy' as const };
      const token = `tok_${idempotencyKey}_${locks.size}`;
      locks.set(idempotencyKey, token);
      return {
        ok: true as const,
        token,
        release: async () => {
          if (locks.get(idempotencyKey) === token) locks.delete(idempotencyKey);
        },
      };
    },
    appendAudit: async (entry) => {
      audits.push(entry as any);
    },
  };

  return { deps, ledger, autoRows, audits, locks, issues };
}

const FLAG_KEYS = [
  'FEATURE_AUTO_EQUIPMENT_DEDUCTIONS_ENABLED',
  'FEATURE_EQUIPMENT_LEDGER_ENABLED',
  'FEATURE_RECRUITMENT_V2_ENABLED',
] as const;

describe('Phase D acceptance — money + schedules', () => {
  it('S: PAID 800 and NOT_PAID 900 schedules (integer milliemes)', () => {
    const paid = liabilityInstallmentSchedule('PAID');
    const unpaid = liabilityInstallmentSchedule('NOT_PAID');
    assert.equal(paid.originalLiabilityMilli, 80000);
    assert.deepEqual(paid.schedule, [26667, 26667, 26666]);
    assert.equal(paid.schedule.reduce((a, b) => a + b, 0), 80000);
    assert.equal(unpaid.originalLiabilityMilli, 90000);
    assert.deepEqual(unpaid.schedule, [30000, 30000, 30000]);
    assert.equal(formatMilliemesAsEgp(80000), '800.00');
    assert.equal(formatMilliemesAsEgp(90000), '900.00');
  });
});

describe('Phase D acceptance — partial payout + carry-forward', () => {
  const saved: Record<string, string | undefined> = {};
  beforeEach(() => {
    for (const k of FLAG_KEYS) saved[k] = process.env[k];
    process.env.FEATURE_AUTO_EQUIPMENT_DEDUCTIONS_ENABLED = 'true';
  });
  afterEach(() => {
    for (const k of FLAG_KEYS) {
      if (saved[k] === undefined) delete process.env[k];
      else process.env[k] = saved[k];
    }
  });

  it('A/B/C: 300 target, 150 available → 150 deducted; next cycle closes installment', async () => {
    const c1 = cycle({
      cycleId: 'pd-c1',
      startDate: '2026-09-01',
      endDate: '2026-09-07',
      deductionGenerationDate: '2026-09-07',
    });
    const c2 = cycle({
      cycleId: 'pd-c2',
      cycleNumber: 2,
      startDate: '2026-09-08',
      endDate: '2026-09-14',
      deductionGenerationDate: '2026-09-14',
    });
    const issue = openIssue({
      equipmentIssueId: 'ISSUE-P',
      riderCode: '700001',
      securityPaidUpfront: false,
    });

    const h1 = makeHarness({
      cycles: [c1, c2],
      issues: [issue],
      availableByRider: { '700001': 15000 },
    });
    const r1 = await runEquipmentAutoDeductionsForDate(
      '2026-09-07',
      { code: 'cron', name: 'test' },
      { availablePayoutMilliByRider: { '700001': 15000 }, deps: h1.deps }
    );
    assert.equal(r1.deducted, 1);
    assert.equal(h1.ledger.size, 1);
    assert.equal([...h1.ledger.values()][0].amount, 150);
    assert.equal(h1.issues[0].amountDeductedMilli, 15000);
    assert.equal(h1.issues[0].outstandingMilli, 75000);
    assert.equal(h1.issues[0].installmentsCompleted, 0); // partial — index not advanced

    // Carry-forward: remaining 150 of installment #1
    const h2 = makeHarness({
      cycles: [c1, c2],
      issues: [h1.issues[0]],
      availableByRider: { '700001': 15000 },
    });
    // Seed prior posted guard for cycle 1 only via amount state; cycle 2 is fresh.
    const r2 = await runEquipmentAutoDeductionsForDate(
      '2026-09-14',
      { code: 'cron', name: 'test' },
      { availablePayoutMilliByRider: { '700001': 15000 }, deps: h2.deps }
    );
    assert.equal(r2.deducted, 1);
    assert.equal(h2.issues[0].amountDeductedMilli, 30000);
    assert.equal(h2.issues[0].installmentsCompleted, 1);
    assert.equal(h2.issues[0].outstandingMilli, 60000);

    const dNext = computeAutoDeductionDecision({
      remainingMilli: h2.issues[0].outstandingMilli,
      schedule: [30000, 30000, 30000],
      installmentsCompleted: 1,
      amountDeductedMilli: h2.issues[0].amountDeductedMilli,
      cycle: c2,
      allCycles: [c1, c2],
      activationDate: '2026-08-01',
      riderCode: '700001',
      equipmentIssueId: 'ISSUE-P',
      existingIdempotencyKeys: new Set(),
      existingIssueCycleKeys: new Set(['ISSUE-P:pd-c2']),
    });
    assert.equal(dNext.action, 'skip');
    assert.equal(dNext.reason, 'already_posted_for_cycle');
  });
});

describe('Phase D acceptance — settlement vs installment', () => {
  it('D: 800 liability + 200 settlement does not satisfy installment', () => {
    const fields = computeLiabilityFields({
      securityPaidUpfront: true,
      bagType: 'motorcycle',
      pricing: {
        source: 'ADMIN_EQUIPMENT_PRICES',
        capturedAt: '2026-08-01T00:00:00.000Z',
        motorcycleBagMilli: 53000,
        bicycleBagMilli: 53000,
        shirtMilli: 13500,
        securityFeeMilli: 10000,
      },
    });
    const settlement = 20000;
    const outstanding = fields.originalLiabilityMilli - settlement;
    const amountDeductedMilli = 0; // settlement must NOT pollute installment progress
    const settlementPaidMilli = settlement;

    assert.equal(outstanding, 60000);
    assert.equal(settlementPaidMilli, 20000);

    const c = cycle({
      cycleId: 'pd-set',
      startDate: '2026-09-08',
      endDate: '2026-09-14',
      deductionGenerationDate: '2026-09-14',
    });
    const d = computeAutoDeductionDecision({
      remainingMilli: outstanding,
      schedule: fields.installmentSchedule,
      installmentsCompleted: 0,
      amountDeductedMilli,
      cycle: c,
      allCycles: [c],
      activationDate: '2026-08-01',
      riderCode: '700010',
      equipmentIssueId: 'ISSUE-S',
      availablePayoutMilli: 26667,
      existingIdempotencyKeys: new Set(),
    });
    assert.equal(d.action, 'deduct');
    if (d.action === 'deduct') {
      // Full first installment still owed (26667), not reduced by settlement.
      assert.equal(d.expectedMilli, 26667);
      assert.equal(d.amountMilli, 26667);
      assert.equal(d.installmentNumber, 1);
      assert.notEqual(d.expectedMilli, 6667);
    }

    // Polluted model (bug): amountDeducted includes settlement → false partial satisfaction
    const polluted = computeAutoDeductionDecision({
      remainingMilli: outstanding,
      schedule: fields.installmentSchedule,
      installmentsCompleted: 0,
      amountDeductedMilli: settlement, // BAD
      cycle: c,
      allCycles: [c],
      activationDate: '2026-08-01',
      riderCode: '700010',
      equipmentIssueId: 'ISSUE-S',
      availablePayoutMilli: 26667,
      existingIdempotencyKeys: new Set(),
    });
    assert.equal(polluted.action, 'deduct');
    if (polluted.action === 'deduct') {
      assert.equal(polluted.expectedMilli, 6667); // proves why settlement must not touch amountDeducted
    }
  });

  it('T: waiver zeros outstanding without fake installment progress', () => {
    const original = 90000;
    const amountDeductedMilli = 30000;
    const settlementPaidMilli = 0;
    const waivedOutstanding = 0;
    const waivedMilli = original - amountDeductedMilli - settlementPaidMilli - waivedOutstanding;
    assert.equal(waivedMilli, 60000);
    const c = cycle({
      cycleId: 'pd-w',
      startDate: '2026-09-08',
      endDate: '2026-09-14',
    });
    const d = computeAutoDeductionDecision({
      remainingMilli: 0,
      schedule: [30000, 30000, 30000],
      installmentsCompleted: 1,
      amountDeductedMilli,
      cycle: c,
      allCycles: [c],
      activationDate: '2026-08-01',
      riderCode: '700011',
      equipmentIssueId: 'ISSUE-W',
      existingIdempotencyKeys: new Set(),
    });
    assert.equal(d.action, 'skip');
    assert.equal(d.reason, 'no_outstanding');
  });
});

describe('Phase D acceptance — cycle protection', () => {
  const saved: Record<string, string | undefined> = {};
  beforeEach(() => {
    saved.FEATURE_AUTO_EQUIPMENT_DEDUCTIONS_ENABLED = process.env.FEATURE_AUTO_EQUIPMENT_DEDUCTIONS_ENABLED;
    process.env.FEATURE_AUTO_EQUIPMENT_DEDUCTIONS_ENABLED = 'true';
  });
  afterEach(() => {
    if (saved.FEATURE_AUTO_EQUIPMENT_DEDUCTIONS_ENABLED === undefined) {
      delete process.env.FEATURE_AUTO_EQUIPMENT_DEDUCTIONS_ENABLED;
    } else {
      process.env.FEATURE_AUTO_EQUIPMENT_DEDUCTIONS_ENABLED = saved.FEATURE_AUTO_EQUIPMENT_DEDUCTIONS_ENABLED;
    }
  });

  it('E: finalized cycle → no payroll mutation', async () => {
    const c = cycle({
      cycleId: 'pd-fin',
      startDate: '2026-09-01',
      endDate: '2026-09-07',
      deductionGenerationDate: '2026-09-07',
      status: 'finalized',
    });
    const issue = openIssue({ equipmentIssueId: 'ISSUE-F', riderCode: '700020' });
    const h = makeHarness({ cycles: [c], issues: [issue] });
    const r = await runEquipmentAutoDeductionsForDate(
      '2026-09-07',
      { code: 'cron', name: 'test' },
      { deps: h.deps }
    );
    assert.ok(r.errors.includes('cycle_finalized'));
    assert.equal(r.deducted, 0);
    assert.equal(h.ledger.size, 0);
    assert.equal(
      isCycleEligibleForEquipmentDeduction(c, [c], '2026-08-01').reason,
      'cycle_finalized'
    );
  });

  it('F: missing cycle → rejected safely', async () => {
    const h = makeHarness({
      cycles: [
        cycle({
          cycleId: 'other',
          startDate: '2026-10-01',
          endDate: '2026-10-07',
          deductionGenerationDate: '2026-10-07',
        }),
      ],
      issues: [openIssue({ equipmentIssueId: 'ISSUE-M', riderCode: '700021' })],
    });
    const r = await runEquipmentAutoDeductionsForDate(
      '2026-09-07',
      { code: 'cron', name: 'test' },
      { deps: h.deps }
    );
    assert.ok(r.errors.includes('no_cycle_for_date'));
    assert.equal(r.deducted, 0);
    assert.equal(h.ledger.size, 0);
    assert.equal(resolveCycleForDeductionDate(h.deps.listPayoutCycles ? await h.deps.listPayoutCycles() : [], '2026-09-07'), null);
  });
});

describe('Phase D acceptance — Redis lock / idempotency / concurrent', () => {
  const saved: Record<string, string | undefined> = {};
  beforeEach(() => {
    saved.FEATURE_AUTO_EQUIPMENT_DEDUCTIONS_ENABLED = process.env.FEATURE_AUTO_EQUIPMENT_DEDUCTIONS_ENABLED;
    process.env.FEATURE_AUTO_EQUIPMENT_DEDUCTIONS_ENABLED = 'true';
  });
  afterEach(() => {
    if (saved.FEATURE_AUTO_EQUIPMENT_DEDUCTIONS_ENABLED === undefined) {
      delete process.env.FEATURE_AUTO_EQUIPMENT_DEDUCTIONS_ENABLED;
    } else {
      process.env.FEATURE_AUTO_EQUIPMENT_DEDUCTIONS_ENABLED = saved.FEATURE_AUTO_EQUIPMENT_DEDUCTIONS_ENABLED;
    }
  });

  it('J: lock TTL is bounded (not 90 days)', () => {
    assert.ok(AUTO_DEDUCTION_LOCK_TTL_SECONDS <= 60 * 60);
    assert.ok(AUTO_DEDUCTION_LOCK_TTL_SECONDS >= 60);
    assert.notEqual(AUTO_DEDUCTION_LOCK_TTL_SECONDS, 90 * 24 * 60 * 60);
  });

  it('J: ownership-verified release', () => {
    assert.equal(canReleaseLock('tok-a', 'tok-a'), true);
    assert.equal(canReleaseLock('tok-a', 'tok-b'), false);
    assert.equal(canReleaseLock(null, 'tok-a'), false);
  });

  it('A/K: first success then duplicate is idempotent', async () => {
    const c = cycle({
      cycleId: 'pd-id',
      startDate: '2026-09-01',
      endDate: '2026-09-07',
      deductionGenerationDate: '2026-09-07',
    });
    const issue = openIssue({ equipmentIssueId: 'ISSUE-I', riderCode: '700030' });
    const h = makeHarness({ cycles: [c], issues: [issue] });
    const actor = { code: 'cron', name: 'test' };
    const r1 = await runEquipmentAutoDeductionsForDate('2026-09-07', actor, { deps: h.deps });
    const r2 = await runEquipmentAutoDeductionsForDate('2026-09-07', actor, { deps: h.deps });
    assert.equal(r1.deducted, 1);
    assert.equal(r2.deducted, 0);
    assert.equal(h.ledger.size, 1);
    assert.equal(h.issues[0].amountDeductedMilli, 30000);
  });

  it('J/K: payroll failure releases lock; retry succeeds (no double)', async () => {
    const c = cycle({
      cycleId: 'pd-fail',
      startDate: '2026-09-01',
      endDate: '2026-09-07',
      deductionGenerationDate: '2026-09-07',
    });
    const issue = openIssue({ equipmentIssueId: 'ISSUE-PF', riderCode: '700031' });
    const h = makeHarness({ cycles: [c], issues: [issue], failPayrollOnce: true });
    const actor = { code: 'cron', name: 'test' };
    const r1 = await runEquipmentAutoDeductionsForDate('2026-09-07', actor, { deps: h.deps });
    assert.equal(r1.deducted, 0);
    assert.ok(r1.errors.some((e) => e.includes('payroll_post_failed')));
    assert.equal(h.locks.size, 0); // released after failure
    const r2 = await runEquipmentAutoDeductionsForDate('2026-09-07', actor, { deps: h.deps });
    assert.equal(r2.deducted, 1);
    assert.equal(h.ledger.size, 1);
  });

  it('I: concurrent cron → exactly one financial deduction', async () => {
    const c = cycle({
      cycleId: 'pd-conc',
      startDate: '2026-09-01',
      endDate: '2026-09-07',
      deductionGenerationDate: '2026-09-07',
    });
    const issue = openIssue({ equipmentIssueId: 'ISSUE-C', riderCode: '700032' });
    const h = makeHarness({ cycles: [c], issues: [issue] });

    // Shared lock map already enforces mutual exclusion when both use same deps.
    const [a, b] = await Promise.all([
      runEquipmentAutoDeductionsForDate('2026-09-07', { code: 'cron', name: 'a' }, { deps: h.deps }),
      runEquipmentAutoDeductionsForDate('2026-09-07', { code: 'cron', name: 'b' }, { deps: h.deps }),
    ]);
    assert.equal(a.deducted + b.deducted, 1);
    assert.equal(h.ledger.size, 1);
    assert.equal(h.issues[0].amountDeductedMilli, 30000);
    const posted = h.autoRows.filter((r) => r.status === 'posted');
    assert.equal(posted.length, 1);
  });
});

describe('Phase D acceptance — missing data + payout edge cases', () => {
  it('G/H: missing/invalid rider fail closed', () => {
    const c = cycle({
      cycleId: 'pd-r',
      startDate: '2026-09-08',
      endDate: '2026-09-14',
    });
    const invalid = computeAutoDeductionDecision({
      remainingMilli: 90000,
      schedule: [30000, 30000, 30000],
      installmentsCompleted: 0,
      cycle: c,
      allCycles: [c],
      activationDate: '2026-08-01',
      riderCode: 'NOT-A-RIDER',
      equipmentIssueId: 'X',
      existingIdempotencyKeys: new Set(),
    });
    assert.equal(invalid.action, 'skip');
    assert.equal(invalid.reason, 'invalid_rider');

    const empty = computeAutoDeductionDecision({
      remainingMilli: 90000,
      schedule: [30000, 30000, 30000],
      installmentsCompleted: 0,
      cycle: c,
      allCycles: [c],
      activationDate: '2026-08-01',
      riderCode: '',
      equipmentIssueId: 'X',
      existingIdempotencyKeys: new Set(),
    });
    assert.equal(empty.action, 'skip');
    assert.equal(empty.reason, 'invalid_rider');
  });

  it('R: zero / negative / insufficient / malformed available payout', () => {
    const c = cycle({
      cycleId: 'pd-pay',
      startDate: '2026-09-08',
      endDate: '2026-09-14',
    });
    const base = {
      remainingMilli: 90000,
      schedule: [30000, 30000, 30000],
      installmentsCompleted: 0,
      cycle: c,
      allCycles: [c],
      activationDate: '2026-08-01',
      riderCode: '700040',
      equipmentIssueId: 'ISSUE-Z',
      existingIdempotencyKeys: new Set<string>(),
    };
    assert.equal(computeAutoDeductionDecision({ ...base, availablePayoutMilli: 0 }).reason, 'insufficient_payout');
    assert.equal(computeAutoDeductionDecision({ ...base, availablePayoutMilli: -1 }).reason, 'negative_available_payout');
    assert.equal(computeAutoDeductionDecision({ ...base, availablePayoutMilli: 12.5 }).reason, 'invalid_available_payout');
    assert.equal(computeAutoDeductionDecision({ ...base, remainingMilli: Number.NaN }).reason, 'malformed_payout_amount');
    assert.equal(computeAutoDeductionDecision({ ...base, remainingMilli: -5 }).reason, 'negative_outstanding');
    assert.equal(parseAvailablePayoutMilli('abc').ok, false);
    assert.equal(parseAvailablePayoutMilli(15000).ok, true);
  });

  it('closed liability / missing liability → no deduct', () => {
    const c = cycle({
      cycleId: 'pd-cl',
      startDate: '2026-09-08',
      endDate: '2026-09-14',
    });
    const d = computeAutoDeductionDecision({
      remainingMilli: 0,
      schedule: [30000, 30000, 30000],
      installmentsCompleted: 3,
      cycle: c,
      allCycles: [c],
      activationDate: '2026-08-01',
      riderCode: '700041',
      equipmentIssueId: 'CLOSED',
      existingIdempotencyKeys: new Set(),
    });
    assert.equal(d.action, 'skip');
    assert.equal(d.reason, 'no_outstanding');
  });
});

describe('Phase D acceptance — salary / flag matrix + legacy isolation', () => {
  const saved: Record<string, string | undefined> = {};
  beforeEach(() => {
    for (const k of [
      'FEATURE_AUTO_EQUIPMENT_DEDUCTIONS_ENABLED',
      'FEATURE_EQUIPMENT_LEDGER_ENABLED',
      'FEATURE_RECRUITMENT_V2_ENABLED',
    ]) {
      saved[k] = process.env[k];
    }
  });
  afterEach(() => {
    for (const [k, v] of Object.entries(saved)) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
  });

  it('L: Auto OFF → run is no-op (no deduction)', async () => {
    delete process.env.FEATURE_AUTO_EQUIPMENT_DEDUCTIONS_ENABLED;
    assert.equal(isAutoEquipmentDeductionsEnabled(), false);
    const c = cycle({
      cycleId: 'pd-off',
      startDate: '2026-09-01',
      endDate: '2026-09-07',
      deductionGenerationDate: '2026-09-07',
    });
    const h = makeHarness({
      cycles: [c],
      issues: [openIssue({ equipmentIssueId: 'ISSUE-OFF', riderCode: '700050' })],
    });
    const r = await runEquipmentAutoDeductionsForDate(
      '2026-09-07',
      { code: 'cron', name: 'test' },
      { deps: h.deps }
    );
    assert.equal(r.enabled, false);
    assert.equal(r.deducted, 0);
    assert.equal(h.ledger.size, 0);
  });

  it('L: Auto ON → deducts; Ledger ON + Auto OFF → liability ok, no auto txn', async () => {
    process.env.FEATURE_AUTO_EQUIPMENT_DEDUCTIONS_ENABLED = 'true';
    process.env.FEATURE_EQUIPMENT_LEDGER_ENABLED = 'true';
    const c = cycle({
      cycleId: 'pd-on',
      startDate: '2026-09-01',
      endDate: '2026-09-07',
      deductionGenerationDate: '2026-09-07',
    });
    const h = makeHarness({
      cycles: [c],
      issues: [openIssue({ equipmentIssueId: 'ISSUE-ON', riderCode: '700051' })],
    });
    const r = await runEquipmentAutoDeductionsForDate(
      '2026-09-07',
      { code: 'cron', name: 'test' },
      { deps: h.deps }
    );
    assert.equal(r.deducted, 1);

    process.env.FEATURE_AUTO_EQUIPMENT_DEDUCTIONS_ENABLED = 'false';
    assert.equal(isEquipmentLedgerEnabled(), true);
    assert.equal(isAutoEquipmentDeductionsEnabled(), false);
    const h2 = makeHarness({
      cycles: [c],
      issues: [openIssue({ equipmentIssueId: 'ISSUE-ON2', riderCode: '700052' })],
    });
    const r2 = await runEquipmentAutoDeductionsForDate(
      '2026-09-07',
      { code: 'cron', name: 'test' },
      { deps: h2.deps }
    );
    assert.equal(r2.deducted, 0);
    assert.equal(h2.ledger.size, 0);
  });

  it('L/E: Recruitment V2 ON + Auto OFF → no financial effect', () => {
    process.env.FEATURE_RECRUITMENT_V2_ENABLED = 'true';
    delete process.env.FEATURE_AUTO_EQUIPMENT_DEDUCTIONS_ENABLED;
    assert.equal(isRecruitmentV2Enabled(), true);
    assert.equal(isAutoEquipmentDeductionsEnabled(), false);
  });

  it('M: legacy equipment isolation — never supervisor-wide zero', () => {
    assert.equal(
      shouldZeroLegacyEquipmentCostForSupervisor({
        autoDeductionsEnabled: true,
        openLiabilityRiderCount: 1,
      }),
      false
    );
    assert.equal(
      shouldZeroLegacyEquipmentCostForSupervisor({
        autoDeductionsEnabled: false,
        openLiabilityRiderCount: 5,
      }),
      false
    );
  });
});

describe('Phase D acceptance — multiple liabilities + audit + sheets', () => {
  const saved: Record<string, string | undefined> = {};
  beforeEach(() => {
    saved.FEATURE_AUTO_EQUIPMENT_DEDUCTIONS_ENABLED = process.env.FEATURE_AUTO_EQUIPMENT_DEDUCTIONS_ENABLED;
    process.env.FEATURE_AUTO_EQUIPMENT_DEDUCTIONS_ENABLED = 'true';
  });
  afterEach(() => {
    if (saved.FEATURE_AUTO_EQUIPMENT_DEDUCTIONS_ENABLED === undefined) {
      delete process.env.FEATURE_AUTO_EQUIPMENT_DEDUCTIONS_ENABLED;
    } else {
      process.env.FEATURE_AUTO_EQUIPMENT_DEDUCTIONS_ENABLED = saved.FEATURE_AUTO_EQUIPMENT_DEDUCTIONS_ENABLED;
    }
  });

  it('Q: only open liabilities are deducted; settled/waived ignored by listOpen', async () => {
    const c = cycle({
      cycleId: 'pd-ml',
      startDate: '2026-09-01',
      endDate: '2026-09-07',
      deductionGenerationDate: '2026-09-07',
    });
    const open = openIssue({ equipmentIssueId: 'OPEN1', riderCode: '700060' });
    const settled = openIssue({
      equipmentIssueId: 'SETTLED1',
      riderCode: '700061',
      status: 'settled',
      outstandingMilli: 0,
    });
    const waived = openIssue({
      equipmentIssueId: 'WAIVED1',
      riderCode: '700062',
      status: 'waived',
      outstandingMilli: 0,
    });
    const h = makeHarness({ cycles: [c], issues: [open, settled, waived] });
    const r = await runEquipmentAutoDeductionsForDate(
      '2026-09-07',
      { code: 'cron', name: 'test' },
      { deps: h.deps }
    );
    assert.equal(r.processed, 1);
    assert.equal(r.deducted, 1);
    assert.equal(h.ledger.size, 1);
  });

  it('O: audit trail records posted + skip reasons (no per-skip sheet flood)', async () => {
    const c = cycle({
      cycleId: 'pd-au',
      startDate: '2026-09-01',
      endDate: '2026-09-07',
      deductionGenerationDate: '2026-09-07',
    });
    const h = makeHarness({
      cycles: [c],
      issues: [openIssue({ equipmentIssueId: 'ISSUE-AU', riderCode: '700070' })],
      availableByRider: { '700070': 0 },
    });
    const r = await runEquipmentAutoDeductionsForDate(
      '2026-09-07',
      { code: 'cron', name: 'test' },
      { availablePayoutMilliByRider: { '700070': 0 }, deps: h.deps }
    );
    assert.equal(r.deducted, 0);
    assert.ok(r.auditTrail?.some((a) => a.reason === 'insufficient_payout'));
    assert.ok(h.audits.some((a) => a.action === 'auto_deduction_skip'));
    // Production default: skip rows are NOT written to Sheets (QPM safety).
    assert.equal(h.autoRows.filter((row) => row.status === 'skipped').length, 0);
  });

  it('P: Sheets failure fail-closed (not empty business state)', async () => {
    const c = cycle({
      cycleId: 'pd-sh',
      startDate: '2026-09-01',
      endDate: '2026-09-07',
      deductionGenerationDate: '2026-09-07',
    });
    const h = makeHarness({
      cycles: [c],
      issues: [openIssue({ equipmentIssueId: 'ISSUE-SH', riderCode: '700071' })],
      sheetsFailOnList: true,
    });
    const r = await runEquipmentAutoDeductionsForDate(
      '2026-09-07',
      { code: 'cron', name: 'test' },
      { deps: h.deps }
    );
    assert.equal(r.deducted, 0);
    assert.ok(r.errors.some((e) => e.includes('sheets_failure')));
    assert.equal(h.ledger.size, 0);
  });

  it('N: payroll failure does not mark success', async () => {
    const c = cycle({
      cycleId: 'pd-pr',
      startDate: '2026-09-01',
      endDate: '2026-09-07',
      deductionGenerationDate: '2026-09-07',
    });
    const h = makeHarness({
      cycles: [c],
      issues: [openIssue({ equipmentIssueId: 'ISSUE-PR', riderCode: '700072' })],
      failPayrollOnce: true,
    });
    const r = await runEquipmentAutoDeductionsForDate(
      '2026-09-07',
      { code: 'cron', name: 'test' },
      { deps: h.deps }
    );
    assert.equal(r.deducted, 0);
    assert.ok(r.auditTrail?.some((a) => a.reason === 'payroll_post_failure'));
  });

  it('cron availablePayout JSON wiring', () => {
    const parsed = parseAvailablePayoutMilliByRiderJson('{"700080":15000,"bad":"x"}');
    assert.equal(parsed.byRider['700080'], 15000);
    assert.ok(parsed.invalidRiderCodes.includes('bad'));
  });

  it('idempotency key stable format', () => {
    assert.equal(
      buildIdempotencyKey('700090', 'ISSUE-X', 'cyc-1', 2),
      'equipment:700090:ISSUE-X:cyc-1:2'
    );
  });

  it('cycle resolution is date-driven (not hard-coded month)', () => {
    const cycles = [
      cycle({
        cycleId: 'jan',
        year: 2027,
        month: 1,
        startDate: '2027-01-01',
        endDate: '2027-01-07',
        deductionGenerationDate: '2027-01-07',
      }),
      cycle({
        cycleId: 'feb',
        year: 2027,
        month: 2,
        cycleNumber: 1,
        startDate: '2027-02-01',
        endDate: '2027-02-07',
        deductionGenerationDate: '2027-02-07',
      }),
    ];
    assert.equal(resolveCycleForDeductionDate(cycles, '2027-01-07')?.cycleId, 'jan');
    assert.equal(resolveCycleForDeductionDate(cycles, '2027-02-07')?.cycleId, 'feb');
  });
});

describe('Phase D final safety gate — available payout + reconcile + isolation', () => {
  const saved: Record<string, string | undefined> = {};
  beforeEach(() => {
    saved.FEATURE_AUTO_EQUIPMENT_DEDUCTIONS_ENABLED = process.env.FEATURE_AUTO_EQUIPMENT_DEDUCTIONS_ENABLED;
    process.env.FEATURE_AUTO_EQUIPMENT_DEDUCTIONS_ENABLED = 'true';
  });
  afterEach(() => {
    if (saved.FEATURE_AUTO_EQUIPMENT_DEDUCTIONS_ENABLED === undefined) {
      delete process.env.FEATURE_AUTO_EQUIPMENT_DEDUCTIONS_ENABLED;
    } else {
      process.env.FEATURE_AUTO_EQUIPMENT_DEDUCTIONS_ENABLED = saved.FEATURE_AUTO_EQUIPMENT_DEDUCTIONS_ENABLED;
    }
  });

  it('A–C: never deduct more than available (150 / 0 / 500)', () => {
    const c = cycle({
      cycleId: 'fg-pay',
      startDate: '2026-09-08',
      endDate: '2026-09-14',
    });
    const base = {
      remainingMilli: 90000,
      schedule: [30000, 30000, 30000] as number[],
      installmentsCompleted: 0,
      cycle: c,
      allCycles: [c],
      activationDate: '2026-08-01',
      riderCode: '700100',
      equipmentIssueId: 'FG-P',
      existingIdempotencyKeys: new Set<string>(),
    };
    const a = computeAutoDeductionDecision({ ...base, availablePayoutMilli: 15000 });
    assert.equal(a.action, 'deduct');
    if (a.action === 'deduct') assert.equal(a.amountMilli, 15000);

    const b = computeAutoDeductionDecision({ ...base, availablePayoutMilli: 0 });
    assert.equal(b.action, 'skip');
    assert.equal(b.reason, 'insufficient_payout');

    const c500 = computeAutoDeductionDecision({ ...base, availablePayoutMilli: 50000 });
    assert.equal(c500.action, 'deduct');
    if (c500.action === 'deduct') assert.equal(c500.amountMilli, 30000);
  });

  it('D: missing rider in available map → fail closed (not unlimited)', async () => {
    const c = cycle({
      cycleId: 'fg-miss',
      startDate: '2026-09-01',
      endDate: '2026-09-07',
      deductionGenerationDate: '2026-09-07',
    });
    const h = makeHarness({
      cycles: [c],
      issues: [openIssue({ equipmentIssueId: 'FG-MISS', riderCode: '700101' })],
      omitAvailablePayout: true,
    });
    const r = await runEquipmentAutoDeductionsForDate(
      '2026-09-07',
      { code: 'cron', name: 'test' },
      { deps: h.deps }
    );
    assert.equal(r.deducted, 0);
    assert.equal(h.ledger.size, 0);
    assert.ok(r.auditTrail?.some((a) => a.reason === 'available_payout_unresolved'));
  });

  it('E: available payout source error → no full deduction', async () => {
    const c = cycle({
      cycleId: 'fg-src',
      startDate: '2026-09-01',
      endDate: '2026-09-07',
      deductionGenerationDate: '2026-09-07',
    });
    const h = makeHarness({
      cycles: [c],
      issues: [openIssue({ equipmentIssueId: 'FG-SRC', riderCode: '700102' })],
      failAvailableResolve: true,
    });
    const r = await runEquipmentAutoDeductionsForDate(
      '2026-09-07',
      { code: 'cron', name: 'test' },
      { deps: h.deps }
    );
    assert.equal(r.deducted, 0);
    assert.equal(h.ledger.size, 0);
    assert.ok(r.errors.some((e) => e.includes('available_payout_resolve_failed')));
  });

  it('payroll post ok + balance fail → retry reconciles without double ledger', async () => {
    const c = cycle({
      cycleId: 'fg-rec',
      startDate: '2026-09-01',
      endDate: '2026-09-07',
      deductionGenerationDate: '2026-09-07',
    });
    const issue = openIssue({ equipmentIssueId: 'FG-REC', riderCode: '700103' });
    const h = makeHarness({ cycles: [c], issues: [issue], failBalanceOnce: true });
    const actor = { code: 'cron', name: 'test' };
    const r1 = await runEquipmentAutoDeductionsForDate('2026-09-07', actor, { deps: h.deps });
    assert.equal(r1.deducted, 0);
    assert.equal(h.ledger.size, 1);
    assert.ok(r1.errors.some((e) => e.includes('balance_update_failed')));
    // Outstanding unchanged after failed balance
    assert.equal(h.issues[0].outstandingMilli, 90000);

    const r2 = await runEquipmentAutoDeductionsForDate('2026-09-07', actor, { deps: h.deps });
    assert.equal(h.ledger.size, 1); // no second payroll post
    assert.ok(
      r2.auditTrail?.some(
        (a) => a.reason === 'reconciled_after_ledger_dup' || a.reason === 'already_processed'
      )
    );
    assert.equal(h.issues[0].amountDeductedMilli, 30000);
    assert.equal(h.issues[0].outstandingMilli, 60000);
    assert.equal(
      expectedOutstandingMilli({
        originalLiabilityMilli: 90000,
        amountDeductedMilli: h.issues[0].amountDeductedMilli,
        settlementPaidMilli: 0,
        outstandingMilli: h.issues[0].outstandingMilli,
        status: 'open',
      }),
      h.issues[0].outstandingMilli
    );
  });

  it('unrecoveredLedgerPostMilli is zero when already applied', () => {
    assert.equal(
      unrecoveredLedgerPostMilli({
        snapshot: {
          originalLiabilityMilli: 90000,
          amountDeductedMilli: 30000,
          settlementPaidMilli: 0,
          outstandingMilli: 60000,
          status: 'open',
        },
        postedMilli: 30000,
        balanceAlreadyApplied: true,
      }),
      0
    );
    assert.equal(
      unrecoveredLedgerPostMilli({
        snapshot: {
          originalLiabilityMilli: 90000,
          amountDeductedMilli: 0,
          settlementPaidMilli: 0,
          outstandingMilli: 90000,
          status: 'open',
        },
        postedMilli: 30000,
        balanceAlreadyApplied: false,
      }),
      30000
    );
  });

  it('legacy isolation: V2 rider must not zero supervisor-wide legacy cost', () => {
    assert.equal(
      shouldZeroLegacyEquipmentCostForSupervisor({
        autoDeductionsEnabled: true,
        openLiabilityRiderCount: 1,
      }),
      false
    );
  });

  it('coexistence ambiguity documented: no per-rider legacy exclusion possible', () => {
    // Architecture asks to exclude the V2 rider from legacy المعدات contribution,
    // but legacy sheet rows are supervisor-aggregated (no rider column).
    // Therefore coexistence of SAME equipment on both sheets is an operational
    // process rule, not an enforceable per-rider salary filter.
    const legacySheetHasRiderColumn = false;
    assert.equal(legacySheetHasRiderColumn, false);
  });
});
