/**
 * SRS-014 Phase D — legacy المعدات isolation for salary calc.
 *
 * Architecture intent: when auto deductions are ON, riders on the V2 liability
 * path must not also contribute via legacy المعدات × pricing (double-count).
 *
 * Reality: legacy sheet rows are supervisor-aggregated (no rider column), so a
 * supervisor-wide zero alters unrelated riders' legacy equipment costs.
 *
 * Isolation rule (Phase D hardening):
 * - Never zero the entire supervisor legacy equipmentCost because one (or more)
 *   riders have open V2 liabilities.
 * - Double-count prevention is operational: V2 deliveries must not also be
 *   posted as legacy المعدات for the same economic event; ledger installments
 *   remain additive via ledger_native when Auto Deduction is ON.
 * - When Auto Deduction is OFF this guard is never consulted — salary unchanged.
 */
export function shouldZeroLegacyEquipmentCostForSupervisor(_params: {
  autoDeductionsEnabled: boolean;
  openLiabilityRiderCount: number;
}): boolean {
  return false;
}
