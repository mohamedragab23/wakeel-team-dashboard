/**
 * SRS-014 Phase 4D.5.4.13 — FLOW A Opening Balance / Equipment Reconciliation (domain).
 *
 * NON-FINANCIAL: no wallet, ledger money, REQUEST, Financial Apply, or production writes
 * unless an explicit future persist flag is enabled (defaults OFF).
 *
 * FLOW A identity authority = المناديب.كود (live riderCode).
 * Does NOT call Phase-C Candidate gates or Recruitment lookups.
 */

import { egpToMilliemes } from '@/lib/money';
import { normalizeAndValidateRiderCode } from '@/lib/equipmentLiability/phaseCGates';
import { scheduleFromPersistedOriginalMilli } from '@/lib/equipmentPricing/computeFromPricing';
import type { EquipmentPricingMilli } from '@/lib/equipmentPricing/types';
import { APPROVED_ADMIN_EQUIPMENT_PRICING_EGP } from '@/lib/equipmentPricing/approvedDefaults';
import type { EquipmentBagType, EquipmentLiabilityStatus } from '@/lib/equipmentLiability/constants';
import type { EquipmentLiabilityIssue } from '@/lib/equipmentLiability/store';
import { isSrs014FinancialApplyEnabled } from '@/lib/srs014Flags';
import {
  assertOpeningPilotPersistAllowed,
  isSrs014OpeningBalanceWriteEnabled,
} from '@/lib/equipmentLiability/openingPilotAllowlist';

/** FLOW A always persists this literal — never Admin / legacy reprice labels. */
export const OPENING_PRICING_SOURCE = 'OPENING_MIGRATION' as const;

export function openingMigrationKey(riderCode: string): string {
  const n = normalizeAndValidateRiderCode(riderCode);
  if (!n.ok) return '';
  return `OPENING:${n.riderCode}`;
}

/** Explicit Security only — UNKNOWN fails closed. */
export type OpeningSecurityStatus = 'PAID' | 'NOT_PAID';

export type OpeningReconciliationInput = {
  riderCode: string;
  motorcycleBagHeld: boolean;
  bicycleBagHeld: boolean;
  tshirtQuantity: number;
  jacketQuantity: number;
  helmetQuantity: number;
  securityStatus: OpeningSecurityStatus;
  /** Historical cash/desk paid in milliemes (maps to settlementPaidMilli). */
  historicalPaidMilli: number;
  /** Explicit human confirmation required. */
  operatorConfirmation: boolean;
  evidenceReference?: string;
  notes?: string;
  /** Optional live-master snapshots (from المناديب read — not invented). */
  riderNameSnapshot?: string;
  zoneSnapshot?: string;
  supervisorCodeSnapshot?: string;
  supervisorNameSnapshot?: string;
  migrationDate?: string;
  actorCode?: string;
  actorName?: string;
};

export type OpeningCatalogPricesMilli = EquipmentPricingMilli;

/** Default catalog reference from approved Admin defaults (EGP→milli). Preview only until frozen. */
export function defaultOpeningCatalogFromApprovedDefaults(): OpeningCatalogPricesMilli {
  const d = APPROVED_ADMIN_EQUIPMENT_PRICING_EGP;
  return {
    motorcycleBagMilli: egpToMilliemes(d.motorcycleBox),
    bicycleBagMilli: egpToMilliemes(d.bicycleBox),
    shirtMilli: egpToMilliemes(d.tshirt),
    securityFeeMilli: egpToMilliemes(d.securityCheck),
    jacketMilli: egpToMilliemes(d.jacket),
    helmetMilli: egpToMilliemes(d.helmet),
  };
}

export type OpeningValidationError = {
  ok: false;
  code: string;
  error: string;
};

