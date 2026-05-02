'use client';

import { useMemo, useState } from 'react';
import Layout from '@/components/Layout';
import { useQuery } from '@tanstack/react-query';

type StatusFilter = 'all' | 'pending' | 'approved' | 'rejected';

interface PeriodStats {
  orders: number;
  hours: number;
  break: number;
  delay: number;
  avgAcceptance: number;
  records: number;
  workDays: number;
  debtAtEndOfPeriod: number | null;
}

interface TerminationRequestRow {
  id: number;
  supervisorCode: string;
  supervisorName: string;
  riderCode: string;
  riderName: string;
  reason: string;
  status: 'pending' | 'approved' | 'rejected';
  requestDate: string;
  approvalDate: string;
  approvedBy: string;
  debt: number;
  periodStats?: PeriodStats | null;
}

function defaultStatsRange(): { from: string; to: string } {
  const end = new Date();
  const start = new Date();
  start.setDate(start.getDate() - 29);
  return { from: start.toISOString().split('T')[0], to: end.toISOString().split('T')[0] };
}

function statusLabel(s: TerminationRequestRow['status']) {
  if (s === 'approved') return 'موافق عليها';
  if (s === 'rejected') return 'مرفوضة';
  return 'قيد الانتظار';
}

export default function TerminationRequestsViewerPage() {
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [{ from: statsFrom, to: statsTo }, setStatsRange] = useState(defaultStatsRange);

  const { data: rows = [], isLoading } = useQuery({
    queryKey: ['termination-requests-viewer', statusFilter, statsFrom, statsTo],
    queryFn: async () => {
      const token = localStorage.getItem('token');
      const url = new URL('/api/termination-requests', window.location.origin);
      if (statusFilter !== 'all') url.searchParams.set('status', statusFilter);
      url.searchParams.set('statsFrom', statsFrom);
      url.searchParams.set('statsTo', statsTo);
      const res = await fetch(url.toString(), { headers: { Authorization: `Bearer ${token}` } });
      const data = await res.json();
      return (data?.success ? (data.data as TerminationRequestRow[]) : []) ?? [];
    },
  });

  const counts = useMemo(() => {
    const all = rows.length;
    const pending = rows.filter((r) => r.status === 'pending').length;
    const approved = rows.filter((r) => r.status === 'approved').length;
    const rejected = rows.filter((r) => r.status === 'rejected').length;
    return { all, pending, approved, rejected };
  }, [rows]);

  return (
    <Layout>
      <div className="space-y-5">
        <div>
          <h1 className="text-3xl font-semibold text-[#EAF0FF] mb-2">الإقالات</h1>
          <p className="text-[rgba(234,240,255,0.70)]">
            طلب من المشرف إلى المدير؛ بعد الموافقة يبقى أداء المندوب (أوردرات، ساعات، مديونية ضمن الفترة) مرئياً هنا ويُحسب ضمن إجمالي أداء المشرف للفترة في التقارير.
          </p>
        </div>

        <div className="rounded-xl border border-[rgba(255,255,255,0.10)] bg-[rgba(255,255,255,0.06)] backdrop-blur-md p-4 space-y-3">
          <div className="text-sm font-medium text-[#EAF0FF]">فترة عرض أداء المندوبين (البيانات اليومية)</div>
          <div className="flex flex-wrap items-end gap-3">
            <label className="flex flex-col gap-1 text-xs text-[rgba(234,240,255,0.65)]">
              من
              <input
                type="date"
                value={statsFrom}
                onChange={(e) => setStatsRange((r) => ({ ...r, from: e.target.value }))}
                className="rounded-lg border border-[rgba(255,255,255,0.15)] bg-[rgba(0,0,0,0.25)] px-3 py-2 text-sm text-[#EAF0FF]"
              />
            </label>
            <label className="flex flex-col gap-1 text-xs text-[rgba(234,240,255,0.65)]">
              إلى
              <input
                type="date"
                value={statsTo}
                onChange={(e) => setStatsRange((r) => ({ ...r, to: e.target.value }))}
                className="rounded-lg border border-[rgba(255,255,255,0.15)] bg-[rgba(0,0,0,0.25)] px-3 py-2 text-sm text-[#EAF0FF]"
              />
            </label>
            <button
              type="button"
              onClick={() => setStatsRange(defaultStatsRange())}
              className="rounded-lg border border-[rgba(255,255,255,0.20)] bg-[rgba(255,255,255,0.08)] px-3 py-2 text-sm text-[rgba(234,240,255,0.85)] hover:bg-[rgba(255,255,255,0.12)]"
            >
              آخر 30 يوماً
            </button>
          </div>
        </div>

        <div className="rounded-xl border border-[rgba(255,255,255,0.10)] bg-[rgba(255,255,255,0.06)] backdrop-blur-md p-3">
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => setStatusFilter('all')}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                statusFilter === 'all'
                  ? 'bg-gradient-to-l from-[color:var(--v2-accent-cyan)] to-[color:var(--v2-accent-purple)] text-black'
                  : 'bg-[rgba(255,255,255,0.08)] text-[rgba(234,240,255,0.80)] hover:bg-[rgba(255,255,255,0.12)]'
              }`}
            >
              الكل ({counts.all})
            </button>
            <button
              type="button"
              onClick={() => setStatusFilter('pending')}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                statusFilter === 'pending'
                  ? 'bg-[rgba(250,204,21,0.90)] text-black'
                  : 'bg-[rgba(255,255,255,0.08)] text-[rgba(234,240,255,0.80)] hover:bg-[rgba(255,255,255,0.12)]'
              }`}
            >
              قيد الانتظار ({counts.pending})
            </button>
            <button
              type="button"
              onClick={() => setStatusFilter('approved')}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                statusFilter === 'approved'
                  ? 'bg-[rgba(34,197,94,0.90)] text-black'
                  : 'bg-[rgba(255,255,255,0.08)] text-[rgba(234,240,255,0.80)] hover:bg-[rgba(255,255,255,0.12)]'
              }`}
            >
              الموافق عليها ({counts.approved})
            </button>
            <button
              type="button"
              onClick={() => setStatusFilter('rejected')}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                statusFilter === 'rejected'
                  ? 'bg-[rgba(239,68,68,0.90)] text-black'
                  : 'bg-[rgba(255,255,255,0.08)] text-[rgba(234,240,255,0.80)] hover:bg-[rgba(255,255,255,0.12)]'
              }`}
            >
              المرفوضة ({counts.rejected})
            </button>
          </div>
        </div>

        {isLoading ? (
          <div className="rounded-xl border border-[rgba(255,255,255,0.10)] bg-[rgba(255,255,255,0.06)] backdrop-blur-md p-8 text-center">
            <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-[color:var(--v2-accent-cyan)] mx-auto" />
            <p className="mt-4 text-[rgba(234,240,255,0.70)]">جاري تحميل البيانات...</p>
          </div>
        ) : rows.length === 0 ? (
          <div className="rounded-xl border border-[rgba(255,255,255,0.10)] bg-[rgba(255,255,255,0.06)] backdrop-blur-md p-8 text-center">
            <p className="text-[rgba(234,240,255,0.70)]">لا توجد طلبات إقالة.</p>
          </div>
        ) : (
          <div className="rounded-xl border border-[rgba(255,255,255,0.10)] bg-[rgba(255,255,255,0.06)] backdrop-blur-md overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[1400px]">
                <thead className="bg-[rgba(255,255,255,0.06)]">
                  <tr className="text-sm">
                    <th className="text-right py-3 px-4 font-semibold text-[#EAF0FF]">المشرف</th>
                    <th className="text-right py-3 px-4 font-semibold text-[#EAF0FF]">المندوب</th>
                    <th className="text-right py-3 px-4 font-semibold text-[#EAF0FF]" title="عند تقديم الطلب">
                      مديونية (عند الطلب)
                    </th>
                    <th className="text-right py-3 px-4 font-semibold text-[#EAF0FF]">أوردرات الفترة</th>
                    <th className="text-right py-3 px-4 font-semibold text-[#EAF0FF]">ساعات الفترة</th>
                    <th className="text-right py-3 px-4 font-semibold text-[#EAF0FF]">أيام عمل</th>
                    <th className="text-right py-3 px-4 font-semibold text-[#EAF0FF]">قبول %</th>
                    <th className="text-right py-3 px-4 font-semibold text-[#EAF0FF]" title="آخر قيمة مديونية في البيانات اليومية ضمن الفترة">
                      مديونية آخر يوم بالفترة
                    </th>
                    <th className="text-right py-3 px-4 font-semibold text-[#EAF0FF]">السبب</th>
                    <th className="text-right py-3 px-4 font-semibold text-[#EAF0FF]">تاريخ الطلب</th>
                    <th className="text-right py-3 px-4 font-semibold text-[#EAF0FF]">موافقة / رفض</th>
                    <th className="text-right py-3 px-4 font-semibold text-[#EAF0FF]">الحالة</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[rgba(255,255,255,0.08)]">
                  {rows.map((r) => (
                    <tr key={r.id} className="hover:bg-[rgba(255,255,255,0.04)]">
                      <td className="py-3 px-4 text-sm">
                        <div>
                          <div className="font-medium text-[#EAF0FF]">{r.supervisorName || '—'}</div>
                          <div className="text-xs text-[rgba(234,240,255,0.55)]">{r.supervisorCode || '—'}</div>
                        </div>
                      </td>
                      <td className="py-3 px-4 text-sm">
                        <div>
                          <div className="font-medium text-[#EAF0FF]">{r.riderName || '—'}</div>
                          <div className="text-xs text-[rgba(234,240,255,0.55)]">{r.riderCode || '—'}</div>
                        </div>
                      </td>
                      <td className="py-3 px-4 text-sm tabular-nums text-[#EAF0FF]">
                        {(Number(r.debt) || 0).toFixed(2)}
                      </td>
                      <td className="py-3 px-4 text-sm tabular-nums text-[#EAF0FF]">
                        {r.periodStats ? r.periodStats.orders : '—'}
                      </td>
                      <td className="py-3 px-4 text-sm tabular-nums text-[#EAF0FF]">
                        {r.periodStats ? r.periodStats.hours.toFixed(1) : '—'}
                      </td>
                      <td className="py-3 px-4 text-sm tabular-nums text-[#EAF0FF]">
                        {r.periodStats ? r.periodStats.workDays : '—'}
                      </td>
                      <td className="py-3 px-4 text-sm tabular-nums text-[#EAF0FF]">
                        {r.periodStats ? `${r.periodStats.avgAcceptance}%` : '—'}
                      </td>
                      <td className="py-3 px-4 text-sm tabular-nums text-[#EAF0FF]">
                        {r.periodStats && r.periodStats.debtAtEndOfPeriod != null
                          ? Number(r.periodStats.debtAtEndOfPeriod).toFixed(2)
                          : '—'}
                      </td>
                      <td className="py-3 px-4 text-sm text-[rgba(234,240,255,0.70)] max-w-[280px]">
                        <div className="truncate" title={r.reason || ''}>
                          {r.reason || '—'}
                        </div>
                      </td>
                      <td className="py-3 px-4 text-sm text-[rgba(234,240,255,0.70)]">
                        {r.requestDate || '—'}
                      </td>
                      <td className="py-3 px-4 text-xs text-[rgba(234,240,255,0.65)] whitespace-nowrap">
                        {r.approvalDate ? (
                          <span title={r.approvedBy || ''}>
                            {r.approvalDate}
                            {r.approvedBy ? ` · ${r.approvedBy}` : ''}
                          </span>
                        ) : (
                          '—'
                        )}
                      </td>
                      <td className="py-3 px-4 text-sm">
                        <span
                          className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ${
                            r.status === 'pending'
                              ? 'bg-[rgba(250,204,21,0.20)] text-[rgba(250,204,21,0.95)]'
                              : r.status === 'approved'
                              ? 'bg-[rgba(34,197,94,0.18)] text-[rgba(34,197,94,0.95)]'
                              : 'bg-[rgba(239,68,68,0.18)] text-[rgba(239,68,68,0.95)]'
                          }`}
                        >
                          {statusLabel(r.status)}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </Layout>
  );
}

