'use client';

/**
 * SRS-011 Part 11 — Decision Effectiveness & Learning.
 * Shows the "AI Recommendation Performance" dashboard built from the
 * decision log, plus the manual "Was it executed?" check-in the loop
 * depends on (there is no way to auto-detect a phone call happened —
 * a human must confirm it, same as `rider_daily_comments` elsewhere).
 */
import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { authFetch } from '@/lib/authFetch';
import type { DecisionLogEntry, RecommendationPerformance } from '@/lib/strategicOps/decisionLearning/types';

function StatBox({ label, value, tone }: { label: string; value: string | number; tone?: 'good' | 'bad' | 'neutral' }) {
  const toneClass = tone === 'good' ? 'text-emerald-300' : tone === 'bad' ? 'text-red-300' : 'text-[#EAF0FF]';
  return (
    <div className="rounded-xl border border-white/10 bg-white/5 p-3">
      <p className="text-[10px] text-[#64748B] mb-1">{label}</p>
      <p className={`text-xl font-bold ${toneClass}`}>{value}</p>
    </div>
  );
}

const OUTCOME_STYLE: Record<DecisionLogEntry['outcome'], string> = {
  pending: 'text-[#94A3B8]',
  successful: 'text-emerald-300',
  failed: 'text-red-300',
  not_executed: 'text-[#64748B]',
};

const OUTCOME_LABEL_AR: Record<DecisionLogEntry['outcome'], string> = {
  pending: '⏳ قيد التقييم',
  successful: '✔ نجح القرار',
  failed: '✖ فشل القرار',
  not_executed: '— لم يُنفَّذ',
};

