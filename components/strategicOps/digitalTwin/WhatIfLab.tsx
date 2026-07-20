'use client';

import { useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { authFetch } from '@/lib/authFetch';
import {
  SCENARIO_PRESETS,
  compareScenarios,
  type OptimalPlan,
  type ScenarioLevers,
  type ScenarioPresetId,
  type SimulationResult,
} from '@/lib/strategicOps/digitalTwin';
import { saveDraft, listDrafts } from '@/lib/strategicOps/digitalTwin/persistence/localDrafts';
import { ScenarioBuilder } from './ScenarioBuilder';
import { HiringSimulatorPanel } from './HiringSimulatorPanel';
import { ImpactSummary } from './ImpactSummary';
import { ExecutiveDecisionCard } from './ExecutiveDecisionCard';
import { ScenarioComparisonTable } from './ScenarioComparisonTable';

type Filters = {
  startDate: string;
  endDate: string;
  zone: string;
  supervisorCode: string;
};

type SimApiData = {
  baseline: SimulationResult['baseline'];
  projected: SimulationResult['projected'];
  impact: SimulationResult['impact'];
  decision: SimulationResult['decision'];
  timeline: SimulationResult['timeline'];
  optimizationHints: SimulationResult['optimizationHints'];
  levers: ScenarioLevers;
  generatedAt: string;
};

type CompareItem = { id: string; title: string; result: SimulationResult };

type Props = {
  filters: Filters;
  userCode?: string;
};

export function WhatIfLab({ filters, userCode = 'admin' }: Props) {
  const [levers, setLevers] = useState<ScenarioLevers>({});
  const [title, setTitle] = useState('سيناريو مخصص');
  const [compareItems, setCompareItems] = useState<CompareItem[]>([]);
  const [saveMsg, setSaveMsg] = useState<string | null>(null);
  const [optimalPlan, setOptimalPlan] = useState<OptimalPlan | null>(null);
  const [optimalLoading, setOptimalLoading] = useState(false);

  const simBody = useMemo(
    () => JSON.stringify({ ...filters, levers }),
    [filters, levers]
  );

  const simQuery = useQuery({
    queryKey: ['digital-twin-simulate', simBody],
    queryFn: async () => {
      const res = await authFetch('/api/strategic-ops/digital-twin/simulate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: simBody,
      });
      const json = await res.json();
      if (!json.success) throw new Error(json.error || 'فشل المحاكاة');
      return json.data as SimApiData;
    },
    enabled: !!filters.startDate && !!filters.endDate,
    staleTime: 30_000,
  });

  useEffect(() => {
    if (!simQuery.data) return;
    saveDraft(userCode, {
      title: title || 'مسودة',
      filters,
      levers,
    });
  }, [simQuery.data, userCode, title, filters, levers]);

  const applyPreset = (id: ScenarioPresetId) => {
    if (id === 'custom') return;
    const preset = SCENARIO_PRESETS[id];
    setLevers(preset.levers);
    setTitle(preset.titleAr);
  };

  const addToCompare = () => {
    if (!simQuery.data) return;
    const data = simQuery.data;
    const result: SimulationResult = {
      baseline: data.baseline,
      projected: data.projected,
      levers: data.levers,
      impact: data.impact,
      decision: data.decision,
      timeline: data.timeline,
      optimizationHints: data.optimizationHints,
      generatedAt: data.generatedAt,
    };
    const id = `cmp-${Date.now()}`;
    setCompareItems((prev) => [...prev, { id, title: title || id, result }].slice(-8));
  };

  const saveToNeon = async () => {
    setSaveMsg(null);
    const res = await authFetch('/api/strategic-ops/digital-twin/scenarios', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title, ...filters, levers }),
    });
    const json = await res.json();
    if (!json.success) {
      setSaveMsg(json.error || 'فشل الحفظ');
      return;
    }
    setSaveMsg('تم حفظ السيناريو في Neon');
  };

  const loadOptimalPlan = async () => {
    setOptimalLoading(true);
    setSaveMsg(null);
    try {
      const res = await authFetch('/api/strategic-ops/digital-twin/optimal-plan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(filters),
      });
      const json = await res.json();
      if (!json.success) {
        setSaveMsg(json.error || 'فشل الخطة المثلى');
        return;
      }
      const plan = json.data as OptimalPlan;
      setOptimalPlan(plan);
      setLevers(plan.recommendedLevers);
      setTitle('خطة مثلى (AI Optimization)');
    } finally {
      setOptimalLoading(false);
    }
  };

  const comparisonRows = useMemo(
    () => compareScenarios(compareItems),
    [compareItems]
  );

  const [draftCount, setDraftCount] = useState(0);
  useEffect(() => {
    setDraftCount(listDrafts(userCode).length);
  }, [userCode, simQuery.dataUpdatedAt]);

  return (
    <section className="rounded-2xl border border-white/10 bg-[rgba(255,255,255,0.04)] p-5 space-y-5" dir="rtl">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-[#EAF0FF]">What-If Lab — مختبر السيناريوهات</h2>
          <p className="text-xs text-[#64748B] mt-1">
            محاكاة معزولة — لا تعديل على بيانات الإنتاج. المسودات تُحفظ محلياً.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={addToCompare}
            disabled={!simQuery.data}
            className="rounded-lg border border-white/15 px-3 py-1.5 text-xs text-[#EAF0FF] hover:bg-white/10 disabled:opacity-40"
          >
            أضف للمقارنة
          </button>
          <button
            type="button"
            onClick={saveToNeon}
            disabled={!simQuery.data}
            className="rounded-lg bg-cyan-500/80 hover:bg-cyan-500 text-black font-semibold px-3 py-1.5 text-xs disabled:opacity-40"
          >
            حفظ في Neon
          </button>
          <button
            type="button"
            onClick={loadOptimalPlan}
            disabled={optimalLoading}
            className="rounded-lg border border-violet-400/40 bg-violet-500/20 px-3 py-1.5 text-xs text-violet-100 hover:bg-violet-500/30 disabled:opacity-40"
          >
            {optimalLoading ? 'جاري التحسين…' : 'خطة مثلى (Mature Optimization)'}
          </button>
        </div>
      </div>

      {optimalPlan && (
        <div className="rounded-xl border border-violet-500/30 bg-violet-500/10 p-3 text-xs space-y-1">
          <p className="font-semibold text-[#EAF0FF]">
            أفضل خطة — درجة {optimalPlan.score} · إنجاز {optimalPlan.expectedAchievement}% · مخاطر{' '}
            {optimalPlan.expectedRisk}
          </p>
          <ul className="list-disc list-inside text-[#94A3B8]">
            {optimalPlan.rationaleAr.map((r) => (
              <li key={r}>{r}</li>
            ))}
          </ul>
        </div>
      )}

      <div className="flex flex-wrap gap-2 items-center">
        <label className="text-xs text-[#94A3B8]">اسم السيناريو</label>
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          className="rounded-lg bg-black/30 border border-white/10 px-3 py-1.5 text-sm text-[#EAF0FF] min-w-[200px]"
        />
        {saveMsg && <span className="text-xs text-cyan-300">{saveMsg}</span>}
      </div>

      <HiringSimulatorPanel
        value={levers.hireRiders ?? 0}
        onChange={(n) => setLevers((L) => ({ ...L, hireRiders: n }))}
      />

      <ScenarioBuilder levers={levers} onChange={setLevers} onApplyPreset={applyPreset} />

      {simQuery.isFetching && (
        <p className="text-sm text-[#94A3B8] animate-pulse">جاري تشغيل المحاكاة…</p>
      )}
      {simQuery.error && (
        <p className="text-sm text-red-300">{(simQuery.error as Error).message}</p>
      )}

      {simQuery.data && (
        <>
          <ImpactSummary impact={simQuery.data.impact} />
          <ExecutiveDecisionCard decision={simQuery.data.decision} />

          <div className="rounded-xl border border-white/10 p-3 space-y-2">
            <p className="text-xs font-semibold text-[#EAF0FF]">خطة مقترحة (Optimization)</p>
            <ul className="space-y-1 text-xs text-[#94A3B8]">
              {simQuery.data.optimizationHints.map((h) => (
                <li key={h.actionAr}>
                  <span className="text-cyan-300">[{h.priority}]</span> {h.actionAr} — {h.expectedGainAr}
                </li>
              ))}
            </ul>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 text-xs">
            {(
              [
                ['أسبوع', simQuery.data.timeline.nextWeek.actualHours],
                ['شهر', simQuery.data.timeline.nextMonth.actualHours],
                ['ربع', simQuery.data.timeline.nextQuarter.actualHours],
                ['6 أشهر', simQuery.data.timeline.nextSixMonths.actualHours],
                ['نهاية السنة', simQuery.data.timeline.yearEnd.actualHours],
              ] as const
            ).map(([label, hours]) => (
              <div key={label} className="rounded-xl border border-white/10 bg-black/20 p-2">
                <p className="text-[#64748B]">{label}</p>
                <p className="text-[#EAF0FF] font-semibold">{hours}h</p>
              </div>
            ))}
          </div>
        </>
      )}

      <div>
        <p className="text-xs font-semibold text-[#EAF0FF] mb-2">مقارنة السيناريوهات</p>
        <ScenarioComparisonTable rows={comparisonRows} />
      </div>

      {draftCount > 0 && (
        <div className="text-[10px] text-[#64748B]">مسودات محلية محفوظة: {draftCount}</div>
      )}
    </section>
  );
}
