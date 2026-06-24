'use client';

import { CONTRACT_TYPE_OPTIONS, computeContractEndDate, parseRiderIsoDate } from '@/lib/riderMetadata';

type Props = {
  joinDate: string;
  contractType: string;
  onJoinDateChange: (value: string) => void;
  onContractTypeChange: (value: string) => void;
  className?: string;
};

export default function RiderMetadataFields({
  joinDate,
  contractType,
  onJoinDateChange,
  onContractTypeChange,
  className = '',
}: Props) {
  let contractEndPreview = '';
  try {
    if (parseRiderIsoDate(joinDate)) {
      contractEndPreview = computeContractEndDate(joinDate);
    }
  } catch {
    contractEndPreview = '';
  }

  return (
    <div className={`grid grid-cols-1 md:grid-cols-3 gap-3 ${className}`}>
      <div>
        <label className="block text-sm mb-1 text-gray-700">نوع العقد *</label>
        <select
          value={contractType}
          onChange={(e) => onContractTypeChange(e.target.value)}
          required
          className="w-full px-3 py-2 border border-gray-300 rounded-lg"
        >
          <option value="">اختر نوع العقد</option>
          {CONTRACT_TYPE_OPTIONS.map((opt) => (
            <option key={opt} value={opt}>
              {opt}
            </option>
          ))}
        </select>
      </div>
      <div>
        <label className="block text-sm mb-1 text-gray-700">تاريخ الانضمام *</label>
        <input
          type="date"
          value={joinDate}
          onChange={(e) => onJoinDateChange(e.target.value)}
          required
          className="w-full px-3 py-2 border border-gray-300 rounded-lg"
        />
      </div>
      <div>
        <label className="block text-sm mb-1 text-gray-700">تاريخ انتهاء العقد (تلقائي)</label>
        <input
          type="text"
          readOnly
          value={contractEndPreview || '—'}
          className="w-full px-3 py-2 border border-gray-200 rounded-lg bg-gray-50 text-gray-600"
        />
        <p className="text-xs text-gray-500 mt-1">Join Date + 1 سنة — يمكن للمدير تعديله عند الموافقة فقط</p>
      </div>
    </div>
  );
}
