/**
 * 4D.5.4.15 — Controlled Opening Balance pilot orchestration.
 * Persists Opening Liability only (FLOW A). No FA / Auto REQUEST / wallet / ledger money.
 */

import { appendAuditLog } from '@/lib/auditLog';
import {
  createOpeningLiability,
  openingMigrationKey,
  type CreateOpeningLiabilityDeps,
  type OpeningCatalogPricesMilli,
  type OpeningReconciliationInput,
} from '@/lib/equipmentLiability/openingBalance';
import {
  assertOpeningPilotPersistAllowed,
  isRiderOnOpeningPilotAllowlist,
  isSrs014OpeningBalanceWriteEnabled,
  OPENING_PILOT_BLOCKED_DIAGNOSTIC_RIDER,
  parseOpeningPilotAllowlist,
} from '@/lib/equipmentLiability/openingPilotAllowlist';
import { acquirePhaseCLiabilityLocks } from '@/lib/equipmentLiability/phaseCLock';
import type { EquipmentLiabilityIssue } from '@/lib/equipmentLiability/store';
import { buildExpectedDeductionSnapshot } from '@/lib/equipmentDeductions/expectedSnapshot';
import type { PayoutCycle } from '@/lib/payoutCycles/types';
import {
  isAutoEquipmentDeductionsEnabled,
  isSrs014FinancialApplyEnabled,
} from '@/lib/srs014Flags';

export {
  assertOpeningPilotPersistAllowed,
  assertConfirmOpeningProductionWrite,
  isRiderOnOpeningPilotAllowlist,
  isSrs014OpeningBalanceWriteEnabled,
  OPENING_PILOT_BLOCKED_DIAGNOSTIC_RIDER,
  parseOpeningPilotAllowlist,
} from '@/lib/equipmentLiability/openingPilotAllowlist';

export type OpeningVerificationResult = {
  ok: boolean;
  checks: {
    riderCode: boolean;
    openingKey: boolean;
    originalLiabilityMilli: boolean;
    settlementPaidMilli: boolean;
    amountDeductedMilli: boolean;
    outstandingMilli: boolean;
    pricingSource: boolean;
    snapshotPrices: boolean;
    securityStatus: boolean;
    status: boolean;
    noDuplicateKey: boolean;
    equation: boolean;
  };
  failures: string[];
  equation: {
    original: number;
    settlementPaid: number;
    amountDeducted: number;
    outstanding: number;
    expectedOutstanding: number;
  };
};

/**
 * READ-ONLY verification after Opening persist / idempotent return.
 * outstanding = original − settlementPaid − amountDeducted
 * At opening create: amountDeductedMilli MUST be 0.
 */
