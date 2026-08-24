/**
 * Fresh final supervisor declarations — review outcomes & ledger consistency checks.
 * Pure helpers. No automatic ledger/liability mutation.
 */
import {
  declaredPaidFromStatus,
  normalizeRiderCodeKey,
  type OperationalExceptionCode,
  type SupervisorPaymentStatus,
} from '@/lib/equipmentDeductions/equipmentFinancialModel';
import type { SupervisorEquipmentDeclaration } from '@/lib/equipmentDeductions/supervisorDeclarations';
import { milliemesToEgp } from '@/lib/money';

/** Marker embedded in notes for new authoritative final declarations (from-scratch campaign). */
export const FINAL_AUTHORITATIVE_TAG = 'FINAL_AUTHORITATIVE';

/**
 * Missing-liability supervisor outcomes (A–E).
 * Do NOT invent 800/900 automatically.
 */
export type MissingLiabilityOutcome =
  | 'OWES' // A received equipment, still owes
  | 'PARTIAL' // B received, paid partially
  | 'FULLY_PAID' // C received, paid fully
  | 'NO_EQUIPMENT' // D never received / no liability
  | 'DATA_ERROR'; // E data incorrect → admin review

export const MISSING_LIABILITY_OUTCOME_TAG = 'MISSING_OUTCOME';

export function isFinalAuthoritativeDeclaration(
  d: Pick<SupervisorEquipmentDeclaration, 'notes'> | null | undefined
): boolean {
  if (!d) return false;
  return String(d.notes || '').includes(FINAL_AUTHORITATIVE_TAG);
}

export function parseMissingLiabilityOutcome(
  notes: string
): MissingLiabilityOutcome | null {
  const m = String(notes || '').match(/MISSING_OUTCOME:([A-Z_]+)/);
  if (!m) return null;
  const v = m[1] as MissingLiabilityOutcome;
  if (
    v === 'OWES' ||
    v === 'PARTIAL' ||
    v === 'FULLY_PAID' ||
    v === 'NO_EQUIPMENT' ||
    v === 'DATA_ERROR'
  ) {
    return v;
  }
  return null;
}

export function buildDeclarationNotes(params: {
  userNote?: string;
  missingLiabilityOutcome?: MissingLiabilityOutcome | null;
  extraTags?: string[];
}): string {
  const parts: string[] = [FINAL_AUTHORITATIVE_TAG];
  if (params.missingLiabilityOutcome) {
    parts.push(`${MISSING_LIABILITY_OUTCOME_TAG}:${params.missingLiabilityOutcome}`);
  }
  for (const t of params.extraTags || []) {
    if (t) parts.push(t);
  }
  const user = String(params.userNote || '').trim();
  if (user) parts.push(user);
  return parts.join(' | ');
}

export type PostDeclarationReview = {
  exceptionCode: OperationalExceptionCode | null;
  agreesWithLedger: boolean;
  adminCorrectionRequired: boolean;
  adminLiabilityCreationRequired: boolean;
  proposedCorrection: {
    currentOutstandingMilli: number | null;
    currentSettlementMilli: number | null;
    currentAmountDeductedMilli: number | null;
    supervisorStatus: SupervisorPaymentStatus;
    supervisorDeclaredPaidMilli: number;
    impliedOutstandingMilli: number | null;
    sheetActualMilli: number;
    discrepancyMilli: number | null;
    note: string;
  } | null;
  operationalHint: 'GREEN' | 'RED' | 'YELLOW';
};

/**
 * After a FINAL authoritative declaration, decide if admin action is needed.
 * Never mutates ledger.
 */
