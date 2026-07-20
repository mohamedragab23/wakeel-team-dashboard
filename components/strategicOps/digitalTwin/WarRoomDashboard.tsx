'use client';

import type { DigitalTwinState, SimulationResult } from '@/lib/strategicOps/digitalTwin';
import { SystemHealthCard } from '@/components/strategicOps/SystemHealthCard';

type Props = {
  twin: DigitalTwinState | null | undefined;
  bestSimulation?: SimulationResult | null;
  loading?: boolean;
};

export function WarRoomDashboard({ twin, bestSimulation, loading }: Props) {
  if (loading) {
    return (
      <div className="rounded-2xl border border-white/10 bg-white/5 p-5 animate-pulse text-sm text-[#94A3B8]">
        جاري تحميل غرفة القرار…
      </div>
    );
  }

  if (!twin) {
    return (
      <div className="rounded-2xl border border-white/10 bg-white/5 p-5 text-sm text-[#64748B]">
        اختر الفترة وشغّل التحليل لتحميل التوأم الرقمي.
      </div>
    );
  }

  const f = twin.fleet;
  const best = bestSimulation;
  const highestRiskSup = [...twin.supervisors].sort((a, b) => b.riskScore - a.riskScore)[0];
  const gap = Math.max(0, f.targetHours - f.actualHours);
  const investment = best?.impact.financial.totalInvestment ?? 0;
  const roi = best?.impact.financial.roiPercent ?? 0;

  return (
    <div className="space-y-4" dir="rtl">
      <div
        className={`rounded-2xl border p-5 ${
          f.healthScore >= 80
            ? 'border-emerald-500/40 bg-emerald-500/10'
            : f.healthScore >= 65
              ? 'border-amber-500/40 bg-amber-500/10'
              : 'border-red-500/40 bg-red-500/10'
        }`}
      >
        <p className="text-xs text-[#94A3B8]">Executive War Room — الوضع الحالي</p>
        <div className="flex flex-wrap items-end gap-4 mt-2">
          <div>
            <p className="text-5xl font-bold text-[#EAF0FF]">{f.healthScore}</p>
            <p className="text-xs text-[#64748B]">Health Score</p>
          </div>
          <div className="text-sm text-[#CBD5E1] space-y-1">
            <p>
              ساعات {f.actualHours} / هدف {f.targetHours} — إنجاز {f.achievement}%
            </p>
            <p>
              نشطون {f.activeRiders} / رأس مال {f.headcount} — فجوة {gap}h
            </p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        <SystemHealthCard
          title="أفضل محاكاة"
          value={best ? `${best.impact.projected.achievement}%` : '—'}
          sub={best ? best.decision.answerAr : 'أضف سيناريو للمقارنة'}
          status={best?.decision.shouldDoIt ? 'healthy' : 'unknown'}
        />
        <SystemHealthCard
          title="أعلى مخاطر"
          value={highestRiskSup?.name ?? '—'}
          sub={highestRiskSup ? `Risk ${highestRiskSup.riskScore}` : undefined}
          status={
            (highestRiskSup?.riskScore ?? 0) > 60
              ? 'critical'
              : (highestRiskSup?.riskScore ?? 0) > 40
                ? 'degraded'
                : 'healthy'
          }
        />
        <SystemHealthCard
          title="فرصة النمو الأسرع"
          value={gap > 0 ? `${gap}h gap` : 'هدف متحقق'}
          sub="سد الفجوة بالإنتاجية أو التعيين"
          status={gap > 100 ? 'degraded' : 'healthy'}
        />
        <SystemHealthCard
          title="استثمار / ROI"
          value={investment}
          sub={`ROI ${roi}%`}
          status={roi >= 0 ? 'healthy' : 'degraded'}
        />
      </div>

      {best && (
        <div className="rounded-xl border border-cyan-500/30 bg-cyan-500/10 p-4 text-sm text-[#EAF0FF]">
          <p className="font-semibold mb-1">توصية القرار</p>
          <p className="text-[#CBD5E1]">{best.decision.whyAr}</p>
          <p className="text-xs text-[#94A3B8] mt-2">{best.decision.expectedResultAr}</p>
        </div>
      )}

      <div className="rounded-xl border border-white/10 bg-black/20 p-3 text-xs text-[#94A3B8]">
        تنبيهات حرجة:{' '}
        {twin.quality.coveragePercent < 80 && 'تغطية بيانات منخفضة · '}
        {twin.quality.ghostLeakagePercent > 5 && 'تسرب Ghost مرتفع · '}
        {f.achievement < 70 && 'إنجاز تحت 70% · '}
        {f.noShowRiders > 20 && `غياب مرتفع (${f.noShowRiders}) · `}
        {twin.quality.coveragePercent >= 80 &&
          twin.quality.ghostLeakagePercent <= 5 &&
          f.achievement >= 70 &&
          'لا تنبيهات حرجة'}
      </div>
    </div>
  );
}