export function verifyOpeningLiabilityReadOnly(
  issue: EquipmentLiabilityIssue,
  opts?: { expectedRiderCode?: string; allowNonZeroAmountDeducted?: boolean }
): OpeningVerificationResult {
  const failures: string[] = [];
  const expectedKey = openingMigrationKey(issue.riderCode);
  const expectedOutstanding =
    Math.trunc(issue.originalLiabilityMilli) -
    Math.trunc(issue.settlementPaidMilli ?? 0) -
    Math.trunc(issue.amountDeductedMilli ?? 0);

  const checks = {
    riderCode: Boolean(
      !opts?.expectedRiderCode ||
        String(issue.riderCode) === String(opts.expectedRiderCode)
    ),
    openingKey: String(issue.deliveryRowRef || '') === expectedKey,
    originalLiabilityMilli: Number.isFinite(issue.originalLiabilityMilli),
    settlementPaidMilli: Number.isFinite(issue.settlementPaidMilli ?? 0),
    amountDeductedMilli:
      opts?.allowNonZeroAmountDeducted === true
        ? Number.isFinite(issue.amountDeductedMilli)
        : Math.trunc(issue.amountDeductedMilli ?? 0) === 0,
    outstandingMilli: Number.isFinite(issue.outstandingMilli),
    pricingSource: issue.pricingSource === 'OPENING_MIGRATION',
    snapshotPrices:
      typeof issue.snapMotorcycleBagMilli === 'number' &&
      typeof issue.snapBicycleBagMilli === 'number' &&
      typeof issue.snapShirtUnitMilli === 'number',
    securityStatus:
      issue.securityPaidUpfront === true || issue.securityPaidUpfront === false,
    status: issue.status === 'open' || issue.status === 'settled',
    noDuplicateKey: String(issue.deliveryRowRef || '').startsWith('OPENING:'),
    equation: Math.trunc(issue.outstandingMilli) === expectedOutstanding,
  };

  if (!checks.riderCode) failures.push('riderCode');
  if (!checks.openingKey) failures.push('openingKey');
  if (!checks.originalLiabilityMilli) failures.push('originalLiabilityMilli');
  if (!checks.settlementPaidMilli) failures.push('settlementPaidMilli');
  if (!checks.amountDeductedMilli) failures.push('amountDeductedMilli');
  if (!checks.outstandingMilli) failures.push('outstandingMilli');
  if (!checks.pricingSource) failures.push('pricingSource');
  if (!checks.snapshotPrices) failures.push('snapshotPrices');
  if (!checks.securityStatus) failures.push('securityStatus');
  if (!checks.status) failures.push('status');
  if (!checks.noDuplicateKey) failures.push('noDuplicateKey');
  if (!checks.equation) failures.push('equation');

  if (issue.status === 'settled' && Math.trunc(issue.outstandingMilli) !== 0) {
    failures.push('settled_nonzero_outstanding');
  }
  if (issue.status === 'open' && Math.trunc(issue.outstandingMilli) <= 0) {
    failures.push('open_zero_outstanding');
  }

  return {
    ok: failures.length === 0,
    checks,
    failures,
    equation: {
      original: Math.trunc(issue.originalLiabilityMilli),
      settlementPaid: Math.trunc(issue.settlementPaidMilli ?? 0),
      amountDeducted: Math.trunc(issue.amountDeductedMilli ?? 0),
      outstanding: Math.trunc(issue.outstandingMilli),
      expectedOutstanding,
    },
  };
}

/** Settled openings must not enter open Expected population. */
export function openingEntersOpenExpectedPopulation(
  issue: EquipmentLiabilityIssue
): boolean {
  return issue.status === 'open' && Math.trunc(issue.outstandingMilli) > 0;
}

export type PilotExpectedDryRun = {
  financialMutation: false;
  autoRequestEnabled: boolean;
  financialApplyEnabled: boolean;
  entersOpenExpected: boolean;
  expectedDeductionMilli: number;
  reasonIfZero: string;
  usesPersistedOriginal: true;
  note: string;
};

/**
 * READ-ONLY Expected dry-run for one Opening issue.
 * Uses persisted originalLiabilityMilli — never live Admin reprice.
 */
