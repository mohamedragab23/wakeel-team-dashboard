'use client';

import type { ScenarioComparisonRow } from '@/lib/strategicOps/digitalTwin';

type Props = { rows: ScenarioComparisonRow[] };

export function ScenarioComparisonTable({ rows }: Props) {
  if (rows.length === 0) {
    return <p className="text-sm text-[#64748B]">لا سيناريوهات للمقارنة بعد.</p>;
  }

  return (
    <div className="overflow-x-auto rounded-xl border border-white/10" dir="rtl">
      <table className="min-w-full text-xs text-[#CBD5E1]">
        <thead className="bg-black/40 text-[#94A3B8]">
          <tr>
            <th className="px-3 py-2 text-right">السيناريو</th>
            <th className="px-3 py-2">استثمار</th>
            <th className="px-3 py-2">ساعات</th>
            <th className="px-3 py-2">طلبات</th>
            <th className="px-3 py-2">ربح</th>
            <th className="px-3 py-2">مخاطر</th>
            <th className="px-3 py-2">ROI%</th>
            <th className="px-3 py-2">نمو%</th>
            <th className="px-3 py-2">إنجاز%</th>
            <th className="px-3 py-2 text-right">توصية</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr
              key={r.id}
              className={`border-t border-white/5 ${r.isBest ? 'bg-emerald-500/10' : ''}`}
            >
              <td className="px-3 py-2 font-semibold text-[#EAF0FF]">
                {r.title}
                {r.isBest && (
                  <span className="mr-2 text-[10px] text-emerald-300 border border-emerald-500/40 rounded px-1">
                    الأفضل
                  </span>
                )}
              </td>
              <td className="px-3 py-2 text-center">{r.investment}</td>
              <td className="px-3 py-2 text-center">{r.hours}</td>
              <td className="px-3 py-2 text-center">{r.orders}</td>
              <td className="px-3 py-2 text-center">{r.profit}</td>
              <td className="px-3 py-2 text-center">{r.risk}</td>
              <td className="px-3 py-2 text-center">{r.roiPercent}</td>
              <td className="px-3 py-2 text-center">{r.growthRate}</td>
              <td className="px-3 py-2 text-center">{r.achievement}</td>
              <td className="px-3 py-2 max-w-[220px] truncate" title={r.recommendationAr}>
                {r.recommendationAr}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
