'use client';

import Link from 'next/link';
import {
  TICKET_PRIORITY_LABELS_AR,
  TICKET_STATUS_LABELS_AR,
  TICKET_TYPE_LABELS_AR,
  type TicketRow,
} from '@/lib/ticketing/types';

const STATUS_COLORS: Record<string, string> = {
  new: 'bg-blue-500/20 text-blue-300',
  under_review: 'bg-amber-500/20 text-amber-300',
  waiting_supervisor_response: 'bg-purple-500/20 text-purple-300',
  approved: 'bg-emerald-500/20 text-emerald-300',
  rejected: 'bg-red-500/20 text-red-300',
  closed: 'bg-slate-500/20 text-slate-300',
};

export function TicketStatusBadge({ status }: { status: string }) {
  return (
    <span className={`text-xs px-2 py-0.5 rounded-full ${STATUS_COLORS[status] ?? 'bg-white/10'}`}>
      {TICKET_STATUS_LABELS_AR[status as keyof typeof TICKET_STATUS_LABELS_AR] ?? status}
    </span>
  );
}

export function TicketTable({
  items,
  showSupervisor = false,
}: {
  items: TicketRow[];
  showSupervisor?: boolean;
}) {
  if (items.length === 0) {
    return <p className="text-sm text-[rgba(234,240,255,0.6)]">لا توجد طلبات</p>;
  }

  return (
    <div className="overflow-x-auto rounded-xl border border-white/10">
      <table className="w-full text-sm">
        <thead className="bg-white/5 text-[#94A3B8]">
          <tr>
            <th className="text-start p-3">#</th>
            <th className="text-start p-3">النوع</th>
            <th className="text-start p-3">الموضوع</th>
            {showSupervisor && <th className="text-start p-3">المشرف</th>}
            <th className="text-start p-3">المنطقة</th>
            <th className="text-start p-3">الأولوية</th>
            <th className="text-start p-3">الحالة</th>
            <th className="text-start p-3">التاريخ</th>
          </tr>
        </thead>
        <tbody>
          {items.map((t) => (
            <tr key={t.id} className="border-t border-white/5 hover:bg-white/5">
              <td className="p-3">
                <Link href={`/ticketing/${t.id}`} className="text-cyan-400 hover:underline">
                  #{t.ticketNumber}
                </Link>
              </td>
              <td className="p-3">{TICKET_TYPE_LABELS_AR[t.type]}</td>
              <td className="p-3 max-w-[200px] truncate">{t.subject || '—'}</td>
              {showSupervisor && <td className="p-3">{t.supervisorName}</td>}
              <td className="p-3">{t.zone}</td>
              <td className="p-3">{TICKET_PRIORITY_LABELS_AR[t.priority]}</td>
              <td className="p-3">
                <TicketStatusBadge status={t.status} />
              </td>
              <td className="p-3 text-xs text-[#94A3B8]">
                {new Date(t.createdAt).toLocaleString('ar-EG')}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