export function expectedDryRunForOpeningIssue(
  issue: EquipmentLiabilityIssue,
  asOfDate = new Date().toISOString().slice(0, 10)
): PilotExpectedDryRun {
  const activation = String(issue.activationDate || asOfDate).slice(0, 10);
  // Cycle must start AFTER activation for eligibility (Expected rules).
  const cycleStart = activation < asOfDate ? asOfDate : asOfDate;
  // Ensure startDate > activationDate
  const start =
    cycleStart > activation
      ? cycleStart
      : (() => {
          const d = new Date(`${activation}T00:00:00.000Z`);
          d.setUTCDate(d.getUTCDate() + 1);
          return d.toISOString().slice(0, 10);
        })();
  const end = start;

  const cycle: PayoutCycle = {
    cycleId: 'pilot-expected-dry-run',
    year: Number(start.slice(0, 4)) || 2026,
    month: Number(start.slice(5, 7)) || 1,
    cycleNumber: 1,
    startDate: start,
    endDate: end,
    payoutDate: end,
    deductionGenerationDate: start,
    isClosing: false,
    equipmentDeductionEnabled: true,
    status: 'active',
    notes: 'pilot-expected-dry-run',
    createdBy: 'system',
    createdAt: asOfDate,
    updatedBy: 'system',
    updatedAt: asOfDate,
  };

  const snap = buildExpectedDeductionSnapshot({
    asOfDate: start,
    cycle,
    allCycles: [cycle],
    openIssues: [
      {
        equipmentIssueId: issue.equipmentIssueId,
        riderCode: issue.riderCode,
        riderNameSnapshot: issue.riderNameSnapshot,
        activationDate: activation,
        originalLiabilityMilli: issue.originalLiabilityMilli,
        outstandingMilli: issue.outstandingMilli,
        amountDeductedMilli: issue.amountDeductedMilli,
        installmentsCompleted: issue.installmentsCompleted,
        securityPaidUpfront: issue.securityPaidUpfront,
        status: issue.status,
        bagCostMilli: issue.bagCostMilli,
        shirtCostMilli: issue.shirtCostMilli,
        securityFeeMilli: issue.securityFeeMilli,
      },
    ],
  });

  const line = snap.lines[0];
  return {
    financialMutation: false,
    autoRequestEnabled: isAutoEquipmentDeductionsEnabled(),
    financialApplyEnabled: isSrs014FinancialApplyEnabled(),
    entersOpenExpected: openingEntersOpenExpectedPopulation(issue),
    expectedDeductionMilli: line?.expectedDeductionMilli ?? 0,
    reasonIfZero: line?.reasonIfZero || (issue.status !== 'open' ? 'not_open' : ''),
    usesPersistedOriginal: true,
    note: 'Expected dry-run only — no REQUEST / FA / payroll',
  };
}

export type ControlledOpeningPilotDeps = CreateOpeningLiabilityDeps & {
  /** Concurrent write lock (defaults to Redis Phase-C style locks). */
  acquireLocks?: typeof acquirePhaseCLiabilityLocks;
  appendAudit?: typeof appendAuditLog;
  /** Count Opening rows for migration key (duplicate detection). */
  countByMigrationKey?: (migrationKey: string) => number | Promise<number>;
};

export type ControlledOpeningPilotResult =
  | {
      ok: true;
      created: boolean;
      mode: 'PERSISTED';
      duplicateAttempt: boolean;
      issue: EquipmentLiabilityIssue;
      verification: OpeningVerificationResult;
      expectedDryRun: PilotExpectedDryRun;
      auditAction: 'create_opening_liability';
      financialSideEffects: {
        walletMutated: false;
        ledgerMoneyMutated: false;
        financialApply: false;
        requestCreated: false;
        financialApplyEnabled: false;
        autoRequestEnabled: false;
        productionWrite: true;
      };
    }
  | {
      ok: false;
      code: string;
      error: string;
      busy?: boolean;
      existing?: EquipmentLiabilityIssue;
    };

/**
 * Controlled pilot persist: allowlist → lock → createOpeningLiability(persist)
 * → audit create_opening_liability → read-only verify → Expected dry-run.
 * Never enables FA / Auto REQUEST.
 */
