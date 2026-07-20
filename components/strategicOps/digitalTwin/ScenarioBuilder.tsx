'use client';

import { SCENARIO_PRESETS, type ScenarioLevers, type ScenarioPresetId } from '@/lib/strategicOps/digitalTwin';

type Props = {
  levers: ScenarioLevers;
  onChange: (levers: ScenarioLevers) => void;
  onApplyPreset: (id: ScenarioPresetId) => void;
};

export function ScenarioBuilder({ levers, onChange, onApplyPreset }: Props) {
  const set = <K extends keyof ScenarioLevers>(key: K, value: ScenarioLevers[K]) => {
    onChange({ ...levers, [key]: value });
  };

  return (
    <div className="space-y-4" dir="rtl">
      <div>
        <p className="text-xs font-semibold text-[#EAF0FF] mb-2">سيناريوهات جاهزة (A–J)</p>
        <div className="flex flex-wrap gap-2">
          {(Object.keys(SCENARIO_PRESETS) as Array<Exclude<ScenarioPresetId, 'custom'>>).map((id) => (
            <button
              key={id}
              type="button"
              onClick={() => onApplyPreset(id)}
              className="rounded-lg border border-white/15 bg-black/20 px-2.5 py-1.5 text-[11px] text-[#EAF0FF] hover:bg-white/10"
            >
              {SCENARIO_PRESETS[id].titleAr}
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
        <Slider
          label="استرداد الغياب %"
          value={levers.noShowRecoveryPct ?? 0}
          onChange={(v) => set('noShowRecoveryPct', v)}
        />
        <Slider
          label="خفض الاستراحة %"
          value={levers.breakRecoveryPct ?? levers.breakReductionPercent ?? 0}
          onChange={(v) => {
            set('breakRecoveryPct', v);
            set('breakReductionPercent', v);
          }}
        />
        <Slider
          label="خفض التأخير %"
          value={levers.lateRecoveryPct ?? levers.lateReductionPercent ?? 0}
          onChange={(v) => {
            set('lateRecoveryPct', v);
            set('lateReductionPercent', v);
          }}
        />
        <Slider
          label="تفعيل غير النشطين %"
          value={levers.inactiveRecoveryPct ?? 0}
          onChange={(v) => set('inactiveRecoveryPct', v)}
        />
        <Num
          label="خفض الغياب %"
          value={levers.absenteeismReductionPercent ?? 0}
          onChange={(v) => set('absenteeismReductionPercent', v)}
        />
        <Num
          label="متوسط ساعات جديد"
          value={levers.avgHoursDelta ?? 0}
          step={0.1}
          onChange={(v) => set('avgHoursDelta', v || undefined)}
        />
        <Num
          label="Δ نشطين"
          value={levers.activeRidersDelta ?? 0}
          onChange={(v) => set('activeRidersDelta', v)}
        />
        <Num
          label="إنهاء خدمة"
          value={levers.terminateRiders ?? 0}
          onChange={(v) => set('terminateRiders', v)}
        />
        <Num
          label="هدف جديد (ساعات)"
          value={levers.newTargetHours ?? 0}
          onChange={(v) => set('newTargetHours', v || undefined)}
        />
        <Num
          label="تغيير الهدف %"
          value={levers.targetPercentChange ?? 0}
          onChange={(v) => set('targetPercentChange', v)}
        />
        <Num
          label="تغيير الطلب %"
          value={levers.demandPercentChange ?? 0}
          onChange={(v) => set('demandPercentChange', v)}
        />
        <Num
          label="مقياس المدينة"
          value={levers.cityScaleFactor ?? 1}
          step={0.1}
          onChange={(v) => set('cityScaleFactor', v)}
        />
        <Num
          label="نقل طيارين"
          value={levers.reallocateRiders ?? 0}
          onChange={(v) => set('reallocateRiders', v)}
        />
        <label className="flex items-center gap-2 rounded-xl border border-white/10 bg-black/20 px-3 py-2">
          <input
            type="checkbox"
            checked={!!levers.replaceWeakSupervisor}
            onChange={(e) => set('replaceWeakSupervisor', e.target.checked)}
          />
          <span className="text-[#EAF0FF]">استبدال المشرف الأضعف</span>
        </label>
      </div>
    </div>
  );
}

function Slider({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
}) {
  return (
    <label className="block rounded-xl border border-white/10 bg-black/20 px-3 py-2">
      <div className="flex justify-between mb-1 text-[#94A3B8]">
        <span>{label}</span>
        <span className="text-[#EAF0FF]">{value}%</span>
      </div>
      <input
        type="range"
        min={0}
        max={100}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-full"
      />
    </label>
  );
}

function Num({
  label,
  value,
  onChange,
  step = 1,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  step?: number;
}) {
  return (
    <label className="block rounded-xl border border-white/10 bg-black/20 px-3 py-2">
      <span className="text-[#94A3B8] block mb-1">{label}</span>
      <input
        type="number"
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-full rounded-lg bg-black/40 border border-white/10 px-2 py-1 text-[#EAF0FF]"
      />
    </label>
  );
}
