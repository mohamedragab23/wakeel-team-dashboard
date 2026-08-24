import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  analyzeManualV2ForCycle,
} from '@/lib/equipmentDeductions/manualV2CycleAnalysis';
import {
  buildFreshDeclarationQueue,
  buildMissingLiabilityQueue,
  buildSheetVsLedgerQueue,
  isGenuineSheetVsLedgerDisagree,
} from '@/lib/equipmentDeductions/exceptionQueues';
import {
  classifyOperationalBucket,
  buildEquipmentDryRunPreview,
} from '@/lib/equipmentDeductions/operationalEngine';
import { computeCycleRequestBreakdown } from '@/lib/equipmentDeductions/equipmentFinancialModel';
import { DEDUCTION_IMPORT_HEADERS, DEDUCTIONS_ACTUAL_HEADERS } from '@/lib/equipmentSheetConstants';
import { isSrs014FinancialApplyEnabled } from '@/lib/srs014Flags';
import type { EquipmentLiabilityIssue } from '@/lib/equipmentLiability/store';
import type { PayoutCycle } from '@/lib/payoutCycles/types';

function reqHeaderRow(): unknown[] {
  return [...DEDUCTION_IMPORT_HEADERS];
}

function actHeaderRow(): unknown[] {
  return [...DEDUCTIONS_ACTUAL_HEADERS];
}

function reqRow(partial: Record<string, unknown>): unknown[] {
  const row = DEDUCTION_IMPORT_HEADERS.map(() => '');
  for (const [k, v] of Object.entries(partial)) {
    const i = DEDUCTION_IMPORT_HEADERS.indexOf(k as (typeof DEDUCTION_IMPORT_HEADERS)[number]);
    if (i >= 0) row[i] = v as string;
  }
  return row;
}

function actRow(partial: Record<string, unknown>): unknown[] {
  const row = DEDUCTIONS_ACTUAL_HEADERS.map(() => '');
  for (const [k, v] of Object.entries(partial)) {
    const i = DEDUCTIONS_ACTUAL_HEADERS.indexOf(k as (typeof DEDUCTIONS_ACTUAL_HEADERS)[number]);
    if (i >= 0) row[i] = v as string;
  }
  return row;
}

function issue(p: Partial<EquipmentLiabilityIssue> & Pick<EquipmentLiabilityIssue, 'equipmentIssueId' | 'riderCode'>): EquipmentLiabilityIssue {
  return {
    riderNameSnapshot: 'R',
    zoneSnapshot: 'Z',
    supervisorCodeSnapshot: 'WA-001',
    supervisorNameSnapshot: 'S',
    issueDate: '2026-08-01',
    activationDate: '2026-08-01',
    bagType: 'motorcycle',
    bagCostMilli: 53000,
    shirtQty: 2,
    shirtCostMilli: 27000,
    securityFeeMilli: 10000,
    securityPaidUpfront: false,
    originalLiabilityMilli: 90000,
    outstandingMilli: 90000,
    amountDeductedMilli: 0,
    settlementPaidMilli: 0,
    installmentsCompleted: 0,
    status: 'open',
    deliveryRowRef: '',
    jacketHeld: false,
    helmetHeld: false,
    createdAt: '',
    createdBy: '',
    updatedAt: '',
    updatedBy: '',
    installmentSchedule: [30000, 30000, 30000],
    ...p,
  };
}

function cycle(partial: Partial<PayoutCycle> & Pick<PayoutCycle, 'cycleId'>): PayoutCycle {
  return {
    year: 2026,
    month: 8,
    cycleNumber: 2,
    startDate: '2026-08-10',
    endDate: '2026-08-16',
    payoutDate: '2026-08-16',
    deductionGenerationDate: '2026-08-10',
    isClosing: false,
    equipmentDeductionEnabled: true,
    status: 'active',
    notes: '',
    createdBy: '',
    createdAt: '',
    updatedBy: '',
    updatedAt: '',
    ...partial,
  };
}

