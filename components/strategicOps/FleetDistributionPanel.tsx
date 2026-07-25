'use client';

/**
 * SRS-011 Part 4 — Fleet Distribution Intelligence.
 * Instead of a pie chart, the COO sees exactly who is working how many
 * hours: names, supervisor, last daily-comment, last active day — grouped
 * into 6 operational buckets, each with its own recommendation, plus a
 * deterministic "what if" uplift projection.
 */
import { useEffect, useState } from 'react';
import type { FleetDistribution, FleetHourBucketId, FleetBucketTone } from '@/lib/strategicOps/controlTower/fleetDistribution';

type Props = {
  distribution: FleetDistribution;
  /** Compact = only the uplift line + bucket chips (used inside Executive Brief). */
  compact?: boolean;
  onOpenKpi?: (kpiId: string) => void;
  /** SRS-011 Part 3 — externally-driven bucket to auto-expand (e.g. from Root Cause Tree). */
  focusBucketId?: FleetHourBucketId | null;
};

const TONE_STYLES: Record<FleetBucketTone, string> = {
  critical: 'border-red-500/40 bg-red-500/10 text-red-200',
  warning: 'border-orange-500/40 bg-orange-500/10 text-orange-200',
  neutral: 'border-amber-500/40 bg-amber-500/10 text-amber-200',
  good: 'border-emerald-500/40 bg-emerald-500/10 text-emerald-200',
  elite: 'border-cyan-500/40 bg-cyan-500/10 text-cyan-200',
};

const TONE_ICON: Record<FleetBucketTone, string> = {
  critical: '🔴',
  warning: '🟠',
  neutral: '🟡',
  good: '🟢',
  elite: '💎',
};

function daysAgoAr(dateStr: string | null): string {
  if (!dateStr) return 'لا يوجد نشاط في الفترة';
  const d = new Date(dateStr + 'T00:00:00');
  const now = new Date();
  const diffDays = Math.round((now.getTime() - d.getTime()) / (24 * 60 * 60 * 1000));
  if (diffDays <= 0) return 'اليوم';
  if (diffDays === 1) return 'أمس';
  return `منذ ${diffDays} يوم (${dateStr})`;
}

export function FleetDistributionPanel({ distribution, compact, onOpenKpi, focusBucketId }: Props) {
  const [openBucket, setOpenBucket] = useState<FleetHourBucketId | null>(
    distribution.buckets.find((b) => (b.id === 'under_2' || b.id === 'under_4') && b.count > 0)?.id ?? null
  );

  useEffect(() => {
    if (focusBucketId) setOpenBucket(focusBucketId);
  }, [focusBucketId]);

  if (distribution.totalRiders === 0) return null;

  const uplift = distribution.upliftScenario;

  return (
    <section className="space-y-3" dir="rtl">
      {!compact && (
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h3 className="text-sm font-semibold text-[#EAF0FF]">
            🚴 توزيع الأسطول حسب ساعات العمل — {distribution.totalRiders} طيار
          </h3>
          <p className="text-[11px] text-[#64748B]">
            متوسط الساعات اليومية الحالي: <span className="text-cyan-200 font-semibold">{distribution.currentAvgHoursDaily}س</span>
          </p>
        </div>
      )}

      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2">
        {distribution.buckets.map((b) => (
          <button
            key={b.id}
            type="button"
            onClick={() => setOpenBucket((v) => (v === b.id ? null : b.id))}
            className={`rounded-xl border px-3 py-2.5 text-right transition-colors ${TONE_STYLES[b.tone]} ${
              openBucket === b.id ? 'ring-2 ring-white/40' : 'hover:brightness-110'
            }`}
          >
            <p className="text-[11px] opacity-90">{TONE_ICON[b.tone]} {b.labelAr}</p>
            <p className="text-2xl font-bold mt-0.5">{b.count}</p>
          </button>
        ))}
      </div>

      {uplift.ridersAffected > 0 && (
        <div className="rounded-xl border border-cyan-500/30 bg-cyan-500/10 p-3 text-xs text-cyan-100">
          💡 لو تم رفع {uplift.ridersAffected} طيار (أقل من 4 ساعات) إلى 6 ساعات/يوم، سيزداد متوسط الساعات
          اليومية للأسطول بمقدار <span className="font-semibold">+{uplift.deltaAvgHoursDaily}س</span> — من{' '}
          {distribution.currentAvgHoursDaily}س إلى{' '}
          <span className="font-semibold">{uplift.projectedAvgHoursDaily}س</span> (إجمالي {uplift.hoursAddedDaily}س
          إضافية/يوم على مستوى الأسطول).
        </div>
      )}

      {!compact &&
        distribution.buckets.map((b) => {
          if (openBucket !== b.id) return null;
          return (
            <div key={b.id} className={`rounded-xl border p-3 ${TONE_STYLES[b.tone]} bg-black/20`}>
              <p className="text-xs font-semibold mb-2">📋 {b.recommendationAr}</p>
              {b.count === 0 ? (
                <p className="text-xs text-[#64748B]">لا يوجد طيارون في هذه الفئة حاليًا.</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="min-w-full text-[11px] text-[#CBD5E1]">
                    <thead className="text-[#94A3B8]">
                      <tr>
                        <th className="px-2 py-1 text-right">الطيار</th>
                        <th className="px-2 py-1 text-right">المشرف</th>
                        <th className="px-2 py-1 text-right">ساعات/يوم</th>
                        <th className="px-2 py-1 text-right">غياب</th>
                        <th className="px-2 py-1 text-right">آخر نشاط فعلي</th>
                        <th className="px-2 py-1 text-right">آخر تعليق</th>
                      </tr>
                    </thead>
                    <tbody>
                      {b.riders.slice(0, 50).map((r) => (
                        <tr key={r.code} className="border-t border-white/10">
                          <td className="px-2 py-1 whitespace-nowrap text-[#EAF0FF]">
                            {r.name}
                            <br />
                            <span className="text-[10px] text-[#64748B]">{r.code}</span>
                          </td>
                          <td className="px-2 py-1 whitespace-nowrap">{r.supervisorName || '—'}</td>
                          <td className="px-2 py-1 font-semibold">{r.actualHoursDaily}س</td>
                          <td className="px-2 py-1">{r.noShowCount}</td>
                          <td className="px-2 py-1 whitespace-nowrap">{daysAgoAr(r.lastActiveDate)}</td>
                          <td className="px-2 py-1 max-w-[220px] truncate" title={r.lastCommentAr ?? undefined}>
                            {r.lastCommentAr ?? '—'}
                            {r.lastCommentDate && <span className="text-[10px] text-[#64748B]"> ({r.lastCommentDate})</span>}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {b.riders.length > 50 && (
                    <p className="text-[10px] text-[#64748B] mt-1">
                      عرض أول 50 من {b.riders.length} طيار في هذه الفئة.
                    </p>
                  )}
                </div>
              )}
              {onOpenKpi && (
                <button
                  type="button"
                  onClick={() => onOpenKpi('active_riders')}
                  className="mt-2 rounded-lg border border-white/15 bg-black/20 px-2 py-1 text-[10px] text-[#EAF0FF] hover:bg-white/10"
                >
                  🔗 لماذا هذا مهم؟ (Active Riders KPI)
                </button>
              )}
            </div>
          );
        })}
    </section>
  );
}
