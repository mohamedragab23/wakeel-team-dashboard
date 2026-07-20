'use client';

import type { Srs006CompletePackage } from '@/lib/strategicOps/trust/srs006Package';

type Props = { pack: Srs006CompletePackage };

export function ExecutiveDecisionBriefPanel({ pack }: Props) {
  const b = pack.executiveDecisionBrief;
  return (
    <section className="rounded-2xl border border-violet-500/30 bg-violet-500/10 p-5 space-y-3" dir="rtl">
      <h2 className="text-lg font-semibold text-[#EAF0FF]">وضع القرار التنفيذي — 10 نقاط كحد أقصى</h2>
      <ol className="list-decimal list-inside space-y-1.5 text-sm text-[#CBD5E1]">
        {b.bullets.map((x) => (
          <li key={x}>{x}</li>
        ))}
      </ol>
      <p className="text-[10px] text-[#64748B]">ثقة موجزة: {b.confidence}% — {new Date(b.generatedAt).toLocaleString('ar-EG')}</p>
    </section>
  );
}

export function ForecastValidationPanel({ pack }: Props) {
  if (pack.forecastValidations.length === 0) {
    return (
      <p className="text-sm text-[#64748B]">لا توقعات للتحقق — فعّل Control Tower.</p>
    );
  }
  return (
    <div className="space-y-2" dir="rtl">
      {pack.forecastValidations.map((f) => (
        <div key={f.metricKey} className="rounded-xl border border-white/10 bg-black/20 p-3 text-xs">
          <div className="flex flex-wrap justify-between gap-2 mb-1">
            <span className="font-semibold text-[#EAF0FF]">{f.metricKey}</span>
            <span className="text-cyan-300">موثوقية: {f.reliability} ({f.reliabilityScore})</span>
          </div>
          <p className="text-[#94A3B8]">{f.methodAr}</p>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mt-2 text-[#CBD5E1]">
            <span>MAPE: {f.mape}%</span>
            <span>دقة تاريخية: {f.historicalAccuracyPercent}%</span>
            <span>Best: {f.bestCase}</span>
            <span>Worst: {f.worstCase}</span>
            <span>Expected: {f.expectedCase}</span>
            <span>
              Interval: [{f.predictionInterval.low} … {f.predictionInterval.high}]
            </span>
            <span>Confidence: {f.confidence}</span>
            <span>Error: {f.pastForecastError}</span>
          </div>
        </div>
      ))}
    </div>
  );
}

export function CrossValidationPanel({ pack }: Props) {
  const c = pack.crossValidation;
  return (
    <div className="space-y-2" dir="rtl">
      <p className="text-xs text-[#94A3B8]">
        PASS {c.passCount} · WARN {c.warnCount} · FAIL {c.failCount}
      </p>
      {c.checks.map((ch) => (
        <div
          key={ch.id}
          className={`rounded-xl border px-3 py-2 text-xs ${
            ch.status === 'PASS'
              ? 'border-emerald-500/30 bg-emerald-500/10'
              : ch.status === 'WARN'
                ? 'border-amber-500/30 bg-amber-500/10'
                : 'border-red-500/30 bg-red-500/10'
          }`}
        >
          <div className="flex justify-between gap-2">
            <span className="text-[#EAF0FF] font-semibold">{ch.metricAr}</span>
            <span>{ch.status}</span>
          </div>
          <p className="text-[#94A3B8] mt-0.5">
            {ch.sourceA} ↔ {ch.sourceB}: {ch.detailAr}
          </p>
        </div>
      ))}
    </div>
  );
}

export function SupervisorFairnessPanel({ pack }: Props) {
  const rows = pack.supervisorFairness.slice(0, 12);
  if (!rows.length) return <p className="text-sm text-[#64748B]">لا بيانات مشرفين.</p>;
  return (
    <div className="overflow-x-auto rounded-xl border border-white/10" dir="rtl">
      <table className="min-w-full text-xs text-[#CBD5E1]">
        <thead className="bg-black/40 text-[#94A3B8]">
          <tr>
            <th className="px-2 py-1.5 text-right">الرتبة</th>
            <th className="px-2 py-1.5 text-right">المشرف</th>
            <th className="px-2 py-1.5">HC</th>
            <th className="px-2 py-1.5">Fair Score</th>
            <th className="px-2 py-1.5">س/طيار</th>
            <th className="px-2 py-1.5">حضور%</th>
            <th className="px-2 py-1.5">إنجاز خام</th>
            <th className="px-2 py-1.5">Percentile</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.code} className="border-t border-white/5">
              <td className="px-2 py-1.5">{r.rank}</td>
              <td className="px-2 py-1.5 text-[#EAF0FF]">{r.name}</td>
              <td className="px-2 py-1.5 text-center">{r.headcount}</td>
              <td className="px-2 py-1.5 text-center font-bold text-cyan-300">{r.fairScore}</td>
              <td className="px-2 py-1.5 text-center">{r.hoursPerRider}</td>
              <td className="px-2 py-1.5 text-center">{r.attendanceProxy}</td>
              <td className="px-2 py-1.5 text-center">{r.rawAchievement}</td>
              <td className="px-2 py-1.5 text-center">{r.peerPercentile}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="text-[10px] text-[#64748B] p-2">
        الترتيب عادل: يعتمد على معدلات (ساعات/طيار، حضور، إنجاز) وليس المجاميع الخام.
      </p>
    </div>
  );
}