export function validateOpeningReconciliationInput(
  input: OpeningReconciliationInput
): { ok: true } | OpeningValidationError {
  const rider = normalizeAndValidateRiderCode(input.riderCode);
  if (!rider.ok) {
    return { ok: false, code: 'RIDER_CODE_INVALID', error: 'كود المندوب غير صالح' };
  }
  if (input.motorcycleBagHeld && input.bicycleBagHeld) {
    return {
      ok: false,
      code: 'BOTH_BAG_TYPES',
      error: 'لا يمكن اختيار شنطة موتوسيكل وشنطة عجلة معًا',
    };
  }
  for (const [label, v] of [
    ['tshirtQuantity', input.tshirtQuantity],
    ['jacketQuantity', input.jacketQuantity],
    ['helmetQuantity', input.helmetQuantity],
  ] as const) {
    if (!Number.isFinite(v) || !Number.isInteger(v) || v < 0) {
      return {
        ok: false,
        code: 'INVALID_QUANTITY',
        error: `${label} يجب أن يكون عددًا صحيحًا غير سالب`,
      };
    }
  }
  if (input.securityStatus !== 'PAID' && input.securityStatus !== 'NOT_PAID') {
    return {
      ok: false,
      code: 'SECURITY_STATUS_REQUIRED',
      error: 'حالة الاستعلام الأمني يجب أن تكون PAID أو NOT_PAID صراحة',
    };
  }
  if (!Number.isFinite(input.historicalPaidMilli) || !Number.isInteger(input.historicalPaidMilli)) {
    return {
      ok: false,
      code: 'INVALID_PAID',
      error: 'المبلغ المدفوع تاريخيًا غير صالح',
    };
  }
  if (input.historicalPaidMilli < 0) {
    return { ok: false, code: 'NEGATIVE_PAID', error: 'المبلغ المدفوع لا يمكن أن يكون سالبًا' };
  }
  if (input.operatorConfirmation !== true) {
    return {
      ok: false,
      code: 'CONFIRMATION_REQUIRED',
      error: 'يلزم تأكيد المشغّل الصريح قبل إنشاء Opening Liability',
    };
  }
  return { ok: true };
}

export type OpeningLiabilityCalculation = {
  pricingSource: typeof OPENING_PRICING_SOURCE;
  pricingCapturedAt: string;
  bagType: EquipmentBagType;
  bagCostMilli: number;
  shirtQty: number;
  shirtCostMilli: number;
  jacketCostMilli: number;
  helmetCostMilli: number;
  securityFeeMilli: number;
  securityPaidUpfront: boolean;
  originalLiabilityMilli: number;
  historicalPaidMilli: number;
  outstandingMilli: number;
  /** installment progress always 0 at opening create */
  amountDeductedMilli: 0;
  settlementPaidMilli: number;
  installmentsCompleted: 0;
  installmentSchedule: number[];
  status: EquipmentLiabilityStatus;
  migrationKey: string;
  zeroBalancePolicy: 'CREATE_SETTLED_OPENING_RECORD';
  financialSideEffects: {
    walletMutated: false;
    ledgerMoneyMutated: false;
    financialApply: false;
    requestCreated: false;
  };
};

/**
 * Pure calculation for FLOW A.
 * Catalog prices are the frozen reference used for declared equipment components.
 * historicalPaid → settlementPaidMilli (desk/cash history), NOT installment progress.
 *
 * ZERO-BALANCE POLICY: if outstanding === 0, still build a settled opening record
 * (status=settled) so OPENING:<riderCode> idempotency + audit exist; it will NOT
 * appear in open Expected/REQUEST lists.
 */
