'use client';

import Link from 'next/link';
import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { authFetch } from '@/lib/authFetch';
import {
  COMMENT_CATEGORY_LABELS_AR,
  COMMENT_CATEGORY_ICONS,
  type CommentCategory,
} from '@/lib/riderComments/types';

type CommentRow = {
  riderCode: string;
  riderName: string;
  supervisorName: string;
  date: string;
  category: CommentCategory;
  notes?: string;
};

type RepeatWarning = {
  riderCode: string;
  riderName: string;
  supervisorName: string;
  category: CommentCategory;
  count: number;
  severity: 'high' | 'medium' | 'low';
};

function buildRepeatWarnings(comments: CommentRow[]): RepeatWarning[] {
  const byRider = new Map<
    string,
    {
      riderName: string;
      supervisorName: string;
      cats: Partial<Record<CommentCategory, number>>;
    }
  >();

  for (const c of comments) {
    if (c.category === 'working_normally') continue;
    const cur = byRider.get(c.riderCode) || {
      riderName: c.riderName,
      supervisorName: c.supervisorName,
      cats: {},
    };
    cur.cats[c.category] = (cur.cats[c.category] || 0) + 1;
    byRider.set(c.riderCode, cur);
  }

  const thresholds: Partial<Record<CommentCategory, { min: number; severity: RepeatWarning['severity'] }>> = {
    accident: { min: 2, severity: 'high' },
    medical_leave: { min: 3, severity: 'medium' },
    vacation: { min: 4, severity: 'low' },
    frequent_absences: { min: 2, severity: 'high' },
    family_emergency: { min: 3, severity: 'medium' },
    equipment_issue: { min: 3, severity: 'medium' },
    poor_performance: { min: 2, severity: 'high' },
    other: { min: 4, severity: 'low' },
  };

  const out: RepeatWarning[] = [];
  for (const [riderCode, data] of byRider) {
    for (const [cat, count] of Object.entries(data.cats) as [CommentCategory, number][]) {
      const rule = thresholds[cat];
      if (!rule || count < rule.min) continue;
      out.push({
        riderCode,
        riderName: data.riderName,
        supervisorName: data.supervisorName,
        category: cat,
        count,
        severity: count >= rule.min + 2 ? 'high' : rule.severity,
      });
    }
  }

  return out.sort((a, b) => b.count - a.count).slice(0, 12);
}

type Props = {
  startDate: string;
  endDate: string;
  enabled?: boolean;
};