export function evaluatePostDeclarationReview(params: {
  hasLiability: boolean;
  declaration: SupervisorEquipmentDeclaration;
  originalLiabilityMilli: number;
  settlementPaidMilli: number;
  amountDeductedMilli: number;
  outstandingMilli: number | null;
  sheetActualMilli: number;
  hadSheetVsLedgerDisagree: boolean;
  toleranceMilli?: number;
}): PostDeclarationReview {
  const tol = params.toleranceMilli ?? 100;
  const decl = params.declaration;
  const missingOutcome = parseMissingLiabilityOutcome(decl.notes);

  if (!params.hasLiability) {
    if (missingOutcome === 'OWES' || missingOutcome === 'PARTIAL') {
      return {
        exceptionCode: 'ADMIN_LIABILITY_CREATION_REQUIRED',
        agreesWithLedger: false,
        adminCorrectionRequired: false,
        adminLiabilityCreationRequired: true,
        proposedCorrection: {
          currentOutstandingMilli: null,
          currentSettlementMilli: null,
          currentAmountDeductedMilli: null,
          supervisorStatus: decl.paymentStatus,
          supervisorDeclaredPaidMilli: decl.declaredPaidMilli,
          impliedOutstandingMilli:
            missingOutcome === 'PARTIAL'
              ? null
              : Math.max(0, decl.originalLiabilityMilli - decl.declaredPaidMilli),
          sheetActualMilli: params.sheetActualMilli,
          discrepancyMilli: null,
          note: 'Supervisor confirmed equipment liability exists but no liability row. Admin must create/backfill after approval. Do NOT invent 800/900 automatically.',
        },
        operationalHint: 'YELLOW',
      };
    }
    if (missingOutcome === 'DATA_ERROR') {
      return {
        exceptionCode: 'DATA_QUALITY',
        agreesWithLedger: false,
        adminCorrectionRequired: false,
        adminLiabilityCreationRequired: false,
        proposedCorrection: {
          currentOutstandingMilli: null,
          currentSettlementMilli: null,
          currentAmountDeductedMilli: null,
          supervisorStatus: decl.paymentStatus,
          supervisorDeclaredPaidMilli: decl.declaredPaidMilli,
          impliedOutstandingMilli: null,
          sheetActualMilli: params.sheetActualMilli,
          discrepancyMilli: null,
          note: 'Supervisor flagged incorrect data — admin review required.',
        },
        operationalHint: 'YELLOW',
      };
    }
    // FULLY_PAID / NO_EQUIPMENT / or payment status FULLY without outcome → no REQUEST
    if (
      missingOutcome === 'FULLY_PAID' ||
      missingOutcome === 'NO_EQUIPMENT' ||
      decl.paymentStatus === 'FULLY_PAID'
    ) {
      return {
        exceptionCode: null,
        agreesWithLedger: true,
        adminCorrectionRequired: false,
        adminLiabilityCreationRequired: false,
        proposedCorrection: null,
        operationalHint: 'GREEN',
      };
    }
    return {
      exceptionCode: 'MISSING_LIABILITY_NEEDS_SUPERVISOR_REVIEW',
      agreesWithLedger: false,
      adminCorrectionRequired: false,
      adminLiabilityCreationRequired: false,
      proposedCorrection: null,
      operationalHint: 'YELLOW',
    };
  }

  const original = Math.max(0, Math.trunc(params.originalLiabilityMilli));
  const declaredPaid = declaredPaidFromStatus({
    status: decl.paymentStatus,
    declaredPaidMilli: decl.declaredPaidMilli,
    originalLiabilityMilli: original,
  });
  const impliedOutstanding = Math.max(0, original - declaredPaid);
  // Ledger remaining already nets settlement + amountDeducted
  const ledgerOutstanding = params.outstandingMilli == null ? null : Math.max(0, Math.trunc(params.outstandingMilli));

  let agrees = true;
  let discrepancyMilli: number | null = null;

  if (decl.paymentStatus === 'FULLY_PAID') {
    // Fully paid ⇒ operational remaining should be 0
    if (ledgerOutstanding != null && ledgerOutstanding > tol) {
      agrees = false;
      discrepancyMilli = ledgerOutstanding;
    }
  } else if (decl.paymentStatus === 'NOT_PAID') {
    // Not paid ⇒ declared cash 0; ledger outstanding should still reflect unpaid remainder
    // Inconsistency if ledger says 0 but supervisor says not paid and original > 0
    if (ledgerOutstanding != null && ledgerOutstanding <= tol && original > tol) {
      agrees = false;
      discrepancyMilli = -original;
    }
  } else if (decl.paymentStatus === 'PARTIALLY_PAID') {
    if (ledgerOutstanding != null) {
      discrepancyMilli = ledgerOutstanding - impliedOutstanding;
      if (Math.abs(discrepancyMilli) > tol) agrees = false;
    }
  }

  // Sheet vs ledger booking-path cases: if supervisor final state conflicts with ledger booking
  if (params.hadSheetVsLedgerDisagree && !agrees) {
    return {
      exceptionCode: 'ADMIN_LEDGER_CORRECTION_REQUIRED',
      agreesWithLedger: false,
      adminCorrectionRequired: true,
      adminLiabilityCreationRequired: false,
      proposedCorrection: {
        currentOutstandingMilli: ledgerOutstanding,
        currentSettlementMilli: params.settlementPaidMilli,
        currentAmountDeductedMilli: params.amountDeductedMilli,
        supervisorStatus: decl.paymentStatus,
        supervisorDeclaredPaidMilli: declaredPaid,
        impliedOutstandingMilli: impliedOutstanding,
        sheetActualMilli: params.sheetActualMilli,
        discrepancyMilli,
        note: `Supervisor FINAL declaration (${decl.paymentStatus}, paid ${milliemesToEgp(declaredPaid)} EGP) conflicts with ledger outstanding ${ledgerOutstanding == null ? 'n/a' : milliemesToEgp(ledgerOutstanding)} EGP. Sheet abs(actual)=${milliemesToEgp(params.sheetActualMilli)}. Do NOT auto-apply.`,
      },
      operationalHint: 'YELLOW',
    };
  }

  if (!agrees) {
    return {
      exceptionCode: 'ADMIN_LEDGER_CORRECTION_REQUIRED',
      agreesWithLedger: false,
      adminCorrectionRequired: true,
      adminLiabilityCreationRequired: false,
      proposedCorrection: {
        currentOutstandingMilli: ledgerOutstanding,
        currentSettlementMilli: params.settlementPaidMilli,
        currentAmountDeductedMilli: params.amountDeductedMilli,
        supervisorStatus: decl.paymentStatus,
        supervisorDeclaredPaidMilli: declaredPaid,
        impliedOutstandingMilli: impliedOutstanding,
        sheetActualMilli: params.sheetActualMilli,
        discrepancyMilli,
        note: `Supervisor FINAL declaration inconsistent with ledger. Proposed operational outstanding ${milliemesToEgp(impliedOutstanding)} EGP vs ledger ${ledgerOutstanding == null ? 'n/a' : milliemesToEgp(ledgerOutstanding)}. No automatic correction.`,
      },
      operationalHint: 'YELLOW',
    };
  }

  if (decl.paymentStatus === 'FULLY_PAID' || impliedOutstanding <= 0) {
    return {
      exceptionCode: null,
      agreesWithLedger: true,
      adminCorrectionRequired: false,
      adminLiabilityCreationRequired: false,
      proposedCorrection: null,
      operationalHint: 'GREEN',
    };
  }

  // Still owes, declaration clear, ledger agrees → RED eligible (unless other yellow gates)
  return {
    exceptionCode: null,
    agreesWithLedger: true,
    adminCorrectionRequired: false,
    adminLiabilityCreationRequired: false,
    proposedCorrection: null,
    operationalHint: 'RED',
  };
}

export function normalizeRiderKey(code: unknown): string {
  return normalizeRiderCodeKey(code);
}