export function calculateOpeningLiability(
  input: OpeningReconciliationInput,
  catalog: OpeningCatalogPricesMilli,
  capturedAt = new Date().toISOString()
): OpeningLiabilityCalculation | OpeningValidationError {
  const v = validateOpeningReconciliationInput(input);
  if (!v.ok) return v;

  const rider = normalizeAndValidateRiderCode(input.riderCode);
  if (!rider.ok) {
    return { ok: false, code: 'RIDER_CODE_INVALID', error: 'كود المندوب غير صالح' };
  }

  const bagType: EquipmentBagType = input.bicycleBagHeld ? 'bicycle' : 'motorcycle';
  const bagCostMilli = input.motorcycleBagHeld
    ? Math.max(0, Math.trunc(catalog.motorcycleBagMilli))
    : input.bicycleBagHeld
      ? Math.max(0, Math.trunc(catalog.bicycleBagMilli))
      : 0;
  const shirtQty = Math.trunc(input.tshirtQuantity);
  const shirtCostMilli = shirtQty * Math.max(0, Math.trunc(catalog.shirtMilli));
  const jacketCostMilli =
    Math.trunc(input.jacketQuantity) * Math.max(0, Math.trunc(catalog.jacketMilli));
  const helmetCostMilli =
    Math.trunc(input.helmetQuantity) * Math.max(0, Math.trunc(catalog.helmetMilli));
  const securityPaidUpfront = input.securityStatus === 'PAID';
  const securityFeeMilli = Math.max(0, Math.trunc(catalog.securityFeeMilli));
  const securityContribution = securityPaidUpfront ? 0 : securityFeeMilli;

  const originalLiabilityMilli =
    bagCostMilli + shirtCostMilli + jacketCostMilli + helmetCostMilli + securityContribution;
  const historicalPaidMilli = Math.trunc(input.historicalPaidMilli);

  if (historicalPaidMilli > originalLiabilityMilli) {
    return {
      ok: false,
      code: 'PAID_EXCEEDS_ORIGINAL',
      error: 'المبلغ المدفوع لا يمكن أن يتجاوز أصل العهدة',
    };
  }

  const outstandingMilli = originalLiabilityMilli - historicalPaidMilli;
  const status: EquipmentLiabilityStatus = outstandingMilli === 0 ? 'settled' : 'open';

  return {
    pricingSource: OPENING_PRICING_SOURCE,
    pricingCapturedAt: capturedAt,
    bagType,
    bagCostMilli,
    shirtQty,
    shirtCostMilli,
    jacketCostMilli,
    helmetCostMilli,
    securityFeeMilli,
    securityPaidUpfront,
    originalLiabilityMilli,
    historicalPaidMilli,
    outstandingMilli,
    amountDeductedMilli: 0,
    settlementPaidMilli: historicalPaidMilli,
    installmentsCompleted: 0,
    installmentSchedule: scheduleFromPersistedOriginalMilli(originalLiabilityMilli),
    status,
    migrationKey: openingMigrationKey(rider.riderCode),
    zeroBalancePolicy: 'CREATE_SETTLED_OPENING_RECORD',
    financialSideEffects: {
      walletMutated: false,
      ledgerMoneyMutated: false,
      financialApply: false,
      requestCreated: false,
    },
  };
}

export type OpeningFlowIdentityAssessment = {
  identityReady: boolean;
  reconciliationDataComplete: boolean;
  blockers: string[];
  /** FLOW A never requires Candidate */
  candidateRequired: false;
};

/**
 * FLOW A readiness split:
 * IDENTITY_READY = live rider exists in المناديب
 * RECONCILIATION_DATA_COMPLETE = operator provided valid reconciliation input
 */
export function assessOpeningFlowReadiness(params: {
  liveRiderExists: boolean;
  reconciliationInput?: OpeningReconciliationInput | null;
  catalog?: OpeningCatalogPricesMilli;
}): OpeningFlowIdentityAssessment {
  const blockers: string[] = [];
  if (!params.liveRiderExists) blockers.push('MISSING_RIDER_MASTER');

  let reconciliationDataComplete = false;
  if (params.reconciliationInput) {
    const calc = calculateOpeningLiability(
      params.reconciliationInput,
      params.catalog ?? defaultOpeningCatalogFromApprovedDefaults()
    );
    reconciliationDataComplete = !('ok' in calc && calc.ok === false);
    if ('ok' in calc && calc.ok === false) blockers.push(calc.code);
  } else {
    blockers.push('RECONCILIATION_DATA_INCOMPLETE');
  }

  return {
    identityReady: params.liveRiderExists,
    reconciliationDataComplete,
    blockers,
    candidateRequired: false,
  };
}

export type BuildOpeningLiabilityIssueResult =
  | { ok: true; issue: EquipmentLiabilityIssue; calculation: OpeningLiabilityCalculation }
  | OpeningValidationError;