export async function runControlledOpeningPilotPersist(
  input: OpeningReconciliationInput,
  catalog: OpeningCatalogPricesMilli,
  deps: ControlledOpeningPilotDeps,
  opts?: { equipmentIssueId?: string }
): Promise<ControlledOpeningPilotResult> {
  const gate = assertOpeningPilotPersistAllowed(input.riderCode);
  if (!gate.ok) {
    return { ok: false, code: gate.code, error: gate.error };
  }

  if (isSrs014FinancialApplyEnabled()) {
    // Refuse coupling even if FA somehow ON — Opening persist must stay isolated.
  }

  const migrationKey = openingMigrationKey(gate.riderCode);
  const acquire = deps.acquireLocks ?? acquirePhaseCLiabilityLocks;
  const locks = await acquire({
    deliveryRowRef: migrationKey,
    riderCode: gate.riderCode,
  });
  if (!locks.ok) {
    return {
      ok: false,
      code: 'CONCURRENT_WRITE_BUSY',
      error: 'محاولة كتابة متزامنة — أعد المحاولة',
      busy: true,
    };
  }

  try {
    // Re-check duplicate under lock
    if (deps.findByMigrationKey) {
      const existing = await deps.findByMigrationKey(migrationKey);
      if (existing) {
        const verification = verifyOpeningLiabilityReadOnly(existing, {
          expectedRiderCode: gate.riderCode,
        });
        const expectedDryRun = expectedDryRunForOpeningIssue(existing);
        return {
          ok: true,
          created: false,
          mode: 'PERSISTED',
          duplicateAttempt: true,
          issue: existing,
          verification,
          expectedDryRun,
          auditAction: 'create_opening_liability',
          financialSideEffects: {
            walletMutated: false,
            ledgerMoneyMutated: false,
            financialApply: false,
            requestCreated: false,
            financialApplyEnabled: false,
            autoRequestEnabled: false,
            productionWrite: true,
          },
        };
      }
    }

    const created = await createOpeningLiability(
      { ...input, riderCode: gate.riderCode },
      catalog,
      {
        liveRiderExists: deps.liveRiderExists,
        findByMigrationKey: deps.findByMigrationKey,
        hasOpenAssignmentLiability: deps.hasOpenAssignmentLiability,
        persistIssue: deps.persistIssue,
      },
      { persist: true, equipmentIssueId: opts?.equipmentIssueId }
    );

    if (!created.ok) {
      return {
        ok: false,
        code: created.code,
        error: created.error,
        existing: 'existing' in created ? created.existing : undefined,
      };
    }

    if (created.mode !== 'PERSISTED') {
      return {
        ok: false,
        code: 'PRODUCTION_WRITE_DISABLED',
        error: 'لم تُكتب Opening Liability — الكتابة غير مفعّلة أو persistIssue مفقود',
      };
    }

    if (deps.countByMigrationKey) {
      const n = await deps.countByMigrationKey(migrationKey);
      if (n > 1) {
        return {
          ok: false,
          code: 'DUPLICATE_OPENING_ROWS',
          error: 'وُجدت أكثر من Opening لنفس المفتاح — STOP بدون حذف صامت',
          existing: created.issue,
        };
      }
    }

    const appendAudit = deps.appendAudit ?? appendAuditLog;
    await appendAudit({
      domain: 'equipment',
      action: 'create_opening_liability',
      entityType: 'equipment_issue',
      entityCode: created.issue.equipmentIssueId,
      actorCode: input.actorCode || 'opening-pilot',
      actorName: input.actorName || 'opening-pilot',
      after: {
        riderCode: created.issue.riderCode,
        migrationKey,
        originalLiabilityMilli: created.issue.originalLiabilityMilli,
        settlementPaidMilli: created.issue.settlementPaidMilli,
        outstandingMilli: created.issue.outstandingMilli,
        pricingSource: created.issue.pricingSource,
        snapMotorcycleBagMilli: created.issue.snapMotorcycleBagMilli,
        snapBicycleBagMilli: created.issue.snapBicycleBagMilli,
        snapShirtUnitMilli: created.issue.snapShirtUnitMilli,
        securityPaidUpfront: created.issue.securityPaidUpfront,
        status: created.issue.status,
        evidenceReference: input.evidenceReference || null,
        notes: input.notes || null,
        created: created.created,
      },
    });

    const verification = verifyOpeningLiabilityReadOnly(created.issue, {
      expectedRiderCode: gate.riderCode,
    });
    if (!verification.ok) {
      return {
        ok: false,
        code: 'POST_WRITE_VERIFICATION_FAILED',
        error: `فشل التحقق بعد الكتابة: ${verification.failures.join(',')}`,
        existing: created.issue,
      };
    }

    const expectedDryRun = expectedDryRunForOpeningIssue(created.issue);

    return {
      ok: true,
      created: created.created,
      mode: 'PERSISTED',
      duplicateAttempt: !created.created,
      issue: created.issue,
      verification,
      expectedDryRun,
      auditAction: 'create_opening_liability',
      financialSideEffects: {
        walletMutated: false,
        ledgerMoneyMutated: false,
        financialApply: false,
        requestCreated: false,
        financialApplyEnabled: false,
        autoRequestEnabled: false,
        productionWrite: true,
      },
    };
  } finally {
    await locks.release();
  }
}
