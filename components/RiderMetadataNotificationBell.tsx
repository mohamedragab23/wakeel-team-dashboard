'use client';

import { authFetch } from '@/lib/authFetch';
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';

type NotificationPayload = {
  missingJoinDateCount: number;
  ridersMissingJoinDate: Array<{ riderCode: string; name: string }>;
  message: string;
  actionUrl: string;
};

export default function RiderMetadataNotificationBell() {
  const [open, setOpen] = useState(false);

  const { data } = useQuery({
    queryKey: ['rider-metadata', 'notifications'],
    queryFn: async () => {
      const res = await authFetch('/api/rider-metadata-notifications');
      const json = await res.json();
      if (!json.success) return { payload: null as NotificationPayload | null, unread: 0 };
      return {
        payload: json.data as NotificationPayload,
        unread: Number(json.unread ?? json.data?.missingJoinDateCount ?? 0),
      };
    },
    refetchInterval: 120_000,
  });

  const unread = data?.unread ?? 0;
  const payload = data?.payload;

  if (!payload || unread === 0) return null;

  return (
    <div className="relative mt-2">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="flex items-center gap-2 text-sm text-[rgba(234,240,255,0.85)] hover:text-white"
        aria-label="إشعارات بيانات المناديب"
      >
        <span>📝</span>
        <span>بيانات المناديب</span>
        <span className="bg-amber-500 text-black text-xs rounded-full px-2 py-0.5 min-w-[1.25rem] text-center font-semibold">
          {unread}
        </span>
      </button>
      {open && (
        <div className="absolute start-0 top-full mt-2 z-50 w-80 max-h-72 overflow-y-auto rounded-lg border border-[rgba(255,255,255,0.12)] bg-[#0a0e18] shadow-xl p-3">
          <p className="text-sm font-medium text-amber-200 mb-2">{payload.message}</p>
          <ul className="space-y-1 mb-3">
            {payload.ridersMissingJoinDate.slice(0, 8).map((r) => (
              <li key={r.riderCode} className="text-xs text-[rgba(234,240,255,0.85)]">
                {r.name} ({r.riderCode})
              </li>
            ))}
            {payload.ridersMissingJoinDate.length > 8 && (
              <li className="text-xs text-[#64748B]">
                +{payload.ridersMissingJoinDate.length - 8} مناديب آخرين
              </li>
            )}
          </ul>
          <Link
            href={payload.actionUrl}
            className="text-xs text-cyan-400 hover:text-cyan-300"
            onClick={() => setOpen(false)}
          >
            عرض التقرير وإكمال Join Date
          </Link>
        </div>
      )}
    </div>
  );
}