export function ExecutiveTimelinePanel({ pack }: Props) {
  const events = pack.executiveTimeline.slice(0, 20);
  return (
    <div className="space-y-2 max-h-96 overflow-y-auto" dir="rtl">
      {events.map((e, i) => (
        <div
          key={`${e.at}-${e.type}-${i}`}
          className={`rounded-xl border px-3 py-2 text-xs ${
            e.severity === 'critical'
              ? 'border-red-500/30 bg-red-500/10'
              : e.severity === 'warning'
                ? 'border-amber-500/30 bg-amber-500/10'
                : 'border-white/10 bg-black/20'
          }`}
        >
          <div className="flex justify-between gap-2">
            <span className="font-semibold text-[#EAF0FF]">{e.titleAr}</span>
            <span className="text-[#64748B]">{e.type}</span>
          </div>
          <p className="text-[#94A3B8] mt-0.5">{e.detailAr}</p>
          <p className="text-[10px] text-[#64748B] mt-0.5">{new Date(e.at).toLocaleString('ar-EG')}</p>
        </div>
      ))}
    </div>
  );
}

export function CityIntelligencePanel({ pack }: Props) {
  const c = pack.cityIntelligence;
  return (
    <div className="rounded-xl border border-cyan-500/30 bg-cyan-500/10 p-4 text-sm space-y-2" dir="rtl">
      <p className="font-semibold text-[#EAF0FF]">
        ذكاء المدينة: {c.city.labelAr}
      </p>
      <p className="text-[#CBD5E1]">
        هدف المدينة {c.targetHours} س · إنجاز مقابل معيار المدينة {c.achievementVsCityTarget}% · متوسط
        ساعات مقابل المتوقع {c.avgHoursVsExpected}% · OPH {c.ophVsExpected}%
      </p>
      <ul className="list-disc list-inside text-xs text-[#94A3B8] space-y-1">
        {c.adaptedRecommendationsAr.map((r) => (
          <li key={r}>{r}</li>
        ))}
      </ul>
      <p className="text-[10px] text-[#64748B]">{c.noteAr}</p>
    </div>
  );
}

export function RootCauseExplainPanel({ pack }: Props) {
  const rows = pack.rootCauseExplanations.slice(0, 6);
  if (!rows.length) return null;
  return (
    <div className="space-y-3" dir="rtl">
      {rows.map((r) => (
        <div key={r.kpiKey} className="rounded-xl border border-white/10 bg-black/20 p-3 text-xs space-y-1">
          <p className="font-semibold text-[#EAF0FF]">{r.kpiKey}</p>
          <p><span className="text-[#64748B]">ماذا حدث؟</span> {r.whatHappenedAr}</p>
          <p><span className="text-[#64748B]">لماذا؟</span> {r.whyAr}</p>
          <p><span className="text-[#64748B]">الأثر:</span> {r.impactAr}</p>
          {r.hoursLost != null && (
            <p>
              ساعات/طلبات/تكلفة تقديرية: {r.hoursLost} س · {r.ordersLost ?? '—'} طلب ·{' '}
              {r.financialCostEstimate ?? '—'}
            </p>
          )}
          <p><span className="text-[#64748B]">الإصلاح:</span> {r.suggestedFixAr}</p>
          <p><span className="text-cyan-300">الاسترداد المتوقع:</span> {r.expectedRecoveryAr}</p>
          {r.responsibleSupervisors.length > 0 && (
            <p className="text-[#94A3B8]">
              مشرفون: {r.responsibleSupervisors.map((s) => s.name).join(' · ')}
            </p>
          )}
        </div>
      ))}
    </div>
  );
}
