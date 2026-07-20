'use client';

import type { SimulationImpact } from '@/lib/strategicOps/digitalTwin';

type Props = { impact: SimulationImpact };

function Delta({ label, value, unit = '' }: { label: string; value: number; unit?: string }) {
  const positive = value > 0;
  const color = value === 0 ? 'text-[#94A3B8]' : positive ? 'text-emerald-300' : 'text-red-300';
  return (
    <div className="rounded-xl border border-white/10 bg-black/20 p-3">
      <p className="text-[10px] text-[#64748B]">{label}</p>
      <p className={`text-lg font-bold ${color}`}>
        {positive ? '+' : ''}
        {value}
        {unit}
      </p>
    </div>
  );
}

export function ImpactSummary({ impact }: Props) {
  const { projected, baseline, deltas, financial, risk } = impact;
  return (
    <div className="space-y-4" dir="rtl">
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        <Metric label="ساعات (متوقع)" value={projected.actualHours} sub={`كان ${baseline.actualHours}`} />
        <Metric label="إنجاز %" value={projected.achievement} sub={`Δ ${deltas.achievement}`} />
        <Metric label="طلبات/يوم" value={projected.orders} sub={`Δ ${deltas.orders}`} />
        <Metric label="صحة التشغيل" value={projected.healthScore} sub={`/100`} />
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 gap-2">
        <Delta label="Headcount" value={deltas.headcount} />
        <Delta label="Active" value={deltas.activeRiders} />
        <Delta label="Hours" value={deltas.hours} unit="h" />
        <Delta label="Orders" value={deltas.orders} />
        <Delta label="OPH" value={deltas.ordersPerHour} />
        <Delta label="Utilization" value={deltas.utilization} unit="%" />
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-sm">
        <Metric label="إيراد الفترة" value={financial.revenue} sub={financial.currency} />
        <Metric label="استثمار" value={financial.totalInvestment} sub={financial.currency} />
        <Metric label="ربح" value={financial.profit} sub={financial.currency} />
        <Metric label="ROI %" value={financial.roiPercent} sub={financial.paybackDays != null ? `Payback ${financial.paybackDays}d` : '—'} />
      </div>

      <div className="rounded-xl border border-white/10 bg-white/[0.03] p-3 text-xs text-[#94A3B8]">
        مخاطر إجمالية <strong className="text-[#EAF0FF]">{risk.overallRisk}</strong>/100 — ثقة{' '}
        <strong className="text-[#EAF0FF]">{risk.confidence}%</strong> ({risk.confidenceLevel})
        <p className="mt-1 text-[10px]">{financial.assumptionsNoteAr}</p>
      </div>
    </div>
  );
}

function Metric({ label, value, sub }: { label: string; value: number; sub?: string }) {
  return (
    <div className="rounded-xl border border-white/10 bg-white/5 p-3">
      <p className="text-[10px] text-[#64748B]">{label}</p>
      <p className="text-xl font-bold text-[#EAF0FF]">{value}</p>
      {sub && <p className="text-[10px] text-[#64748B] mt-0.5">{sub}</p>}
    </div>
  );
}