describe('correction gate — Manual V2 current-cycle filter', () => {
  it('includes only target-cycle manual_v2; excludes old cycle and wrong source', () => {
    const rows = [
      reqHeaderRow(),
      reqRow({
        كود_المندوب: '1001',
        اسم_المندوب: 'A',
        كود_المشرف: 'WA-001',
        قيمة_الاستقطاع: '200',
        السبب: 'سلفة',
        دورة_الاستقطاع: 'الثانية',
        شهر: 'أغسطس',
        سنة: '2026',
        source: 'manual_v2',
        deductionId: 'man_1',
        currentCycleId: 'C2',
        status: 'open',
      }),
      reqRow({
        كود_المندوب: '1001',
        قيمة_الاستقطاع: '500',
        السبب: 'سلفة',
        دورة_الاستقطاع: 'الأولى',
        شهر: 'أغسطس',
        سنة: '2026',
        source: 'manual_v2',
        deductionId: 'man_old',
        currentCycleId: 'C1',
        status: 'open',
      }),
      reqRow({
        كود_المندوب: '1002',
        قيمة_الاستقطاع: '300',
        السبب: 'معدات',
        دورة_الاستقطاع: 'الثانية',
        شهر: 'أغسطس',
        سنة: '2026',
        source: 'auto_equipment',
        deductionId: 'eq_1',
        currentCycleId: 'C2',
        status: 'open',
      }),
      reqRow({
        كود_المندوب: '1003',
        قيمة_الاستقطاع: '100',
        السبب: 'سلفة',
        دورة_الاستقطاع: 'الثانية',
        شهر: 'أغسطس',
        سنة: '2026',
        source: 'manual_v2',
        deductionId: 'man_1',
        currentCycleId: 'C2',
        status: 'open',
      }),
      reqRow({
        كود_المندوب: '1004',
        قيمة_الاستقطاع: '50',
        السبب: 'غرامة',
        دورة_الاستقطاع: 'الثانية',
        شهر: 'أغسطس',
        سنة: '',
        source: 'manual_v2',
        deductionId: 'man_noyear',
        status: 'open',
      }),
      reqRow({
        كود_المندوب: '1005',
        قيمة_الاستقطاع: '75',
        السبب: 'سلفة',
        دورة_الاستقطاع: 'الثانية',
        شهر: 'أغسطس',
        سنة: '2026',
        source: 'manual_v2',
        deductionId: 'man_cancelled',
        currentCycleId: 'C2',
        status: 'cancelled',
      }),
    ];

    const analysis = analyzeManualV2ForCycle({
      requestRows: rows,
      cycleId: 'C2',
      cycleLabel: 'الثانية',
      monthLabel: 'أغسطس',
      year: 2026,
    });

    assert.equal(analysis.stats.includedCount, 1);
    assert.equal(analysis.manualV2TotalEgp, 200);
    assert.equal(analysis.manualV2ByReason['سلفة']?.rows, 1);
    assert.ok(analysis.manualV2ExcludedRows.some((r) => r.exclusionReason === 'currentCycleId_mismatch' || r.exclusionReason === 'wrong_cycle_scope' || r.exclusionReason.includes('cycle')));
    assert.ok(analysis.manualV2ExcludedRows.some((r) => r.exclusionReason === 'duplicate_deductionId'));
    assert.ok(analysis.manualV2ExcludedRows.some((r) => r.exclusionReason === 'year_missing_required' || r.exclusionReason === 'wrong_cycle_scope'));
    assert.ok(analysis.manualV2ExcludedRows.some((r) => r.exclusionReason === 'status_cancelled'));
  });
});

