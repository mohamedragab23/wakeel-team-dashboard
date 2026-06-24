import type { Rider } from '@/lib/adminService';

export const CONTRACT_TYPE_OPTIONS = ['Full Time', 'Part Time'] as const;
export type ContractType = (typeof CONTRACT_TYPE_OPTIONS)[number];

export type RiderMetadataField = 'joinDate' | 'contractType' | 'contractEndDate';

export type RiderMetadataStatus = {
  riderCode: string;
  name: string;
  supervisorCode: string;
  joinDate: string | null;
  contractType: string | null;
  contractEndDate: string | null;
  hasJoinDate: boolean;
  hasContractType: boolean;
  hasContractEndDate: boolean;
  isMetadataComplete: boolean;
  missingFields: RiderMetadataField[];
};

export function parseRiderIsoDate(raw: unknown): string | null {
  if (raw == null || raw === '') return null;
  if (raw instanceof Date && !Number.isNaN(raw.getTime())) {
    return raw.toISOString().split('T')[0];
  }
  const s = String(raw).trim();
  if (!s) return null;
  const iso = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) {
    const d = new Date(`${iso[1]}-${iso[2]}-${iso[3]}T00:00:00`);
    return Number.isNaN(d.getTime()) ? null : d.toISOString().split('T')[0];
  }
  const dmy = s.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})/);
  if (dmy) {
    const d = new Date(`${dmy[3]}-${dmy[2].padStart(2, '0')}-${dmy[1].padStart(2, '0')}T00:00:00`);
    return Number.isNaN(d.getTime()) ? null : d.toISOString().split('T')[0];
  }
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? null : d.toISOString().split('T')[0];
}

export function isValidContractType(raw: unknown): raw is ContractType {
  const s = String(raw ?? '').trim();
  return CONTRACT_TYPE_OPTIONS.includes(s as ContractType);
}

export function computeContractEndDate(joinDate: string): string {
  const parsed = parseRiderIsoDate(joinDate);
  if (!parsed) throw new Error('تاريخ الانضمام غير صالح');
  const d = new Date(`${parsed}T00:00:00`);
  d.setFullYear(d.getFullYear() + 1);
  return d.toISOString().split('T')[0];
}

export function assessRiderMetadata(rider: Rider): RiderMetadataStatus {
  const joinDate = parseRiderIsoDate(rider.joinDate);
  const contractTypeRaw = String(rider.contractType ?? '').trim();
  const contractType = isValidContractType(contractTypeRaw) ? contractTypeRaw : null;
  const contractEndDate = parseRiderIsoDate(rider.contractEndDate);

  const hasJoinDate = joinDate !== null;
  const hasContractType = contractType !== null;
  const hasContractEndDate = contractEndDate !== null;

  const missingFields: RiderMetadataField[] = [];
  if (!hasJoinDate) missingFields.push('joinDate');
  if (!hasContractType) missingFields.push('contractType');
  if (!hasContractEndDate) missingFields.push('contractEndDate');

  return {
    riderCode: String(rider.code ?? '').trim(),
    name: String(rider.name ?? rider.code ?? '').trim(),
    supervisorCode: String(rider.supervisorCode ?? '').trim(),
    joinDate,
    contractType,
    contractEndDate,
    hasJoinDate,
    hasContractType,
    hasContractEndDate,
    isMetadataComplete: missingFields.length === 0,
    missingFields,
  };
}

export function validateAssignmentMetadata(input: {
  joinDate: string;
  contractType: string;
  contractEndDate?: string;
  allowCustomEndDate?: boolean;
}):
  | { ok: true; joinDate: string; contractType: ContractType; contractEndDate: string }
  | { ok: false; error: string } {
  const joinDate = parseRiderIsoDate(input.joinDate);
  if (!joinDate) {
    return { ok: false, error: 'تاريخ الانضمام مطلوب ويجب أن يكون بصيغة YYYY-MM-DD' };
  }
  if (!isValidContractType(input.contractType)) {
    return { ok: false, error: 'نوع العقد مطلوب: Full Time أو Part Time' };
  }

  if (input.allowCustomEndDate && input.contractEndDate) {
    const customEnd = parseRiderIsoDate(input.contractEndDate);
    if (!customEnd) {
      return { ok: false, error: 'تاريخ انتهاء العقد غير صالح' };
    }
    if (customEnd < joinDate) {
      return { ok: false, error: 'تاريخ انتهاء العقد يجب أن يكون بعد تاريخ الانضمام' };
    }
    return {
      ok: true,
      joinDate,
      contractType: input.contractType,
      contractEndDate: customEnd,
    };
  }

  return {
    ok: true,
    joinDate,
    contractType: input.contractType,
    contractEndDate: computeContractEndDate(joinDate),
  };
}
