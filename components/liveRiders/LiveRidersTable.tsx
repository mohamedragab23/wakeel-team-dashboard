'use client';

import VirtualTable from '@/components/ui-v2/VirtualTable';
import LiveStatusBadge from '@/components/liveRiders/LiveStatusBadge';
import type { LiveRiderWithAssignment } from '@/lib/roosterLive/types';

function formatDuration(totalSeconds: number): string {
  if (!totalSeconds) return '00:00';
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  return h > 0 ? `${h}س ${m}د` : `${m}د`;
}

const HEADER = (
  <div className="grid grid-cols-[1.4fr_0.8fr_1fr_0.7fr_0.8fr_0.8fr_0.7fr_0.7fr_0.7fr_0.8fr] gap-2 px-4 py-3 bg-[rgba(255,255,255,0.04)] text-xs font-semibold text-[rgba(234,240,255,0.65)]">
    <span>المندوب</span>
    <span>الحالة</span>
    <span>الجلسة الحالية</span>
    <span>الأداء</span>
    <span>وقت العمل</span>
    <span>معدل القبول</span>
    <span>الرصيد</span>
    <span>الاستراحات</span>
    <span>التأخير</span>
    <span>آخر تحديث</span>
  </div>
);

export default function LiveRidersTable({
  riders,
  onSelect,
}: {
  riders: LiveRiderWithAssignment[];
  onSelect: (rider: LiveRiderWithAssignment) => void;
}) {
  return (
    <VirtualTable
      items={riders}
      rowHeight={64}
      maxHeight={640}
      header={HEADER}
      emptyMessage="لا يوجد مناديب مطابقين للبحث/الفلاتر الحالية"
      renderRow={(rider) => (
        <button
          key={rider.riderId}
          onClick={() => onSelect(rider)}
          className="w-full grid grid-cols-[1.4fr_0.8fr_1fr_0.7fr_0.8fr_0.8fr_0.7fr_0.7fr_0.7fr_0.8fr] gap-2 px-4 py-3 items-center text-right border-t border-[rgba(255,255,255,0.06)] hover:bg-[rgba(255,255,255,0.04)] transition-colors"
        >
          {/* المندوب */}
          <span className="min-w-0">
            <span className="block text-sm font-medium text-[#EAF0FF] truncate">{rider.riderName || '—'}</span>
            <span className="block text-xs text-[rgba(234,240,255,0.5)]">#{rider.riderId}</span>
          </span>

          {/* الحالة */}
          <span>
            <LiveStatusBadge status={rider.statusBucket} />
            <span className="block text-xs text-[rgba(234,240,255,0.5)] mt-1 truncate">{rider.riderState || '—'}</span>
          </span>

          {/* الجلسة الحالية */}
          <span className="text-sm text-[#EAF0FF] truncate">{rider.currentSessionLabel || '—'}</span>

          {/* الأداء (UTR/Performance) */}
          <span className="text-sm font-semibold text-[#10B981]">
            {rider.performance !== null && rider.performance !== undefined ? String(rider.performance) : '—'}
          </span>

          {/* وقت العمل */}
          <span className="text-sm text-[#EAF0FF]">{rider.timeWorkedLabel || '—'}</span>

          {/* معدل القبول */}
          <span className="text-sm text-[#EAF0FF]">
            {rider.acceptanceRate !== null ? `${Math.round(rider.acceptanceRate)}%` : '—'}
          </span>

          {/* الرصيد */}
          <span
            className={`text-sm font-semibold ${rider.walletBalance <= 0 ? 'text-[#FB7185]' : 'text-[#EAF0FF]'}`}
          >
            {rider.walletBalance.toLocaleString('ar-EG')}
          </span>

          {/* الاستراحات */}
          <span className="text-sm text-[#EAF0FF]">
            {rider.breaksCount}
            {rider.breakTimeSeconds > 0 && (
              <span className="block text-xs text-[rgba(234,240,255,0.5)]">{formatDuration(rider.breakTimeSeconds)}</span>
            )}
          </span>

          {/* التأخير */}
          <span className={`text-sm ${rider.lateTimeSeconds > 0 ? 'text-[#FBBF24]' : 'text-[rgba(234,240,255,0.5)]'}`}>
            {formatDuration(rider.lateTimeSeconds)}
          </span>

          {/* آخر تحديث */}
          <span className="text-xs text-[rgba(234,240,255,0.5)]">
            {new Date(rider.lastSyncAt).toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' })}
          </span>
        </button>
      )}
    />
  );
}
