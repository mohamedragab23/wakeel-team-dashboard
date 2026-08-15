import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { createMemoryEvidenceApplyStore } from '@/lib/equipmentDeductions/evidenceApply';
import { runManagerCompareOrchestration } from '@/lib/equipmentDeductions/managerCompareOrchestration';
import { createRequestObligation } from '@/lib/equipmentDeductions/obligations';
import { isSrs014FinancialApplyEnabled } from '@/lib/srs014Flags';

describe('SRS-014 Manager Compare orchestration (safe path)', () => {
  it('without confirm → FILE_PARTIAL; no allocation; zero financial mutation', async () => {
    assert.equal(isSrs014FinancialApplyEnabled(), false);
    const store = createMemoryEvidenceApplyStore();
    const obligations = [
      createRequestObligation({
        deductionId: 'E1',
        source: 'auto_equipment',
        riderCode: 'R1',
        reason: 'معدات',
        originalCycleId: 'C1',
        originalAmount: 30000,
        obligationAgeKey: '1',
        equipmentIssueId: 'ISSUE-A',
        installmentNumber: 1,
      }),
    ];
    const r = await runManagerCompareOrchestration({
      evidenceStore: store,
      cycleScope: { cycleLabel: 'الأولى', monthLabel: 'أغسطس', year: 2026, cycleId: 'C1' },
      adminWalletByRiderEgp: new Map([['R1', 300]]),
      obligations,
      completeCycleConfirmed: false,
      runAllocation: true,
      actor: { code: 'admin', name: 'Admin' },
      decoded: {
        role: 'admin',
        permissions: 'deductions_reconcile,deductions_verify',
      },
    });
    assert.equal(r.compare.fileValidationStatus, 'FILE_PARTIAL');
    assert.equal(r.compare.allocationReady, false);
    assert.equal(r.allocationOutcome, 'not_allocation_ready');
    assert.equal(r.financialSideEffects.walletMutated, false);
    assert.equal(r.financialSideEffects.productionFinancialMutation, false);
  });

  it('confirm + dual-gate → FILE_VALID + allocation applied; still no wallet', async () => {
    const store = createMemoryEvidenceApplyStore();
    const obligations = [
      createRequestObligation({
        deductionId: 'E1',
        source: 'auto_equipment',
        riderCode: 'R1',
        reason: 'معدات',
        originalCycleId: 'C1',
        originalAmount: 30000,
        obligationAgeKey: '1',
        equipmentIssueId: 'ISSUE-A',
        installmentNumber: 1,
      }),
    ];
    const r = await runManagerCompareOrchestration({
      evidenceStore: store,
      cycleScope: { cycleLabel: 'الأولى', monthLabel: 'أغسطس', year: 2026, cycleId: 'C1' },
      adminWalletByRiderEgp: new Map([['R1', 300]]),
      obligations,
      completeCycleConfirmed: true,
      runAllocation: true,
      actor: { code: 'admin', name: 'Admin' },
      decoded: {
        role: 'admin',
        permissions: 'deductions_reconcile,deductions_verify',
      },
    });
    assert.equal(r.compare.fileValidationStatus, 'FILE_VALID');
    assert.ok(r.compare.evidenceIdentityKey);
    assert.equal(r.evidencePersisted, true);
    assert.ok(
      r.allocationOutcome === 'applied' || r.allocationOutcome === 'idempotent_already_applied'
    );
    assert.ok(r.allocatedTotalMilli > 0);
    assert.equal(r.financialSideEffects.walletMutated, false);
    assert.equal(r.financialSideEffects.ledgerNativeWritten, false);
    assert.equal(r.financialSideEffects.productionFinancialMutation, false);
  });

  it('actual > requested → anomaly blocks allocation', async () => {
    const store = createMemoryEvidenceApplyStore();
    const obligations = [
      createRequestObligation({
        deductionId: 'E1',
        source: 'auto_equipment',
        riderCode: 'R1',
        reason: 'معدات',
        originalCycleId: 'C1',
        originalAmount: 10000,
        obligationAgeKey: '1',
        equipmentIssueId: 'ISSUE-A',
        installmentNumber: 1,
      }),
    ];
    const r = await runManagerCompareOrchestration({
      evidenceStore: store,
      cycleScope: { cycleLabel: 'الأولى', monthLabel: 'أغسطس', year: 2026 },
      adminWalletByRiderEgp: new Map([['R1', 500]]),
      obligations,
      completeCycleConfirmed: true,
      runAllocation: true,
      actor: { code: 'admin', name: 'Admin' },
      decoded: {
        role: 'admin',
        permissions: 'deductions_reconcile,deductions_verify',
      },
    });
    assert.ok(r.anomalyActualExceedsRequested.length >= 1);
    assert.equal(r.allocationOutcome, 'blocked_actual_exceeds_requested_anomaly');
    assert.equal(r.financialSideEffects.productionFinancialMutation, false);
  });
});
