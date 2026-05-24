'use client';

import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';

/** جرس إشعارات التعيين — يُحدَّث كل دقيقتين */
export default function RecruitmentNotificationBell() {
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);

  const { data } = useQuery({
    queryKey: ['recruitment', 'notifications'],
    queryFn: async () => {
      const token = localStorage.getItem('token');
      const res = await fetch('/api/recruitment/notifications', {
        headers: { Authorization: `Bearer ${token}` },
      });
      const json = await res.json();
      if (!json.success) return { data: [], unread: 0 };
      return { data: json.data, unread: json.unread ?? 0 };
    },
    refetchInterval: 2 * 60 * 1000,
  });

  const unread = data?.unread ?? 0;
  const items = data?.data ?? [];

  const markRead = async (id: string) => {
    const token = localStorage.getItem('token');
    await fetch('/api/recruitment/notifications', {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ id }),
    });
    queryClient.invalidateQueries({ queryKey: ['recruitment', 'notifications'] });
  };

  return (
    <div className="relative mt-3">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="flex items-center gap-2 text-sm text-[rgba(234,240,255,0.85)] hover:text-white"
        aria-label="إشعارات التعيين"
      >
        <span>🔔</span>
        <span>إشعارات</span>
        {unread > 0 && (
          <span className="bg-[#FB7185] text-white text-xs rounded-full px-2 py-0.5 min-w-[1.25rem] text-center">
            {unread}
          </span>
        )}
      </button>
      {open && (
        <div className="absolute start-0 top-full mt-2 z-50 w-72 max-h-64 overflow-y-auto rounded-lg border border-[rgba(255,255,255,0.12)] bg-[#0a0e18] shadow-xl p-2">
          {items.length === 0 ? (
            <p className="text-sm text-[rgba(234,240,255,0.6)] p-2">لا توجد إشعارات</p>
          ) : (
            items.slice(0, 10).map((n: { id: string; message: string; read: boolean }) => (
              <button
                key={n.id}
                type="button"
                onClick={() => !n.read && markRead(n.id)}
                className={`w-full text-start text-sm p-2 rounded hover:bg-[rgba(255,255,255,0.06)] ${
                  n.read ? 'opacity-60' : 'font-medium'
                }`}
              >
                {n.message}
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
}
