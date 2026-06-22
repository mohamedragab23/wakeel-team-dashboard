'use client';

import { authFetch } from '@/lib/authFetch';
import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';

export default function TicketingNotificationBell() {
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);

  const { data } = useQuery({
    queryKey: ['ticketing', 'notifications'],
    queryFn: async () => {
      const res = await authFetch('/api/ticketing/notifications');
      const json = await res.json();
      if (!json.success) return { data: [], unread: 0 };
      return { data: json.data, unread: json.unread ?? 0 };
    },
    refetchInterval: 90_000 });

  const unread = data?.unread ?? 0;
  const items = data?.data ?? [];

  const markRead = async (id: string) => {
    await authFetch('/api/ticketing/notifications', {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json' },
      body: JSON.stringify({ id }) });
    queryClient.invalidateQueries({ queryKey: ['ticketing', 'notifications'] });
  };

  return (
    <div className="relative mt-2">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="flex items-center gap-2 text-sm text-[rgba(234,240,255,0.85)] hover:text-white"
        aria-label="إشعارات التذاكر"
      >
        <span>🎫</span>
        <span>تذاكر</span>
        {unread > 0 && (
          <span className="bg-amber-500 text-black text-xs rounded-full px-2 py-0.5 min-w-[1.25rem] text-center font-semibold">
            {unread}
          </span>
        )}
      </button>
      {open && (
        <div className="absolute start-0 top-full mt-2 z-50 w-80 max-h-72 overflow-y-auto rounded-lg border border-[rgba(255,255,255,0.12)] bg-[#0a0e18] shadow-xl p-2">
          {items.length === 0 ? (
            <p className="text-sm text-[rgba(234,240,255,0.6)] p-2">لا توجد إشعارات</p>
          ) : (
            items.slice(0, 15).map(
              (n: { id: string; message: string; readAt: string | null; ticketId: string | null }) => (
                <div key={n.id} className="border-b border-white/5 last:border-0">
                  <button
                    type="button"
                    onClick={() => !n.readAt && markRead(n.id)}
                    className={`w-full text-start text-sm p-2 rounded hover:bg-[rgba(255,255,255,0.06)] ${
                      n.readAt ? 'opacity-60' : 'font-medium'
                    }`}
                  >
                    {n.message}
                  </button>
                  {n.ticketId && (
                    <Link
                      href={`/ticketing/${n.ticketId}`}
                      className="block text-xs text-cyan-400 px-2 pb-2"
                      onClick={() => setOpen(false)}
                    >
                      عرض الطلب
                    </Link>
                  )}
                </div>
              )
            )
          )}
        </div>
      )}
    </div>
  );
}
