'use client';

import { getStoredUser } from '@/lib/clientSession';
import { authFetch } from '@/lib/authFetch';
import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';

export default function TicketingMetricsPage() {
  const router = useRouter();

  useEffect(() => {
    try {
      const user = getStoredUser() || {};
      if (user?.role !== 'admin') router.replace('/ticketing/my');
    } catch {
      router.replace('/ticketing/my');
    }
  }, [router]);

  const { data, isLoading, error } = useQuery({
    queryKey: ['ticketing', 'metrics'],
    queryFn: async () => {
      const res = await authFetch('/api/ticketing/metrics');
      const json = await res.json();
      if (!json.success) throw new Error(json.error || 'فشل التحميل');
      return json.data;
    } });

  if (isLoading) return <p className="text-sm">جاري التحميل…</p>;
  if (error) return <p className="text-sm text-red-400">{(error as Error).message}</p>;
  if (!data) return null;

  const cards = [
    { label: 'طلبات جديدة', value: data.newRequests },
    { label: 'طلبات مفتوحة', value: data.openRequests },
    {
      label: 'متوسط وقت الحل (ساعة)',
      value: data.averageResolutionHours ?? '—' },
    { label: 'مرفوضة', value: data.rejectedRequests },
    { label: 'مغلقة', value: data.closedRequests },
  ];

  return (
    <div>
      <div className="grid sm:grid-cols-2 lg:grid-cols-5 gap-3 mb-6">
        {cards.map((c) => (
          <div key={c.label} className="rounded-xl border border-white/10 bg-white/5 p-4">
            <p className="text-xs text-[#94A3B8]">{c.label}</p>
            <p className="text-2xl font-bold mt-1">{c.value}</p>
          </div>
        ))}
      </div>

      <h2 className="text-sm font-semibold text-[#94A3B8] mb-2">توزيع الحالات</h2>
      <div className="grid sm:grid-cols-3 gap-2">
        {Object.entries(data.statusCounts || {}).map(([status, count]) => (
          <div key={status} className="rounded-lg bg-white/5 px-3 py-2 text-sm flex justify-between">
            <span>{status}</span>
            <span className="font-mono">{count as number}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