export function StrategicOpsCommentsPanel({ startDate, endDate, enabled = true }: Props) {
  const qs = useMemo(() => {
    const p = new URLSearchParams();
    if (startDate) p.set('startDate', startDate);
    if (endDate) p.set('endDate', endDate);
    return p.toString();
  }, [startDate, endDate]);

  const query = useQuery({
    queryKey: ['strategic-ops-comments', startDate, endDate],
    enabled: enabled && Boolean(startDate && endDate),
    queryFn: async () => {
      const res = await authFetch(`/api/rider-comments?${qs}`);
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'فشل تحميل التعليقات');
      return (json.comments || []) as CommentRow[];
    },
    staleTime: 60_000,
  });

  const comments = query.data || [];
  const warnings = useMemo(() => buildRepeatWarnings(comments), [comments]);

  const categoryTotals = useMemo(() => {
    const map = new Map<CommentCategory, number>();
    for (const c of comments) {
      map.set(c.category, (map.get(c.category) || 0) + 1);
    }
    return Array.from(map.entries())
      .map(([category, count]) => ({ category, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 6);
  }, [comments]);

  const uniqueRiders = useMemo(() => new Set(comments.map((c) => c.riderCode)).size, [comments]);

  return (
    <section className="rounded-2xl border border-white/10 bg-[rgba(255,255,255,0.04)] p-5 space-y-4" dir="rtl">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-[#EAF0FF]">💬 ذكاء التعليقات اليومية</h2>
          <p className="text-sm text-[#94A3B8] mt-1">
            تحليل حالة المناديب وتكرار نفس الأعذار — مربوط بلوحة التعليقات
          </p>
        </div>
        <Link
          href={`/admin/rider-comments-dashboard`}
          className="rounded-lg border border-cyan-500/40 bg-cyan-500/10 px-3 py-1.5 text-xs font-semibold text-cyan-200 hover:bg-cyan-500/20"
        >
          فتح لوحة التعليقات الكاملة ←
        </Link>
      </div>

      {query.isLoading && <p className="text-sm text-[#94A3B8]">جاري تحليل التعليقات…</p>}
      {query.error && (
        <p className="text-sm text-red-300">{(query.error as Error).message}</p>
      )}

      {!query.isLoading && !query.error && (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="rounded-xl border border-white/10 bg-black/20 p-3">
              <p className="text-xs text-[#94A3B8]">إجمالي التعليقات</p>
              <p className="text-2xl font-bold text-[#EAF0FF]">{comments.length}</p>
            </div>
            <div className="rounded-xl border border-white/10 bg-black/20 p-3">
              <p className="text-xs text-[#94A3B8]">مناديب بتعليق</p>
              <p className="text-2xl font-bold text-[#EAF0FF]">{uniqueRiders}</p>
            </div>
            <div className="rounded-xl border border-white/10 bg-black/20 p-3">
              <p className="text-xs text-[#94A3B8]">تكرار أعذار</p>
              <p className="text-2xl font-bold text-amber-300">{warnings.length}</p>
            </div>
            <div className="rounded-xl border border-white/10 bg-black/20 p-3">
              <p className="text-xs text-[#94A3B8]">أعلى فئة</p>
              <p className="text-sm font-semibold text-[#EAF0FF] mt-1">
                {categoryTotals[0]
                  ? `${COMMENT_CATEGORY_ICONS[categoryTotals[0].category]} ${COMMENT_CATEGORY_LABELS_AR[categoryTotals[0].category]} (${categoryTotals[0].count})`
                  : '—'}
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <div>
              <h3 className="text-sm font-semibold text-[#EAF0FF] mb-2">توزيع الفئات</h3>
              <div className="space-y-2">
                {categoryTotals.length === 0 && (
                  <p className="text-sm text-[#64748B]">لا تعليقات في الفترة المحددة</p>
                )}
                {categoryTotals.map((row) => (
                  <div
                    key={row.category}
                    className="flex items-center justify-between rounded-lg border border-white/10 bg-black/20 px-3 py-2 text-sm"
                  >
                    <span className="text-[#EAF0FF]">
                      {COMMENT_CATEGORY_ICONS[row.category]}{' '}
                      {COMMENT_CATEGORY_LABELS_AR[row.category]}
                    </span>
                    <span className="text-[#94A3B8]">{row.count}</span>
                  </div>
                ))}
              </div>
            </div>

            <div>
              <h3 className="text-sm font-semibold text-[#EAF0FF] mb-2">
                مناديب يكررون نفس الأعذار
              </h3>
              <div className="space-y-2 max-h-72 overflow-y-auto">
                {warnings.length === 0 && (
                  <p className="text-sm text-[#64748B]">
                    لا يوجد تكرار ملحوظ في الفترة (ضمن الحدود الحالية)
                  </p>
                )}
                {warnings.map((w) => (
                  <div
                    key={`${w.riderCode}-${w.category}`}
                    className={`rounded-lg border px-3 py-2 text-sm ${
                      w.severity === 'high'
                        ? 'border-red-500/40 bg-red-500/10'
                        : w.severity === 'medium'
                          ? 'border-amber-500/40 bg-amber-500/10'
                          : 'border-white/10 bg-black/20'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-semibold text-[#EAF0FF]">{w.riderName}</span>
                      <span className="text-xs text-[#94A3B8]">{w.count}×</span>
                    </div>
                    <p className="text-xs text-[#94A3B8] mt-0.5">
                      {w.riderCode} · مشرف: {w.supervisorName || '—'}
                    </p>
                    <p className="text-xs text-[#EAF0FF] mt-1">
                      {COMMENT_CATEGORY_ICONS[w.category]}{' '}
                      {COMMENT_CATEGORY_LABELS_AR[w.category]}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </>
      )}
    </section>
  );
}
