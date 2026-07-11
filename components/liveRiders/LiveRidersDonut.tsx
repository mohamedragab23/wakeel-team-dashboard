'use client';

import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip, Legend } from 'recharts';
import Card from '@/components/ui-v2/Card';
import type { LiveRidersDistributionBucket } from '@/lib/roosterLive/types';

const PALETTE = ['#00F5FF', '#A855F7', '#34D399', '#FBBF24', '#FB7185', '#38BDF8', 'rgba(234,240,255,0.55)'];

export default function LiveRidersDonut({
  title,
  data,
  loading,
}: {
  title: string;
  data: LiveRidersDistributionBucket[];
  loading?: boolean;
}) {
  const total = data.reduce((sum, d) => sum + d.count, 0);

  return (
    <Card title={title}>
      {loading ? (
        <div className="h-[220px] flex items-center justify-center text-[rgba(234,240,255,0.55)] text-sm">
          جارِ التحميل...
        </div>
      ) : total === 0 ? (
        <div className="h-[220px] flex items-center justify-center text-[rgba(234,240,255,0.55)] text-sm">
          لا توجد بيانات لعرضها
        </div>
      ) : (
        <div className="h-[220px]">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie
                data={data}
                dataKey="count"
                nameKey="label"
                innerRadius="55%"
                outerRadius="80%"
                paddingAngle={2}
                strokeWidth={0}
              >
                {data.map((entry, idx) => (
                  <Cell key={entry.key} fill={PALETTE[idx % PALETTE.length]} />
                ))}
              </Pie>
              <Tooltip
                contentStyle={{
                  background: '#0f1524',
                  border: '1px solid rgba(255,255,255,0.10)',
                  borderRadius: 8,
                  color: '#EAF0FF',
                }}
              />
              <Legend
                verticalAlign="bottom"
                height={36}
                formatter={(value) => <span style={{ color: 'rgba(234,240,255,0.85)', fontSize: 12 }}>{value}</span>}
              />
            </PieChart>
          </ResponsiveContainer>
        </div>
      )}
    </Card>
  );
}
