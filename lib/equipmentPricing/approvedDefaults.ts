/**
 * Suggested Admin UI / first-save defaults for أسعار_المعدات.
 *
 * NOT a silent runtime authority for NEW rider liability creation.
 * NEW liabilities must load validated Admin configuration (fail closed).
 */

import type { AdminEquipmentPricingEgp } from '@/lib/equipmentPricing/types';

/** Current approved business prices (EGP) for Admin configuration defaults. */
export const APPROVED_ADMIN_EQUIPMENT_PRICING_EGP: AdminEquipmentPricingEgp = {
  motorcycleBox: 530,
  bicycleBox: 530,
  tshirt: 135,
  jacket: 0,
  helmet: 0,
  securityCheck: 100,
};