/** Build liability issue object without sheet I/O. */
export function buildOpeningLiabilityIssue(
  input: OpeningReconciliationInput,
  catalog: OpeningCatalogPricesMilli,
  opts?: { equipmentIssueId?: string; capturedAt?: string }
): BuildOpeningLiabilityIssueResult {
  const calc = calculateOpeningLiability(input, catalog, opts?.capturedAt);
  if ('ok' in calc && calc.ok === false) return calc;

  const c = calc as OpeningLiabilityCalculation;
  const rider = normalizeAndValidateRiderCode(input.riderCode);
  if (!rider.ok) {
    return { ok: false, code: 'RIDER_CODE_INVALID', error: 'كود المندوب غير صالح' };
  }
  const now = c.pricingCapturedAt;
  const issue: EquipmentLiabilityIssue = {
    equipmentIssueId: opts?.equipmentIssueId || `opening_${rider.riderCode}_${Date.now()}`,
    riderCode: rider.riderCode,
    riderNameSnapshot: String(input.riderNameSnapshot || '').trim(),
    zoneSnapshot: String(input.zoneSnapshot || '').trim(),
    supervisorCodeSnapshot: String(input.supervisorCodeSnapshot || '').trim(),
    supervisorNameSnapshot: String(input.supervisorNameSnapshot || '').trim(),
    issueDate: (input.migrationDate || now).slice(0, 10),
    activationDate: (input.migrationDate || now).slice(0, 10),
    bagType: c.bagType,
    bagCostMilli: c.bagCostMilli,
    shirtQty: c.shirtQty,
    shirtCostMilli: c.shirtCostMilli,
    securityFeeMilli: c.securityFeeMilli,
    securityPaidUpfront: c.securityPaidUpfront,
    originalLiabilityMilli: c.originalLiabilityMilli,
    outstandingMilli: c.outstandingMilli,
    amountDeductedMilli: 0,
    settlementPaidMilli: c.settlementPaidMilli,
    installmentsCompleted: 0,
    status: c.status,
    deliveryRowRef: c.migrationKey,
    jacketHeld: input.jacketQuantity > 0,
    helmetHeld: input.helmetQuantity > 0,
    createdAt: now,
    createdBy: input.actorCode || 'opening-migration',
    updatedAt: now,
    updatedBy: input.actorCode || 'opening-migration',
    installmentSchedule: c.installmentSchedule,
    pricingSource: OPENING_PRICING_SOURCE,
    pricingCapturedAt: c.pricingCapturedAt,
    snapMotorcycleBagMilli: catalog.motorcycleBagMilli,
    snapBicycleBagMilli: catalog.bicycleBagMilli,
    snapShirtUnitMilli: catalog.shirtMilli,
  };
  return { ok: true, issue, calculation: c };
}

export type CreateOpeningLiabilityDeps = {
  /** Live rider existence check — MUST NOT use Candidate lookup. */
  liveRiderExists: (riderCode: string) => boolean | Promise<boolean>;
  findByMigrationKey?: (
    migrationKey: string
  ) => EquipmentLiabilityIssue | null | Promise<EquipmentLiabilityIssue | null>;
  hasOpenAssignmentLiability?: (
    riderCode: string
  ) => boolean | Promise<boolean>;
  /**
   * Persist hook. When omitted or when production write flag is OFF,
   * createOpeningLiability returns DRY_RUN / PRODUCTION_WRITE_DISABLED and never writes.
   */
  persistIssue?: (issue: EquipmentLiabilityIssue) => Promise<void>;
};

export type CreateOpeningLiabilityResult =
  | {
      ok: true;
      created: boolean;
      mode: 'DRY_RUN' | 'PERSISTED';
      issue: EquipmentLiabilityIssue;
      calculation: OpeningLiabilityCalculation;
      financialSideEffects: OpeningLiabilityCalculation['financialSideEffects'] & {
        financialApplyEnabled: false;
      };
    }
  | OpeningValidationError
  | { ok: false; code: string; error: string; existing?: EquipmentLiabilityIssue };