describe('correction gate — exceptions calibrated', () => {
  it('genuine disagree: sheet payroll not in amountDeducted while outstanding > 0', () => {
    assert.equal(
      isGenuineSheetVsLedgerDisagree({
        outstandingMilli: 40000,
        amountDeductedMilli: 0,
        settlementPaidMilli: 50000,
        sheetActualMilli: 30000,
      }),
      true
    );
  });

  it('normal history does NOT falsely flag when sheet already applied', () => {
    assert.equal(
      isGenuineSheetVsLedgerDisagree({
        outstandingMilli: 30000,
        amountDeductedMilli: 30000,
        settlementPaidMilli: 0,
        sheetActualMilli: 30000,
      }),
      false
    );
  });

  it('outstanding 0 does NOT flag disagreement', () => {
    assert.equal(
      isGenuineSheetVsLedgerDisagree({
        outstandingMilli: 0,
        amountDeductedMilli: 0,
        settlementPaidMilli: 30000,
        sheetActualMilli: 30000,
      }),
      false
    );
  });

  it('sheet with no settlement and no deducted is NOT booking-path disagreement', () => {
    assert.equal(
      isGenuineSheetVsLedgerDisagree({
        outstandingMilli: 60000,
        amountDeductedMilli: 0,
        settlementPaidMilli: 0,
        sheetActualMilli: 30000,
      }),
      false
    );
  });

  it('buildSheetVsLedgerQueue returns only genuine cases', () => {
    const liabilities = [
      issue({
        equipmentIssueId: 'E1',
        riderCode: '4802518',
        outstandingMilli: 20000,
        amountDeductedMilli: 0,
        settlementPaidMilli: 70000,
      }),
      issue({
        equipmentIssueId: 'E2',
        riderCode: '9999001',
        outstandingMilli: 0,
        amountDeductedMilli: 0,
        settlementPaidMilli: 90000,
      }),
      issue({
        equipmentIssueId: 'E3',
        riderCode: '9999002',
        outstandingMilli: 30000,
        amountDeductedMilli: 30000,
        settlementPaidMilli: 0,
        originalLiabilityMilli: 60000,
      }),
    ];
    const actualRows = [
      actHeaderRow(),
      actRow({
        كود_المندوب: '4802518',
        دورة_الاستقطاع: 'الأولى',
        شهر: 'أغسطس',
        سنة: '2026',
        خصم_المحفظة_شيت_المدير: '-400',
      }),
      actRow({
        كود_المندوب: '4802518',
        دورة_الاستقطاع: 'الثانية',
        شهر: 'أغسطس',
        سنة: '2026',
        خصم_المحفظة_شيت_المدير: '-300',
      }),
      actRow({
        كود_المندوب: '9999001',
        دورة_الاستقطاع: 'الأولى',
        شهر: 'أغسطس',
        سنة: '2026',
        خصم_المحفظة_شيت_المدير: '-300',
      }),
      actRow({
        كود_المندوب: '9999002',
        دورة_الاستقطاع: 'الأولى',
        شهر: 'أغسطس',
        سنة: '2026',
        خصم_المحفظة_شيت_المدير: '-300',
      }),
    ];
    const q = buildSheetVsLedgerQueue({
      liabilities,
      requestRows: [reqHeaderRow()],
      actualRows,
      evidenceCycles: [
        { cycleLabel: 'الأولى', monthLabel: 'أغسطس', year: 2026 },
        { cycleLabel: 'الثانية', monthLabel: 'أغسطس', year: 2026 },
      ],
    });
    assert.equal(q.length, 1);
    assert.equal(q[0].riderCode, '4802518');
    assert.equal(q[0].exceptionType, 'SHEET_VS_LEDGER_DISAGREE');
  });

  it('missing-liability rider with activity appears in Yellow queue', () => {
    const missing = buildMissingLiabilityQueue({
      roster: [{ riderCode: '1393931', riderName: 'Ghost', supervisorCode: 'WA-009' }],
      liabilities: [],
      requestRows: [
        reqHeaderRow(),
        reqRow({
          كود_المندوب: '1393931',
          قيمة_الاستقطاع: '200',
          دورة_الاستقطاع: 'الأولى',
          شهر: 'أغسطس',
          سنة: '2026',
          المصدر: '',
        }),
      ],
      actualRows: [
        actHeaderRow(),
        actRow({
          كود_المندوب: '1393931',
          دورة_الاستقطاع: 'الأولى',
          شهر: 'أغسطس',
          سنة: '2026',
          خصم_المحفظة_شيت_المدير: '-200',
        }),
      ],
      evidenceCycles: [{ cycleLabel: 'الأولى', monthLabel: 'أغسطس', year: 2026 }],
    });
    assert.equal(missing.length, 1);
    assert.equal(missing[0].supervisorCode, 'WA-009');
    assert.equal(missing[0].exceptionType, 'MISSING_LIABILITY_NEEDS_SUPERVISOR_REVIEW');
  });
});

