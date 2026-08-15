/**
 * Master safety: Financial Apply flag OFF ⇒ zero production mutations.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { isSrs014FinancialApplyEnabled } from '@/lib/srs014Flags';
import { runProductionFinancialApplyLine } from '@/lib/equipmentDeductions/financialApplyProduction';
import { createMemoryEvidenceApplyStore } from '@/lib/equipmentDeductions/evidenceApply';
import { createMemoryFinancialApplyIntentStore } from '@/lib/equipmentDeductions/financialApply';
import { createRequestObligation } from '@/lib/equipmentDeductions/obligations';
import {
  acquireFinancialApplyLock,
  createMemoryFailClosedLockRedis,
} from '@/lib/equipmentDeductions/financialApplyLock';

describe('SRS-014 Financial Apply safety (flag OFF)', () => {
  it('FEATURE_SRS014_FINANCIAL_APPLY_ENABLED is OFF by default', () => {
    assert.equal(isSrs014FinancialApplyEnabled(), false);
  });

  it('production entry with default flag → zero wallet/ledger/obligation/intent mutation', async () => {
    const evidenceStore = createMemoryEvidenceApplyStore();
    const intentStore = createMemoryFinancialApplyIntentStore();
    const redis = createMemoryFailClosedLockRedis({ configured: true });
    let wallet = 0;
    let ledger = 0;
    let save = 0;
    const obligation = createRequestObligation({
      deductionId: 'E-SAFE',
      source: 'auto_equipment',
      riderCode: 'R1',
      reason: 'معدات',
      originalCycleId: 'C1',
      originalAmount: 30000,
      obligationAgeKey: '1',
      equipmentIssueId: 'ISSUE-A',
      installmentNumber: 1,
    });

    const r = await runProductionFinancialApplyLine({
      evidenceIdentityKey: 'ek',
      reconcileBatchId: 'rb',
      deductionId: 'E-SAFE',
      dualGateSatisfied: true,
      actor: { code: 'a', name: 'a' },
      period: '2026-08',
      cycleId: 'C1',
      ports: {
        intentStore,
        evidenceStore,
        dualGateSatisfied: true,
        managerConfirmed: true,
        actor: { code: 'a', name: 'a' },
        period: '2026-08',
        cycleId: 'C1',
        acquireLock: (k) => acquireFinancialApplyLock(k, redis),
        getObligation: async () => ({ ...obligation }),
        saveObligation: async () => {
          save += 1;
        },
        getLiability: async () => null,
        updateLiabilityBalance: async () => {
          wallet += 1;
          return { ok: false, error: 'should_not_run' };
        },
        getLedgerByIdempotencyKey: async () => null,
        appendLedgerNative: async () => {
          ledger += 1;
          return { transactionId: 'x', idempotencyKey: 'x' };
        },
      },
      // Use real flag function (default OFF) — do not force ON.
    });

    assert.equal(r.outcome, 'rejected');
    assert.equal(r.reason, 'financial_apply_flag_off');
    assert.equal(r.financialSideEffects.productionFinancialMutation, false);
    assert.equal(wallet, 0);
    assert.equal(ledger, 0);
    assert.equal(save, 0);
    assert.equal(intentStore.intents.length, 0);
  });
});
