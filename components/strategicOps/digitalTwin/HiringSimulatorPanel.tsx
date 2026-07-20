'use client';

import { HIRING_PRESETS } from '@/lib/strategicOps/digitalTwin';

type Props = {
  value: number;
  onChange: (n: number) => void;
};

export function HiringSimulatorPanel({ value, onChange }: Props) {
  return (
    <div className="space-y-2" dir="rtl">
      <p className="text-xs font-semibold text-[#EAF0FF]">محاكاة التعيين</p>
      <div className="flex flex-wrap gap-2">
        {HIRING_PRESETS.map((n) => (
          <button
            key={n}
            type="button"
            onClick={() => onChange(n)}
            className={`rounded-lg border px-2.5 py-1 text-xs ${
              value === n
                ? 'border-cyan-400 bg-cyan-500/20 text-cyan-100'
                : 'border-white/15 text-[#94A3B8] hover:bg-white/5'
            }`}
          >
            {n}
          </button>
        ))}
      </div>
      <div className="flex items-center gap-2">
        <label className="text-[11px] text-[#64748B]">مخصص</label>
        <input
          type="number"
          min={0}
          max={500}
          value={value}
          onChange={(e) => onChange(Math.max(0, Number(e.target.value) || 0))}
          className="w-28 rounded-lg bg-black/30 border border-white/10 px-2 py-1.5 text-sm text-[#EAF0FF]"
        />
      </div>
    </div>
  );
}
