import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  buildCanonicalControlledTestPack,
  formatControlledTestPackReport,
} from '@/lib/equipmentDeductions/controlledTestPack';
import { proposePayoutCyclesForMonth } from '@/lib/payoutCycles/monthProposal';
import { isSrs014FinancialApplyEnabled } from '@/lib/srs014Flags';

describe('4D.5.4.4 controlled one-rider read-only test pack', () => {
  it('August 2026 proposal matches business cycle windows', () => {
    const p = proposePayoutCyclesForMonth(2026, 8);
    assert.equal(p[0]?.startDate, '2026-08-01');
    assert.equal(p[0]?.endDate, '2026-08-09');
    assert.equal(p[1]?.startDate, '2026-08-10');
    assert.equal(p[1]?.endDate, '2026-08-16');
    assert.equal(p[2]?.startDate, '2026-08-17');
    assert.equal(p[2]?.endDate, '2026-08-23');
    assert.equal(p[3]?.startDate, '2026-08-24');
    assert.equal(p[3]?.endDate, '2026-08-31');
    assert.equal(p[3]?.isClosing, true);
  });

  it('MATCH = PASS when Actual equals Expected installment', () => {
    assert.equal(isSrs014FinancialApplyEnabled(), false);
    const report = buildCanonicalControlledTestPack();
    assert.equal(report.match.result, 'PASS');
    assert.equal(report.payroll.expectedDeductionMilli, 26667);
    assert.equal(report.payroll.actualDeductionMilli, 26667);
    assert.equal(report.payroll.allocatedMilli, 26667);
    assert.equal(report.liability.originalMilli, 80000);
    assert.equal(report.eligibility.firstEligibleCycleId, '2026-08-C2');
    assert.equal(report.cycle.cycleId, '2026-08-C2');
    assert.equal(report.cycle.isClosing, false);
    assert.equal(report.financialApplyEnabled, false);
    assert.equal(report.financialMutation, false);
    assert.equal(report.firstTransactionExecuted, false);
    assert.equal(report.safety.updateBalanceCalled, false);
    assert.equal(report.safety.financialApplyCalled, false);
    assert.ok(report.allocation.economicKey.includes(report.allocation.deductionId));
    assert.ok(report.evidence.evidenceIdentityKey.includes('FILE_VALID'));
  });

  it('MATCH = FAIL when Actual diverges (still zero mutations)', () => {
    const report = buildCanonicalControlledTestPack({ actualDeductionMilli: 10000 });
    assert.equal(report.match.result, 'FAIL');
    assert.equal(report.payroll.expectedDeductionMilli, 26667);
    assert.equal(report.payroll.actualDeductionMilli, 10000);
    assert.equal(report.payroll.allocatedMilli, 10000);
    assert.equal(report.financialMutation, false);
    assert.ok(report.match.reasonIfFail.includes('expected'));
  });

  it('module source never enables financial apply or wallet mutation', () => {
    const src = readFileSync(
      join(process.cwd(), 'lib/equipmentDeductions/controlledTestPack.ts'),
      'utf8'
    );
    assert.ok(!/updateBalance\s*\(/.test(src));
    assert.ok(!/FEATURE_SRS014_FINANCIAL_APPLY_ENABLED\s*=\s*['"]true['"]/.test(src));
    assert.ok(!/appendLedger|ledger_native/.test(src));
    assert.ok(/READ_ONLY_PREPARATION/.test(src));
  });

  it('formatted report includes MATCH line', () => {
    const text = formatControlledTestPackReport(buildCanonicalControlledTestPack());
    assert.ok(text.includes('MATCH = PASS'));
    assert.ok(text.includes('Expected=26667'));
  });
});
