'use client';

import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { authFetch } from '@/lib/authFetch';
import { ZONE_OPTIONS } from '@/lib/zones';
import type { CityExpansionAction, CityExpansionResult } from '@/lib/strategicOps/digitalTwin';

type Filters = {
  startDate: string;
  endDate: string;
  zone: string;
  supervisorCode: string;
};

type Props = { filters: Filters };

export function CityExpansionPanel({ filters }: Props) {
  const [action, setAction] = useState<CityExpansionAction>('open');
  const [cityKey, setCityKey] = useState(
    filters.zone !== 'all' ? filters.zone : ZONE_OPTIONS[0] ?? 'Alexandria'
  );
  const [seedHeadcount, setSeedHeadcount] = useState(80);
  const [scaleFactor, setScaleFactor] = useState(1.25);
  const [runKey, setRunKey] = useState(0);

  const body = useMemo(
    () =>
      JSON.stringify({
        ...filters,
        action,
        cityKey,
        seedHeadcount,
        scaleFactor,
      }),
    [filters, action, cityKey, seedHeadcount, scaleFactor]
  );

  const query = useQuery({
    queryKey: ['city-expansion', body, runKey],
    queryFn: async () => {
      const res = await authFetch('/api/strategic-ops/digital-twin/city-expansion', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body,
      });
      const json = await res.json();
      if (!json.success) throw new Error(json.error || 'فشل محاكاة التوسع');
      return json.data as CityExpansionResult;
    },
    enabled: runKey > 0,
    staleTime: 60_000,
  });

  return (
    <section className="rounded-2xl border border-amber-500/30 bg-amber-500/10 p-5 space-y-4" dir="rtl">
      <div>
        <h2 className="text-lg font-semibold text-[#EAF0FF]">محاكاة توسع المدينة — City Expansion</h2>
        <p className="text-xs text-[#64748B] mt-1">
          افتتاح / إغلاق / توسيع / تقليص — تكلفة، إيراد، تعادل، وتعقيد تشغيلي
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
        <div>
          <label className="text-xs text-[#94A3B8] block mb-1">الإجراء</label>
          <select
            value={action}
            onChange={(e) => setAction(e.target.value as CityExpansionAction)}
            className="w-full rounded-lg bg-black/30 border border-white/10 px-3 py-2 text-[#EAF0FF] text-sm"
          >
            <option value="open">افتتاح</option>
            <option value="close">إغلاق</option>
            <option value="expand">توسيع</option>
            <option value="reduce">تقليص</option>
          </select>
        </div>
        <div>
          <label className="text-xs text-[#94A3B8] block mb-1">المدينة</label>
          <select
            value={cityKey}
            onChange={(e) => setCityKey(e.target.value)}
            className="w-full rounded-lg bg-black/30 border border-white/10 px-3 py-2 text-[#EAF0FF] text-sm"
          >
            {ZONE_OPTIONS.map((z) => (
              <option key={z} value={z}>
                {z}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="text-xs text-[#94A3B8] block mb-1">Headcount ابتدائي</label>
          <input
            type="number"
            min={10}
            value={seedHeadcount}
            onChange={(e) => setSeedHeadcount(Number(e.target.value) || 0)}
            className="w-full rounded-lg bg-black/30 border border-white/10 px-3 py-2 text-[#EAF0FF] text-sm"
          />
        </div>
        <div>
          <label className="text-xs text-[#94A3B8] block mb-1">معامل التوسع/التقليص</label>
          <input
            type="number"
            step={0.05}
            min={0.3}
            max={2}
            value={scaleFactor}
            onChange={(e) => setScaleFactor(Number(e.target.value) || 1)}
            className="w-full rounded-lg bg-black/30 border border-white/10 px-3 py-2 text-[#EAF0FF] text-sm"
          />
        </div>
        <div className="flex items-end">
          <button
            type="button"
            onClick={() => setRunKey((k) => k + 1)}
            className="w-full rounded-lg bg-amber-400/90 hover:bg-amber-400 text-black font-semibold py-2.5 text-sm"
          >
            تشغيل المحاكاة
          </button>
        </div>
      </div>

      {query.isFetching && <p className="text-sm text-[#94A3B8] animate-pulse">جاري الحساب…</p>}
      {query.error && <p className="text-sm text-red-300">{(query.error as Error).message}</p>}

      {query.data && (
        <div className="rounded-xl border border-white/10 bg-black/20 p-4 space-y-2 text-sm">
          <p className="font-semibold text-[#EAF0FF]">{query.data.summaryAr}</p>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs text-[#CBD5E1]">
            <span>طيارون: {query.data.resources.headcount}</span>
            <span>مشرفون: {query.data.resources.supervisorsNeeded}</span>
            <span>هدف يومي: {query.data.resources.dailyTargetHours} س</span>
            <span>تعقيد: {query.data.operationalComplexity}</span>
            <span>إعداد: {query.data.cost.totalSetup}</span>
            <span>تشغيل شهري: {query.data.cost.monthlyOperating}</span>
            <span>إيراد شهري: {query.data.expectedRevenueMonthly}</span>
            <span>تعادل: {query.data.breakEvenMonths ?? '—'} شهر</span>
          </div>
        </div>
      )}
    </section>
  );
}
