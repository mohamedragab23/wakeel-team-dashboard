'use client';

import Card from '@/components/ui-v2/Card';
import type { LiveRidersKpis } from '@/lib/roosterLive/types';

interface KpiDef {
  key: keyof LiveRidersKpis;
  label: string;
  accent: string;
}

const KPI_DEFS: KpiDef[] = [
  { key: 'total', label: 'إجمالي المناديب', accent: '#00F5FF' },
  { key: 'online', label: 'متصل', accent: '#34D399' },
  { key: 'busy', label: 'مشغول', accent: '#38BDF8' },
  { key: 'onBreak', label: 'في استراحة', accent: '#FBBF24' },
  { key: 'late', label: 'متأخر', accent: '#FB7185' },
  { key: 'offline', label: 'غير متصل', accent: 'rgba(234,240,255,0.55)' },
  { key: 'walletAlerts', label: 'تنبيهات الرصيد', accent: '#A855F7' },
];

export default function LiveRidersKpiCards({ kpis, loading }: { kpis: LiveRidersKpis | null; loading?: boolean }) {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-7 gap-3">
      {KPI_DEFS.map((def) => (
        <Card key={def.key}>
          <div className="flex flex-col gap-1">
            <span className="text-xs text-[rgba(234,240,255,0.65)]">{def.label}</span>
            <span className="text-2xl font-bold" style={{ color: def.accent }}>
              {loading ? '—' : (kpis?.[def.key] ?? 0)}
            </span>
          </div>
        </Card>
      ))}
    </div>
  );
}
