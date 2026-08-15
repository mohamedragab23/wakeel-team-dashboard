/**
 * 4D.5.4.14 — Opening reconciliation UI helpers (pure).
 * No sheet writes. No Financial Apply.
 */

import {
  assessOpeningFlowReadiness,
  calculateOpeningLiability,
  defaultOpeningCatalogFromApprovedDefaults,
  openingMigrationKey,
  type OpeningCatalogPricesMilli,
  type OpeningReconciliationInput,
  type OpeningSecurityStatus,
} from '@/lib/equipmentLiability/openingBalance';
import { normalizeRiderCodeForPerformance } from '@/lib/riderCodeUtils';
import { milliemesToEgp } from '@/lib/money';
import type { EquipmentLiabilityIssue } from '@/lib/equipmentLiability/store';

export type ReconciliationListStatus =
  | 'NOT_MIGRATED'
  | 'READY'
  | 'MIGRATED'
  | 'CONFLICT';

export type LiveRiderRow = {
  riderCode: string;
  name: string;
  zone: string;
  supervisorCode: string;
  supervisorName: string;
  joinDate: string;
  status: string;
  active: boolean;
};

export function parseLiveRidersFromSheet(data: unknown[][] | null | undefined): LiveRiderRow[] {
  if (!data || data.length < 2) return [];
  const out: LiveRiderRow[] = [];
  for (let i = 1; i < data.length; i++) {
    const row = data[i];
    const code = normalizeRiderCodeForPerformance(String(row?.[0] ?? ''));
    if (!code) continue;
    const status = String(row?.[7] ?? '').trim();
    const active = status === 'نشط' || status.toLowerCase() === 'active';
    out.push({
      riderCode: code,
      name: String(row?.[1] ?? '').trim(),
      zone: String(row?.[2] ?? '').trim(),
      supervisorCode: String(row?.[3] ?? '').trim(),
      supervisorName: String(row?.[4] ?? '').trim(),
      joinDate: String(row?.[6] ?? '').trim(),
      status,
      active,
    });
  }
  return out;
}

export function isOpeningMigrationIssue(issue: EquipmentLiabilityIssue): boolean {
  const ref = String(issue.deliveryRowRef || '').trim();
  return (
    issue.pricingSource === 'OPENING_MIGRATION' ||
    ref.startsWith('OPENING:')
  );
}

export function resolveReconciliationStatus(params: {
  rider: LiveRiderRow;
  openingIssue: EquipmentLiabilityIssue | null;
  hasOtherOpenLiability: boolean;
}): ReconciliationListStatus {
  if (params.openingIssue) return 'MIGRATED';
  if (params.hasOtherOpenLiability) return 'CONFLICT';
  if (params.rider.active) return 'READY';
  return 'NOT_MIGRATED';
}

export type OpeningPreviewFormInput = {
  riderCode: string;
  motorcycleBagHeld: boolean;
  bicycleBagHeld: boolean;
  tshirtQuantity: number;
  jacketQuantity: number;
  helmetQuantity: number;
  /** Empty string = UNKNOWN (invalid). */
  securityStatus: '' | OpeningSecurityStatus;
  historicalPaidEgp: number;
  evidenceReference?: string;
  notes?: string;
  operatorConfirmation: boolean;
  riderNameSnapshot?: string;
  zoneSnapshot?: string;
  supervisorCodeSnapshot?: string;
  supervisorNameSnapshot?: string;
};

