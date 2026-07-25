'use client';

/**
 * SRS-010 Part 1 — Today's Executive Brief.
 * Sits at the very top of Strategic Operations. Fully generated text —
 * every value comes from `buildExecutiveBrief()`, nothing hardcoded here.
 */
import type { ExecutiveBrief } from '@/lib/strategicOps/executiveBrief';
import type { FleetDistribution } from '@/lib/strategicOps/controlTower/fleetDistribution';
import { FleetDistributionPanel } from '@/components/strategicOps/FleetDistributionPanel';

type Props = {
  brief: ExecutiveBrief;
  onOpenKpi?: (kpiId: string) => void;
  /** SRS-011 Part 1 — fleet hours distribution, rendered compact inside the brief. */
  fleetDistribution?: FleetDistribution;
};

const STATUS_STYLES: Record<string, { border: string; text: string; badge: string }> = {
  Critical: { border: 'border-red-500/40 bg-red-500/10', text: 'text-red-300', badge: '🔴 حرج' },
  Warning: { border: 'border-amber-500/40 bg-amber-500/10', text: 'text-amber-300', badge: '🟠 تحذير' },
  Healthy: { border: 'border-emerald-500/40 bg-emerald-500/10', text: 'text-emerald-300', badge: '🟢 جيد' },
  Unknown: { border: 'border-white/15 bg-white/5', text: 'text-[#94A3B8]', badge: '⚪ غير متاح' },
};

export function ExecutiveBriefPanel({ brief, onOpenKpi, fleetDistribution }: Props) {
  const style = STATUS_STYLES[brief.overallStatus] ?? STATUS_STYLES.Unknown;

  return (
    <section className={`rounded-2xl border p-5 space-y-4 ${style.border}`} dir="rtl">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs text-[#94A3B8] mb-1">موجز الصباح التنفيذي — Executive Morning Brief</p>
          {brief.hasData && (
            <p className="text-lg font-semibold text-[#EAF0FF] mb-1">{brief.greetingAr}</p>
          )}
          <div className="flex items-center gap-2">
            <span className={`text-2xl font-bold ${style.text}`}>{style.badge}</span>
            {brief.hasData && (
              <span className="text-sm text-[#64748B]">
                (درجة الصحة {brief.healthScore}/100)
              </span>
            )}
          </div>
        </div>
        <p className="text-[10px] text-[#64748B]">
          توليد تلقائي: {new Date(brief.generatedAt).toLocaleString('ar-EG')}
        </p>
      </div>

      {!brief.hasData ? (
        <p className="text-sm text-[#94A3B8]">{brief.mainReasonAr}</p>
      ) : (
        <>
          <div>
            <p className="text-[11px] text-[#64748B] mb-1">السبب الرئيسي</p>
            <div className="space-y-1">
              {brief.causeChainAr.map((line, idx) => (
                <p key={idx} className="text-sm text-[#EAF0FF]">
                  {idx > 0 && <span className="text-[#64748B] ml-1">↳</span>}
                  {line}
                </p>
              ))}
            </div>
          </div>

          {/* SRS-011: operational currency (hours/riders) leads — money is secondary context. */}
          <div className="grid sm:grid-cols-2 gap-3">
            <Stat label="الأثر بالساعات/يوم" value={brief.impactHoursAr} tone="bad" size="lg" />
            <Stat label="الطيارون المتأثرون (السبب الفعلي)" value={brief.ridersUnderFourHoursAr} tone="bad" size="lg" />
          </div>
          <div className="grid sm:grid-cols-2 gap-3">
            <Stat
              label="إذا لم يتغيّر شيء"
              value={
                brief.projectedAchievementPercent != null
                  ? `الإنجاز سيصل إلى ~${brief.projectedAchievementPercent}%`
                  : brief.projectionIfIgnoredAr
              }
              tone="warn"
            />
            <Stat label="القيمة المالية التقديرية (سياق ثانوي)" value={brief.financialImpactAr} tone="neutral" />
          </div>

          {fleetDistribution && fleetDistribution.totalRiders > 0 && (
            <div className="rounded-xl border border-white/10 bg-black/10 p-3">
              <FleetDistributionPanel distribution={fleetDistribution} compact onOpenKpi={onOpenKpi} />
            </div>
          )}

          <div className="rounded-xl border border-cyan-500/30 bg-cyan-500/5 p-3">
            <p className="text-[11px] text-cyan-300 mb-1">
              🎯 الأولوية الأعلى اليوم {brief.priorityCount > 1 && `(من أصل ${brief.priorityCount} أولوية مفتوحة)`}
            </p>
            <p className="text-sm text-[#EAF0FF] font-semibold">{brief.topPriorityAr}</p>
            <div className="flex flex-wrap gap-3 mt-1.5 text-xs text-[#94A3B8]">
              <span>⏰ الموعد: {brief.topPriorityDeadlineAr}</span>
              <span className="text-emerald-300">↗ العائد المتوقع: {brief.expectedGainAr}</span>
              <span>✅ الثقة: {brief.confidencePercent}%</span>
            </div>
          </div>

          {brief.assumptionsAr.length > 0 && (
            <p className="text-[10px] text-[#64748B]">
              افتراضات: {brief.assumptionsAr.join(' — ')}
            </p>
          )}

          {onOpenKpi && (
            <button
              type="button"
              onClick={() => onOpenKpi(brief.kpiId)}
              className="text-xs text-cyan-300 hover:underline"
            >
              🔎 افتح شجرة السبب الجذري الكاملة والمؤشر المرتبط ←
            </button>
          )}
        </>
      )}
    </section>
  );
}

function Stat({
  label,
  value,
  tone,
  size = 'md',
}: {
  label: string;
  value: string;
  tone: 'bad' | 'warn' | 'good' | 'neutral';
  size?: 'md' | 'lg';
}) {
  const toneClass =
    tone === 'bad' ? 'text-red-300' : tone === 'warn' ? 'text-amber-300' : tone === 'good' ? 'text-emerald-300' : 'text-[#94A3B8]';
  return (
    <div className="rounded-xl border border-white/10 bg-black/20 p-3">
      <p className="text-[10px] text-[#64748B] mb-1">{label}</p>
      <p className={`font-semibold ${toneClass} ${size === 'lg' ? 'text-base' : 'text-sm'}`}>{value}</p>
    </div>
  );
}