describe('correction gate — declaration queue + buckets', () => {
  it('full roster declaration queue includes riders without liability', () => {
    const q = buildFreshDeclarationQueue({
      roster: [
        { riderCode: '1', riderName: 'A', supervisorCode: 'WA-001' },
        { riderCode: '2', riderName: 'B', supervisorCode: 'WA-001' },
      ],
      liabilities: [issue({ equipmentIssueId: 'E1', riderCode: '1', outstandingMilli: 30000 })],
      requestRows: [reqHeaderRow()],
      actualRows: [actHeaderRow()],
      evidenceCycles: [{ cycleLabel: 'الأولى', monthLabel: 'أغسطس', year: 2026 }],
    });
    assert.equal(q.length, 2);
    assert.equal(q.find((r) => r.riderCode === '2')?.hasLiability, false);
    assert.equal(q.every((r) => r.needsFreshDeclaration), true);
  });

  it('GREEN excluded / YELLOW blocked / RED included', () => {
    const green = classifyOperationalBucket({
      hasLiability: true,
      declaration: null,
      declarationIsAuthoritative: false,
      systemOutstandingMilli: 0,
      remainingAfterDeclarationMilli: 0,
      sheetVsLedgerDisagree: false,
      ledgerInvariantOk: true,
      duplicateRider: false,
      invalidCycle: false,
    });
    assert.equal(green.bucket, 'GREEN');

    const yellow = classifyOperationalBucket({
      hasLiability: true,
      declaration: null,
      declarationIsAuthoritative: false,
      systemOutstandingMilli: 50000,
      remainingAfterDeclarationMilli: 50000,
      sheetVsLedgerDisagree: false,
      ledgerInvariantOk: true,
      duplicateRider: false,
      invalidCycle: false,
    });
    assert.equal(yellow.bucket, 'YELLOW');

    const red = classifyOperationalBucket({
      hasLiability: true,
      declaration: {
        declarationId: 'd',
        riderCode: '1',
        riderName: '',
        supervisorCode: '',
        supervisorName: '',
        cycleId: 'C2',
        cycleLabel: '',
        monthLabel: '',
        year: 2026,
        paymentStatus: 'NOT_PAID',
        declaredPaidMilli: 0,
        originalLiabilityMilli: 90000,
        notes: 'FINAL_AUTHORITATIVE',
        createdAt: '',
        supersedesDeclarationId: '',
      },
      declarationIsAuthoritative: true,
      systemOutstandingMilli: 50000,
      remainingAfterDeclarationMilli: 50000,
      sheetVsLedgerDisagree: false,
      ledgerInvariantOk: true,
      duplicateRider: false,
      invalidCycle: false,
    });
    assert.equal(red.bucket, 'RED');
  });

  it('full 67 booking-path set is YELLOW until fresh final declaration', () => {
    const y = classifyOperationalBucket({
      hasLiability: true,
      declaration: null,
      declarationIsAuthoritative: false,
      systemOutstandingMilli: 20000,
      remainingAfterDeclarationMilli: 20000,
      sheetVsLedgerDisagree: true,
      ledgerInvariantOk: true,
      duplicateRider: false,
      invalidCycle: false,
    });
    assert.equal(y.bucket, 'YELLOW');
    assert.equal(y.exceptionCode, 'SHEET_VS_LEDGER_DISAGREE');
  });

  it('carry 100 + base 300 = 400', () => {
    const b = computeCycleRequestBreakdown({
      remainingLiabilityMilli: 30000,
      carryForwardShortfallMilli: 10000,
    });
    assert.equal(b.baseInstallmentMilli, 30000);
    assert.equal(b.totalRequestMilli, 40000);
  });

  it('dry-run: missing liability activity rider is YELLOW; FA off', () => {
    assert.equal(isSrs014FinancialApplyEnabled(), false);
    const preview = buildEquipmentDryRunPreview({
      targetCycle: cycle({ cycleId: 'C2', cycleNumber: 2 }),
      priorCycles: [cycle({ cycleId: 'C1', cycleNumber: 1, startDate: '2026-08-01', endDate: '2026-08-09', status: 'finalized' })],
      liabilities: [],
      declarations: [],
      roster: [{ riderCode: '1393931', riderName: 'G', supervisorCode: 'WA-009' }],
      requestRows: [
        reqHeaderRow(),
        reqRow({
          كود_المندوب: '1393931',
          قيمة_الاستقطاع: '200',
          دورة_الاستقطاع: 'الأولى',
          شهر: 'أغسطس',
          سنة: '2026',
        }),
      ],
      actualRows: [actHeaderRow()],
      evidenceCycles: [
        { cycleLabel: 'الأولى', monthLabel: 'أغسطس', year: 2026 },
        { cycleLabel: 'الثانية', monthLabel: 'أغسطس', year: 2026 },
      ],
    });
    assert.ok(preview.summary.yellowCount >= 1);
    assert.ok(
      preview.lines.some(
        (l) =>
          l.riderCode === '1393931' &&
          l.operationalBucket === 'YELLOW' &&
          l.exceptionCode === 'MISSING_LIABILITY_NEEDS_SUPERVISOR_REVIEW'
      )
    );
    assert.equal(preview.summary.totalEquipmentRequestMilli, 0);
  });
});
