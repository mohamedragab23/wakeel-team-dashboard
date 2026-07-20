'use client';

import { useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { authFetch } from '@/lib/authFetch';
import type { LearningMetrics, PredictionRecord } from '@/lib/strategicOps/digitalTwin';
import type { SavedScenarioRecord } from '@/lib/strategicOps/digitalTwin/types';

export function ModelLearningPanel() {
  const [selectedId, setSelectedId] = useState('');
  const [actualHours, setActualHours] = useState('');
  const [actualOrders, setActualOrders] = useState('');
  const [actualAchievement, setActualAchievement] = useState('');
  const [msg, setMsg] = useState<string | null>(null);

  const listQuery = useQuery({
    queryKey: ['dt-scenarios-learning'],
    queryFn: async () => {
      const res = await authFetch('/api/strategic-ops/digital-twin/scenarios');
      const json = await res.json();
      if (!json.success) throw new Error(json.error || 'فشل تحميل السيناريوهات');
      return (json.data ?? []) as SavedScenarioRecord[];
    },
    staleTime: 30_000,
  });

  const learningQuery = useQuery({
    queryKey: ['dt-learning-metrics', listQuery.dataUpdatedAt],
    queryFn: async () => {
      const res = await authFetch('/api/strategic-ops/digital-twin/learning');
      const json = await res.json();
      if (!json.success) throw new Error(json.error || 'فشل مقاييس التعلم');
      return json.data as { metrics: LearningMetrics; records: PredictionRecord[] };
    },
    staleTime: 30_000,
  });

  useEffect(() => {
    if (!selectedId && listQuery.data?.[0]) setSelectedId(listQuery.data[0].id);
  }, [listQuery.data, selectedId]);

  const selected = useMemo(
    () => listQuery.data?.find((s) => s.id === selectedId) ?? null,
    [listQuery.data, selectedId]
  );

  const recordActual = async () => {
    if (!selectedId) return;
    setMsg(null);
    const actualResult = {
      hours: Number(actualHours) || 0,
      orders: Number(actualOrders) || 0,
      achievement: Number(actualAchievement) || 0,
      recordedAt: new Date().toISOString(),
    };
    const predicted = {
      hours: selected?.impact?.projected?.actualHours ?? 0,
      orders: selected?.impact?.projected?.orders ?? 0,
      achievement: selected?.impact?.projected?.achievement ?? 0,
    };
    const variance = {
      hours: actualResult.hours - predicted.hours,
      orders: actualResult.orders - predicted.orders,
      achievement: actualResult.achievement - predicted.achievement,
    };
    const res = await authFetch(`/api/strategic-ops/digital-twin/scenarios/${selectedId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ actualResult, variance }),
    });
    const json = await res.json();
    if (!json.success) {
      setMsg(json.error || 'فشل التسجيل');
      return;
    }
    setMsg('تم تسجيل النتيجة الفعلية');
    void listQuery.refetch();
    void learningQuery.refetch();
  };

  const metrics = learningQuery.data?.metrics;

  return (
    <section className="rounded-2xl border border-emerald-500/30 bg-emerald-500/10 p-5 space-y-4" dir="rtl">
      <div>
        <h2 className="text-lg font-semibold text-[#EAF0FF]">تعلّم النموذج — Prediction vs Reality</h2>
        <p className="text-xs text-[#64748B] mt-1">
          سجّل النتيجة الفعلية بعد التنفيذ لقياس MAPE ومعايرة المحاكاة
        </p>
      </div>

      {listQuery.error && (
        <p className="text-sm text-amber-200">
          {(listQuery.error as Error).message} — احفظ سيناريوهات في Neon أولاً.
        </p>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
        <div className="sm:col-span-2">
          <label className="text-xs text-[#94A3B8] block mb-1">سيناريو محفوظ</label>
          <select
            value={selectedId}
            onChange={(e) => setSelectedId(e.target.value)}
            className="w-full rounded-lg bg-black/30 border border-white/10 px-3 py-2 text-[#EAF0FF] text-sm"
          >
            {(listQuery.data ?? []).map((s) => (
              <option key={s.id} value={s.id}>
                {s.title} ({new Date(s.createdAt).toLocaleDateString('ar-EG')})
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="text-xs text-[#94A3B8] block mb-1">ساعات فعلية</label>
          <input
            value={actualHours}
            onChange={(e) => setActualHours(e.target.value)}
            className="w-full rounded-lg bg-black/30 border border-white/10 px-3 py-2 text-[#EAF0FF] text-sm"
          />
        </div>
        <div>
          <label className="text-xs text-[#94A3B8] block mb-1">طلبات فعلية</label>
          <input
            value={actualOrders}
            onChange={(e) => setActualOrders(e.target.value)}
            className="w-full rounded-lg bg-black/30 border border-white/10 px-3 py-2 text-[#EAF0FF] text-sm"
          />
        </div>
        <div>
          <label className="text-xs text-[#94A3B8] block mb-1">إنجاز فعلي %</label>
          <input
            value={actualAchievement}
            onChange={(e) => setActualAchievement(e.target.value)}
            className="w-full rounded-lg bg-black/30 border border-white/10 px-3 py-2 text-[#EAF0FF] text-sm"
          />
        </div>
      </div>

      <button
        type="button"
        onClick={recordActual}
        disabled={!selectedId}
        className="rounded-lg bg-emerald-400/90 hover:bg-emerald-400 text-black font-semibold px-4 py-2 text-sm disabled:opacity-40"
      >
        تسجيل Actual Result
      </button>
      {msg && <p className="text-xs text-cyan-300">{msg}</p>}

      {metrics && (
        <div className="rounded-xl border border-white/10 bg-black/20 p-3 text-xs space-y-1 text-[#CBD5E1]">
          <p className="font-semibold text-[#EAF0FF]">دقة النموذج: {metrics.accuracyScore}/100</p>
          <p>{metrics.calibrationNoteAr}</p>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mt-2">
            <span>عينات: {metrics.sampleSize}</span>
            <span>MAPE ساعات: {metrics.mapeHours ?? '—'}%</span>
            <span>MAPE طلبات: {metrics.mapeOrders ?? '—'}%</span>
            <span>MAPE إنجاز: {metrics.mapeAchievement ?? '—'}%</span>
            <span>انحياز ساعات: {metrics.biasHours ?? '—'}</span>
            <span>عامل تصحيح ساعات: {metrics.suggestedAdjustments.hoursFactor}</span>
          </div>
        </div>
      )}
    </section>
  );
}
