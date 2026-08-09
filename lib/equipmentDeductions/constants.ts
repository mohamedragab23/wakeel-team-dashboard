export const SHEET_EQUIPMENT_AUTO_DEDUCTIONS = 'استقطاعات_المعدات_التلقائية';

export const EQUIPMENT_AUTO_DEDUCTION_HEADERS = [
  'id',
  'idempotencyKey',
  'equipmentIssueId',
  'riderCode',
  'riderNameSnapshot',
  'cycleId',
  'installmentNumber',
  'amountMilli',
  'amountEgp',
  'period',
  'ledgerTransactionId',
  'status',
  'skipReason',
  'createdAt',
] as const;

export type EquipmentAutoDeductionStatus = 'posted' | 'skipped';
