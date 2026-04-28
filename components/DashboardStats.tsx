'use client';

import { memo } from 'react';
import Card from '@/components/ui-v2/Card';

interface DashboardData {
  totalHours: number;
  totalOrders: number;
  totalAbsences: number;
  totalBreaks?: number;
  avgAcceptance: number;
}

const DashboardStats = memo(function DashboardStats({ data }: { data: DashboardData }) {
  const stats = [
    {
      label: 'إجمالي ساعات العمل',
      value: data.totalHours.toFixed(1),
      icon: '⏰',
      color: 'bg-blue-500',
    },
    {
      label: 'إجمالي الطلبات',
      value: data.totalOrders.toLocaleString(),
      icon: '📦',
      color: 'bg-green-500',
    },
    {
      label: 'عدد الغيابات',
      value: data.totalAbsences,
      icon: '❌',
      color: 'bg-red-500',
    },
    {
      label: 'إجمالي الاستراحات',
      value: (data.totalBreaks || 0).toFixed(1),
      icon: '☕',
      color: 'bg-orange-500',
    },
    {
      label: 'متوسط نسبة القبول',
      value: `${data.avgAcceptance.toFixed(1)}%`,
      icon: '✅',
      color: 'bg-purple-500',
    },
  ];

  return (
    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-2 sm:gap-4 min-w-0">
      {stats.map((stat, index) => (
        <Card
          key={index}
          title={stat.label}
          rightSlot={
            <div
              className="p-2 sm:p-2.5 rounded-[var(--v2-radius-lg)] text-black text-lg sm:text-xl shrink-0 bg-gradient-to-l from-[color:var(--v2-accent-cyan)] to-[color:var(--v2-accent-purple)]"
              aria-hidden="true"
            >
              {stat.icon}
            </div>
          }
          className="min-w-0 overflow-hidden"
        >
          <p className="text-2xl sm:text-3xl font-extrabold text-[#EAF0FF] break-all">{stat.value}</p>
        </Card>
      ))}
    </div>
  );
});

export default DashboardStats;

