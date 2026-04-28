'use client';

import { useMemo, useState } from 'react';
import Layout from '@/components/Layout';
import { useQuery } from '@tanstack/react-query';

type StatusFilter = 'all' | 'pending' | 'approved' | 'rejected';

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
}

function statusLabel(s: TerminationRequestRow['status']) {
  if (s === 'approved') return 'موافق عليها';
  if (s === 'rejected') return 'مرفوضة';
  return 'قيد الانتظار';
}

export default function TerminationRequestsViewerPage() {
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');

  const { data: rows = [], isLoading } = useQuery({
    queryKey: ['termination-requests-viewer', statusFilter],
    queryFn: async () => {
      const token = localStorage.getItem('token');
      const url = new URL('/api/termination-requests', window.location.origin);
      if (statusFilter !== 'all') url.searchParams.set('status', statusFilter);
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
          <p className="text-[rgba(234,240,255,0.70)]">عرض طلبات الإقالة (كل مشرف يرى طلباته فقط).</p>
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
              <table className="w-full min-w-[1100px]">
                <thead className="bg-[rgba(255,255,255,0.06)]">
                  <tr className="text-sm">
                    <th className="text-right py-3 px-4 font-semibold text-[#EAF0FF]">المشرف</th>
                    <th className="text-right py-3 px-4 font-semibold text-[#EAF0FF]">المندوب</th>
                    <th className="text-right py-3 px-4 font-semibold text-[#EAF0FF]">المديونية</th>
                    <th className="text-right py-3 px-4 font-semibold text-[#EAF0FF]">السبب</th>
                    <th className="text-right py-3 px-4 font-semibold text-[#EAF0FF]">تاريخ الطلب</th>
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
                      <td className="py-3 px-4 text-sm text-[rgba(234,240,255,0.70)] max-w-[520px]">
                        <div className="truncate" title={r.reason || ''}>
                          {r.reason || '—'}
                        </div>
                      </td>
                      <td className="py-3 px-4 text-sm text-[rgba(234,240,255,0.70)]">
                        {r.requestDate || '—'}
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

