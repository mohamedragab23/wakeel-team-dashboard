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

export const SRS014_FLAG_OFF_BODY = {
  success: false as const,
  enabled: false as const,
  error: 'هذه الميزة غير مفعّلة حاليًا',
};
