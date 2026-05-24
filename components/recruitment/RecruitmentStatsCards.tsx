'use client';

import Card from '@/components/ui-v2/Card';
import type { RecruitmentStats } from '@/lib/recruitment/types';

export default function RecruitmentStatsCards({ stats }: { stats: RecruitmentStats }) {
  const cards = [
    { label: 'جدد هذا الأسبوع', value: stats.newThisWeek, icon: '🆕' },
    { label: 'تم التواصل', value: stats.contacted, icon: '📞' },
    { label: 'لم يتم التواصل', value: stats.notContacted, icon: '⏳' },
    { label: 'حضر المحاضرة', value: stats.attendedLecture, icon: '🎓' },
    { label: 'استلم المعدات', value: stats.equipmentReceived, icon: '📦' },
    { label: 'إجمالي النشطين', value: stats.totalActive, icon: '👥' },
  ];

  return (
    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
      {cards.map((c) => (
        <Card key={c.label} className="p-4">
          <div className="text-2xl mb-1">{c.icon}</div>
          <p className="text-xs text-[rgba(234,240,255,0.65)]">{c.label}</p>
          <p className="text-2xl font-bold mt-1">{c.value}</p>
        </Card>
      ))}
    </div>
  );
}
