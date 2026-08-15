/**
 * SRS-014 feature flags — all default OFF unless env === 'true' (case-insensitive).
 */

function envTrue(name: string): boolean {
  return String(process.env[name] || '')
    .trim()
    .toLowerCase() === 'true';
}

export function isRecruitmentV2Enabled(): boolean {
  return envTrue('FEATURE_RECRUITMENT_V2_ENABLED');
}

export function isPayoutCyclesEnabled(): boolean {
  return envTrue('FEATURE_PAYOUT_CYCLES_ENABLED');
}

export function isEquipmentLedgerEnabled(): boolean {
  return envTrue('FEATURE_EQUIPMENT_LEDGER_ENABLED');
}

export function isAutoEquipmentDeductionsEnabled(): boolean {
  return envTrue('FEATURE_AUTO_EQUIPMENT_DEDUCTIONS_ENABLED');
}

export function isEquipmentReturnsV2Enabled(): boolean {
  return envTrue('FEATURE_EQUIPMENT_RETURNS_V2_ENABLED');
}

export function isManualDeductionsV2Enabled(): boolean {
  return envTrue('FEATURE_MANUAL_DEDUCTIONS_V2_ENABLED');
}

export function isEquipmentInventoryV2Enabled(): boolean {
  return envTrue('FEATURE_EQUIPMENT_INVENTORY_V2_ENABLED');
}

/**
 * SRS-014 Phase 4D.5 — production financial apply (ALLOCATED → wallet/ledger).
 * OFF by default. Does NOT inherit Auto REQUEST or other flags.
 * Enablement is a separate explicit Go — do not turn ON in this phase.
 */
export function isSrs014FinancialApplyEnabled(): boolean {
  return envTrue('FEATURE_SRS014_FINANCIAL_APPLY_ENABLED');
}

/**
 * 4D.5.4.15 — Opening Balance Production write (FLOW A liability row only).
 * OFF by default. Does NOT enable Financial Apply, Auto REQUEST, wallet, or ledger money.
 * Also requires FEATURE_SRS014_OPENING_PILOT_ALLOWLIST (max 3 rider codes).
 */
export function isSrs014OpeningBalanceWriteEnabled(): boolean {
  return envTrue('FEATURE_SRS014_OPENING_BALANCE_WRITE_ENABLED');
}

export const SRS014_FLAG_OFF_BODY = {
  success: false as const,
  enabled: false as const,
  error: 'هذه الميزة غير مفعّلة حاليًا',
};