/**
 * Domain create authority for FLOW A.
 * Default: DRY_RUN only (no sheet write). Production persist requires
 * FEATURE_SRS014_OPENING_BALANCE_WRITE_ENABLED=true AND pilot allowlist
 * AND deps.persistIssue AND opts.persist=true.
 * Never enables Financial Apply. Never looks up Candidates.
 */
export async function createOpeningLiability(
  input: OpeningReconciliationInput,
  catalog: OpeningCatalogPricesMilli,
  deps: CreateOpeningLiabilityDeps,
  opts?: {
    persist?: boolean;
    equipmentIssueId?: string;
    /**
     * Equipment Manager accept of supervisor opening_report — skips pilot allowlist
     * and Opening write flag; still no FA; still requires persistIssue + confirmation.
     */
    fromEquipmentManagerProposal?: boolean;
  }
): Promise<CreateOpeningLiabilityResult> {
  if (isSrs014FinancialApplyEnabled()) {
    // Even if somehow ON, opening create still refuses money path coupling.
  }

  const wantPersist = opts?.persist === true;
  const fromProposal = opts?.fromEquipmentManagerProposal === true;

  if (wantPersist && !fromProposal) {
    const allow = assertOpeningPilotPersistAllowed(input.riderCode);
    if (!allow.ok) {
      return { ok: false, code: allow.code, error: allow.error };
    }
  }

  if (wantPersist && fromProposal && !input.operatorConfirmation) {
    return {
      ok: false,
      code: 'OPERATOR_CONFIRMATION_REQUIRED',
      error: 'تأكيد مسؤول المعدات مطلوب لإنشاء العهدة من الاقتراح',
    };
  }

  const exists = await deps.liveRiderExists(input.riderCode);
  if (!exists) {
    return {
      ok: false,
      code: 'LIVE_RIDER_NOT_FOUND',
      error: 'كود المندوب غير موجود في ورقة المناديب',
    };
  }

  const built = buildOpeningLiabilityIssue(input, catalog, {
    equipmentIssueId: opts?.equipmentIssueId,
  });
  if (!built.ok) return built;

  const migrationKey = built.calculation.migrationKey;
  if (deps.findByMigrationKey) {
    const existing = await deps.findByMigrationKey(migrationKey);
    if (existing) {
      return {
        ok: true,
        created: false,
        mode:
          wantPersist && (fromProposal || isSrs014OpeningBalanceWriteEnabled())
            ? 'PERSISTED'
            : 'DRY_RUN',
        issue: existing,
        calculation: built.calculation,
        financialSideEffects: {
          ...built.calculation.financialSideEffects,
          financialApplyEnabled: false,
        },
      };
    }
  }

  if (deps.hasOpenAssignmentLiability) {
    const open = await deps.hasOpenAssignmentLiability(built.issue.riderCode);
    if (open) {
      return {
        ok: false,
        code: 'OPEN_LIABILITY_EXISTS',
        error: 'توجد عهدة مفتوحة للمندوب — لا يمكن إنشاء Opening مكرر',
      };
    }
  }

  const canPersist =
    wantPersist &&
    typeof deps.persistIssue === 'function' &&
    (fromProposal || isSrs014OpeningBalanceWriteEnabled());

  if (wantPersist && !canPersist) {
    return {
      ok: false,
      code: 'PRODUCTION_WRITE_DISABLED',
      error:
        'كتابة Opening Liability على Production معطّلة (FEATURE_SRS014_OPENING_BALANCE_WRITE_ENABLED أو persistIssue)',
    };
  }

  if (canPersist && deps.persistIssue) {
    await deps.persistIssue(built.issue);
    return {
      ok: true,
      created: true,
      mode: 'PERSISTED',
      issue: built.issue,
      calculation: built.calculation,
      financialSideEffects: {
        ...built.calculation.financialSideEffects,
        financialApplyEnabled: false,
      },
    };
  }

  return {
    ok: true,
    created: true,
    mode: 'DRY_RUN',
    issue: built.issue,
    calculation: built.calculation,
    financialSideEffects: {
      ...built.calculation.financialSideEffects,
      financialApplyEnabled: false,
    },
  };
}