export function formToOpeningInput(
  form: OpeningPreviewFormInput
): OpeningReconciliationInput | { ok: false; code: string; error: string } {
  if (form.securityStatus !== 'PAID' && form.securityStatus !== 'NOT_PAID') {
    return {
      ok: false,
      code: 'SECURITY_STATUS_REQUIRED',
      error: 'حالة الاستعلام الأمني يجب أن تكون PAID أو NOT_PAID',
    };
  }
  const paidEgp = Number(form.historicalPaidEgp);
  if (!Number.isFinite(paidEgp)) {
    return { ok: false, code: 'INVALID_PAID', error: 'المبلغ المدفوع غير صالح' };
  }
  const historicalPaidMilli = Math.round(paidEgp * 100);
  return {
    riderCode: form.riderCode,
    motorcycleBagHeld: form.motorcycleBagHeld,
    bicycleBagHeld: form.bicycleBagHeld,
    tshirtQuantity: Math.trunc(Number(form.tshirtQuantity) || 0),
    jacketQuantity: Math.trunc(Number(form.jacketQuantity) || 0),
    helmetQuantity: Math.trunc(Number(form.helmetQuantity) || 0),
    securityStatus: form.securityStatus,
    historicalPaidMilli,
    operatorConfirmation: form.operatorConfirmation === true,
    evidenceReference: form.evidenceReference,
    notes: form.notes,
    riderNameSnapshot: form.riderNameSnapshot,
    zoneSnapshot: form.zoneSnapshot,
    supervisorCodeSnapshot: form.supervisorCodeSnapshot,
    supervisorNameSnapshot: form.supervisorNameSnapshot,
  };
}

export type OpeningPreviewView = {
  ok: true;
  migrationKey: string;
  pricingSource: 'OPENING_MIGRATION';
  zeroBalancePolicy: 'CREATE_SETTLED_OPENING_RECORD';
  status: string;
  originalLiabilityMilli: number;
  historicalPaidMilli: number;
  outstandingMilli: number;
  originalLiabilityEgp: number;
  historicalPaidEgp: number;
  outstandingEgp: number;
  bagCostMilli: number;
  shirtCostMilli: number;
  securityFeeMilli: number;
  securityPaidUpfront: boolean;
  entersExpectedRequest: boolean;
  financialSideEffects: {
    walletMutated: false;
    ledgerMoneyMutated: false;
    financialApply: false;
    productionWrite: false;
  };
};

export function buildOpeningPreview(
  form: OpeningPreviewFormInput,
  catalog: OpeningCatalogPricesMilli = defaultOpeningCatalogFromApprovedDefaults()
): OpeningPreviewView | { ok: false; code: string; error: string } {
  const mapped = formToOpeningInput(form);
  if ('ok' in mapped && mapped.ok === false) return mapped;
  const input = mapped as OpeningReconciliationInput;
  const calc = calculateOpeningLiability(input, catalog);
  // OpeningValidationError always has `ok`; success calculation never does.
  if ('ok' in calc) return calc;

  return {
    ok: true,
    migrationKey: calc.migrationKey,
    pricingSource: 'OPENING_MIGRATION',
    zeroBalancePolicy: calc.zeroBalancePolicy,
    status: calc.status,
    originalLiabilityMilli: calc.originalLiabilityMilli,
    historicalPaidMilli: calc.historicalPaidMilli,
    outstandingMilli: calc.outstandingMilli,
    originalLiabilityEgp: milliemesToEgp(calc.originalLiabilityMilli),
    historicalPaidEgp: milliemesToEgp(calc.historicalPaidMilli),
    outstandingEgp: milliemesToEgp(calc.outstandingMilli),
    bagCostMilli: calc.bagCostMilli,
    shirtCostMilli: calc.shirtCostMilli,
    securityFeeMilli: calc.securityFeeMilli,
    securityPaidUpfront: calc.securityPaidUpfront,
    entersExpectedRequest: calc.status === 'open' && calc.outstandingMilli > 0,
    financialSideEffects: {
      walletMutated: false,
      ledgerMoneyMutated: false,
      financialApply: false,
      productionWrite: false,
    },
  };
}

/** Diagnostic for a listed rider (e.g. 4811093) — never invents reconciliation data. */
export function riderOpeningDiagnostic(params: {
  riderCode: string;
  liveRiderExists: boolean;
  openingIssue: EquipmentLiabilityIssue | null;
}): {
  identityReady: boolean;
  reconciliationDataComplete: boolean;
  candidateRequired: false;
  migrationKey: string;
  alreadyMigrated: boolean;
} {
  const ready = assessOpeningFlowReadiness({
    liveRiderExists: params.liveRiderExists,
    reconciliationInput: null,
  });
  return {
    identityReady: ready.identityReady,
    reconciliationDataComplete: false,
    candidateRequired: false,
    migrationKey: openingMigrationKey(params.riderCode),
    alreadyMigrated: Boolean(params.openingIssue),
  };
}
