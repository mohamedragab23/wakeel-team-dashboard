'use client';

import { getStoredUser } from '@/lib/clientSession';
import { authFetch } from '@/lib/authFetch';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { TicketTable } from '@/components/ticketing/TicketTable';
import {
  TICKET_PRIORITIES,
  TICKET_PRIORITY_LABELS_AR,
  TICKET_STATUSES,
  TICKET_STATUS_LABELS_AR,
  TICKET_TYPES,
  TICKET_TYPE_LABELS_AR } from '@/lib/ticketing/types';
import { ZONE_OPTIONS } from '@/lib/zones';

export default function AdminTicketQueuePage() {
  const router = useRouter();
  const [status, setStatus] = useState('');
  const [type, setType] = useState('');
  const [priority, setPriority] = useState('');
  const [zone, setZone] = useState('');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);

  useEffect(() => {
    try {
      const user = getStoredUser() || {};
      if (user?.role !== 'admin') router.replace('/ticketing/my');
    } catch {
      router.replace('/ticketing/my');
    }
  }, [router]);

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['ticketing', 'admin', status, type, priority, zone, search, page],
    queryFn: async () => {
      const qs = new URLSearchParams({ page: String(page), pageSize: '25' });
      if (status) qs.set('status', status);
      if (type) qs.set('type', type);
      if (priority) qs.set('priority', priority);
      if (zone) qs.set('zone', zone);
      if (search) qs.set('search', search);
      const res = await authFetch(`/api/ticketing?${qs}`);
      const json = await res.json();
      if (!json.success) throw new Error(json.error || 'فشل التحميل');
      return json;
    } });

  return (
    <div className="space-y-4">
      <div className="grid sm:grid-cols-2 lg:grid-cols-5 gap-3">
        <Select label="الحالة" value={status} onChange={setStatus} options={[{ v: '', l: 'الكل' }, ...TICKET_STATUSES.map((s) => ({ v: s, l: TICKET_STATUS_LABELS_AR[s] }))]} />
        <Select label="النوع" value={type} onChange={setType} options={[{ v: '', l: 'الكل' }, ...TICKET_TYPES.map((t) => ({ v: t, l: TICKET_TYPE_LABELS_AR[t] }))]} />
        <Select label="الأولوية" value={priority} onChange={setPriority} options={[{ v: '', l: 'الكل' }, ...TICKET_PRIORITIES.map((p) => ({ v: p, l: TICKET_PRIORITY_LABELS_AR[p] }))]} />
        <Select label="المنطقة" value={zone} onChange={setZone} options={[{ v: '', l: 'الكل' }, ...ZONE_OPTIONS.map((z) => ({ v: z, l: z }))]} />
        <label className="text-sm">
          بحث
          <input
            className="mt-1 w-full rounded-lg bg-white/5 border border-white/10 p-2"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="رقم، موضوع، مشرف…"
          />
        </label>
      </div>

      <button type="button" onClick={() => refetch()} className="text-sm text-cyan-400">
        تحديث
      </button>

      {isLoading && <p className="text-sm">جاري التحميل…</p>}
      {error && <p className="text-sm text-red-400">{(error as Error).message}</p>}
      {data && (
        <>
          <p className="text-xs text-[#94A3B8]">
            {data.total} طلب — صفحة {data.page}
          </p>
          <TicketTable items={data.items} showSupervisor />
          <div className="flex gap-2 mt-4">
            <button
              type="button"
              disabled={page <= 1}
              onClick={() => setPage((p) => p - 1)}
              className="px-3 py-1 rounded bg-white/5 text-sm disabled:opacity-40"
            >
              السابق
            </button>
            <button
              type="button"
              disabled={data.page * data.pageSize >= data.total}
              onClick={() => setPage((p) => p + 1)}
              className="px-3 py-1 rounded bg-white/5 text-sm disabled:opacity-40"
            >
              التالي
            </button>
          </div>
        </>
      )}
    </div>
  );
}

function Select({
  label,
  value,
  onChange,
  options }: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: { v: string; l: string }[];
}) {
  return (
    <label className="text-sm">
      {label}
      <select
        className="mt-1 w-full rounded-lg bg-white/5 border border-white/10 p-2"
        value={value}
        onChange={(e) => onChange(e.target.value)}
      >
        {options.map((o) => (
          <option key={o.v || 'all'} value={o.v}>
            {o.l}
          </option>
        ))}
      </select>
    </label>
  );
}
