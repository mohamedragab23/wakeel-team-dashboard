/**
 * Manual Deductions V2 — pure mapping + REQUEST contract (no Sheets / FA).
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  isManualV2CycleKey,
  isManualV2UiReason,
  mapManualV2ReasonToLedger,
  resolveManualV2CycleId,
} from '@/lib/equipmentDeductions/manualV2Request';
import {
  createMemoryObligationLedgerStore,
  emitRequestObligation,
  findPersistedByDeductionId,
} from '@/lib/equipmentDeductions/requestPersistence';
import { isManualDeductionsV2Enabled, isSrs014FinancialApplyEnabled } from '@/lib/srs014Flags';
import { egpToMilliemes } from '@/lib/money';

describe('Manual V2 — reason / cycle mapping', () => {
  it('maps frozen vocabulary and never silently maps أخرى to معدات', () => {
    assert.deepEqual(mapManualV2ReasonToLedger('سلفة', ''), {
      ok: true,
      reason: 'سلفة',
      reasonOther: '',
    });
    assert.deepEqual(mapManualV2ReasonToLedger('خصم تشغيلي', ''), {
      ok: true,
      reason: 'خصم تشغيل',
      reasonOther: '',
    });
    assert.deepEqual(mapManualV2ReasonToLedger('مديونية سابقة', ''), {
      ok: true,
      reason: 'مديونية سابقة',
      reasonOther: '',
    });
    const otherFail = mapManualV2ReasonToLedger('أخرى', '  ');
    assert.equal(otherFail.ok, false);
    const otherOk = mapManualV2ReasonToLedger('أخرى', 'غرامة تأخير');
    assert.equal(otherOk.ok, true);
    if (otherOk.ok) {
      assert.match(otherOk.reason, /^أخرى:/);
      assert.ok(!otherOk.reason.includes('معدات'));
      assert.equal(otherOk.reasonOther, 'غرامة تأخير');
    }
  });

  it('accepts UI reasons and cycle keys only', () => {
    assert.equal(isManualV2UiReason('سلفة'), true);
    assert.equal(isManualV2UiReason('خصم تشغيل'), false);
    assert.equal(isManualV2UiReason('معدات'), false);
    assert.equal(isManualV2CycleKey('first'), true);
    assert.equal(isManualV2CycleKey('fourth'), false);
  });

  it('resolves synthetic cycle id from month/year/key', () => {
    assert.equal(
      resolveManualV2CycleId({ year: 2026, month: 8, cycleKey: 'second' }),
      'manual:2026-08:c2'
    );
    assert.equal(
      resolveManualV2CycleId({
        year: 2026,
        month: 8,
        cycleKey: 'first',
        payoutCycleId: 'pc_abc',
      }),
      'pc_abc'
    );
  });
});

describe('Manual V2 — REQUEST emit contract (memory ledger)', () => {
  it('writes source=manual_v2 with paidAmount=0 and no FA side effects', async () => {
    const store = createMemoryObligationLedgerStore();
    const amountMilli = egpToMilliemes(150);
    const mapped = mapManualV2ReasonToLedger('سلفة', '');
    assert.equal(mapped.ok, true);
    if (!mapped.ok) return;

    const result = await emitRequestObligation(store, {
      deductionId: 'man_v2_test_1',
      source: 'manual_v2',
      riderCode: 'R100',
      reason: mapped.reason as 'سلفة',
      originalCycleId: 'manual:2026-08:c1',
      currentCycleId: 'manual:2026-08:c1',
      originalAmount: amountMilli,
      obligationAgeKey: '2026-08-15T00:00:00.000Z',
      uploadedAt: '2026-08-15T00:00:00.000Z',
      zone: 'Nasr city',
      cycleLabel: 'الأولى',
      monthLabel: 'أغسطس',
      year: 2026,
    });

    assert.equal(result.outcome, 'created');
    assert.equal(result.obligation.source, 'manual_v2');
    assert.equal(result.obligation.paidAmount, 0);
    assert.equal(result.obligation.remainingAmount, amountMilli);
    assert.equal(result.financialSideEffects.walletMutated, false);
    assert.equal(result.financialSideEffects.ledgerNativeWritten, false);
    assert.equal(result.financialSideEffects.paidAmountIncremented, false);

    const found = await findPersistedByDeductionId(store, 'man_v2_test_1');
    assert.ok(found);
    assert.equal(found!.obligation.source, 'manual_v2');
    assert.equal(found!.obligation.reason, 'سلفة');
  });

  it('أخرى free-text is stored explicitly and is never معدات', async () => {
    const store = createMemoryObligationLedgerStore();
    const mapped = mapManualV2ReasonToLedger('أخرى', 'تعويض تلف');
    assert.equal(mapped.ok, true);
    if (!mapped.ok) return;

    const result = await emitRequestObligation(store, {
      deductionId: 'man_v2_other_1',
      source: 'manual_v2',
      riderCode: 'R200',
      reason: mapped.reason as 'خصم تشغيل',
      originalCycleId: 'manual:2026-08:c3',
      originalAmount: 10000,
      obligationAgeKey: '2026-08-15T01:00:00.000Z',
    });
    assert.equal(result.obligation.reason, 'أخرى: تعويض تلف');
    assert.notEqual(result.obligation.reason, 'معدات');
    assert.equal(result.obligation.equipmentIssueId, undefined);
  });
});

describe('Manual V2 — safety / nav source contracts', () => {
  it('flags default OFF (FA and Manual V2)', () => {
    delete process.env.FEATURE_MANUAL_DEDUCTIONS_V2_ENABLED;
    delete process.env.FEATURE_SRS014_FINANCIAL_APPLY_ENABLED;
    assert.equal(isManualDeductionsV2Enabled(), false);
    assert.equal(isSrs014FinancialApplyEnabled(), false);
  });

  it('API route no longer posts ledger_native on create', () => {
    const route = readFileSync(
      join(process.cwd(), 'app/api/supervisor/manual-deductions/route.ts'),
      'utf8'
    );
    assert.ok(route.includes('emitManualV2RequestObligation'));
    assert.ok(route.includes('manual_deduction_v2_request'));
    assert.ok(!route.includes('appendLedgerTransaction'));
    assert.ok(!route.includes("source: 'ledger_native'"));
  });

  it('supervisor Layout hides Excel deductions-upload and keeps manual + equipment status', () => {
    const layout = readFileSync(join(process.cwd(), 'components/Layout.tsx'), 'utf8');
    const supervisorBlock = layout.slice(
      layout.indexOf('// Supervisor menu'),
      layout.indexOf('const menuItems')
    );
    assert.ok(supervisorBlock.includes('/manual-deductions'));
    assert.ok(supervisorBlock.includes('/supervisor/equipment-status'));
    assert.ok(!supervisorBlock.includes('/deductions-upload'));
  });
});
