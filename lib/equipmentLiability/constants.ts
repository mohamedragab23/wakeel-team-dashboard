export const SHEET_EQUIPMENT_LIABILITY = 'عهدة_المعدات';

export const EQUIPMENT_LIABILITY_HEADERS = [
  'equipmentIssueId',
  'riderCode',
  'riderNameSnapshot',
  'zoneSnapshot',
  'supervisorCodeSnapshot',
  'supervisorNameSnapshot',
  'issueDate',
  'activationDate',
  'bagType',
  'bagCostMilli',
  'shirtQty',
  'shirtCostMilli',
  'securityFeeMilli',
  'securityPaidUpfront',
  'originalLiabilityMilli',
  'outstandingMilli',
  'amountDeductedMilli',
  'installmentsCompleted',
  'status',
  'deliveryRowRef',
  'jacketHeld',
  'helmetHeld',
  'createdAt',
  'createdBy',
  'updatedAt',
  'updatedBy',
  /** Additive — cash return settlement paid (not installment progress). */
  'settlementPaidMilli',
] as const;

export type EquipmentLiabilityStatus = 'open' | 'settled' | 'waived' | 'closed';
export type EquipmentBagType = 'motorcycle' | 'bicycle';
