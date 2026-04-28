'use client';

import { memo } from 'react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';

type TopRider = {
  name: string;
  orders: number;
  hours: number;
  acceptance: number;
};

const TopRidersMiniChart = memo(function TopRidersMiniChart({ topRiders }: { topRiders: TopRider[] }) {
  const data = topRiders.slice(0, 8).map((r) => ({
    name: r.name.length > 12 ? r.name.slice(0, 12) + '…' : r.name,
    orders: r.orders,
    hours: Number(r.hours.toFixed(1)),
  }));

  return (
    <div className="h-56 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 8, right: 8, left: 8, bottom: 8 }}>
          <CartesianGrid stroke="rgba(255,255,255,0.08)" vertical={false} />
          <XAxis
            dataKey="name"
            stroke="rgba(234,240,255,0.55)"
            tick={{ fill: 'rgba(234,240,255,0.55)', fontSize: 12 }}
            axisLine={{ stroke: 'rgba(255,255,255,0.10)' }}
            tickLine={{ stroke: 'rgba(255,255,255,0.10)' }}
          />
          <YAxis
            stroke="rgba(234,240,255,0.55)"
            tick={{ fill: 'rgba(234,240,255,0.55)', fontSize: 12 }}
            axisLine={{ stroke: 'rgba(255,255,255,0.10)' }}
            tickLine={{ stroke: 'rgba(255,255,255,0.10)' }}
            width={36}
          />
          <Tooltip
            contentStyle={{
              background: 'rgba(5,7,13,0.92)',
              border: '1px solid rgba(255,255,255,0.12)',
              borderRadius: 12,
              color: '#EAF0FF',
              backdropFilter: 'blur(10px)',
            }}
            cursor={{ fill: 'rgba(255,255,255,0.04)' }}
          />
          <Bar dataKey="orders" name="الطلبات" fill="rgba(0,245,255,0.75)" radius={[8, 8, 0, 0]} />
          <Bar dataKey="hours" name="الساعات" fill="rgba(168,85,247,0.70)" radius={[8, 8, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
});

export default TopRidersMiniChart;

