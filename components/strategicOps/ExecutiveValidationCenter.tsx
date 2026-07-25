'use client';

/**
 * SRS-010 Part 7 — Ops Validation Center, business-framed.
 * Every failed test → Scenario / Expected / Actual / Affected KPIs /
 * Business impact / Suggested fix / Code location / Estimated effort.
 */
import { useMemo, useState } from 'react';
import {
  explainValidationReportForExecutive,
  type ExecutiveValidationExplain,
} from '@/lib/strategicOps/opsValidation/executiveExplain';
import type { ValidationTestResult } from '@/lib/strategicOps/opsValidation/types';

type Props = {
  results: ValidationTestResult[] | undefined;
  onOpenKpi?: (kpiId: string) => void;
  focusKpiId?: string | null;
};

export function ExecutiveValidationCenter({ results, onOpenKpi, focusKpiId }: Props) {
  const [openId, setOpenId] = useState<string | null>(null);

  const explains = useMemo(() => {
    if (!results) return [];
    const all = explainValidationReportForExecutive(results);
    if (!focusKpiId) return all;
    return [...all].sort((a, b) => {
      const aMatch = a.affectedKpiIds.includes(focusKpiId) ? 1 : 0;
      const bMatch = b.affectedKpiIds.includes(focusKpiId) ? 1 : 0;
      return bMatch - aMatch;
    });
  }, [results, focusKpiId]);

  if (!results) return null;

  if (explains.length === 0) {
    return (
      <div className="rounded-2xl border border-emerald-500/40 bg-emerald-500/10 p-5" dir="rtl">
        <p className="text-sm font-semibold text-emerald-200">✅ لا توجد اختبارات فاشلة</p>
        <p className="text-xs text-[#94A3B8] mt-1">
          كل الحالات التشغيلية ({results.length}) اجتازت التحقق — الشهادة غير محجوبة بسبب اختبار مفتوح.
        </p>
      </div>
    );
  }

  return (
    <section className="space-y-3" dir="rtl">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="text-sm font-semibold text-[#EAF0FF]">
          ✅ Executive Validation Findings — {explains.length} اختبار يحتاج إصلاح
        </h3>
        <p className="text-[11px] text-[#64748B]">
          كل بطاقة = اختبار تشغيلي فاشل من SRS-008، مُترجم إلى سيناريو وأثر تجاري وموقع الإصلاح.
        </p>
      </div>

      <div className="space-y-2.5">
        {explains.map((ex: ExecutiveValidationExplain) => {
          const isFocused = focusKpiId != null && ex.affectedKpiIds.includes(focusKpiId);
          return (
            <div
              key={ex.id}
              className={`rounded-xl border p-4 ${
                ex.critical ? 'border-red-500/40 bg-red-500/10' : 'border-amber-500/40 bg-amber-500/10'
              } ${isFocused ? 'ring-2 ring-cyan-400/60' : ''}`}
            >
              <div className="flex flex-wrap items-start justify-between gap-2">
                <span className="text-sm font-semibold text-[#EAF0FF]">
                  {ex.critical ? '🔴 حرج' : '🟡 غير حرج'} — {ex.scenarioAr}
                </span>
                <span className="flex items-center gap-2 shrink-0">
                  <span className="text-[10px] font-semibold text-red-300">{ex.succeededLabelAr}</span>
                  <span className="text-[10px] text-[#64748B] font-mono">{ex.id}</span>
                </span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mt-2 text-xs">
                <p className="text-[#94A3B8]">
                  <span className="text-[#64748B]">النتيجة المتوقعة: </span>
                  {ex.expectedResultAr}
                </p>
                <p className="text-red-200">
                  <span className="text-[#64748B]">النتيجة الفعلية: </span>
                  {ex.actualResultAr}
                </p>
              </div>

              <p className="text-xs text-[#CBD5E1] mt-2">
                <span className="text-[#94A3B8]">الأثر التجاري: </span>
                {ex.businessImpactAr}
              </p>

              <div className="flex flex-wrap items-center gap-2 mt-3">
                <button
                  type="button"
                  onClick={() => setOpenId((v) => (v === ex.id ? null : ex.id))}
                  className="rounded-lg bg-cyan-500/80 hover:bg-cyan-500 text-black font-semibold px-3 py-1.5 text-xs"
                >
                  {openId === ex.id ? 'إخفاء تفاصيل الإصلاح' : '🛠 تفاصيل الإصلاح'}
                </button>
                {onOpenKpi && ex.affectedKpiIds[0] && (
                  <button
                    type="button"
                    onClick={() => onOpenKpi(ex.affectedKpiIds[0])}
                    className="rounded-lg border border-white/15 px-3 py-1.5 text-xs text-cyan-200 hover:bg-white/10"
                  >
                    🔗 المؤشر المرتبط
                  </button>
                )}
                <span className="text-[10px] text-[#64748B]">⏱ {ex.estimatedEffortAr}</span>
                <span className="text-[10px] text-[#94A3B8]">👤 المسؤول: {ex.ownerAr}</span>
              </div>

              {openId === ex.id && (
                <div className="mt-3 rounded-lg border border-white/10 bg-black/30 p-3 space-y-1.5">
                  <p className="text-xs text-[#CBD5E1]">
                    <span className="text-cyan-200 font-semibold">الإصلاح المقترح: </span>
                    {ex.suggestedFixAr}
                  </p>
                  <p className="text-[11px] text-[#94A3B8] font-mono">
                    <span className="text-[#64748B]">موقع الكود: </span>
                    {ex.codeLocation}
                  </p>
                  {ex.affectedKpiIds.length > 0 && (
                    <p className="text-[10px] text-[#64748B]">
                      المؤشرات المتأثرة: {ex.affectedKpiIds.join(', ')}
                    </p>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}
