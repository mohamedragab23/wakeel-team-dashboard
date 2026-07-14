'use client';

import VirtualTable from '@/components/ui-v2/VirtualTable';

interface SupervisorSummary {
  supervisorCode: string;
  supervisorName: string;
  totalRiders: number;
  online: number;
  offline: number;
  onBreak: number;
  late: number;
  working: number;
  walletAlerts: number;
  avgUtilization: number;
  avgAcceptanceRate: number;
}

const HEADER = (
  <div className="grid grid-cols-[1.5fr_0.8fr_0.8fr_0.8fr_0.8fr_0.8fr_0.8fr_1fr] gap-2 px-4 py-3 bg-[rgba(255,255,255,0.04)] text-xs font-semibold text-[rgba(234,240,255,0.65)]">
    <span>المشرف</span>
    <span>المجموع</span>
    <span>شغال</span>
    <span>متصل</span>
    <span>استراحة</span>
    <span>متأخر</span>
    <span>تنبيه رصيد</span>
    <span>متوسط الأداء</span>
  </div>
);

export default function SupervisorSummaryTable({
  supervisors,
  onSelect,
}: {
  supervisors: SupervisorSummary[];
  onSelect?: (supervisor: SupervisorSummary) => void;
}) {
  return (
    <VirtualTable
      items={supervisors}
      rowHeight={56}
      maxHeight={640}
      header={HEADER}
      emptyMessage="لا يوجد مشرفين بمناديب في الوقت الحالي"
      renderRow={(sup) => (
        <button
          key={sup.supervisorCode}
          onClick={() => onSelect?.(sup)}
          className="w-full grid grid-cols-[1.5fr_0.8fr_0.8fr_0.8fr_0.8fr_0.8fr_0.8fr_1fr] gap-2 px-4 py-3 items-center text-right border-t border-[rgba(255,255,255,0.06)] hover:bg-[rgba(255,255,255,0.04)] transition-colors"
        >
          {/* المشرف */}
          <span className="min-w-0">
            <span className="block text-sm font-medium text-[#EAF0FF] truncate">{sup.supervisorName || '—'}</span>
            <span className="block text-xs text-[rgba(234,240,255,0.5)]">{sup.supervisorCode}</span>
          </span>

          {/* المجموع */}
          <span className="text-sm font-semibold text-[#EAF0FF]">{sup.totalRiders}</span>

          {/* شغال */}
          <span className="text-sm text-[#10B981]">{sup.working}</span>

          {/* متصل */}
          <span className="text-sm text-[#10B981]">{sup.online}</span>

          {/* استراحة */}
          <span className="text-sm text-[#FBBF24]">{sup.onBreak}</span>

          {/* متأخر */}
          <span className={`text-sm ${sup.late > 0 ? 'text-[#FB7185]' : 'text-[rgba(234,240,255,0.5)]'}`}>
            {sup.late}
          </span>

          {/* تنبيه رصيد */}
          <span className={`text-sm ${sup.walletAlerts > 0 ? 'text-[#FB7185]' : 'text-[rgba(234,240,255,0.5)]'}`}>
            {sup.walletAlerts}
          </span>

          {/* متوسط الأداء */}
          <span className="text-sm text-[#EAF0FF]">
            {sup.avgUtilization > 0 ? sup.avgUtilization.toFixed(1) : '—'}
          </span>
        </button>
      )}
    />
  );
}
