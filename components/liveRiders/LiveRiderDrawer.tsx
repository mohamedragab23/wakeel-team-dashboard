'use client';

import AccessibleModal from '@/components/ui-v2/AccessibleModal';
import LiveStatusBadge from '@/components/liveRiders/LiveStatusBadge';
import type { LiveRiderWithAssignment } from '@/lib/roosterLive/types';

function formatDuration(totalSeconds: number): string {
  if (!totalSeconds) return '00:00:00';
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = Math.floor(totalSeconds % 60);
  return [h, m, s].map((n) => String(n).padStart(2, '0')).join(':');
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between py-2 border-b border-[rgba(255,255,255,0.06)] last:border-0">
      <span className="text-sm text-[rgba(234,240,255,0.65)]">{label}</span>
      <span className="text-sm font-semibold text-[#EAF0FF]">{value}</span>
    </div>
  );
}

export default function LiveRiderDrawer({
  rider,
  onClose,
}: {
  rider: LiveRiderWithAssignment | null;
  onClose: () => void;
}) {
  return (
    <AccessibleModal
      open={!!rider}
      onClose={onClose}
      title={rider?.riderName || 'تفاصيل المندوب'}
      description={rider ? `كود المندوب: ${rider.riderId}` : undefined}
      maxWidthClass="max-w-md"
    >
      {rider && (
        <div className="flex flex-col">
          <div className="flex items-center justify-between mb-3">
            <LiveStatusBadge status={rider.statusBucket} />
            <span className="text-xs text-[rgba(234,240,255,0.55)]">{rider.riderState}</span>
          </div>

          <Row label="المشرف" value={rider.supervisorName || '—'} />
          <Row label="رصيد المحفظة" value={`${rider.walletBalance.toLocaleString('ar-EG')} ج.م`} />
          <Row label="الجلسة الحالية" value={rider.currentSessionLabel || '—'} />
          <Row label="وقت العمل" value={rider.timeWorkedLabel || '—'} />
          <Row label="عدد الاستراحات" value={rider.breaksCount} />
          <Row label="وقت الاستراحة" value={formatDuration(rider.breakTimeSeconds)} />
          <Row label="وقت التأخير" value={formatDuration(rider.lateTimeSeconds)} />
          {rider.acceptanceRate !== null && <Row label="نسبة القبول" value={`${rider.acceptanceRate}%`} />}
          {rider.performance !== null && <Row label="الأداء (UTR)" value={String(rider.performance)} />}
          {rider.ordersToday !== null && <Row label="عدد الطلبات" value={rider.ordersToday} />}
          {rider.vehicle && <Row label="نوع المركبة" value={rider.vehicle} />}
          {rider.zone && <Row label="المنطقة" value={rider.zone} />}

          <div className="mt-4 pt-3 border-t border-[rgba(255,255,255,0.08)] text-xs text-[rgba(234,240,255,0.5)]">
            آخر تحديث: {new Date(rider.lastSyncAt).toLocaleTimeString('ar-EG')}
          </div>
        </div>
      )}
    </AccessibleModal>
  );
}
