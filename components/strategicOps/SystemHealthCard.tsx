'use client';

type Props = {
  title: string;
  value: string | number;
  sub?: string;
  status?: 'healthy' | 'degraded' | 'critical' | 'unknown';
};

function statusBorder(status?: Props['status']): string {
  if (status === 'healthy') return 'border-emerald-500/30 bg-emerald-500/5';
  if (status === 'degraded') return 'border-amber-500/30 bg-amber-500/5';
  if (status === 'critical') return 'border-red-500/30 bg-red-500/5';
  return 'border-white/10 bg-white/5';
}

export function SystemHealthCard({ title, value, sub, status }: Props) {
  return (
    <div className={`rounded-xl border p-4 ${statusBorder(status)}`}>
      <p className="text-xs text-[#94A3B8] mb-1">{title}</p>
      <p className="text-xl font-bold text-[#EAF0FF] truncate">{value}</p>
      {sub && <p className="text-[11px] text-[#64748B] mt-1">{sub}</p>}
    </div>
  );
}
