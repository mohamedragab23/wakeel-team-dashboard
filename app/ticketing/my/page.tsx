'use client';

import { authFetch } from '@/lib/authFetch';
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { TicketTable } from '@/components/ticketing/TicketTable';
import { TICKET_STATUSES, TICKET_STATUS_LABELS_AR } from '@/lib/ticketing/types';

export default function SupervisorTicketsPage() {
  const [status, setStatus] = useState('');

  const { data, isLoading, error } = useQuery({
    queryKey: ['ticketing', 'my', status],
    queryFn: async () => {
      const qs = new URLSearchParams();
      if (status) qs.set('status', status);
      const res = await authFetch(`/api/ticketing?${qs}`);
      const json = await res.json();
      if (!json.success) throw new Error(json.error || 'فشل التحميل');
      return json;
    } });

  return (
    <div>
      <div className="flex flex-wrap gap-2 mb-4">
        <FilterBtn active={!status} onClick={() => setStatus('')}>
          الكل
        </FilterBtn>
        {TICKET_STATUSES.map((s) => (
          <FilterBtn key={s} active={status === s} onClick={() => setStatus(s)}>
            {TICKET_STATUS_LABELS_AR[s]}
          </FilterBtn>
        ))}
      </div>

      {isLoading && <p className="text-sm">جاري التحميل…</p>}
      {error && <p className="text-sm text-red-400">{(error as Error).message}</p>}
      {data && <TicketTable items={data.items} />}
    </div>
  );
}

function FilterBtn({
  children,
  active,
  onClick }: {
  children: React.ReactNode;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`px-3 py-1.5 rounded-lg text-xs ${
        active ? 'bg-cyan-500/25 text-cyan-200' : 'bg-white/5 text-[#94A3B8]'
      }`}
    >
      {children}
    </button>
  );
}