export function AIRecommendationPerformancePanel() {
  const queryClient = useQueryClient();
  const [filter, setFilter] = useState<'all' | 'needs_checkin' | 'evaluated'>('needs_checkin');

  const query = useQuery({
    queryKey: ['strategic-ops-decision-log'],
    queryFn: async () => {
      const res = await authFetch('/api/strategic-ops/decision-log');
      const json = await res.json();
      if (!json.success) throw new Error(json.error || 'فشل تحميل سجل القرارات');
      return json.data as { log: DecisionLogEntry[]; performance: RecommendationPerformance };
    },
    staleTime: 60_000,
  });

  const markExecuted = useMutation({
    mutationFn: async ({ id, executed }: { id: string; executed: boolean }) => {
      const res = await authFetch('/api/strategic-ops/decision-log', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, executed }),
      });
      const json = await res.json();
      if (!json.success) throw new Error(json.error || 'فشل التحديث');
      return json;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['strategic-ops-decision-log'] });
    },
  });

  if (query.isLoading) {
    return <p className="text-sm text-[#94A3B8]">⏳ جاري تحميل سجل فعالية القرارات...</p>;
  }
  if (query.error) {
    return <p className="text-sm text-red-300">{(query.error as Error).message}</p>;
  }
  if (!query.data) return null;

  const { log, performance: perf } = query.data;

  const filteredLog = log.filter((e) => {
    if (filter === 'needs_checkin') return e.executed === null;
    if (filter === 'evaluated') return e.evaluated;
    return true;
  });

  return (
    <div className="space-y-5" dir="rtl">
      <section>
        <h3 className="text-sm font-semibold text-[#EAF0FF] mb-2">
          📊 AI Recommendation Performance — فعالية توصيات النظام
        </h3>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          <StatBox label="عدد التوصيات" value={perf.totalRecommendations} />
          <StatBox label="عدد المنفَّذ" value={perf.executedCount} tone="good" />
          <StatBox label="عدد الناجح" value={perf.successfulCount} tone="good" />
          <StatBox label="عدد الفاشل" value={perf.failedCount} tone="bad" />
          <StatBox label="قيد التقييم" value={perf.pendingEvaluationCount} />
          <StatBox label="نسبة التنفيذ" value={`${perf.executionRatePercent}%`} />
          <StatBox
            label="نسبة نجاح القرارات"
            value={`${perf.successRatePercent}%`}
            tone={perf.successRatePercent >= 60 ? 'good' : perf.successRatePercent > 0 ? 'bad' : 'neutral'}
          />
          <StatBox
            label="متوسط زمن التنفيذ"
            value={perf.avgExecutionTimeHours != null ? `${perf.avgExecutionTimeHours} ساعة` : '—'}
          />
        </div>
        {perf.evaluatedCount === 0 && (
          <p className="text-[11px] text-[#64748B] mt-2">
            لم تُقيَّم أي توصية بعد — التقييم يحدث تلقائيًا بعد يومين من صدور كل توصية حرجة/عالية الأولوية، بشرط تأكيد
            التنفيذ أدناه.
          </p>
        )}
      </section>

      {(perf.bestActionKinds.length > 0 || perf.worstActionKinds.length > 0) && (
        <div className="grid sm:grid-cols-2 gap-3">
          <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/5 p-3">
            <p className="text-xs font-semibold text-emerald-200 mb-1.5">أفضل أنواع التوصيات</p>
            {perf.bestActionKinds.length === 0 ? (
              <p className="text-[11px] text-[#64748B]">لا توجد بيانات كافية بعد.</p>
            ) : (
              <ul className="space-y-1">
                {perf.bestActionKinds.map((k) => (
                  <li key={k.actionKind} className="text-[11px] text-[#CBD5E1] flex justify-between">
                    <span className="font-mono">{k.actionKind}</span>
                    <span className="text-emerald-300">{k.successRatePercent}% ({k.count})</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
          <div className="rounded-xl border border-red-500/30 bg-red-500/5 p-3">
            <p className="text-xs font-semibold text-red-200 mb-1.5">أسوأ أنواع التوصيات</p>
            {perf.worstActionKinds.length === 0 ? (
              <p className="text-[11px] text-[#64748B]">لا توجد بيانات كافية بعد.</p>
            ) : (
              <ul className="space-y-1">
                {perf.worstActionKinds.map((k) => (
                  <li key={k.actionKind} className="text-[11px] text-[#CBD5E1] flex justify-between">
                    <span className="font-mono">{k.actionKind}</span>
                    <span className="text-red-300">{k.successRatePercent}% ({k.count})</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}

      {perf.bestRespondingSupervisors.length > 0 && (
        <div className="rounded-xl border border-cyan-500/30 bg-cyan-500/5 p-3">
          <p className="text-xs font-semibold text-cyan-200 mb-1.5">أفضل المشرفين استجابة للتوصيات</p>
          <ul className="flex flex-wrap gap-2">
            {perf.bestRespondingSupervisors.map((s) => (
              <li key={s.entityName} className="rounded-full border border-white/10 bg-black/20 px-2.5 py-1 text-[11px] text-[#CBD5E1]">
                {s.entityName} — {s.successRatePercent}% ({s.count})
              </li>
            ))}
          </ul>
        </div>
      )}

      <section>
        <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
          <h4 className="text-xs font-semibold text-[#EAF0FF]">سجل التوصيات ({filteredLog.length})</h4>
          <div className="flex gap-1.5">
            {(['needs_checkin', 'evaluated', 'all'] as const).map((f) => (
              <button
                key={f}
                type="button"
                onClick={() => setFilter(f)}
                className={`rounded-lg border px-2.5 py-1 text-[11px] ${
                  filter === f ? 'border-cyan-500/50 bg-cyan-500/15 text-cyan-200' : 'border-white/10 bg-white/5 text-[#94A3B8]'
                }`}
              >
                {f === 'needs_checkin' ? 'تحتاج تأكيد تنفيذ' : f === 'evaluated' ? 'تم تقييمها' : 'الكل'}
              </button>
            ))}
          </div>
        </div>

        {filteredLog.length === 0 ? (
          <p className="text-xs text-[#64748B]">لا توجد توصيات في هذا الفلتر.</p>
        ) : (
          <div className="space-y-2">
            {filteredLog.map((e) => (
              <div key={e.id} className="rounded-xl border border-white/10 bg-white/5 p-3 text-xs space-y-1.5">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="font-semibold text-[#EAF0FF]">{e.entityName}</span>
                  <span className={`font-semibold ${OUTCOME_STYLE[e.outcome]}`}>{OUTCOME_LABEL_AR[e.outcome]}</span>
                </div>
                <p className="text-[#94A3B8]">{e.problemAr}</p>
                <p className="text-cyan-200/90">الإجراء: {e.actionAr}</p>
                <p className="text-[10px] text-[#64748B]">
                  الأساس: {e.baselineMetricLabel} = {e.baselineMetricValue} — صدرت: {new Date(e.issuedAt).toLocaleDateString('ar-EG')}
                  {e.evaluated && e.afterMetricValue != null && (
                    <> ← الآن: {e.afterMetricValue} ({e.metricDeltaPct != null && e.metricDeltaPct >= 0 ? '+' : ''}{e.metricDeltaPct}%)</>
                  )}
                </p>
                {e.executed === null ? (
                  <div className="flex items-center gap-2 pt-1">
                    <span className="text-[10px] text-amber-300">هل تم تنفيذ هذا الإجراء؟</span>
                    <button
                      type="button"
                      disabled={markExecuted.isPending}
                      onClick={() => markExecuted.mutate({ id: e.id, executed: true })}
                      className="rounded-lg bg-emerald-500/80 hover:bg-emerald-500 text-black font-semibold px-2.5 py-1 text-[10px] disabled:opacity-50"
                    >
                      ✔ نعم، نُفِّذ
                    </button>
                    <button
                      type="button"
                      disabled={markExecuted.isPending}
                      onClick={() => markExecuted.mutate({ id: e.id, executed: false })}
                      className="rounded-lg border border-white/15 px-2.5 py-1 text-[10px] text-[#EAF0FF] hover:bg-white/10 disabled:opacity-50"
                    >
                      ✖ لا، لم يُنفَّذ
                    </button>
                  </div>
                ) : (
                  <p className="text-[10px] text-[#64748B]">
                    {e.executed ? '✔ مؤكَّد التنفيذ' : '✖ مؤكَّد عدم التنفيذ'}
                    {e.executedAt && ` — ${new Date(e.executedAt).toLocaleString('ar-EG')}`}
                  </p>
                )}
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
